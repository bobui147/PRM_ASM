'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { createLogger } = require('../../src/logger');
const { getConfig } = require('../../src/config');
const { getPool } = require('../../src/db');
const { hashPassword } = require('../../src/services/password');
const { resetTestDatabase, truncateDataTables, closeTestDatabase } = require('../helpers/db');
let app;
beforeAll(async () => {
  await resetTestDatabase();
  app = createApp({ config: getConfig(), logger: createLogger({ level: 'silent' }) });
});
afterEach(truncateDataTables);
afterAll(closeTestDatabase);
test('admin duyệt nội dung qua session/CSRF, view escape HTML và ghi nhật ký', async () => {
  await getPool().query('INSERT INTO admins(username,email,password_hash) VALUES (?,?,?)', [
    'testadmin',
    'admin@x.vn',
    await hashPassword('Admin12345678'),
  ]);
  const [user] = await getPool().query(
    "INSERT INTO users(email,password_hash,display_name,email_verified_at) VALUES ('a@x.vn','h','Lan',NOW())",
  );
  const [p] = await getPool().query('INSERT INTO community_posts(user_id,content) VALUES (?,?)', [
    user.insertId,
    '<script>alert(1)</script>',
  ]);
  const agent = request.agent(app);
  const login = await agent.get('/admin/login');
  const csrf = login.text.match(/name="_csrf" value="([^"]+)"/)[1];
  expect(
    (await agent.post('/admin/login').type('form').send({ _csrf: csrf, login: 'testadmin', password: 'Admin12345678' }))
      .status,
  ).toBe(302);
  const page = await agent.get('/admin/community');
  expect(page.status).toBe(200);
  expect(page.text).toContain('&lt;script&gt;');
  expect(page.text).not.toContain('<script>alert(1)</script>');
  const nextToken = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  expect((await agent.post(`/admin/community/posts/${p.insertId}/approve`).type('form').send({})).status).toBe(403);
  expect(
    (await agent.post(`/admin/community/posts/${p.insertId}/approve`).type('form').send({ _csrf: nextToken })).status,
  ).toBe(302);
  const [[row]] = await getPool().query('SELECT status FROM community_posts WHERE id=?', [p.insertId]);
  expect(row.status).toBe('published');
  const [[{ n }]] = await getPool().query(
    "SELECT COUNT(*) AS n FROM admin_audit_logs WHERE action='community_approve'",
  );
  expect(n).toBe(1);
});
