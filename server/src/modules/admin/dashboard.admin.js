'use strict';

const express = require('express');
const { getPool } = require('../../db');

/** GET /admin — số liệu tổng quan (FR-A02). */
function createDashboardRouter() {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    const pool = getPool();
    const [[stats]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM reviews WHERE status = 'pending') AS pending_reviews,
         (SELECT COUNT(*) FROM review_reports WHERE status = 'open') AS open_reports,
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM users WHERE blocked_permanent OR blocked_until > UTC_TIMESTAMP()) AS blocked_users,
         (SELECT COUNT(*) FROM foods) AS foods,
         (SELECT COUNT(*) FROM restaurants WHERE status = 'active') AS active_restaurants,
         (SELECT COUNT(*) FROM posts WHERE status = 'visible') AS visible_posts,
         (SELECT COUNT(*) FROM content_reports WHERE status = 'open') AS open_content_reports,
         (SELECT COUNT(*) FROM group_rooms WHERE phase IN ('selecting', 'voting') AND expires_at > UTC_TIMESTAMP()) AS active_rooms`,
    );
    const [hotReports] = await pool.query(
      `SELECT rv.id, r.name AS restaurant_name, COUNT(*) AS report_count
         FROM review_reports rp JOIN reviews rv ON rv.id = rp.review_id JOIN restaurants r ON r.id = rv.restaurant_id
        WHERE rp.status = 'open' GROUP BY rv.id HAVING report_count >= 3 ORDER BY report_count DESC LIMIT 10`,
    );
    const [logs] = await pool.query(
      `SELECT l.action, l.summary, l.created_at, a.username
         FROM admin_audit_logs l LEFT JOIN admins a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT 10`,
    );
    res.render('admin/dashboard', { title: 'Dashboard', stats, hotReports, logs });
  });

  return router;
}

module.exports = { createDashboardRouter };
