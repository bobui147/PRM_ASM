'use strict';
const request = require('supertest');
const express = require('express');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const { getPool } = require('../../src/db');
const { getConfig } = require('../../src/config');
const { createApiRouter } = require('../../src/routes/api');
const { createCommunityAdminRouter } = require('../../src/modules/admin/community.admin');
const { signAccessToken } = require('../../src/modules/auth/token.service');
const { createErrorHandler } = require('../../src/middleware/error-handler');
const { resetTestDatabase, truncateDataTables, closeTestDatabase } = require('../helpers/db');
let app, token, otherToken, userId;
beforeAll(async () => {
  await resetTestDatabase();
  app = express();
  app.use('/api/v1', createApiRouter({ config: getConfig(), checkDatabase: async () => {} }));
  // Test nghiệp vụ admin riêng; CSRF/session do middleware admin hiện có bảo vệ.
  app.use(
    '/moderate',
    express.urlencoded({ extended: false }),
    (req, _res, next) => {
      req.admin = { id: null };
      next();
    },
    createCommunityAdminRouter(),
  );
  app.use(createErrorHandler({ isProduction: false }));
});
beforeEach(async () => {
  const [a] = await getPool().query(
    "INSERT INTO users (email,password_hash,display_name,email_verified_at) VALUES ('a@x.vn','h','Lan',NOW())",
  );
  const [b] = await getPool().query(
    "INSERT INTO users (email,password_hash,display_name,email_verified_at) VALUES ('b@x.vn','h','Mai',NOW())",
  );
  userId = a.insertId;
  token = signAccessToken({ id: a.insertId, token_version: 0 });
  otherToken = signAccessToken({ id: b.insertId, token_version: 0 });
});
afterEach(truncateDataTables);
afterAll(closeTestDatabase);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const createPost = () =>
  request(app).post('/api/v1/community/posts').set(auth(token)).field('content', 'Món ngon hôm nay');
test('bài và bình luận chỉ công khai sau duyệt; like không trùng; báo cáo và ẩn chặn tương tác', async () => {
  const created = await createPost();
  expect(created.status).toBe(201);
  const id = created.body.id;
  const path = `/api/v1/community/posts/${id}`;
  expect(created.body.status).toBe('pending');
  expect((await request(app).get(path)).status).toBe(404);
  expect((await request(app).get('/api/v1/community/posts')).body.total).toBe(0);
  expect((await request(app).post(`/moderate/posts/${id}/approve`)).status).toBe(302);
  expect((await request(app).get(path)).body.content).toBe('Món ngon hôm nay');
  for (let n = 0; n < 2; n++) expect((await request(app).put(`${path}/like`).set(auth(otherToken))).status).toBe(204);
  expect((await request(app).get(path)).body.likes).toBe(1);
  expect((await request(app).post(`${path}/comments`).set(auth(otherToken)).send({ content: 'Ngon quá' })).status).toBe(
    201,
  );
  expect((await request(app).get(`${path}/comments`)).body.total).toBe(0);
  const mine = await request(app).get(`${path}/comments`).set(auth(otherToken));
  expect(mine.body.items[0].status).toBe('pending');
  expect((await request(app).post(`/moderate/comments/${mine.body.items[0].id}/approve`)).status).toBe(302);
  expect((await request(app).get(path)).body.comments).toBe(1);
  expect((await request(app).post(`${path}/reports`).set(auth(otherToken)).send({ reason: 'spam' })).status).toBe(201);
  expect((await request(app).post(`${path}/reports`).set(auth(otherToken)).send({ reason: 'spam' })).status).toBe(409);
  const [[report]] = await getPool().query('SELECT id FROM community_reports');
  expect((await request(app).post(`/moderate/reports/${report.id}/resolve`)).status).toBe(302);
  expect((await request(app).get(path)).status).toBe(404);
  expect((await request(app).put(path).set(auth(token)).field('content', 'Sửa để hiện lại')).status).toBe(403);
});
test('quyền sở hữu, giới hạn nội dung và dữ liệu hồ sơ riêng tư', async () => {
  expect((await request(app).post('/api/v1/community/posts').field('content', 'a')).status).toBe(401);
  expect((await request(app).post('/api/v1/community/posts').set(auth(token)).field('content', '')).status).toBe(400);
  expect(
    (await request(app).post('/api/v1/community/posts').set(auth(token)).field('content', 'x'.repeat(2001))).status,
  ).toBe(400);
  const { body } = await createPost();
  expect(
    (await request(app).delete(`/api/v1/community/posts/${body.id}`).set(auth(otherToken))).status,
  ).toBeGreaterThanOrEqual(400);
  await getPool().query('UPDATE users SET blocked_permanent = TRUE WHERE id = ?', [userId]);
  expect((await createPost()).status).toBe(403);
  const profile = await request(app).get(`/api/v1/users/${userId}/profile`);
  expect(profile.body.email).toBeUndefined();
});
test('ảnh được kiểm tra, xóa metadata và xóa file khi xóa bài', async () => {
  const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } })
    .jpeg()
    .withMetadata()
    .toBuffer();
  const created = await createPost().attach('images', image, 'photo.jpg');
  expect(created.status).toBe(201);
  const id = created.body.id;
  expect(created.body.images).toHaveLength(1);
  const dir = `${getConfig().uploadDir}/community/${id}`;
  const files = await fs.readdir(dir);
  const metadata = await sharp(await fs.readFile(`${dir}/${files[0]}`)).metadata();
  expect(metadata.exif).toBeUndefined();
  expect((await request(app).delete(`/api/v1/community/posts/${id}`).set(auth(token))).status).toBe(204);
  await expect(fs.access(dir)).rejects.toThrow();
  expect((await createPost().attach('images', Buffer.from('fake'), 'fake.jpg')).status).toBe(415);
});
test('bảng tin theo dõi, phân trang, sửa bài quay về chờ duyệt và cascade khi xóa tài khoản', async () => {
  const first = await createPost();
  const second = await createPost();
  for (const p of [first, second]) await request(app).post(`/moderate/posts/${p.body.id}/approve`);
  expect((await request(app).get('/api/v1/community/posts?following=true').set(auth(otherToken))).body.total).toBe(0);
  await request(app).put(`/api/v1/users/${userId}/follow`).set(auth(otherToken));
  const page = await request(app).get('/api/v1/community/posts?following=true&limit=1').set(auth(otherToken));
  expect(page.body.items).toHaveLength(1);
  expect(page.body.hasMore).toBe(true);
  const edited = await request(app)
    .put(`/api/v1/community/posts/${first.body.id}`)
    .set(auth(token))
    .field('content', 'Đã cập nhật');
  expect(edited.body.status).toBe('pending');
  await getPool().query('DELETE FROM users WHERE id = ?', [userId]);
  const [[{ n }]] = await getPool().query('SELECT COUNT(*) AS n FROM community_posts');
  expect(n).toBe(0);
  expect((await request(app).get('/api/v1/community/posts')).body.total).toBe(0);
});
test('giới hạn bài vẫn áp dụng sau khi xóa; nội dung chưa xác minh không được ghi', async () => {
  for (let i = 0; i < 10; i++)
    await getPool().query("INSERT INTO community_actions (user_id,kind) VALUES (?, 'post')", [userId]);
  expect((await createPost()).status).toBe(429);
  await getPool().query('UPDATE users SET email_verified_at = NULL WHERE id = ?', [userId]);
  expect((await createPost()).status).toBe(403);
});
