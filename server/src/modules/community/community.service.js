'use strict';

const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { processImage } = require('../../services/image');
const { getStorage } = require('../../services/storage');
const { pageResult } = require('../../utils/http');
const { uploadUrl } = require('../dto');

// requirements-mo-rong.md FR-C01, FR-C03, mục 7 (đã chốt 13/11/2026).
const MAX_IMAGES = 3;
const MAX_CONTENT = 2000;
const MAX_COMMENT = 500;
const MAX_POSTS_PER_DAY = 10;
const MAX_COMMENTS_PER_DAY = 60;
const MAX_REPORTS_PER_DAY = 10;

/**
 * Bài kèm tác giả, số đếm và trạng thái của người xem. Tham số đầu tiên là id
 * người xem (0 = khách). Món/quán chỉ có link khi còn công khai (FR-C01).
 */
const POST_SELECT = `
  SELECT p.id, p.user_id, p.content, p.food_id, p.food_name, p.restaurant_id, p.restaurant_name,
         p.status, p.moderation_note, p.edited_at, p.created_at,
         u.display_name AS author_name,
         (f.id IS NOT NULL AND f.status = 'active' AND fc.status = 'active') AS food_public,
         (r.id IS NOT NULL AND r.status = 'active') AS restaurant_public,
         (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id AND pc.status = 'visible') AS comment_count,
         EXISTS (SELECT 1 FROM post_likes ml WHERE ml.post_id = p.id AND ml.user_id = ?) AS liked
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN foods f ON f.id = p.food_id
    LEFT JOIN food_categories fc ON fc.id = f.category_id
    LEFT JOIN restaurants r ON r.id = p.restaurant_id`;

async function loadImages(conn, postIds) {
  if (postIds.length === 0) {
    return new Map();
  }
  const [rows] = await conn.query(
    'SELECT id, post_id, image_path, thumb_path, width, height FROM post_images WHERE post_id IN (?) ORDER BY sort_order, id',
    [postIds],
  );
  const byPost = new Map();
  for (const row of rows) {
    const list = byPost.get(row.post_id) ?? [];
    list.push({
      id: row.id,
      url: uploadUrl(row.image_path),
      thumbUrl: uploadUrl(row.thumb_path),
      width: row.width,
      height: row.height,
    });
    byPost.set(row.post_id, list);
  }
  return byPost;
}

function toPostDto(row, images, viewerId) {
  const mine = viewerId != null && row.user_id === viewerId;
  const dto = {
    id: row.id,
    author: { id: row.user_id, displayName: row.author_name },
    content: row.content,
    food: row.food_name ? { id: row.food_public ? row.food_id : null, name: row.food_name } : null,
    restaurant: row.restaurant_name
      ? { id: row.restaurant_public ? row.restaurant_id : null, name: row.restaurant_name }
      : null,
    images: images ?? [],
    likeCount: Number(row.like_count),
    commentCount: Number(row.comment_count),
    likedByMe: Boolean(row.liked),
    createdAt: row.created_at,
    edited: row.edited_at != null,
    isMine: mine,
  };
  if (mine) {
    dto.status = row.status;
    dto.moderationNote = row.moderation_note;
  }
  return dto;
}

async function toPostDtos(conn, rows, viewerId) {
  const images = await loadImages(
    conn,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toPostDto(row, images.get(row.id), viewerId));
}

function postNotFound() {
  return AppError.notFound('POST_NOT_FOUND', 'Không tìm thấy bài viết');
}

/** Bài mà người xem được phép thấy: bài công khai, hoặc bài của chính họ. */
async function findViewablePost(conn, postId, viewerId) {
  const [[row]] = await conn.query(`${POST_SELECT} WHERE p.id = ?`, [viewerId ?? 0, postId]);
  if (!row || (row.status !== 'visible' && row.user_id !== viewerId)) {
    throw postNotFound();
  }
  return row;
}

async function getPost(postId, viewerId) {
  const pool = getPool();
  const row = await findViewablePost(pool, postId, viewerId);
  const [dto] = await toPostDtos(pool, [row], viewerId);
  return dto;
}

/** FR-C02: bảng tin Mới nhất hoặc Đang theo dõi, mới nhất trước. */
async function listFeed({ filter, page, limit }, viewer) {
  const pool = getPool();
  const viewerId = viewer?.id ?? null;
  const where = ["p.status = 'visible'"];
  const params = [];
  if (filter === 'following') {
    if (!viewer) {
      throw AppError.unauthenticated('Đăng nhập để xem bài của người bạn theo dõi');
    }
    where.push('p.user_id IN (SELECT followee_id FROM user_follows WHERE follower_id = ?)');
    params.push(viewer.id);
  }
  const whereSql = where.join(' AND ');
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM posts p WHERE ${whereSql}`, params);
  const [rows] = await pool.query(
    `${POST_SELECT} WHERE ${whereSql} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [viewerId ?? 0, ...params, limit, (page - 1) * limit],
  );
  return pageResult(await toPostDtos(pool, rows, viewerId), { page, limit }, total);
}

/** Bài công khai của một người (hồ sơ công khai) hoặc mọi bài của chính mình (`includeHidden`). */
async function listUserPosts(userId, { page, limit }, viewerId, { includeHidden = false } = {}) {
  const pool = getPool();
  const whereSql = includeHidden ? 'p.user_id = ?' : "p.user_id = ? AND p.status = 'visible'";
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM posts p WHERE ${whereSql}`, [userId]);
  const [rows] = await pool.query(
    `${POST_SELECT} WHERE ${whereSql} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [viewerId ?? 0, userId, limit, (page - 1) * limit],
  );
  return pageResult(await toPostDtos(pool, rows, viewerId), { page, limit }, total);
}

async function findPublicUser(conn, userId) {
  const [[user]] = await conn.query(
    'SELECT id, display_name, created_at FROM users WHERE id = ? AND email_verified_at IS NOT NULL',
    [userId],
  );
  if (!user) {
    throw AppError.notFound('USER_NOT_FOUND', 'Không tìm thấy người dùng');
  }
  return user;
}

/** FR-C02: hồ sơ công khai, không có email hay thông tin riêng. */
async function getPublicProfile(userId, viewerId) {
  const pool = getPool();
  const user = await findPublicUser(pool, userId);
  const [[counts]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM user_follows WHERE followee_id = ?) AS followers,
            (SELECT COUNT(*) FROM user_follows WHERE follower_id = ?) AS following,
            (SELECT COUNT(*) FROM posts WHERE user_id = ? AND status = 'visible') AS posts,
            EXISTS (SELECT 1 FROM user_follows WHERE follower_id = ? AND followee_id = ?) AS followed`,
    [userId, userId, userId, viewerId ?? 0, userId],
  );
  return {
    id: user.id,
    displayName: user.display_name,
    joinedAt: user.created_at,
    followerCount: Number(counts.followers),
    followingCount: Number(counts.following),
    postCount: Number(counts.posts),
    isFollowing: Boolean(counts.followed),
    isMe: viewerId === user.id,
  };
}

async function setFollow(followeeId, user, follow) {
  if (followeeId === user.id) {
    throw new AppError(400, 'CANNOT_FOLLOW_SELF', 'Bạn không thể theo dõi chính mình');
  }
  const pool = getPool();
  await findPublicUser(pool, followeeId);
  if (follow) {
    await pool.query('INSERT IGNORE INTO user_follows (follower_id, followee_id) VALUES (?, ?)', [user.id, followeeId]);
  } else {
    await pool.query('DELETE FROM user_follows WHERE follower_id = ? AND followee_id = ?', [user.id, followeeId]);
  }
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM user_follows WHERE followee_id = ?', [followeeId]);
  return { following: follow, followerCount: Number(n) };
}

async function assertDailyLimit(conn, sql, userId, max, message) {
  const [[recent]] = await conn.query(sql, [userId]);
  if (recent.n >= max) {
    const oldest = recent.oldest ? new Date(recent.oldest).getTime() : Date.now();
    throw AppError.rateLimited((oldest + 24 * 3600_000 - Date.now()) / 1000, 'RATE_LIMITED', message);
  }
}

/** Món còn công khai (món và nhóm đều active) hoặc lỗi trường foodId. */
async function resolveFood(conn, foodId) {
  if (foodId == null) {
    return { id: null, name: null };
  }
  const [[food]] = await conn.query(
    `SELECT f.id, f.name FROM foods f JOIN food_categories c ON c.id = f.category_id
      WHERE f.id = ? AND f.status = 'active' AND c.status = 'active'`,
    [foodId],
  );
  if (!food) {
    throw AppError.validation({ foodId: 'Món này không còn trong danh mục' });
  }
  return food;
}

async function resolveRestaurant(conn, restaurantId) {
  if (restaurantId == null) {
    return { id: null, name: null };
  }
  const [[restaurant]] = await conn.query("SELECT id, name FROM restaurants WHERE id = ? AND status = 'active'", [
    restaurantId,
  ]);
  if (!restaurant) {
    throw AppError.validation({ restaurantId: 'Quán này không còn hoạt động' });
  }
  return restaurant;
}

function tooManyImages() {
  return AppError.validation({ images: `Tối đa ${MAX_IMAGES} ảnh` });
}

function emptyPost() {
  return AppError.validation({ content: 'Bài viết cần có nội dung hoặc ít nhất một ảnh' });
}

/** Kiểm tra và chuyển ảnh sang WebP trước khi mở transaction (giống review). */
function processUploads(files) {
  return Promise.all(files.map((file) => processImage(file.path)));
}

async function saveImages(conn, postId, processed, startOrder, written) {
  const storage = getStorage();
  for (const [index, image] of processed.entries()) {
    const saved = await storage.saveImagePair(`posts/${postId}`, image);
    written.push(saved.imagePath, saved.thumbPath);
    await conn.query(
      'INSERT INTO post_images (post_id, image_path, thumb_path, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [postId, saved.imagePath, saved.thumbPath, saved.width, saved.height, startOrder + index],
    );
  }
}

/** FR-C01: đăng bài mới, hiển thị ngay. */
async function createPost(user, body, files) {
  if (files.length > MAX_IMAGES) {
    throw tooManyImages();
  }
  if (!body.content && files.length === 0) {
    throw emptyPost();
  }
  const pool = getPool();
  await assertDailyLimit(
    pool,
    'SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM posts WHERE user_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY',
    user.id,
    MAX_POSTS_PER_DAY,
    `Bạn đã đăng tối đa ${MAX_POSTS_PER_DAY} bài trong 24 giờ, vui lòng thử lại sau`,
  );
  const food = await resolveFood(pool, body.foodId);
  const restaurant = await resolveRestaurant(pool, body.restaurantId);

  const processed = await processUploads(files);
  const written = [];
  let postId;
  try {
    postId = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO posts (user_id, content, food_id, food_name, restaurant_id, restaurant_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user.id, body.content, food.id, food.name, restaurant.id, restaurant.name],
      );
      await saveImages(conn, result.insertId, processed, 0, written);
      return result.insertId;
    });
  } catch (error) {
    await getStorage().removeFiles(written);
    throw error;
  }
  return getPost(postId, user.id);
}

/** FR-C01: tác giả sửa bài; bài bị ẩn không sửa được để tự hiện lại. */
async function updatePost(postId, user, body, files) {
  const processed = await processUploads(files);
  const written = [];
  let removedPaths = [];
  try {
    await withTransaction(async (conn) => {
      const [[row]] = await conn.query(
        'SELECT id, user_id, status, food_id, food_name, restaurant_id, restaurant_name FROM posts WHERE id = ? FOR UPDATE',
        [postId],
      );
      if (!row) {
        throw postNotFound();
      }
      if (row.user_id !== user.id) {
        throw AppError.forbidden('Bạn chỉ được sửa bài của chính mình');
      }
      if (row.status === 'hidden') {
        throw new AppError(403, 'POST_HIDDEN', 'Bài đã bị quản trị viên ẩn nên không sửa được, bạn chỉ có thể xóa');
      }
      // Giữ nguyên món/quán cũ thì không cần kiểm tra lại (có thể đã bị ẩn sau khi đăng).
      const food =
        body.foodId != null && body.foodId === row.food_id
          ? { id: row.food_id, name: row.food_name }
          : await resolveFood(conn, body.foodId);
      const restaurant =
        body.restaurantId != null && body.restaurantId === row.restaurant_id
          ? { id: row.restaurant_id, name: row.restaurant_name }
          : await resolveRestaurant(conn, body.restaurantId);

      const [images] = await conn.query('SELECT id, image_path, thumb_path FROM post_images WHERE post_id = ?', [
        postId,
      ]);
      const keep = new Set(body.keepImageIds);
      if ([...keep].some((id) => !images.some((image) => image.id === id))) {
        throw AppError.validation({ keepImageIds: 'Ảnh cần giữ không thuộc bài này' });
      }
      if (keep.size + processed.length > MAX_IMAGES) {
        throw tooManyImages();
      }
      if (!body.content && keep.size + processed.length === 0) {
        throw emptyPost();
      }
      const removed = images.filter((image) => !keep.has(image.id));
      if (removed.length > 0) {
        await conn.query('DELETE FROM post_images WHERE id IN (?)', [removed.map((image) => image.id)]);
      }
      removedPaths = removed.flatMap((image) => [image.image_path, image.thumb_path]);
      // Sắp lại thứ tự ảnh giữ lại 0..n-1 để ảnh mới nối tiếp không vượt CHECK sort_order < 3.
      for (const [index, id] of [...keep].entries()) {
        await conn.query('UPDATE post_images SET sort_order = ? WHERE id = ?', [index, id]);
      }
      await conn.query(
        `UPDATE posts SET content = ?, food_id = ?, food_name = ?, restaurant_id = ?, restaurant_name = ?,
                edited_at = UTC_TIMESTAMP() WHERE id = ?`,
        [body.content, food.id, food.name, restaurant.id, restaurant.name, postId],
      );
      await saveImages(conn, postId, processed, keep.size, written);
    });
  } catch (error) {
    await getStorage().removeFiles(written);
    throw error;
  }
  await getStorage().removeFiles(removedPaths);
  return getPost(postId, user.id);
}

/**
 * Xóa báo cáo trỏ tới bài/bình luận không còn tồn tại (sau khi xóa bài,
 * bình luận hoặc tài khoản). Không để lại dữ liệu mồ côi (FR-C05).
 */
async function purgeOrphanReports(conn) {
  await conn.query(
    `DELETE cr FROM content_reports cr
       LEFT JOIN posts p ON cr.target_type = 'post' AND p.id = cr.target_id
       LEFT JOIN post_comments c ON cr.target_type = 'comment' AND c.id = cr.target_id
      WHERE p.id IS NULL AND c.id IS NULL`,
  );
}

/** Xóa bài kèm ảnh, lượt thích, bình luận và báo cáo. ownerId = null khi admin xóa. */
async function deletePostById(postId, { ownerId = null } = {}) {
  await withTransaction(async (conn) => {
    const [[row]] = await conn.query('SELECT id, user_id FROM posts WHERE id = ? FOR UPDATE', [postId]);
    if (!row) {
      throw postNotFound();
    }
    if (ownerId != null && row.user_id !== ownerId) {
      throw AppError.forbidden('Bạn chỉ được xóa bài của chính mình');
    }
    await conn.query('DELETE FROM posts WHERE id = ?', [postId]);
    await purgeOrphanReports(conn);
  });
  await getStorage().removeDir(`posts/${postId}`);
}

async function countLikes(conn, postId) {
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?', [postId]);
  return Number(n);
}

/** FR-C03: thích/bỏ thích. Chỉ thích được bài đang công khai. */
async function setLike(postId, user, like) {
  const pool = getPool();
  const [[post]] = await pool.query('SELECT id, status FROM posts WHERE id = ?', [postId]);
  if (!post || (like && post.status !== 'visible')) {
    throw postNotFound();
  }
  if (like) {
    await pool.query('INSERT IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)', [postId, user.id]);
  } else {
    await pool.query('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, user.id]);
  }
  return { liked: like, likeCount: await countLikes(pool, postId) };
}

function toCommentDto(row, viewerId) {
  return {
    id: row.id,
    postId: row.post_id,
    author: { id: row.user_id, displayName: row.author_name },
    content: row.content,
    createdAt: row.created_at,
    isMine: viewerId != null && row.user_id === viewerId,
  };
}

const COMMENT_SELECT = `
  SELECT c.id, c.post_id, c.user_id, c.content, c.status, c.created_at, u.display_name AS author_name
    FROM post_comments c JOIN users u ON u.id = c.user_id`;

/** FR-C03: bình luận đang hiển thị của bài, cũ nhất trước. */
async function listComments(postId, { page, limit }, viewerId) {
  const pool = getPool();
  await findViewablePost(pool, postId, viewerId);
  const [[{ total }]] = await pool.query(
    "SELECT COUNT(*) AS total FROM post_comments WHERE post_id = ? AND status = 'visible'",
    [postId],
  );
  const [rows] = await pool.query(
    `${COMMENT_SELECT} WHERE c.post_id = ? AND c.status = 'visible' ORDER BY c.created_at, c.id LIMIT ? OFFSET ?`,
    [postId, limit, (page - 1) * limit],
  );
  return pageResult(
    rows.map((row) => toCommentDto(row, viewerId)),
    { page, limit },
    total,
  );
}

async function createComment(postId, user, { content }) {
  const pool = getPool();
  const [[post]] = await pool.query('SELECT id, status FROM posts WHERE id = ?', [postId]);
  if (!post || post.status !== 'visible') {
    throw postNotFound();
  }
  await assertDailyLimit(
    pool,
    'SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM post_comments WHERE user_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY',
    user.id,
    MAX_COMMENTS_PER_DAY,
    'Bạn bình luận quá nhiều hôm nay, vui lòng thử lại sau',
  );
  const [result] = await pool.query('INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)', [
    postId,
    user.id,
    content,
  ]);
  const [[row]] = await pool.query(`${COMMENT_SELECT} WHERE c.id = ?`, [result.insertId]);
  return toCommentDto(row, user.id);
}

/** Xóa bình luận kèm báo cáo. ownerId = null khi admin xóa. */
async function deleteCommentById(commentId, { ownerId = null } = {}) {
  await withTransaction(async (conn) => {
    const [[row]] = await conn.query('SELECT id, user_id FROM post_comments WHERE id = ? FOR UPDATE', [commentId]);
    if (!row) {
      throw AppError.notFound('COMMENT_NOT_FOUND', 'Không tìm thấy bình luận');
    }
    if (ownerId != null && row.user_id !== ownerId) {
      throw AppError.forbidden('Bạn chỉ được xóa bình luận của chính mình');
    }
    await conn.query('DELETE FROM post_comments WHERE id = ?', [commentId]);
    await purgeOrphanReports(conn);
  });
}

/** FR-C04: báo cáo bài hoặc bình luận đang hiển thị của người khác. */
async function reportContent(targetType, targetId, user, { reason, details }) {
  const pool = getPool();
  let owner;
  if (targetType === 'post') {
    const [[post]] = await pool.query('SELECT user_id, status FROM posts WHERE id = ?', [targetId]);
    if (!post || post.status !== 'visible') {
      throw postNotFound();
    }
    owner = post.user_id;
  } else {
    const [[comment]] = await pool.query(
      `SELECT c.user_id FROM post_comments c JOIN posts p ON p.id = c.post_id
        WHERE c.id = ? AND c.status = 'visible' AND p.status = 'visible'`,
      [targetId],
    );
    if (!comment) {
      throw AppError.notFound('COMMENT_NOT_FOUND', 'Không tìm thấy bình luận');
    }
    owner = comment.user_id;
  }
  if (owner === user.id) {
    throw new AppError(400, 'CANNOT_REPORT_OWN_CONTENT', 'Bạn không thể báo cáo nội dung của chính mình');
  }
  await assertDailyLimit(
    pool,
    'SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM content_reports WHERE reporter_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY',
    user.id,
    MAX_REPORTS_PER_DAY,
    'Bạn đã gửi quá nhiều báo cáo hôm nay, vui lòng thử lại sau',
  );
  try {
    await pool.query(
      'INSERT INTO content_reports (target_type, target_id, reporter_id, reason, details) VALUES (?, ?, ?, ?, ?)',
      [targetType, targetId, user.id, reason, details],
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw AppError.conflict('ALREADY_REPORTED', 'Bạn đã báo cáo nội dung này và báo cáo đang được xử lý');
    }
    throw error;
  }
}

module.exports = {
  MAX_IMAGES,
  MAX_CONTENT,
  MAX_COMMENT,
  POST_SELECT,
  COMMENT_SELECT,
  toPostDtos,
  listFeed,
  listUserPosts,
  getPost,
  getPublicProfile,
  setFollow,
  createPost,
  updatePost,
  deletePostById,
  setLike,
  listComments,
  createComment,
  deleteCommentById,
  reportContent,
  purgeOrphanReports,
};
