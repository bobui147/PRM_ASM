'use strict';

// requirements FR-A09: ghi mọi thao tác của admin. Không ghi mật khẩu, token, OTP.

/**
 * @param {import('mysql2/promise').PoolConnection | import('mysql2/promise').Pool} conn
 * @param {import('express').Request} req  Cần req.admin và req.ip
 */
async function logAdminAction(conn, req, { action, targetType, targetId = null, summary }) {
  await conn.query(
    'INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, summary, ip) VALUES (?, ?, ?, ?, ?, ?)',
    [req.admin?.id ?? null, action, targetType, targetId, String(summary).slice(0, 500), req.ip ?? null],
  );
}

module.exports = { logAdminAction };
