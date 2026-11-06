'use strict';

const express = require('express');
const { z } = require('zod');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { line, checkbox, idParams } = require('../../utils/http');
const { blockUser, unblockUser, BLOCK_DURATIONS } = require('../users/block.service');
const { isBlocked } = require('../dto');
const { paginate } = require('./helpers');

const PAGE_SIZE = 20;

const blockSchema = z.object({
  duration: z.enum(['1', '7', '30', 'permanent'], { error: 'Chọn thời hạn khóa' }),
  reason: line(3, 255, 'Lý do khóa phải từ 3 đến 255 ký tự'),
  hideReviews: checkbox,
});

const BLOCKED_SQL = '(u.blocked_permanent = TRUE OR u.blocked_until > UTC_TIMESTAMP())';

/** FR-A08: người dùng, khóa và mở khóa. */
function createUsersRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const status = ['unverified', 'active', 'blocked'].includes(req.query.status) ? req.query.status : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const where = ['1 = 1'];
    const params = [];
    if (q) {
      where.push('(u.email LIKE ? OR u.display_name LIKE ?)');
      const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like);
    }
    if (status === 'unverified') where.push('u.email_verified_at IS NULL');
    if (status === 'active') where.push(`u.email_verified_at IS NOT NULL AND NOT ${BLOCKED_SQL}`);
    if (status === 'blocked') where.push(BLOCKED_SQL);
    const pool = getPool();
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`, params);
    const pager = paginate(total, page, PAGE_SIZE);
    const [rows] = await pool.query(
      `SELECT u.*, (SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id) AS review_count,
              (SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id AND r.reject_reason = 'spam'
                  AND r.moderated_at > UTC_TIMESTAMP() - INTERVAL 30 DAY) AS spam_count
         FROM users u WHERE ${whereSql} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, pager.offset],
    );
    res.render('admin/users/index', { title: 'Người dùng', rows, pager, query: { q, status }, isBlocked });
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const pool = getPool();
    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) throw AppError.notFound('NOT_FOUND', 'Không tìm thấy người dùng');
    const [reviews] = await pool.query(
      `SELECT rv.id, rv.rating, rv.status, rv.reject_reason, rv.comment, rv.updated_at, r.id AS restaurant_id, r.name AS restaurant_name
         FROM reviews rv JOIN restaurants r ON r.id = rv.restaurant_id WHERE rv.user_id = ? ORDER BY rv.updated_at DESC LIMIT 50`,
      [id],
    );
    const [reports] = await pool.query(
      'SELECT rp.review_id, rp.reason, rp.status, rp.created_at FROM review_reports rp WHERE rp.reporter_id = ? ORDER BY rp.created_at DESC LIMIT 50',
      [id],
    );
    const [blocks] = await pool.query(
      `SELECT b.*, a.username FROM user_blocks b LEFT JOIN admins a ON a.id = b.admin_id
        WHERE b.user_id = ? ORDER BY b.created_at DESC`,
      [id],
    );
    res.render('admin/users/show', {
      title: user.display_name,
      user,
      reviews,
      reports,
      blocks,
      blocked: isBlocked(user),
      durations: BLOCK_DURATIONS,
    });
  });

  router.post('/:id/block', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const parsed = blockSchema.safeParse(req.body);
    if (!parsed.success) {
      req.flash('danger', parsed.error.issues[0].message);
      res.redirect(`/admin/users/${id}`);
      return;
    }
    await withTransaction((conn) => blockUser(conn, req, { userId: id, ...parsed.data }));
    req.flash('success', 'Đã khóa người dùng và đăng xuất mọi phiên của họ.');
    res.redirect(`/admin/users/${id}`);
  });

  router.post('/:id/unblock', async (req, res) => {
    const { id } = idParams.parse(req.params);
    await withTransaction((conn) => unblockUser(conn, req, id));
    req.flash('success', 'Đã mở khóa người dùng.');
    res.redirect(`/admin/users/${id}`);
  });

  return router;
}

module.exports = { createUsersRouter };
