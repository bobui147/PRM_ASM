'use strict';
const express = require('express');
const request = require('supertest');
const { getPool } = require('../../src/db');
const { getConfig } = require('../../src/config');
const { createApiRouter } = require('../../src/routes/api');
const { createErrorHandler } = require('../../src/middleware/error-handler');
const { signAccessToken } = require('../../src/modules/auth/token.service');
const { resetTestDatabase, truncateDataTables, closeTestDatabase } = require('../helpers/db');
let app, a, b, cat;
beforeAll(async () => {
  await resetTestDatabase();
  app = express();
  app.use('/api/v1', createApiRouter({ config: getConfig(), checkDatabase: async () => {} }));
  app.use(createErrorHandler({ isProduction: false }));
});
beforeEach(async () => {
  const [users] = await getPool().query(
    "INSERT INTO users (email,password_hash,display_name,email_verified_at) VALUES ('a@x.vn','h','A',NOW()),('b@x.vn','h','B',NOW())",
  );
  a = signAccessToken({ id: users.insertId, token_version: 0 });
  b = signAccessToken({ id: users.insertId + 1, token_version: 0 });
  const [[c]] = await getPool().query('SELECT id FROM food_categories LIMIT 1');
  cat = c.id;
  await getPool().query(
    "INSERT INTO foods (category_id,name,reference_price,rarity) VALUES (?,'Phở',40000,'common'),(?,'Cơm',50000,'common')",
    [cat, cat],
  );
});
afterEach(truncateDataTables);
afterAll(closeTestDatabase);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
async function create() {
  const r = await request(app).post('/api/v1/groups').set(auth(a)).send({ categoryId: cat, budget: 50000 });
  expect(r.status).toBe(201);
  return r.body;
}
const act = (id, token, body) => request(app).post(`/api/v1/groups/${id}/action`).set(auth(token)).send(body);
test('thành viên, quyền chủ phòng, loại chung, phiếu và chốt đồng thời', async () => {
  const room = await create();
  const id = room.id;
  expect((await request(app).get(`/api/v1/groups/${id}`).set(auth(b))).status).toBe(404);
  expect((await request(app).post('/api/v1/groups/join').set(auth(b)).send({ code: room.code })).status).toBe(200);
  expect((await act(id, b, { action: 'spin' })).status).toBe(403);
  const [one, two] = room.candidates;
  expect(
    (await act(id, b, { action: 'choice', candidateId: one.id, choice: 'exclude' })).body.candidates[0].eligible,
  ).toBe(false);
  expect((await act(id, a, { action: 'startVote' })).status).toBe(200);
  expect((await act(id, a, { action: 'finishVote' })).status).toBe(409);
  expect((await act(id, b, { action: 'vote', candidateId: one.id })).status).toBe(409);
  expect((await act(id, b, { action: 'vote', candidateId: two.id })).status).toBe(200);
  const results = await Promise.all([act(id, a, { action: 'finishVote' }), act(id, a, { action: 'spin' })]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const state = (await request(app).get(`/api/v1/groups/${id}`).set(auth(b))).body;
  expect(state.result.id).toBe(two.id);
  expect(state.status).toBe('decided');
});
test('không chốt danh sách rỗng; chủ rời hoặc hết hạn kết thúc phòng', async () => {
  const room = await create();
  for (const f of room.candidates) await act(room.id, a, { action: 'choice', candidateId: f.id, choice: 'exclude' });
  expect((await act(room.id, a, { action: 'spin' })).status).toBe(409);
  await request(app).post('/api/v1/groups/join').set(auth(b)).send({ code: room.code });
  expect((await act(room.id, a, { action: 'leave' })).status).toBe(204);
  expect((await request(app).get(`/api/v1/groups/${room.id}`).set(auth(b))).body.status).toBe('ended');
  const next = await create();
  await getPool().query('UPDATE group_rooms SET expires_at = UTC_TIMESTAMP()-INTERVAL 1 MINUTE WHERE id = ?', [
    next.id,
  ]);
  expect((await act(next.id, a, { action: 'spin' })).status).toBe(409);
});
