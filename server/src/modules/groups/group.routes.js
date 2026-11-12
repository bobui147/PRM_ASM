'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../../middleware/validate');
const { requireUser, requireVerified, requireNotBlocked } = require('../../middleware/auth');
const { createLimiter, roomLimiter } = require('../../middleware/rate-limit');
const { idParams, optionalInt } = require('../../utils/http');
const service = require('./group.service');

// Chặn dò mã mời: 30 lần tham gia / 15 phút / người dùng.
const joinLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: 'Bạn nhập mã quá nhiều lần, vui lòng thử lại sau',
});

const filtersBody = z.object({
  categorySlug: z
    .string()
    .max(40)
    .nullish()
    .transform((value) => value || null),
  mealPeriod: z.enum(['breakfast', 'lunch', 'dinner', 'late_night'], { error: 'Bữa ăn không hợp lệ' }).nullish(),
  maxPrice: optionalInt(1000, 10_000_000, 'Ngân sách phải từ 1.000đ đến 10.000.000đ'),
});

const codePattern = new RegExp(`^[${service.CODE_ALPHABET}]{${service.CODE_LENGTH}}$`);
const joinBody = z.object({
  code: z
    .string({ error: 'Nhập mã phòng' })
    .transform((value) => value.replace(/[\s-]/g, '').toUpperCase())
    .pipe(z.string().regex(codePattern, 'Mã phòng không hợp lệ')),
});

const markParams = z.object({
  id: z.coerce.number().int().positive(),
  foodId: z.coerce.number().int().positive(),
});
const markBody = z.object({ mark: z.enum(['pick', 'exclude', 'none'], { error: 'Lựa chọn không hợp lệ' }) });
const startBody = z.object({ mode: z.enum(['vote', 'spin'], { error: 'Chọn bỏ phiếu hoặc quay' }) });
const voteBody = z.object({ foodId: z.coerce.number({ error: 'Chọn một món' }).int().positive() });
const stateQuery = z.object({ version: z.coerce.number().int().min(0).optional().catch(undefined) });

/** API phòng chọn món theo nhóm (requirements-mo-rong.md P2). App polling GET /rooms/:id?version=. */
function createGroupRouter() {
  const router = express.Router();
  const member = [requireUser, requireVerified];
  const writer = [roomLimiter, requireUser, requireVerified, requireNotBlocked];

  router.get('/rooms/current', ...member, async (req, res) => {
    res.json({ room: await service.getCurrentRoom(req.user.id) });
  });

  router.post('/rooms', ...writer, validate({ body: filtersBody }), async (req, res) => {
    res.status(201).json(await service.createRoom(req.user, req.valid.body));
  });

  router.post('/rooms/join', ...writer, joinLimiter, validate({ body: joinBody }), async (req, res) => {
    res.json(await service.joinRoom(req.user, req.valid.body.code));
  });

  router.get('/rooms/:id', ...member, validate({ params: idParams, query: stateQuery }), async (req, res) => {
    res.json(await service.getRoomState(req.valid.params.id, req.user.id, req.valid.query.version));
  });

  router.patch('/rooms/:id/filters', ...writer, validate({ params: idParams, body: filtersBody }), async (req, res) => {
    res.json(await service.updateFilters(req.valid.params.id, req.user, req.valid.body));
  });

  router.put(
    '/rooms/:id/marks/:foodId',
    ...writer,
    validate({ params: markParams, body: markBody }),
    async (req, res) => {
      const { id, foodId } = req.valid.params;
      res.json(await service.setMark(id, req.user, foodId, req.valid.body.mark));
    },
  );

  router.post('/rooms/:id/start', ...writer, validate({ params: idParams, body: startBody }), async (req, res) => {
    res.json(await service.startDecision(req.valid.params.id, req.user, req.valid.body.mode));
  });

  router.put('/rooms/:id/vote', ...writer, validate({ params: idParams, body: voteBody }), async (req, res) => {
    res.json(await service.castVote(req.valid.params.id, req.user, req.valid.body.foodId));
  });

  router.post('/rooms/:id/finalize', ...writer, validate({ params: idParams }), async (req, res) => {
    res.json(await service.finalizeVote(req.valid.params.id, req.user));
  });

  router.post('/rooms/:id/back', ...writer, validate({ params: idParams }), async (req, res) => {
    res.json(await service.backToSelecting(req.valid.params.id, req.user));
  });

  router.post('/rooms/:id/close', ...writer, validate({ params: idParams }), async (req, res) => {
    res.json(await service.closeRoom(req.valid.params.id, req.user));
  });

  // Người bị khóa vẫn rời phòng được.
  router.post('/rooms/:id/leave', roomLimiter, ...member, validate({ params: idParams }), async (req, res) => {
    await service.leaveRoom(req.valid.params.id, req.user);
    res.status(204).end();
  });

  return router;
}

module.exports = { createGroupRouter };
