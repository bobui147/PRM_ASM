'use strict';

const bcrypt = require('bcrypt');
const request = require('supertest');
const { getPool } = require('../../src/db');
const { resetTestDatabase, truncateDataTables, closeTestDatabase } = require('../helpers/db');
const { buildApiApp, createUser, createFood } = require('../helpers/fixtures');

let app;

beforeAll(async () => {
  await resetTestDatabase();
  app = buildApiApp();
});
afterEach(truncateDataTables);
afterAll(closeTestDatabase);

const csrfOf = (html) => /name="_csrf" value="([^"]+)"/.exec(html)[1];

/** Đăng nhập admin bằng session thật; trả agent và hàm lấy CSRF của một trang. */
async function adminAgent() {
  await getPool().query("INSERT INTO admins (username, email, password_hash) VALUES ('admin', 'a@test.vn', ?)", [
    await bcrypt.hash('Admin@12345', 4),
  ]);
  const agent = request.agent(app);
  const login = await agent.get('/admin/login').expect(200);
  await agent
    .post('/admin/login')
    .type('form')
    .send({ _csrf: csrfOf(login.text), login: 'admin', password: 'Admin@12345', next: '/admin' })
    .expect(302);
  return {
    agent,
    async csrf(path) {
      return csrfOf((await agent.get(path).expect(200)).text);
    },
  };
}

async function seedReportedPost() {
  const author = await createUser({ name: 'Tác giả' });
  const reporter = await createUser();
  const [post] = await getPool().query(
    "INSERT INTO posts (user_id, content) VALUES (?, '<b>Nội dung bị báo cáo</b>')",
    [author.id],
  );
  const [comment] = await getPool().query(
    "INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, 'xấu')",
    [post.insertId, reporter.id],
  );
  await getPool().query(
    "INSERT INTO content_reports (target_type, target_id, reporter_id, reason) VALUES ('post', ?, ?, 'spam'), ('comment', ?, ?, 'offensive')",
    [post.insertId, reporter.id, comment.insertId, author.id],
  );
  return { author, reporter, postId: post.insertId, commentId: comment.insertId };
}

describe('Web admin — cộng đồng và phòng', () => {
  test('các trang mới render được, dữ liệu người dùng được escape', async () => {
    const { agent } = await adminAgent();
    await seedReportedPost();
    for (const path of [
      '/admin',
      '/admin/community/posts',
      '/admin/community/comments',
      '/admin/community/reports',
      '/admin/rooms',
    ]) {
      const res = await agent.get(path).expect(200);
      expect(res.text).not.toContain('<b>Nội dung');
    }
    const posts = await agent.get('/admin/community/posts');
    expect(posts.text).toContain('&lt;b&gt;Nội dung bị báo cáo&lt;/b&gt;');
  });

  test('ẩn bài từ báo cáo (khóa tác giả), hiện lại, xóa bình luận; ghi nhật ký không chứa nội dung', async () => {
    const { agent, csrf } = await adminAgent();
    const { author, postId, commentId } = await seedReportedPost();
    let token = await csrf('/admin/community/reports');
    await agent
      .post(`/admin/community/reports/post/${postId}/hide`)
      .type('form')
      .send({ _csrf: token, block: 'on', duration: '7' })
      .expect(302);
    const pool = getPool();
    const [[post]] = await pool.query('SELECT status FROM posts WHERE id = ?', [postId]);
    expect(post.status).toBe('hidden');
    const [[report]] = await pool.query("SELECT status FROM content_reports WHERE target_type = 'post'");
    expect(report.status).toBe('resolved');
    const [[user]] = await pool.query('SELECT blocked_until FROM users WHERE id = ?', [author.id]);
    expect(user.blocked_until).not.toBeNull();

    token = await csrf('/admin/community/posts');
    await agent.post(`/admin/community/posts/${postId}/unhide`).type('form').send({ _csrf: token }).expect(302);
    const [[shown]] = await pool.query('SELECT status FROM posts WHERE id = ?', [postId]);
    expect(shown.status).toBe('visible');

    token = await csrf('/admin/community/comments');
    await agent.post(`/admin/community/comments/${commentId}/delete`).type('form').send({ _csrf: token }).expect(302);
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM content_reports WHERE target_type = 'comment'");
    expect(n).toBe(0);

    const [logs] = await pool.query(
      "SELECT action, summary FROM admin_audit_logs WHERE action <> 'admin.login' ORDER BY id",
    );
    expect(logs.map((l) => l.action)).toEqual(['post.hide', 'user.block', 'post.unhide', 'comment.delete']);
    expect(
      logs.some((l) => l.summary.includes('bị báo cáo<') || l.summary.includes('<b>') || l.summary.includes('xấu')),
    ).toBe(false);

    // Thao tác lặp được báo rõ, không lỗi 500.
    token = await csrf('/admin/community/comments');
    const again = await agent.post(`/admin/community/comments/${commentId}/delete`).type('form').send({ _csrf: token });
    expect(again.status).toBe(302);
  });

  test('admin đóng phòng, thành viên thấy phòng kết thúc', async () => {
    const { agent, csrf } = await adminAgent();
    await createFood();
    const owner = await createUser();
    const { body: room } = await request(app).post('/api/v1/rooms').set(owner.auth).send({}).expect(201);
    const token = await csrf('/admin/rooms');
    await agent.post(`/admin/rooms/${room.id}/close`).type('form').send({ _csrf: token }).expect(302);
    const { body } = await request(app).get(`/api/v1/rooms/${room.id}`).set(owner.auth).expect(200);
    expect(body).toMatchObject({ phase: 'closed', closedReason: 'admin' });
  });

  test('POST admin thiếu CSRF bị từ chối', async () => {
    const { agent } = await adminAgent();
    const { postId } = await seedReportedPost();
    await agent.post(`/admin/community/posts/${postId}/hide`).type('form').send({}).expect(403);
  });
});
