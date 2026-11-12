'use strict';

const express = require('express');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { checkbox, idParams } = require('../../utils/http');
const { uploadUrl } = require('../dto');
const { logAdminAction } = require('../audit/audit.service');
const { blockUser, BLOCK_DURATIONS } = require('../users/block.service');
const community = require('../community/community.service');
const { paginate } = require('./helpers');

const PAGE_SIZE = 20;
const STATUS_LABELS = { visible: 'Đang hiển thị', hidden: 'Đã ẩn' };

function pageOf(req) {
  return Math.max(1, Math.min(10_000, Number(req.query.page) || 1));
}

/** Escape ký tự đặc biệt của LIKE. */
function likePattern(value) {
  return `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

async function handle(req, res, back, fn) {
  try {
    const message = await fn();
    req.flash('success', message);
  } catch (error) {
    if (!(error instanceof AppError) || error.status >= 500) throw error;
    req.flash('danger', error.message);
  }
  res.redirect(back);
}

/** Đường dẫn quay lại an toàn (chỉ trong /admin/community). */
function backUrl(req, fallback) {
  const back = typeof req.body.back === 'string' ? req.body.back : '';
  return back.startsWith('/admin/community/') ? back : fallback;
}

/** Ẩn/hiện bài hoặc bình luận; ẩn thì đóng mọi báo cáo đang mở của nội dung đó (resolved). */
async function setVisibility(conn, req, type, id, visible, note = null) {
  const table = type === 'post' ? 'posts' : 'post_comments';
  const [[row]] = await conn.query(`SELECT id, user_id, status FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
  if (!row) {
    throw AppError.notFound(
      'NOT_FOUND',
      type === 'post' ? 'Bài viết không còn tồn tại' : 'Bình luận không còn tồn tại',
    );
  }
  const target = visible ? 'visible' : 'hidden';
  if (row.status === target) {
    throw AppError.conflict('NO_CHANGE', visible ? 'Nội dung đang hiển thị rồi' : 'Nội dung đã bị ẩn rồi');
  }
  const noteSql = type === 'post' ? ', moderation_note = ?' : '';
  const params = type === 'post' ? [target, req.admin.id, visible ? null : note, id] : [target, req.admin.id, id];
  await conn.query(
    `UPDATE ${table} SET status = ?, moderated_by = ?, moderated_at = UTC_TIMESTAMP()${noteSql} WHERE id = ?`,
    params,
  );
  if (!visible) {
    await conn.query(
      `UPDATE content_reports SET status = 'resolved', handled_by = ?, handled_at = UTC_TIMESTAMP()
        WHERE target_type = ? AND target_id = ? AND status = 'open'`,
      [req.admin.id, type, id],
    );
  }
  // Nhật ký chỉ ghi mã nội dung, không ghi nội dung (FR-C05).
  await logAdminAction(conn, req, {
    action: `${type}.${visible ? 'unhide' : 'hide'}`,
    targetType: type,
    targetId: id,
    summary: `${visible ? 'Hiện lại' : 'Ẩn'} ${type === 'post' ? 'bài' : 'bình luận'} #${id} của user #${row.user_id}`,
  });
  return row;
}

/** Web admin cho cộng đồng ẩm thực (FR-C04): bài, bình luận, báo cáo. */
function createCommunityAdminRouter() {
  const router = express.Router();

  router.get('/posts', async (req, res) => {
    const pool = getPool();
    const query = {
      status: ['visible', 'hidden'].includes(req.query.status) ? req.query.status : '',
      q: typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '',
      userId: Number(req.query.user) > 0 ? Number(req.query.user) : null,
      reported: req.query.reported === '1',
    };
    const where = ['1 = 1'];
    const params = [];
    if (query.status) {
      where.push('p.status = ?');
      params.push(query.status);
    }
    if (query.q) {
      where.push('(p.content LIKE ? OR u.display_name LIKE ?)');
      params.push(likePattern(query.q), likePattern(query.q));
    }
    if (query.userId) {
      where.push('p.user_id = ?');
      params.push(query.userId);
    }
    if (query.reported) {
      where.push(
        "EXISTS (SELECT 1 FROM content_reports cr WHERE cr.target_type = 'post' AND cr.target_id = p.id AND cr.status = 'open')",
      );
    }
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM posts p JOIN users u ON u.id = p.user_id WHERE ${whereSql}`,
      params,
    );
    const pager = paginate(total, pageOf(req), PAGE_SIZE);
    const [rows] = await pool.query(
      `${community.POST_SELECT.replace('u.display_name AS author_name', 'u.display_name AS author_name, u.email AS author_email')}
        WHERE ${whereSql} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
      [0, ...params, PAGE_SIZE, pager.offset],
    );
    const dtos = await community.toPostDtos(pool, rows, null);
    const ids = rows.map((row) => row.id);
    const [reportCounts] = ids.length
      ? await pool.query(
          `SELECT target_id, COUNT(*) AS n FROM content_reports
            WHERE target_type = 'post' AND status = 'open' AND target_id IN (?) GROUP BY target_id`,
          [ids],
        )
      : [[]];
    const reportsById = new Map(reportCounts.map((r) => [r.target_id, Number(r.n)]));
    const items = dtos.map((dto, index) => ({
      ...dto,
      status: rows[index].status,
      moderationNote: rows[index].moderation_note,
      authorEmail: rows[index].author_email,
      openReports: reportsById.get(dto.id) ?? 0,
    }));
    res.render('admin/community/posts', {
      title: 'Bài cộng đồng',
      items,
      pager,
      query,
      statusLabels: STATUS_LABELS,
      back: req.originalUrl,
    });
  });

  router.post('/posts/:id/:action', async (req, res, next) => {
    const { id } = idParams.parse({ id: req.params.id });
    const { action } = req.params;
    if (!['hide', 'unhide', 'delete'].includes(action)) {
      next();
      return;
    }
    const back = backUrl(req, '/admin/community/posts');
    await handle(req, res, back, async () => {
      if (action === 'delete') {
        const [[row]] = await getPool().query('SELECT user_id FROM posts WHERE id = ?', [id]);
        if (!row) {
          throw AppError.notFound('NOT_FOUND', 'Bài viết không còn tồn tại');
        }
        await community.deletePostById(id);
        await logAdminAction(getPool(), req, {
          action: 'post.delete',
          targetType: 'post',
          targetId: id,
          summary: `Xóa bài #${id} của user #${row.user_id}`,
        });
        return `Đã xóa bài #${id}.`;
      }
      const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 300) || null : null;
      await withTransaction((conn) => setVisibility(conn, req, 'post', id, action === 'unhide', note));
      return action === 'hide' ? `Đã ẩn bài #${id}.` : `Đã hiện lại bài #${id}.`;
    });
  });

  router.get('/comments', async (req, res) => {
    const pool = getPool();
    const query = {
      status: ['visible', 'hidden'].includes(req.query.status) ? req.query.status : '',
      q: typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '',
      postId: Number(req.query.post) > 0 ? Number(req.query.post) : null,
    };
    const where = ['1 = 1'];
    const params = [];
    if (query.status) {
      where.push('c.status = ?');
      params.push(query.status);
    }
    if (query.q) {
      where.push('(c.content LIKE ? OR u.display_name LIKE ?)');
      params.push(likePattern(query.q), likePattern(query.q));
    }
    if (query.postId) {
      where.push('c.post_id = ?');
      params.push(query.postId);
    }
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM post_comments c JOIN users u ON u.id = c.user_id WHERE ${whereSql}`,
      params,
    );
    const pager = paginate(total, pageOf(req), PAGE_SIZE);
    const [items] = await pool.query(
      `SELECT c.id, c.post_id, c.user_id, c.content, c.status, c.created_at, u.display_name, u.email,
              (SELECT COUNT(*) FROM content_reports cr
                WHERE cr.target_type = 'comment' AND cr.target_id = c.id AND cr.status = 'open') AS open_reports
         FROM post_comments c JOIN users u ON u.id = c.user_id
        WHERE ${whereSql} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, pager.offset],
    );
    res.render('admin/community/comments', {
      title: 'Bình luận cộng đồng',
      items,
      pager,
      query,
      statusLabels: STATUS_LABELS,
      back: req.originalUrl,
    });
  });

  router.post('/comments/:id/:action', async (req, res, next) => {
    const { id } = idParams.parse({ id: req.params.id });
    const { action } = req.params;
    if (!['hide', 'unhide', 'delete'].includes(action)) {
      next();
      return;
    }
    const back = backUrl(req, '/admin/community/comments');
    await handle(req, res, back, async () => {
      if (action === 'delete') {
        const [[row]] = await getPool().query('SELECT user_id FROM post_comments WHERE id = ?', [id]);
        if (!row) {
          throw AppError.notFound('NOT_FOUND', 'Bình luận không còn tồn tại');
        }
        await community.deleteCommentById(id);
        await logAdminAction(getPool(), req, {
          action: 'comment.delete',
          targetType: 'comment',
          targetId: id,
          summary: `Xóa bình luận #${id} của user #${row.user_id}`,
        });
        return `Đã xóa bình luận #${id}.`;
      }
      await withTransaction((conn) => setVisibility(conn, req, 'comment', id, action === 'unhide'));
      return action === 'hide' ? `Đã ẩn bình luận #${id}.` : `Đã hiện lại bình luận #${id}.`;
    });
  });

  // Báo cáo đang mở, gom theo nội dung, nhiều báo cáo nhất trước.
  router.get('/reports', async (req, res) => {
    const pool = getPool();
    const type = ['post', 'comment'].includes(req.query.type) ? req.query.type : '';
    const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
    const where = type ? 'status = ? AND target_type = ?' : 'status = ?';
    const params = type ? [status, type] : [status];
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM (SELECT 1 FROM content_reports WHERE ${where} GROUP BY target_type, target_id) t`,
      params,
    );
    const pager = paginate(total, pageOf(req), PAGE_SIZE);
    const [groups] = await pool.query(
      `SELECT target_type, target_id, COUNT(*) AS n, MIN(created_at) AS first_at FROM content_reports
        WHERE ${where} GROUP BY target_type, target_id ORDER BY n DESC, first_at ASC LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, pager.offset],
    );
    const items = [];
    for (const group of groups) {
      const [reports] = await pool.query(
        `SELECT cr.reason, cr.details, cr.created_at, cr.status, u.id AS reporter_id, u.display_name
           FROM content_reports cr JOIN users u ON u.id = cr.reporter_id
          WHERE cr.target_type = ? AND cr.target_id = ? AND cr.status = ? ORDER BY cr.created_at`,
        [group.target_type, group.target_id, status],
      );
      let target = null;
      if (group.target_type === 'post') {
        const [[row]] = await pool.query(
          `SELECT p.id, p.content, p.status, p.user_id, p.created_at, u.display_name, u.email FROM posts p
             JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
          [group.target_id],
        );
        if (row) {
          const [images] = await pool.query(
            'SELECT image_path, thumb_path FROM post_images WHERE post_id = ? ORDER BY sort_order',
            [row.id],
          );
          target = {
            ...row,
            images: images.map((img) => ({ url: uploadUrl(img.image_path), thumbUrl: uploadUrl(img.thumb_path) })),
          };
        }
      } else {
        const [[row]] = await pool.query(
          `SELECT c.id, c.post_id, c.content, c.status, c.user_id, c.created_at, u.display_name, u.email
             FROM post_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
          [group.target_id],
        );
        target = row ? { ...row, images: [] } : null;
      }
      items.push({ type: group.target_type, id: group.target_id, target, reports });
    }
    res.render('admin/community/reports', {
      title: 'Báo cáo cộng đồng',
      items,
      pager,
      type,
      status,
      durations: BLOCK_DURATIONS,
    });
  });

  router.post('/reports/:type/:id/:action', async (req, res, next) => {
    const { id } = idParams.parse({ id: req.params.id });
    const { type, action } = req.params;
    if (!['post', 'comment'].includes(type) || !['hide', 'dismiss'].includes(action)) {
      next();
      return;
    }
    const block = checkbox.parse(req.body.block);
    const duration = ['1', '7', '30', 'permanent'].includes(req.body.duration) ? req.body.duration : '7';
    const label = type === 'post' ? 'bài' : 'bình luận';
    await handle(req, res, '/admin/community/reports', () =>
      withTransaction(async (conn) => {
        if (action === 'dismiss') {
          const [result] = await conn.query(
            `UPDATE content_reports SET status = 'dismissed', handled_by = ?, handled_at = UTC_TIMESTAMP()
              WHERE target_type = ? AND target_id = ? AND status = 'open'`,
            [req.admin.id, type, id],
          );
          if (result.affectedRows === 0) {
            throw AppError.conflict('NO_CHANGE', 'Không còn báo cáo đang mở cho nội dung này');
          }
          await logAdminAction(conn, req, {
            action: 'creport.dismiss',
            targetType: type,
            targetId: id,
            summary: `Bỏ qua ${result.affectedRows} báo cáo ${label} #${id}`,
          });
          return `Đã bỏ qua báo cáo của ${label} #${id}.`;
        }
        const row = await setVisibility(conn, req, type, id, false, 'Ẩn sau khi bị báo cáo');
        if (block) {
          await blockUser(conn, req, {
            userId: row.user_id,
            duration,
            reason: 'Nội dung cộng đồng vi phạm bị báo cáo',
          });
        }
        return `Đã ẩn ${label} #${id}${block ? ' và khóa tác giả' : ''}.`;
      }),
    );
  });

  return router;
}

module.exports = { createCommunityAdminRouter };
