'use strict';

const request = require('supertest');
const { getPool } = require('../../src/db');
const { todayInVietnam } = require('../../src/utils/http');
const { resetTestDatabase, truncateDataTables, closeTestDatabase } = require('../helpers/db');
const { buildApiApp, createUser, createFood } = require('../helpers/fixtures');

let app;

beforeAll(async () => {
  await resetTestDatabase();
  app = buildApiApp();
});
afterEach(truncateDataTables);
afterAll(closeTestDatabase);

const api = (p) => `/api/v1${p}`;

describe('P3 — kế hoạch (FR-PM01)', () => {
  test('thêm, chuyển, xóa; dữ liệu theo tài khoản, người khác không truy cập được', async () => {
    const user = await createUser();
    const other = await createUser();
    const food = await createFood({ name: 'Bún chả', price: 35000 });
    const today = todayInVietnam();
    const tomorrow = todayInVietnam(1);

    const { body: item } = await request(app)
      .post(api('/me/meal-plan'))
      .set(user.auth)
      .send({ foodId: food.id, date: today, meal: 'lunch', note: ' với bạn ' })
      .expect(201);
    expect(item).toMatchObject({
      food: { id: food.id, name: 'Bún chả', referencePrice: 35000 },
      date: today,
      meal: 'lunch',
      note: 'với bạn',
      eaten: false,
    });
    await request(app)
      .post(api('/me/meal-plan'))
      .set(user.auth)
      .send({ foodId: food.id, date: today, meal: 'lunch' })
      .expect(201);

    const { body: week } = await request(app).get(api('/me/meal-plan')).set(user.auth).expect(200);
    expect(week.items).toHaveLength(2);
    expect((await request(app).get(api('/me/meal-plan')).set(other.auth)).body.items).toHaveLength(0);

    await request(app)
      .patch(api(`/me/meal-plan/${item.id}`))
      .set(other.auth)
      .send({ meal: 'dinner' })
      .expect(404);
    await request(app)
      .delete(api(`/me/meal-plan/${item.id}`))
      .set(other.auth)
      .expect(404);

    const { body: moved } = await request(app)
      .patch(api(`/me/meal-plan/${item.id}`))
      .set(user.auth)
      .send({ date: tomorrow, meal: 'dinner' })
      .expect(200);
    expect(moved).toMatchObject({ date: tomorrow, meal: 'dinner', note: 'với bạn' });

    await request(app)
      .delete(api(`/me/meal-plan/${item.id}`))
      .set(user.auth)
      .expect(204);
    const { body: after } = await request(app)
      .get(api(`/me/meal-plan?from=${today}&to=${tomorrow}`))
      .set(user.auth)
      .expect(200);
    expect(after.items).toHaveLength(1);
  });

  test('validation: ngày sai, bữa sai, khoảng ngày quá dài, món đã ẩn', async () => {
    const user = await createUser();
    const food = await createFood();
    const hidden = await createFood({ status: 'hidden' });
    const bad = await request(app)
      .post(api('/me/meal-plan'))
      .set(user.auth)
      .send({ foodId: food.id, date: '2026-02-30', meal: 'brunch' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['date', 'meal']);
    const range = await request(app)
      .get(api(`/me/meal-plan?from=${todayInVietnam()}&to=${todayInVietnam(40)}`))
      .set(user.auth);
    expect(range.status).toBe(400);
    const res = await request(app)
      .post(api('/me/meal-plan'))
      .set(user.auth)
      .send({ foodId: hidden.id, date: todayInVietnam(), meal: 'other' });
    expect(res.body.error.fields.foodId).toBeDefined();
  });

  test('món bị ẩn sau khi thêm vẫn hiện tên, không có giá/link, vẫn xóa được', async () => {
    const user = await createUser();
    const food = await createFood({ name: 'Nem rán' });
    const { body: item } = await request(app)
      .post(api('/me/meal-plan'))
      .set(user.auth)
      .send({ foodId: food.id, date: todayInVietnam(), meal: 'other' })
      .expect(201);
    await getPool().query("UPDATE foods SET status = 'hidden' WHERE id = ?", [food.id]);
    const { body } = await request(app).get(api('/me/meal-plan')).set(user.auth);
    expect(body.items[0]).toMatchObject({
      available: false,
      food: { id: null, name: 'Nem rán', referencePrice: null },
    });
    await request(app)
      .delete(api(`/me/meal-plan/${item.id}`))
      .set(user.auth)
      .expect(204);
  });

  test('cần đăng nhập và xác minh; người bị khóa chỉ đọc', async () => {
    await request(app).get(api('/me/meal-plan')).expect(401);
    const unverified = await createUser({ verified: false });
    const res = await request(app).get(api('/me/meal-plan')).set(unverified.auth);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    const blocked = await createUser({ blocked: true });
    await request(app).get(api('/me/meal-plan')).set(blocked.auth).expect(200);
    const write = await request(app)
      .post(api('/me/meal-plan'))
      .set(blocked.auth)
      .send({ foodId: 1, date: todayInVietnam(), meal: 'lunch' });
    expect(write.body.error.code).toBe('ACCOUNT_BLOCKED');
  });
});

describe('P3 — muốn thử và đã ăn (FR-PM02)', () => {
  test('danh sách muốn thử không trùng', async () => {
    const user = await createUser();
    const food = await createFood();
    await request(app)
      .put(api(`/me/want-to-try/${food.id}`))
      .set(user.auth)
      .expect(200);
    await request(app)
      .put(api(`/me/want-to-try/${food.id}`))
      .set(user.auth)
      .expect(200);
    const { body } = await request(app).get(api('/me/want-to-try')).set(user.auth).expect(200);
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({ foodId: food.id, available: true });
    await request(app)
      .delete(api(`/me/want-to-try/${food.id}`))
      .set(user.auth)
      .expect(200);
    expect((await request(app).get(api('/me/want-to-try')).set(user.auth)).body.total).toBe(0);
  });

  test('đánh dấu và hoàn tác đã ăn cập nhật lịch sử; ngày tương lai bị chặn', async () => {
    const user = await createUser();
    const food = await createFood();
    const add = (date) =>
      request(app).post(api('/me/meal-plan')).set(user.auth).send({ foodId: food.id, date, meal: 'lunch' }).expect(201);
    const { body: past } = await add(todayInVietnam(-1));
    const { body: future } = await add(todayInVietnam(2));

    const { body: eaten } = await request(app)
      .put(api(`/me/meal-plan/${past.id}/eaten`))
      .set(user.auth)
      .expect(200);
    expect(eaten.eaten).toBe(true);
    const fut = await request(app)
      .put(api(`/me/meal-plan/${future.id}/eaten`))
      .set(user.auth);
    expect(fut.body.error.code).toBe('FUTURE_DATE');

    let history = await request(app).get(api('/me/eaten')).set(user.auth).expect(200);
    expect(history.body.items.map((i) => i.id)).toEqual([past.id]);

    await request(app)
      .delete(api(`/me/meal-plan/${past.id}/eaten`))
      .set(user.auth)
      .expect(200);
    history = await request(app).get(api('/me/eaten')).set(user.auth);
    expect(history.body.total).toBe(0);
  });

  test('quay món hoặc chốt phòng không tự ghi đã ăn', async () => {
    const user = await createUser();
    await createFood();
    const { body: room } = await request(app).post(api('/rooms')).set(user.auth).send({}).expect(201);
    await request(app)
      .post(api(`/rooms/${room.id}/start`))
      .set(user.auth)
      .send({ mode: 'spin' })
      .expect(200);
    const history = await request(app).get(api('/me/eaten')).set(user.auth);
    expect(history.body.total).toBe(0);
  });
});
