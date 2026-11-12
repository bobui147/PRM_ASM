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
    const { reviewIds, postIds } = await withTransaction(async (conn) => {
      // Cùng khóa với thao tác tạo bài để không bỏ sót thư mục ảnh khi xóa đồng thời.
      await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
      const [reviews] = await conn.query('SELECT id, restaurant_id FROM reviews WHERE user_id = ?', [req.user.id]);
      const [posts] = await conn.query('SELECT id FROM community_posts WHERE user_id = ?', [req.user.id]);
      await conn.query('DELETE FROM users WHERE id = ?', [req.user.id]);
      for (const restaurantId of new Set(reviews.map((review) => review.restaurant_id))) {
        await recalculateRestaurantRating(conn, restaurantId);
      }
      return { reviewIds: reviews.map((review) => review.id), postIds: posts.map((p) => p.id) };
    });
    const storage = getStorage();
    for (const id of postIds) {
      await storage
        .removeDir(`community/${id}`)
        .catch((error) => req.log?.warn({ err: error }, 'Không xóa được ảnh cộng đồng'));
    }
    for (const id of reviewIds) {
      await storage
        .removeDir(`reviews/${id}`)
        .catch((error) => req.log?.warn({ err: error }, 'Không xóa được ảnh review'));
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
