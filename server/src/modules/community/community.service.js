'use strict';

const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { processImage } = require('../../services/image');
const { getStorage } = require('../../services/storage');
const { uploadUrl } = require('../dto');
const { pageResult } = require('../../utils/http');

const SELECT = `SELECT p.*, u.display_name AS author_name,
  IF(f.status = 'active' AND fc.status = 'active', f.name, NULL) AS food_name,
  IF(r.status = 'active', r.name, NULL) AS restaurant_name,
  (SELECT COUNT(*) FROM community_likes WHERE post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM community_comments WHERE post_id = p.id AND status = 'published') AS comments
  FROM community_posts p JOIN users u ON u.id = p.user_id
  LEFT JOIN foods f ON f.id = p.food_id LEFT JOIN food_categories fc ON fc.id = f.category_id
  LEFT JOIN restaurants r ON r.id = p.restaurant_id`;

async function post(conn, id, userId, lock = false) {
  const [[row]] = await conn.query(`SELECT * FROM community_posts WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!row || (row.status !== 'published' && row.user_id !== userId)) {
    throw AppError.notFound('POST_NOT_FOUND', 'Không tìm thấy bài viết');
  }
  return row;
}

async function rate(conn, userId, kind, limit) {
  await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
  const [[{ n }]] = await conn.query(
    'SELECT COUNT(*) AS n FROM community_actions WHERE user_id = ? AND kind = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY',
    [userId, kind],
  );
  if (n >= limit) throw AppError.rateLimited(86400);
  await conn.query('INSERT INTO community_actions (user_id, kind) VALUES (?, ?)', [userId, kind]);
}

async function dto(row, viewerId) {
  const pool = getPool();
  const [images] = await pool.query(
    'SELECT id, image_path, thumb_path FROM community_images WHERE post_id = ? ORDER BY id',
    [row.id],
  );
  const [[{ liked }]] = await pool.query(
    'SELECT EXISTS(SELECT 1 FROM community_likes WHERE post_id = ? AND user_id = ?) AS liked',
    [row.id, viewerId ?? null],
  );
  return {
    id: row.id,
    author: { id: row.user_id, displayName: row.author_name },
    content: row.content,
    status: row.status,
    ...(row.user_id === viewerId ? { moderationNote: row.moderation_note } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    likes: row.likes,
    comments: row.comments,
    liked: Boolean(liked),
    food: row.food_name ? { id: row.food_id, name: row.food_name } : null,
    restaurant: row.restaurant_name ? { id: row.restaurant_id, name: row.restaurant_name } : null,
    images: images.map((i) => ({ id: i.id, url: uploadUrl(i.image_path), thumbUrl: uploadUrl(i.thumb_path) })),
  };
}

async function detail(id, viewerId) {
  await post(getPool(), id, viewerId);
  const [[row]] = await getPool().query(`${SELECT} WHERE p.id = ?`, [id]);
  if (!row || (row.status !== 'published' && row.user_id !== viewerId)) throw AppError.notFound();
  return dto(row, viewerId);
}

async function list({ page, limit, authorId, following, mine }, viewerId) {
  if ((following || mine) && !viewerId) throw AppError.unauthenticated();
  const where = [mine ? 'p.user_id = ?' : "p.status = 'published'"];
  const params = mine ? [viewerId] : [];
  if (authorId) {
    where.push('p.user_id = ?');
    params.push(authorId);
  }
  if (following) {
    where.push('EXISTS(SELECT 1 FROM community_follows cf WHERE cf.followed_id = p.user_id AND cf.follower_id = ?)');
    params.push(viewerId);
  }
  const sql = where.join(' AND ');
  const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total FROM community_posts p WHERE ${sql}`, params);
  const [rows] = await getPool().query(
    `${SELECT} WHERE ${sql} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  return pageResult(await Promise.all(rows.map((r) => dto(r, viewerId))), { page, limit }, total);
}

async function save(id, userId, body, files = []) {
  const processed = await Promise.all(files.map((f) => processImage(f.path)));
  const written = [];
  const removed = [];
  let resultId;
  try {
    resultId = await withTransaction(async (conn) => {
      let images = [];
      if (id) {
        const row = await post(conn, id, userId, true);
        if (row.user_id !== userId || row.status === 'hidden') throw AppError.forbidden();
        [images] = await conn.query('SELECT * FROM community_images WHERE post_id = ?', [id]);
      } else {
        await rate(conn, userId, 'post', 10);
      }
      const keep = new Set(body.keepImageIds ?? []);
      if ([...keep].some((k) => !images.some((i) => i.id === k)))
        throw AppError.validation({ keepImageIds: 'Ảnh không thuộc bài' });
      if (keep.size + processed.length > 3) throw AppError.validation({ images: 'Tối đa 3 ảnh' });
      if (!body.content && !keep.size && !processed.length)
        throw AppError.validation({ content: 'Nhập nội dung hoặc thêm ảnh' });
      for (const [table, value, field] of [
        ['foods', body.foodId, 'foodId'],
        ['restaurants', body.restaurantId, 'restaurantId'],
      ]) {
        if (value != null) {
          const sql =
            table === 'foods'
              ? "SELECT f.id FROM foods f JOIN food_categories c ON c.id=f.category_id WHERE f.id=? AND f.status='active' AND c.status='active'"
              : "SELECT id FROM restaurants WHERE id=? AND status='active'";
          const [[active]] = await conn.query(sql, [value]);
          if (!active) throw AppError.validation({ [field]: 'Liên kết không còn hoạt động' });
        }
      }
      let savedId = id;
      if (!id) {
        const [r] = await conn.query(
          'INSERT INTO community_posts (user_id, content, food_id, restaurant_id) VALUES (?, ?, ?, ?)',
          [userId, body.content, body.foodId, body.restaurantId],
        );
        savedId = r.insertId;
      } else {
        await conn.query(
          "UPDATE community_posts SET content = ?, food_id = ?, restaurant_id = ?, status = 'pending', moderation_note = NULL WHERE id = ?",
          [body.content, body.foodId, body.restaurantId, id],
        );
        for (const image of images.filter((i) => !keep.has(i.id))) {
          removed.push(image.image_path, image.thumb_path);
          await conn.query('DELETE FROM community_images WHERE id = ?', [image.id]);
        }
      }
      for (const image of processed) {
        const saved = await getStorage().saveImagePair(`community/${savedId}`, image);
        written.push(saved.imagePath, saved.thumbPath);
        await conn.query('INSERT INTO community_images (post_id, image_path, thumb_path) VALUES (?, ?, ?)', [
          savedId,
          saved.imagePath,
          saved.thumbPath,
        ]);
      }
      return savedId;
    });
  } catch (error) {
    await getStorage().removeFiles(written);
    throw error;
  }
  await getStorage().removeFiles(removed);
  return detail(resultId, userId);
}

async function remove(id, userId) {
  await withTransaction(async (conn) => {
    const row = await post(conn, id, userId, true);
    if (row.user_id !== userId) throw AppError.forbidden();
    await conn.query('DELETE FROM community_posts WHERE id = ?', [id]);
  });
  await getStorage().removeDir(`community/${id}`);
}

async function comments(id, userId, query) {
  const row = await post(getPool(), id, userId);
  if (row.status !== 'published' && row.user_id !== userId) throw AppError.notFound();
  const where = "c.post_id = ? AND (c.status = 'published' OR c.user_id = ?)";
  const params = [id, userId ?? null];
  const [[{ total }]] = await getPool().query(
    `SELECT COUNT(*) AS total FROM community_comments c WHERE ${where}`,
    params,
  );
  const [rows] = await getPool().query(
    `SELECT c.id, c.user_id AS authorId, u.display_name AS authorName, c.content, c.status, c.created_at AS createdAt,
    IF(c.user_id = ?, c.moderation_note, NULL) AS moderationNote FROM community_comments c JOIN users u ON u.id = c.user_id
    WHERE ${where} ORDER BY c.created_at, c.id LIMIT ? OFFSET ?`,
    [userId ?? null, ...params, query.limit, (query.page - 1) * query.limit],
  );
  return pageResult(rows, query, total);
}

async function interact(id, userId, kind, content) {
  return withTransaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const row = await post(conn, id, userId, true);
    if (row.status !== 'published') throw AppError.conflict('POST_NOT_PUBLIC', 'Bài chưa công khai');
    if (kind === 'comment') {
      await rate(conn, userId, 'comment', 50);
      await conn.query('INSERT INTO community_comments (post_id, user_id, content) VALUES (?, ?, ?)', [
        id,
        userId,
        content,
      ]);
    } else if (kind === 'like') {
      await conn.query('INSERT IGNORE INTO community_likes (post_id, user_id) VALUES (?, ?)', [id, userId]);
    } else {
      await conn.query('DELETE FROM community_likes WHERE post_id = ? AND user_id = ?', [id, userId]);
    }
  });
}

async function report(id, type, userId, body) {
  const table = type === 'post' ? 'community_posts' : 'community_comments';
  const field = type === 'post' ? 'post_id' : 'comment_id';
  try {
    await withTransaction(async (conn) => {
      await rate(conn, userId, 'report', 10);
      const [[row]] = await conn.query(`SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
      if (!row || row.status !== 'published') throw AppError.notFound();
      if (row.user_id === userId) throw AppError.forbidden('Không thể báo cáo nội dung của mình');
      if (type === 'comment' && (await post(conn, row.post_id, null)).status !== 'published') throw AppError.notFound();
      await conn.query(`INSERT INTO community_reports (${field}, reporter_id, reason, details) VALUES (?, ?, ?, ?)`, [
        id,
        userId,
        body.reason,
        body.details,
      ]);
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw AppError.conflict('ALREADY_REPORTED', 'Bạn đã báo cáo nội dung này');
    throw error;
  }
}

module.exports = { detail, list, save, remove, comments, interact, report };
