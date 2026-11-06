'use strict';

const { AppError } = require('../../errors');
const { recalculateRestaurantRating } = require('../../services/rating');
const { revokeAllForUser } = require('../auth/token.service');
const { logAdminAction } = require('../audit/audit.service');

// FR-A08: thời hạn khóa. null = vĩnh viễn.
const BLOCK_DURATIONS = { 1: '1 ngày', 7: '7 ngày', 30: '30 ngày', permanent: 'Vĩnh viễn' };

/**
 * Khóa người dùng trong transaction `conn`: thu hồi refresh token, tùy chọn ẩn review
 * đã đăng và từ chối review chờ duyệt, ghi lịch sử và nhật ký.
 */
async function blockUser(conn, req, { userId, duration, reason, hideReviews = false }) {
  const [[user]] = await conn.query('SELECT id, email FROM users WHERE id = ? FOR UPDATE', [userId]);
  if (!user) {
    throw AppError.notFound('NOT_FOUND', 'Không tìm thấy người dùng');
  }
  const permanent = duration === 'permanent';
  const days = permanent ? null : Number(duration);
  await conn.query(
    `UPDATE users SET blocked_permanent = ?, block_reason = ?,
            blocked_until = IF(?, NULL, UTC_TIMESTAMP() + INTERVAL ? DAY), token_version = token_version + 1
      WHERE id = ?`,
    [permanent, reason, permanent, days ?? 0, userId],
  );
  await revokeAllForUser(conn, userId);
  if (hideReviews) {
    const [published] = await conn.query(
      "SELECT DISTINCT restaurant_id FROM reviews WHERE user_id = ? AND status = 'published'",
      [userId],
    );
    await conn.query(
      `UPDATE reviews SET status = IF(status = 'published', 'hidden', 'rejected'),
              reject_reason = IF(status = 'pending', 'spam', reject_reason),
              moderation_note = 'Tài khoản bị khóa', moderated_by = ?, moderated_at = UTC_TIMESTAMP()
        WHERE user_id = ? AND status IN ('published', 'pending')`,
      [req.admin.id, userId],
    );
    for (const row of published) {
      await recalculateRestaurantRating(conn, row.restaurant_id);
    }
  }
  await conn.query(
    "INSERT INTO user_blocks (user_id, admin_id, action, duration_days, reason) VALUES (?, ?, 'block', ?, ?)",
    [userId, req.admin.id, days, reason],
  );
  await logAdminAction(conn, req, {
    action: 'user.block',
    targetType: 'user',
    targetId: userId,
    summary: `Khóa ${BLOCK_DURATIONS[duration] ?? `${days} ngày`}: ${reason}${hideReviews ? ' (ẩn review)' : ''}`,
  });
}

async function unblockUser(conn, req, userId) {
  await conn.query(
    'UPDATE users SET blocked_permanent = FALSE, blocked_until = NULL, block_reason = NULL WHERE id = ?',
    [userId],
  );
  await conn.query(
    "INSERT INTO user_blocks (user_id, admin_id, action, duration_days, reason) VALUES (?, ?, 'unblock', NULL, 'Mở khóa')",
    [userId, req.admin.id],
  );
  await logAdminAction(conn, req, { action: 'user.unblock', targetType: 'user', targetId: userId, summary: 'Mở khóa' });
}

module.exports = { blockUser, unblockUser, BLOCK_DURATIONS };
