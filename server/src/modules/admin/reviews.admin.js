'use strict';

const express = require('express');
const { z } = require('zod');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { optionalText, stringArray, checkbox, idParams } = require('../../utils/http');
const { recalculateRestaurantRating } = require('../../services/rating');
const { REVIEW_SELECT, withImages, deleteReviewById } = require('../reviews/review.service');
const { logAdminAction } = require('../audit/audit.service');
const { blockUser, BLOCK_DURATIONS } = require('../users/block.service');
const { REJECT_REASON_LABELS } = require('../dto');
const { paginate } = require('./helpers');

const PAGE_SIZE = 20;
const REJECT_REASONS = Object.keys(REJECT_REASON_LABELS);

// FR-R01: chuyển trạng thái hợp lệ của admin.
const TRANSITIONS = {
  approve: { from: ['pending'], to: 'published' },
  reject: { from: ['pending'], to: 'rejected' },
  hide: { from: ['published'], to: 'hidden' },
  unhide: { from: ['hidden'], to: 'published' },
};

const actionSchema = z
  .object({
    reason: z
      .union([z.enum(REJECT_REASONS), z.literal('')])
      .optional()
      .transform((v) => v || null),
    note: optionalText(300, 'Ghi chú tối đa 300 ký tự'),
    block: checkbox,
    duration: z.enum(['1', '7', '30', 'permanent']).catch('7').default('7'),
    back: z.string().optional(),
  })
  .refine((v) => v.reason !== 'other' || v.note, { path: ['note'], message: 'Nhập ghi chú khi chọn Lý do khác' });

/** Đổi trạng thái một review trong transaction; tính lại điểm nếu tập published thay đổi. */
async function moderate(conn, req, reviewId, action, { reason = null, note = null } = {}) {
  const rule = TRANSITIONS[action];
  const [[row]] = await conn.query('SELECT id, user_id, restaurant_id, status FROM reviews WHERE id = ? FOR UPDATE', [
    reviewId,
  ]);
  if (!row) throw AppError.notFound('REVIEW_NOT_FOUND', 'Không tìm thấy review');
  if (!rule.from.includes(row.status)) {
    throw new AppError(409, 'INVALID_TRANSITION', `Review #${reviewId} đang ở trạng thái không cho phép thao tác này`);
  }
  if (action === 'reject' && !reason) {
    throw AppError.validation({ reason: 'Chọn lý do từ chối' }, 'Chọn lý do từ chối');
  }
  await conn.query(
    `UPDATE reviews SET status = ?, reject_reason = ?, moderation_note = ?, moderated_by = ?, moderated_at = UTC_TIMESTAMP(),
            published_at = IF(? = 'published', COALESCE(published_at, UTC_TIMESTAMP()), published_at)
      WHERE id = ?`,
    [rule.to, action === 'reject' ? reason : null, note, req.admin.id, rule.to, reviewId],
  );
  if (row.status === 'published' || rule.to === 'published') {
    await recalculateRestaurantRating(conn, row.restaurant_id);
  }
  // Ẩn review thì các báo cáo đang mở được xem là đã xử lý (FR-A07).
  if (action === 'hide') {
    await conn.query(
      "UPDATE review_reports SET status = 'resolved', handled_by = ?, handled_at = UTC_TIMESTAMP() WHERE review_id = ? AND status = 'open'",
      [req.admin.id, reviewId],
    );
  }
  await logAdminAction(conn, req, {
    action: `review.${action}`,
    targetType: 'review',
    targetId: reviewId,
    summary:
      action === 'reject'
        ? `Từ chối: ${REJECT_REASON_LABELS[reason]}${note ? ` - ${note}` : ''}`
        : `Review #${reviewId}: ${action}`,
  });
  return row;
}

function safeBack(value, fallback) {
  return typeof value === 'string' && value.startsWith('/admin/') && !value.startsWith('//') ? value : fallback;
}

async function listReviews(where, params, page, order) {
  const pool = getPool();
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM reviews rv WHERE ${where}`, params);
  const pager = paginate(total, page, PAGE_SIZE);
  const [rows] = await pool.query(
    `${REVIEW_SELECT.replace(
      'FROM reviews rv',
      `, r.name AS restaurant_name, u.email AS author_email,
         (SELECT COUNT(*) FROM reviews x WHERE x.user_id = rv.user_id AND x.status = 'published') AS author_published,
         (SELECT COUNT(*) FROM reviews x WHERE x.user_id = rv.user_id AND x.status = 'rejected') AS author_rejected,
         (SELECT COUNT(*) FROM reviews x WHERE x.user_id = rv.user_id AND x.reject_reason = 'spam'
             AND x.moderated_at > UTC_TIMESTAMP() - INTERVAL 30 DAY) AS author_spam,
         (SELECT COUNT(*) FROM review_reports rp WHERE rp.review_id = rv.id AND rp.status = 'open') AS open_reports
       FROM reviews rv JOIN restaurants r ON r.id = rv.restaurant_id`,
    )} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, pager.offset],
  );
  const dtos = await withImages(pool, rows, { includeModeration: true });
  const items = rows.map((row, index) => ({ ...dtos[index], raw: row }));
  return { items, pager };
}

function createReviewsRouter() {
  const router = express.Router();

  // Hàng chờ duyệt: cũ nhất trước (FR-A06).
  router.get('/pending', async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const { items, pager } = await listReviews("rv.status = 'pending'", [], page, 'rv.updated_at ASC, rv.id ASC');
    res.render('admin/reviews/list', {
      title: 'Duyệt review',
      items,
      pager,
      pending: true,
      reasons: REJECT_REASONS,
      durations: BLOCK_DURATIONS,
      query: {},
      back: req.originalUrl,
    });
  });

  // Tất cả review, có lọc.
  router.get('/', async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const status = ['pending', 'published', 'rejected', 'hidden'].includes(req.query.status) ? req.query.status : null;
    const restaurantId = Number(req.query.restaurant) || null;
    const userId = Number(req.query.user) || null;
    const rating = [1, 2, 3, 4, 5].includes(Number(req.query.rating)) ? Number(req.query.rating) : null;
    const where = ['1 = 1'];
    const params = [];
    if (status) {
      where.push('rv.status = ?');
      params.push(status);
    }
    if (restaurantId) {
      where.push('rv.restaurant_id = ?');
      params.push(restaurantId);
    }
    if (userId) {
      where.push('rv.user_id = ?');
      params.push(userId);
    }
    if (rating) {
      where.push('rv.rating = ?');
      params.push(rating);
    }
    const { items, pager } = await listReviews(where.join(' AND '), params, page, 'rv.updated_at DESC, rv.id DESC');
    const [restaurants] = await getPool().query('SELECT id, name FROM restaurants ORDER BY name');
    res.render('admin/reviews/list', {
      title: 'Tất cả review',
      items,
      pager,
      pending: false,
      reasons: REJECT_REASONS,
      durations: BLOCK_DURATIONS,
      restaurants,
      query: { status, restaurantId, userId, rating },
      back: req.originalUrl,
    });
  });

  // Duyệt / từ chối hàng loạt.
  router.post('/bulk', async (req, res) => {
    const ids = stringArray
      .parse(req.body.ids)
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    const action = req.body.action === 'reject' ? 'reject' : 'approve';
    const parsed = actionSchema.safeParse(req.body);
    const back = safeBack(req.body.back, '/admin/reviews/pending');
    if (ids.length === 0) {
      req.flash('warning', 'Chưa chọn review nào.');
    } else if (!parsed.success || (action === 'reject' && !parsed.data.reason)) {
      req.flash('danger', 'Chọn lý do từ chối (và nhập ghi chú nếu chọn Lý do khác).');
    } else {
      let done = 0;
      const skipped = [];
      for (const id of ids) {
        try {
          await withTransaction((conn) => moderate(conn, req, id, action, parsed.data));
          done += 1;
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          skipped.push(id);
        }
      }
      req.flash('success', `Đã ${action === 'approve' ? 'duyệt' : 'từ chối'} ${done} review.`);
      if (skipped.length > 0) req.flash('warning', `Bỏ qua ${skipped.length} review đã được xử lý trước đó.`);
    }
    res.redirect(back);
  });

  // Thao tác một review.
  router.post('/:id/:action', async (req, res, next) => {
    const { id } = idParams.parse({ id: req.params.id });
    const action = req.params.action;
    const back = safeBack(req.body.back, '/admin/reviews');
    if (action === 'delete') {
      await deleteReviewById(id);
      await logAdminAction(getPool(), req, {
        action: 'review.delete',
        targetType: 'review',
        targetId: id,
        summary: `Xóa vĩnh viễn review #${id}`,
      });
      req.flash('success', `Đã xóa review #${id}.`);
      res.redirect(back);
      return;
    }
    if (!TRANSITIONS[action]) {
      next();
      return;
    }
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      req.flash('danger', Object.values(parsed.error.issues.map((i) => i.message))[0]);
      res.redirect(back);
      return;
    }
    const data = parsed.data;
    try {
      await withTransaction(async (conn) => {
        const row = await moderate(conn, req, id, action, data);
        // "Từ chối và khóa" hoặc "Ẩn và khóa tác giả".
        if (data.block && (action === 'reject' || action === 'hide')) {
          await blockUser(conn, req, {
            userId: row.user_id,
            duration: data.duration,
            reason: data.note || REJECT_REASON_LABELS[data.reason ?? 'spam'],
            hideReviews: true,
          });
        }
      });
    } catch (error) {
      if (!(error instanceof AppError) || error.status >= 500) throw error;
      req.flash('danger', error.message);
      res.redirect(back);
      return;
    }
    const verb = { approve: 'duyệt', reject: 'từ chối', hide: 'ẩn', unhide: 'hiện lại' }[action];
    req.flash('success', `Đã ${verb} review #${id}${data.block ? ' và khóa tác giả' : ''}.`);
    res.redirect(back);
  });

  return router;
}

module.exports = { createReviewsRouter, moderate };
