'use strict';

const express = require('express');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { checkbox, idParams } = require('../../utils/http');
const { withImages, REVIEW_SELECT } = require('../reviews/review.service');
const { logAdminAction } = require('../audit/audit.service');
const { blockUser, BLOCK_DURATIONS } = require('../users/block.service');
const { moderate } = require('./reviews.admin');
const { paginate } = require('./helpers');

const PAGE_SIZE = 20;

/** FR-A07: báo cáo đang mở, gom theo review, nhiều báo cáo nhất trước. */
function createReportsRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const pool = getPool();
    const page = Math.max(1, Number(req.query.page) || 1);
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(DISTINCT review_id) AS total FROM review_reports WHERE status = 'open'",
    );
    const pager = paginate(total, page, PAGE_SIZE);
    const [groups] = await pool.query(
      `SELECT review_id, COUNT(*) AS n, MIN(created_at) AS first_at FROM review_reports
        WHERE status = 'open' GROUP BY review_id ORDER BY n DESC, first_at ASC LIMIT ? OFFSET ?`,
      [PAGE_SIZE, pager.offset],
    );
    let items = [];
    if (groups.length > 0) {
      const ids = groups.map((g) => g.review_id);
      const [rows] = await pool.query(
        `${REVIEW_SELECT.replace('FROM reviews rv', ', r.name AS restaurant_name, u.email AS author_email FROM reviews rv JOIN restaurants r ON r.id = rv.restaurant_id')}
          WHERE rv.id IN (?)`,
        [ids],
      );
      const dtos = await withImages(pool, rows, { includeModeration: true });
      const [reports] = await pool.query(
        `SELECT rp.review_id, rp.reason, rp.details, rp.created_at, u.id AS reporter_id, u.display_name, u.email
           FROM review_reports rp JOIN users u ON u.id = rp.reporter_id
          WHERE rp.review_id IN (?) AND rp.status = 'open' ORDER BY rp.created_at`,
        [ids],
      );
      const byId = new Map(rows.map((row, index) => [row.id, { ...dtos[index], raw: row }]));
      items = groups
        .filter((g) => byId.has(g.review_id))
        .map((g) => ({ ...byId.get(g.review_id), reports: reports.filter((rp) => rp.review_id === g.review_id) }));
    }
    res.render('admin/reports/index', { title: 'Báo cáo review', items, pager, durations: BLOCK_DURATIONS });
  });

  router.post('/review/:id/:action', async (req, res, next) => {
    const { id } = idParams.parse({ id: req.params.id });
    const action = req.params.action;
    if (action !== 'hide' && action !== 'dismiss') {
      next();
      return;
    }
    const block = checkbox.parse(req.body.block);
    const duration = ['1', '7', '30', 'permanent'].includes(req.body.duration) ? req.body.duration : '7';
    try {
      await withTransaction(async (conn) => {
        if (action === 'dismiss') {
          const [result] = await conn.query(
            "UPDATE review_reports SET status = 'dismissed', handled_by = ?, handled_at = UTC_TIMESTAMP() WHERE review_id = ? AND status = 'open'",
            [req.admin.id, id],
          );
          await logAdminAction(conn, req, {
            action: 'report.dismiss',
            targetType: 'review',
            targetId: id,
            summary: `Bỏ qua ${result.affectedRows} báo cáo`,
          });
          return;
        }
        // moderate('hide') cũng chuyển mọi báo cáo đang mở sang resolved.
        const row = await moderate(conn, req, id, 'hide', { note: 'Ẩn sau khi bị báo cáo' });
        if (block) {
          await blockUser(conn, req, {
            userId: row.user_id,
            duration,
            reason: 'Review vi phạm bị báo cáo',
            hideReviews: true,
          });
        }
      });
    } catch (error) {
      if (!(error instanceof AppError) || error.status >= 500) throw error;
      req.flash('danger', error.message);
      res.redirect('/admin/reports');
      return;
    }
    req.flash(
      'success',
      action === 'hide'
        ? `Đã ẩn review #${id}${block ? ' và khóa tác giả' : ''}.`
        : `Đã bỏ qua báo cáo của review #${id}.`,
    );
    res.redirect('/admin/reports');
  });

  return router;
}

module.exports = { createReportsRouter };
