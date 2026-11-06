'use strict';

const express = require('express');
const { getPool } = require('../../db');
const { paginate } = require('./helpers');

const PAGE_SIZE = 50;

/** FR-A09: nhật ký thao tác admin, lọc theo admin, thao tác, khoảng ngày. */
function createAuditRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const pool = getPool();
    const adminId = Number(req.query.admin) || null;
    const action = /^[a-z_.]{1,40}$/.test(req.query.action ?? '') ? req.query.action : null;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from ?? '') ? req.query.from : null;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to ?? '') ? req.query.to : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const where = ['1 = 1'];
    const params = [];
    if (adminId) {
      where.push('l.admin_id = ?');
      params.push(adminId);
    }
    if (action) {
      where.push('l.action LIKE ?');
      params.push(`${action}%`);
    }
    // Ngày nhập theo giờ Việt Nam (UTC+7).
    if (from) {
      where.push("l.created_at >= CONVERT_TZ(?, '+07:00', '+00:00')");
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      where.push("l.created_at < CONVERT_TZ(?, '+07:00', '+00:00') + INTERVAL 1 DAY");
      params.push(`${to} 00:00:00`);
    }
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM admin_audit_logs l WHERE ${whereSql}`,
      params,
    );
    const pager = paginate(total, page, PAGE_SIZE);
    const [rows] = await pool.query(
      `SELECT l.*, a.username FROM admin_audit_logs l LEFT JOIN admins a ON a.id = l.admin_id
        WHERE ${whereSql} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, pager.offset],
    );
    const [admins] = await pool.query('SELECT id, username FROM admins ORDER BY username');
    res.render('admin/audit/index', {
      title: 'Nhật ký thao tác',
      rows,
      pager,
      admins,
      query: { adminId, action, from, to },
    });
  });

  return router;
}

module.exports = { createAuditRouter };
