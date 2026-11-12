'use strict';

const express = require('express');
const { z } = require('zod');
const { getPool } = require('../../db');
const { AppError } = require('../../errors');
const { validate } = require('../../middleware/validate');
const { optionalUser, requireActiveUser } = require('../../middleware/auth');
const { writeLimiter } = require('../../middleware/rate-limit');
const { uploadImages } = require('../../middleware/upload');
const { idParams, pageQuery, text, optionalInt, optionalText, stringArray } = require('../../utils/http');
const service = require('./community.service');

const postBody = z.object({
  content: optionalText(2000, 'Nội dung tối đa 2.000 ký tự').transform((v) => v ?? ''),
  foodId: optionalInt(1, 4294967295, 'Món không hợp lệ'),
  restaurantId: optionalInt(1, 4294967295, 'Quán không hợp lệ'),
  keepImageIds: stringArray.pipe(z.array(z.coerce.number().int().positive())),
});
const reportBody = z.object({
  reason: z.enum(['offensive', 'spam', 'misleading', 'inappropriate_image', 'other']),
  details: optionalText(300, 'Ghi chú tối đa 300 ký tự'),
});

function createCommunityRouter() {
  const router = express.Router();
  router.get(
    '/community/posts',
    optionalUser,
    validate({
      query: z.object({
        ...pageQuery(10, 30),
        authorId: z.coerce.number().int().positive().optional(),
        following: z
          .enum(['true', 'false'])
          .optional()
          .transform((v) => v === 'true'),
        mine: z
          .enum(['true', 'false'])
          .optional()
          .transform((v) => v === 'true'),
      }),
    }),
    async (req, res) => res.json(await service.list(req.valid.query, req.user?.id)),
  );
  router.get('/community/posts/:id', optionalUser, validate({ params: idParams }), async (req, res) =>
    res.json(await service.detail(req.valid.params.id, req.user?.id)),
  );
  for (const method of ['post', 'put']) {
    router[method](
      method === 'post' ? '/community/posts' : '/community/posts/:id',
      writeLimiter,
      ...requireActiveUser,
      uploadImages('images', 3),
      validate({ ...(method === 'put' ? { params: idParams } : {}), body: postBody }),
      async (req, res) =>
        res
          .status(method === 'post' ? 201 : 200)
          .json(await service.save(req.valid.params?.id, req.user.id, req.valid.body, req.files)),
    );
  }
  router.delete(
    '/community/posts/:id',
    writeLimiter,
    ...requireActiveUser,
    validate({ params: idParams }),
    async (req, res) => {
      await service.remove(req.valid.params.id, req.user.id);
      res.status(204).end();
    },
  );
  router.get(
    '/community/posts/:id/comments',
    optionalUser,
    validate({ params: idParams, query: z.object(pageQuery(20, 50)) }),
    async (req, res) => res.json(await service.comments(req.valid.params.id, req.user?.id, req.valid.query)),
  );
  router.post(
    '/community/posts/:id/comments',
    writeLimiter,
    ...requireActiveUser,
    validate({ params: idParams, body: z.object({ content: text(1, 500, 'Bình luận từ 1 đến 500 ký tự') }) }),
    async (req, res) => {
      await service.interact(req.valid.params.id, req.user.id, 'comment', req.valid.body.content);
      res.status(201).json({ message: 'Bình luận đang chờ duyệt' });
    },
  );
  router.delete(
    '/community/comments/:id',
    writeLimiter,
    ...requireActiveUser,
    validate({ params: idParams }),
    async (req, res) => {
      const [r] = await getPool().query('DELETE FROM community_comments WHERE id = ? AND user_id = ?', [
        req.valid.params.id,
        req.user.id,
      ]);
      if (!r.affectedRows) throw AppError.notFound();
      res.status(204).end();
    },
  );
  for (const method of ['put', 'delete']) {
    router[method](
      '/community/posts/:id/like',
      writeLimiter,
      ...requireActiveUser,
      validate({ params: idParams }),
      async (req, res) => {
        await service.interact(req.valid.params.id, req.user.id, method === 'put' ? 'like' : 'unlike');
        res.status(204).end();
      },
    );
  }
  for (const [segment, type] of [
    ['posts', 'post'],
    ['comments', 'comment'],
  ]) {
    router.post(
      `/community/${segment}/:id/reports`,
      writeLimiter,
      ...requireActiveUser,
      validate({ params: idParams, body: reportBody }),
      async (req, res) => {
        await service.report(req.valid.params.id, type, req.user.id, req.valid.body);
        res.status(201).json({ message: 'Đã tiếp nhận báo cáo' });
      },
    );
  }
  return router;
}
module.exports = { createCommunityRouter, postBody, reportBody };
