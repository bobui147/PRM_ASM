'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../../middleware/validate');
const { optionalUser, requireUser, requireVerified, requireActiveUser } = require('../../middleware/auth');
const { uploadImages } = require('../../middleware/upload');
const { communityWriteLimiter, interactionLimiter } = require('../../middleware/rate-limit');
const { idParams, text, optionalText, optionalInt, stringArray, pageQuery } = require('../../utils/http');
const service = require('./community.service');

const postBody = z.object({
  content: optionalText(service.MAX_CONTENT, `Nội dung tối đa ${service.MAX_CONTENT} ký tự`),
  foodId: optionalInt(1, 4_294_967_295, 'Món không hợp lệ'),
  restaurantId: optionalInt(1, 4_294_967_295, 'Quán không hợp lệ'),
});

const updateBody = postBody.extend({
  keepImageIds: stringArray.pipe(z.array(z.coerce.number().int().positive())),
});

const commentBody = z.object({
  content: text(1, service.MAX_COMMENT, `Bình luận phải từ 1 đến ${service.MAX_COMMENT} ký tự`),
});

const reportBody = z
  .object({
    reason: z.enum(['offensive', 'spam', 'misleading', 'inappropriate_image', 'other'], {
      error: 'Chọn lý do báo cáo',
    }),
    details: optionalText(300, 'Ghi chú tối đa 300 ký tự'),
  })
  .refine((body) => body.reason !== 'other' || body.details, {
    path: ['details'],
    message: 'Nhập ghi chú khi chọn Lý do khác',
  });

const feedQuery = z.object({
  ...pageQuery(20, 50),
  filter: z.enum(['latest', 'following']).catch('latest').default('latest'),
});

const listQuery = z.object(pageQuery(20, 50));
const commentQuery = z.object(pageQuery(30, 100));

/** API cộng đồng ẩm thực (requirements-mo-rong.md P1). */
function createCommunityRouter() {
  const router = express.Router();

  // FR-C02: khách xem được bảng tin, bài, hồ sơ công khai.
  router.get('/posts', optionalUser, validate({ query: feedQuery }), async (req, res) => {
    res.json(await service.listFeed(req.valid.query, req.user));
  });

  router.get('/posts/:id', optionalUser, validate({ params: idParams }), async (req, res) => {
    res.json(await service.getPost(req.valid.params.id, req.user?.id ?? null));
  });

  router.post(
    '/posts',
    communityWriteLimiter,
    ...requireActiveUser,
    uploadImages('images', service.MAX_IMAGES),
    validate({ body: postBody }),
    async (req, res) => {
      res.status(201).json(await service.createPost(req.user, req.valid.body, req.files));
    },
  );

  router.put(
    '/posts/:id',
    communityWriteLimiter,
    ...requireActiveUser,
    uploadImages('images', service.MAX_IMAGES),
    validate({ params: idParams, body: updateBody }),
    async (req, res) => {
      res.json(await service.updatePost(req.valid.params.id, req.user, req.valid.body, req.files));
    },
  );

  // Như review: người bị khóa vẫn xóa được nội dung của mình.
  router.delete('/posts/:id', communityWriteLimiter, requireUser, validate({ params: idParams }), async (req, res) => {
    await service.deletePostById(req.valid.params.id, { ownerId: req.user.id });
    res.status(204).end();
  });

  router.post(
    '/posts/:id/like',
    interactionLimiter,
    ...requireActiveUser,
    validate({ params: idParams }),
    async (req, res) => {
      res.json(await service.setLike(req.valid.params.id, req.user, true));
    },
  );

  router.delete(
    '/posts/:id/like',
    interactionLimiter,
    ...requireActiveUser,
    validate({ params: idParams }),
    async (req, res) => {
      res.json(await service.setLike(req.valid.params.id, req.user, false));
    },
  );

  router.get(
    '/posts/:id/comments',
    optionalUser,
    validate({ params: idParams, query: commentQuery }),
    async (req, res) => {
      res.json(await service.listComments(req.valid.params.id, req.valid.query, req.user?.id ?? null));
    },
  );

  router.post(
    '/posts/:id/comments',
    communityWriteLimiter,
    ...requireActiveUser,
    validate({ params: idParams, body: commentBody }),
    async (req, res) => {
      res.status(201).json(await service.createComment(req.valid.params.id, req.user, req.valid.body));
    },
  );

  router.delete(
    '/comments/:id',
    communityWriteLimiter,
    requireUser,
    validate({ params: idParams }),
    async (req, res) => {
      await service.deleteCommentById(req.valid.params.id, { ownerId: req.user.id });
      res.status(204).end();
    },
  );

  for (const [path, type] of [
    ['/posts/:id/reports', 'post'],
    ['/comments/:id/reports', 'comment'],
  ]) {
    router.post(
      path,
      communityWriteLimiter,
      ...requireActiveUser,
      validate({ params: idParams, body: reportBody }),
      async (req, res) => {
        await service.reportContent(type, req.valid.params.id, req.user, req.valid.body);
        res.status(201).json({ message: 'Đã tiếp nhận báo cáo' });
      },
    );
  }

  router.get('/users/:id', optionalUser, validate({ params: idParams }), async (req, res) => {
    res.json(await service.getPublicProfile(req.valid.params.id, req.user?.id ?? null));
  });

  router.get('/users/:id/posts', optionalUser, validate({ params: idParams, query: listQuery }), async (req, res) => {
    res.json(await service.listUserPosts(req.valid.params.id, req.valid.query, req.user?.id ?? null));
  });

  router.post(
    '/users/:id/follow',
    interactionLimiter,
    ...requireActiveUser,
    validate({ params: idParams }),
    async (req, res) => {
      res.json(await service.setFollow(req.valid.params.id, req.user, true));
    },
  );

  router.delete(
    '/users/:id/follow',
    interactionLimiter,
    ...requireActiveUser,
    validate({ params: idParams }),
    async (req, res) => {
      res.json(await service.setFollow(req.valid.params.id, req.user, false));
    },
  );

  // Bài của chính mình, mọi trạng thái (thấy bài bị ẩn).
  router.get('/me/posts', requireUser, requireVerified, validate({ query: listQuery }), async (req, res) => {
    res.json(await service.listUserPosts(req.user.id, req.valid.query, req.user.id, { includeHidden: true }));
  });

  return router;
}

module.exports = { createCommunityRouter };
