'use strict';
const express = require('express');
const request = require('supertest');
const { getPool } = require('../../src/db');
const { getConfig } = require('../../src/config');
const { createApiRouter } = require('../../src/routes/api');
const { createErrorHandler } = require('../../src/middleware/error-handler');
const { signAccessToken } = require('../../src/modules/auth/token.service');
const { resetTestDatabase, truncateDataTables, closeTestDatabase } = require('../helpers/db');
let app, a, b, foodId, userId;
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
  userId = users.insertId;
  a = signAccessToken({ id: userId, token_version: 0 });
  b = signAccessToken({ id: userId + 1, token_version: 0 });
  const [[cat]] = await getPool().query('SELECT id FROM food_categories LIMIT 1');
  const [f] = await getPool().query(
    "INSERT INTO foods(category_id,name,reference_price,rarity) VALUES (?,'Phở',40000,'common')",
    [cat.id],
  );
  foodId = f.insertId;
});
afterEach(truncateDataTables);
afterAll(closeTestDatabase);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
test('kế hoạch riêng tư, chuyển bữa, xác nhận/hoàn tác đã ăn và giữ tên món bị xóa', async () => {
  const created = await request(app)
    .post('/api/v1/plans/entries')
    .set(auth(a))
    .send({ foodId, date: '2026-11-12', meal: 'lunch' });
  expect(created.status).toBe(201);
  const id = created.body.id;
  expect((await request(app).patch(`/api/v1/plans/entries/${id}`).set(auth(b)).send({ eaten: true })).status).toBe(404);
  expect(
    (
      await request(app)
        .patch(`/api/v1/plans/entries/${id}`)
        .set(auth(a))
        .send({ date: '2026-11-13', meal: 'dinner', eaten: true })
    ).status,
  ).toBe(204);
  expect((await request(app).get('/api/v1/plans/history').set(auth(a))).body.items[0].date).toBe('2026-11-13');
  await request(app).patch(`/api/v1/plans/entries/${id}`).set(auth(a)).send({ eaten: false });
  expect((await request(app).get('/api/v1/plans/history').set(auth(a))).body.total).toBe(0);
  await getPool().query('DELETE FROM foods WHERE id=?', [foodId]);
  const calendar = (await request(app).get('/api/v1/plans/entries?from=2026-11-12&to=2026-11-18').set(auth(a))).body;
  expect(calendar.items[0].foodName).toBe('Phở');
  expect(calendar.items[0].foodId).toBeNull();
  expect((await request(app).get('/api/v1/plans/entries?from=2026-11-12&to=2026-11-18').set(auth(b))).body.total).toBe(
    0,
  );
  expect((await request(app).delete(`/api/v1/plans/entries/${id}`).set(auth(a))).status).toBe(204);
});
test('wishlist không trùng; validation ngày, khóa tài khoản và cascade', async () => {
  for (let i = 0; i < 2; i++)
    expect((await request(app).put(`/api/v1/plans/wishlist/${foodId}`).set(auth(a))).status).toBe(204);
  expect((await request(app).get('/api/v1/plans/wishlist').set(auth(a))).body.total).toBe(1);
  expect(
    (await request(app).post('/api/v1/plans/entries').set(auth(a)).send({ foodId, date: '2026-02-30', meal: 'lunch' }))
      .status,
  ).toBe(400);
  await getPool().query('UPDATE users SET blocked_permanent=TRUE WHERE id=?', [userId]);
  expect((await request(app).put(`/api/v1/plans/wishlist/${foodId}`).set(auth(a))).status).toBe(403);
  await getPool().query('DELETE FROM users WHERE id=?', [userId]);
  const [[{ n }]] = await getPool().query('SELECT COUNT(*) AS n FROM meal_wishlist');
  expect(n).toBe(0);
});
