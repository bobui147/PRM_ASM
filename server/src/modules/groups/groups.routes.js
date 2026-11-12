'use strict';
const crypto = require('node:crypto');
const express = require('express');
const { z } = require('zod');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { requireActiveUser, requireUser } = require('../../middleware/auth');
const { writeLimiter } = require('../../middleware/rate-limit');
const { validate } = require('../../middleware/validate');
const { idParams, pageQuery, pageResult } = require('../../utils/http');
const settings = z.object({
  categoryId: z.number().int().positive(),
  budget: z.union([z.literal(50000), z.literal(100000), z.literal(150000)]).nullable(),
});

function effectiveStatus(room) {
  return !room.host_id || new Date(room.expires_at) <= new Date() ? 'ended' : room.status;
}
async function roomForMember(conn, id, userId, lock = false) {
  const [[room]] = await conn.query(`SELECT * FROM group_rooms WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]);
  const [[member]] = await conn.query('SELECT user_id FROM group_members WHERE room_id = ? AND user_id = ?', [
    id,
    userId,
  ]);
  if (!room || !member) throw AppError.notFound('ROOM_NOT_FOUND', 'Không tìm thấy phòng');
  return room;
}
async function candidates(conn, id) {
  const [rows] = await conn.query(
    `SELECT c.id,c.food_id AS foodId,c.name,c.price,
    NOT EXISTS(SELECT 1 FROM group_choices WHERE candidate_id = c.id AND choice = 'exclude') AS eligible,
    (SELECT COUNT(*) FROM group_choices WHERE candidate_id = c.id AND choice = 'select') AS selections,
    (SELECT COUNT(*) FROM group_choices WHERE candidate_id = c.id AND choice = 'exclude') AS exclusions,
    (SELECT COUNT(*) FROM group_votes WHERE candidate_id = c.id) AS votes
    FROM group_candidates c WHERE c.room_id = ? ORDER BY c.id`,
    [id],
  );
  return rows;
}
async function resetCandidates(conn, id, body) {
  const [[category]] = await conn.query("SELECT id FROM food_categories WHERE id = ? AND status = 'active'", [
    body.categoryId,
  ]);
  if (!category) throw AppError.validation({ categoryId: 'Nhóm không hoạt động' });
  await conn.query('DELETE FROM group_candidates WHERE room_id = ?', [id]);
  await conn.query(
    `INSERT INTO group_candidates (room_id,food_id,name,price)
    SELECT ?, id,name,reference_price FROM foods WHERE category_id = ? AND status = 'active'`,
    [id, body.categoryId],
  );
}
async function state(id, userId) {
  return withTransaction(async (conn) => {
    const room = await roomForMember(conn, id, userId, true);
    const [members] = await conn.query(
      'SELECT m.user_id AS id,u.display_name AS displayName FROM group_members m JOIN users u ON u.id = m.user_id WHERE room_id = ? ORDER BY joined_at,user_id',
      [id],
    );
    const foods = await candidates(conn, id);
    const [choices] = await conn.query(
      'SELECT candidate_id AS candidateId,choice,user_id AS userId FROM group_choices WHERE room_id = ?',
      [id],
    );
    const [votes] = await conn.query(
      'SELECT candidate_id AS candidateId,user_id AS userId FROM group_votes WHERE room_id = ?',
      [id],
    );
    return {
      id,
      code: room.code,
      hostId: room.host_id,
      categoryId: room.category_id,
      budget: room.budget,
      status: effectiveStatus(room),
      expiresAt: room.expires_at,
      members,
      candidates: foods.map((f) => ({ ...f, eligible: Boolean(f.eligible) })),
      choices,
      votes,
      result: foods.find((f) => f.id === room.result_id) ?? null,
    };
  });
}
function createGroupsRouter() {
  const router = express.Router();
  router.get('/groups', requireUser, validate({ query: z.object(pageQuery(10, 30)) }), async (req, res) => {
    const { page, limit } = req.valid.query;
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM group_members WHERE user_id = ?', [
      req.user.id,
    ]);
    const [rows] = await getPool().query(
      'SELECT r.id,r.code,r.status,r.host_id,r.expires_at FROM group_rooms r JOIN group_members m ON m.room_id = r.id WHERE m.user_id = ? ORDER BY r.id DESC LIMIT ? OFFSET ?',
      [req.user.id, limit, (page - 1) * limit],
    );
    res.json(
      pageResult(
        rows.map((r) => ({ id: r.id, code: r.code, status: effectiveStatus(r) })),
        { page, limit },
        total,
      ),
    );
  });
  router.get('/groups/:id', requireUser, validate({ params: idParams }), async (req, res) =>
    res.json(await state(req.valid.params.id, req.user.id)),
  );
  router.post('/groups', writeLimiter, ...requireActiveUser, validate({ body: settings }), async (req, res) => {
    const id = await withTransaction(async (conn) => {
      const [r] = await conn.query(
        'INSERT INTO group_rooms (code,host_id,category_id,budget,expires_at) VALUES (?,?,?,?,UTC_TIMESTAMP()+INTERVAL 1 DAY)',
        [crypto.randomBytes(8).toString('hex'), req.user.id, req.valid.body.categoryId, req.valid.body.budget],
      );
      await resetCandidates(conn, r.insertId, req.valid.body);
      await conn.query('INSERT INTO group_members (room_id,user_id) VALUES (?,?)', [r.insertId, req.user.id]);
      return r.insertId;
    });
    res.status(201).json(await state(id, req.user.id));
  });
  router.post(
    '/groups/join',
    writeLimiter,
    ...requireActiveUser,
    validate({
      body: z.object({
        code: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-f0-9]{16}$/),
      }),
    }),
    async (req, res) => {
      const id = await withTransaction(async (conn) => {
        const [[room]] = await conn.query('SELECT * FROM group_rooms WHERE code = ? FOR UPDATE', [req.valid.body.code]);
        if (!room || effectiveStatus(room) === 'ended')
          throw AppError.notFound('ROOM_NOT_FOUND', 'Mã không hợp lệ hoặc phòng đã kết thúc');
        const [[member]] = await conn.query('SELECT user_id FROM group_members WHERE room_id = ? AND user_id = ?', [
          room.id,
          req.user.id,
        ]);
        if (member) return room.id;
        if (room.status !== 'choosing') throw AppError.conflict('ROOM_LOCKED', 'Phòng đã bắt đầu quyết định');
        const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM group_members WHERE room_id = ?', [room.id]);
        if (n >= 10) throw AppError.conflict('ROOM_FULL', 'Phòng tối đa 10 người');
        await conn.query('INSERT INTO group_members (room_id,user_id) VALUES (?,?)', [room.id, req.user.id]);
        return room.id;
      });
      res.json(await state(id, req.user.id));
    },
  );
  router.post(
    '/groups/:id/action',
    writeLimiter,
    ...requireActiveUser,
    validate({
      params: idParams,
      body: z.object({
        action: z.enum(['settings', 'choice', 'startVote', 'vote', 'spin', 'finishVote', 'reset', 'leave', 'end']),
        categoryId: z.number().int().positive().optional(),
        budget: z.union([z.literal(50000), z.literal(100000), z.literal(150000)]).nullish(),
        candidateId: z.number().int().positive().optional(),
        choice: z.enum(['select', 'exclude', 'neutral']).optional(),
      }),
    }),
    async (req, res) => {
      const { id } = req.valid.params;
      const body = req.valid.body;
      const left = await withTransaction(async (conn) => {
        const room = await roomForMember(conn, id, req.user.id, true);
        if (effectiveStatus(room) === 'ended') throw AppError.conflict('ROOM_ENDED', 'Phòng đã kết thúc');
        const host = room.host_id === req.user.id;
        if (!['choice', 'vote', 'leave'].includes(body.action) && !host) throw AppError.forbidden();
        const foods = await candidates(conn, id);
        const eligible = foods.filter((f) => f.eligible);
        if (body.action === 'leave') {
          if (host) await conn.query("UPDATE group_rooms SET status = 'ended' WHERE id = ?", [id]);
          await conn.query('DELETE FROM group_members WHERE room_id = ? AND user_id = ?', [id, req.user.id]);
          return true;
        }
        if (body.action === 'end') {
          await conn.query("UPDATE group_rooms SET status = 'ended' WHERE id = ?", [id]);
          return false;
        }
        if (body.action === 'settings') {
          if (room.status !== 'choosing') throw AppError.conflict('ROOM_LOCKED', 'Chỉ đổi bộ lọc khi đang chọn');
          const parsed = settings.safeParse(body);
          if (!parsed.success) throw AppError.validation({ categoryId: 'Chọn nhóm và ngân sách' });
          await resetCandidates(conn, id, parsed.data);
          await conn.query('UPDATE group_rooms SET category_id = ?,budget = ? WHERE id = ?', [
            body.categoryId,
            body.budget,
            id,
          ]);
        } else if (body.action === 'reset') {
          if (room.status === 'decided') throw AppError.conflict('ROOM_LOCKED', 'Kết quả đã chốt; hãy tạo phòng mới');
          await conn.query('DELETE FROM group_votes WHERE room_id = ?', [id]);
          await conn.query("UPDATE group_rooms SET status = 'choosing' WHERE id = ?", [id]);
        } else if (body.action === 'choice') {
          if (room.status !== 'choosing') throw AppError.conflict('ROOM_LOCKED', 'Lựa chọn đã khóa');
          if (!foods.some((f) => f.id === body.candidateId) || !body.choice)
            throw AppError.validation({ candidateId: 'Món không thuộc phòng' });
          await conn.query('DELETE FROM group_choices WHERE room_id = ? AND user_id = ? AND candidate_id = ?', [
            id,
            req.user.id,
            body.candidateId,
          ]);
          if (body.choice !== 'neutral')
            await conn.query('INSERT INTO group_choices (room_id,user_id,candidate_id,choice) VALUES (?,?,?,?)', [
              id,
              req.user.id,
              body.candidateId,
              body.choice,
            ]);
        } else if (body.action === 'vote') {
          if (room.status !== 'voting' || !eligible.some((f) => f.id === body.candidateId))
            throw AppError.conflict('INVALID_VOTE', 'Không thể bỏ phiếu món này');
          await conn.query(
            'INSERT INTO group_votes (room_id,user_id,candidate_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE candidate_id = VALUES(candidate_id)',
            [id, req.user.id, body.candidateId],
          );
        } else {
          if (
            (body.action === 'finishVote' && room.status !== 'voting') ||
            (body.action !== 'finishVote' && room.status !== 'choosing')
          )
            throw AppError.conflict('ROOM_LOCKED', 'Trạng thái phòng không cho phép');
          if (!eligible.length)
            throw AppError.conflict('NO_CANDIDATES', 'Không còn món phù hợp; hãy thay đổi lựa chọn');
          if (body.action === 'startVote') {
            await conn.query("UPDATE group_rooms SET status = 'voting' WHERE id = ?", [id]);
          } else {
            let pool = eligible;
            if (body.action === 'finishVote') {
              const max = Math.max(...eligible.map((f) => f.votes));
              if (!max) throw AppError.conflict('NO_VOTES', 'Chưa có phiếu bầu');
              pool = eligible.filter((f) => f.votes === max);
            }
            // Ngân sách ưu tiên xác suất, không phải giá trần; phiếu hòa có cơ hội ngang nhau.
            let selected;
            if (body.action === 'spin' && room.budget) {
              const weights = pool.map((f) => 1 / (1 + Math.abs(f.price - room.budget) / 50000));
              let target = (crypto.randomInt(1000000) / 1000000) * weights.reduce((a, b) => a + b, 0);
              selected = pool[pool.length - 1];
              for (let i = 0; i < pool.length; i++) {
                target -= weights[i];
                if (target < 0) {
                  selected = pool[i];
                  break;
                }
              }
            } else {
              selected = pool[crypto.randomInt(pool.length)];
            }
            await conn.query("UPDATE group_rooms SET status = 'decided',result_id = ? WHERE id = ?", [selected.id, id]);
          }
        }
        return false;
      });
      if (left) res.status(204).end();
      else res.json(await state(id, req.user.id));
    },
  );
  return router;
}
module.exports = { createGroupsRouter };
