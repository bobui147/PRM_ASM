'use strict';

const express = require('express');
const { z } = require('zod');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { validate } = require('../../middleware/validate');
const { requireUser, requireNotBlocked } = require('../../middleware/auth');
const { hashPassword, verifyPassword } = require('../../services/password');
const { getStorage } = require('../../services/storage');
const { recalculateRestaurantRating } = require('../../services/rating');
const { toUserDto } = require('../dto');
const { revokeAllForUser, createSession } = require('../auth/token.service');
const { listMyReviews } = require('../reviews/review.service');
const { purgeOrphanReports } = require('../community/community.service');
const schema = require('../auth/auth.schema');
const { pageQuery } = require('../../utils/http');

async function checkPassword(userId, password) {
  const [[row]] = await getPool().query('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw AppError.validation({ password: 'Mật khẩu không đúng' }, 'Mật khẩu không đúng');
  }
}

/** /api/v1/me (requirements §13.3, FR-U05). */
function createMeRouter() {
  const router = express.Router();
  router.use(requireUser);

  router.get('/', (req, res) => {
    res.json(toUserDto(req.user));
  });

  router.patch('/', requireNotBlocked, validate({ body: schema.updateMeBody }), async (req, res) => {
    await getPool().query('UPDATE users SET display_name = ? WHERE id = ?', [req.valid.body.displayName, req.user.id]);
    res.json(toUserDto({ ...req.user, display_name: req.valid.body.displayName }));
  });

  router.post('/change-password', validate({ body: schema.changePasswordBody }), async (req, res) => {
    const { currentPassword, newPassword } = req.valid.body;
    const [[row]] = await getPool().query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!(await verifyPassword(currentPassword, row.password_hash))) {
      throw AppError.validation({ currentPassword: 'Mật khẩu hiện tại không đúng' }, 'Mật khẩu hiện tại không đúng');
    }
    const passwordHash = await hashPassword(newPassword);
    const tokens = await withTransaction(async (conn) => {
      await conn.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [
        passwordHash,
        req.user.id,
      ]);
      await revokeAllForUser(conn, req.user.id);
      return createSession(conn, { id: req.user.id, token_version: req.user.token_version + 1 }, req.get('user-agent'));
    });
    res.json(tokens);
  });

  router.delete('/', validate({ body: schema.deleteMeBody }), async (req, res) => {
    await checkPassword(req.user.id, req.valid.body.password);
    // CASCADE xóa review, bài, bình luận, lượt thích, theo dõi, phòng, thực đơn của tài khoản.
    const { reviewIds, postIds } = await withTransaction(async (conn) => {
      const [reviews] = await conn.query('SELECT id, restaurant_id FROM reviews WHERE user_id = ?', [req.user.id]);
      const [posts] = await conn.query('SELECT id FROM posts WHERE user_id = ?', [req.user.id]);
      await conn.query('DELETE FROM users WHERE id = ?', [req.user.id]);
      for (const restaurantId of new Set(reviews.map((review) => review.restaurant_id))) {
        await recalculateRestaurantRating(conn, restaurantId);
      }
      // Báo cáo trỏ tới bài/bình luận vừa bị xóa (FR-C05).
      await purgeOrphanReports(conn);
      return { reviewIds: reviews.map((review) => review.id), postIds: posts.map((post) => post.id) };
    });
    const storage = getStorage();
    const dirs = [...reviewIds.map((id) => `reviews/${id}`), ...postIds.map((id) => `posts/${id}`)];
    for (const dir of dirs) {
      await storage.removeDir(dir).catch((error) => req.log?.warn({ err: error }, 'Không xóa được thư mục ảnh'));
    }
    res.status(204).end();
  });

  router.get(
    '/reviews',
    validate({
      query: z.object({
        ...pageQuery(10, 30),
        status: z.enum(['pending', 'published', 'rejected', 'hidden']).optional().catch(undefined),
      }),
    }),
    async (req, res) => {
      res.json(await listMyReviews(req.user.id, req.valid.query));
    },
  );

  return router;
}

module.exports = { createMeRouter };
