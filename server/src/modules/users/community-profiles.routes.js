'use strict';

const express = require('express');
const { getPool } = require('../../db');
const { AppError } = require('../../errors');
const { validate } = require('../../middleware/validate');
const { optionalUser, requireActiveUser } = require('../../middleware/auth');
const { writeLimiter } = require('../../middleware/rate-limit');
const { idParams } = require('../../utils/http');

function createCommunityProfilesRouter() {
  const router = express.Router();

  router.get('/users/:id/profile', optionalUser, validate({ params: idParams }), async (req, res) => {
    const [[user]] = await getPool().query(
      `SELECT u.id, u.display_name,
        (SELECT COUNT(*) FROM community_follows WHERE followed_id = u.id) AS followers,
        (SELECT COUNT(*) FROM community_follows WHERE follower_id = u.id) AS following,
        EXISTS(SELECT 1 FROM community_follows WHERE follower_id = ? AND followed_id = u.id) AS is_following
       FROM users u WHERE u.id = ? AND u.email_verified_at IS NOT NULL`,
      [req.user?.id ?? null, req.valid.params.id],
    );
    if (!user) throw AppError.notFound('USER_NOT_FOUND', 'Không tìm thấy người dùng');
    res.json({
      id: user.id,
      displayName: user.display_name,
      followers: user.followers,
      following: user.following,
      isFollowing: Boolean(user.is_following),
    });
  });

  router.put(
    '/users/:id/follow',
    writeLimiter,
    ...requireActiveUser,
    validate({ params: idParams }),
    async (req, res) => {
      const target = req.valid.params.id;
      if (target === req.user.id) throw AppError.validation({ id: 'Không thể tự theo dõi' });
      const [[user]] = await getPool().query('SELECT id FROM users WHERE id = ? AND email_verified_at IS NOT NULL', [
        target,
      ]);
      if (!user) throw AppError.notFound('USER_NOT_FOUND', 'Không tìm thấy người dùng');
      await getPool().query('INSERT IGNORE INTO community_follows (follower_id, followed_id) VALUES (?, ?)', [
        req.user.id,
        target,
      ]);
      res.status(204).end();
    },
  );

  router.delete(
    '/users/:id/follow',
    writeLimiter,
    ...requireActiveUser,
    validate({ params: idParams }),
    async (req, res) => {
      await getPool().query('DELETE FROM community_follows WHERE follower_id = ? AND followed_id = ?', [
        req.user.id,
        req.valid.params.id,
      ]);
      res.status(204).end();
    },
  );

  return router;
}

module.exports = { createCommunityProfilesRouter };
