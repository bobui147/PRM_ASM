'use strict';

const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { getConfig } = require('../../src/config');
const { getPool } = require('../../src/db');
const { resetTestDatabase, truncateDataTables, closeTestDatabase } = require('../helpers/db');
const { buildApiApp, createUser, createFood, createRestaurant, pngBuffer } = require('../helpers/fixtures');

let app;
let png;

beforeAll(async () => {
  await resetTestDatabase();
  app = buildApiApp();
  png = await pngBuffer();
});
afterEach(truncateDataTables);
afterAll(closeTestDatabase);

const api = (p) => `/api/v1${p}`;

function postWith(user, fields = {}, images = 0) {
  const req = request(app).post(api('/posts')).set(user.auth);
  for (const [key, value] of Object.entries(fields)) {
    req.field(key, String(value));
  }
  for (let i = 0; i < images; i += 1) {
    req.attach('images', png, `a${i}.png`);
  }
  return req;
}

function postDir(id) {
  return path.join(getConfig().uploadDir, 'posts', String(id));
}

describe('P1 — bài đăng (FR-C01)', () => {
  test('khách xem được bảng tin nhưng không đăng được', async () => {
    const author = await createUser();
    await postWith(author, { content: 'Bún chả ngon' }).expect(201);
    const feed = await request(app).get(api('/posts')).expect(200);
    expect(feed.body.items).toHaveLength(1);
    expect(feed.body.items[0]).toMatchObject({ content: 'Bún chả ngon', likeCount: 0, likedByMe: false });
    expect(feed.body.items[0]).not.toHaveProperty('status');
    await request(app).post(api('/posts')).field('content', 'x').expect(401);
  });

  test('người bị khóa nhận ACCOUNT_BLOCKED khi đăng, thích, bình luận, báo cáo', async () => {
    const author = await createUser();
    const blocked = await createUser({ blocked: true });
    const { body: post } = await postWith(author, { content: 'Phở' }).expect(201);
    for (const res of [
      await postWith(blocked, { content: 'hi' }),
      await request(app)
        .post(api(`/posts/${post.id}/like`))
        .set(blocked.auth),
      await request(app)
        .post(api(`/posts/${post.id}/comments`))
        .set(blocked.auth)
        .send({ content: 'hi' }),
      await request(app)
        .post(api(`/posts/${post.id}/reports`))
        .set(blocked.auth)
        .send({ reason: 'spam' }),
      await request(app)
        .post(api(`/users/${author.id}/follow`))
        .set(blocked.auth),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_BLOCKED');
    }
  });

  test('chặn bài rỗng, ảnh thứ tư, file giả ảnh, nội dung quá dài; không để lại file', async () => {
    const author = await createUser();
    const empty = await postWith(author, { content: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.fields.content).toBeDefined();

    const four = await postWith(author, { content: 'x' }, 4);
    expect(four.status).toBe(400);

    const fake = await request(app)
      .post(api('/posts'))
      .set(author.auth)
      .field('content', 'x')
      .attach('images', Buffer.from('not an image at all'), 'fake.png');
    expect(fake.status).toBe(415);

    const long = await postWith(author, { content: 'a'.repeat(2001) });
    expect(long.status).toBe(400);

    const [[{ n }]] = await getPool().query('SELECT COUNT(*) AS n FROM posts');
    expect(n).toBe(0);
    expect(fs.existsSync(path.join(getConfig().uploadDir, 'posts'))).toBe(false);
  });

  test('ảnh quá 5 MB bị từ chối', async () => {
    const author = await createUser();
    const res = await request(app)
      .post(api('/posts'))
      .set(author.auth)
      .attach('images', Buffer.alloc(5 * 1024 * 1024 + 10, 1), 'big.png');
    expect(res.status).toBe(413);
  });

  test('tạo bài có ảnh + gắn món/quán, sửa giữ/xóa ảnh, xóa bài xóa thư mục ảnh', async () => {
    const author = await createUser();
    const food = await createFood({ name: 'Bún bò' });
    const restaurant = await createRestaurant({ name: 'Quán A' });
    const { body: post } = await postWith(
      author,
      { content: 'Ngon', foodId: food.id, restaurantId: restaurant.id },
      2,
    ).expect(201);
    expect(post.images).toHaveLength(2);
    expect(post.food).toEqual({ id: food.id, name: 'Bún bò' });
    expect(post.restaurant).toEqual({ id: restaurant.id, name: 'Quán A' });
    expect(fs.readdirSync(postDir(post.id))).toHaveLength(4);

    const keep = post.images[0].id;
    const { body: updated } = await request(app)
      .put(api(`/posts/${post.id}`))
      .set(author.auth)
      .field('content', 'Ngon hơn')
      .field('keepImageIds[0]', String(keep))
      .attach('images', png, 'n.png')
      .attach('images', png, 'm.png')
      .expect(200);
    expect(updated.images.map((i) => i.id)).toContain(keep);
    expect(updated.images).toHaveLength(3);
    expect(updated.edited).toBe(true);
    expect(updated.food).toBeNull();
    expect(fs.readdirSync(postDir(post.id))).toHaveLength(6);

    // Người khác không sửa/xóa được.
    const other = await createUser();
    await request(app)
      .put(api(`/posts/${post.id}`))
      .set(other.auth)
      .field('content', 'hack')
      .expect(403);
    await request(app)
      .delete(api(`/posts/${post.id}`))
      .set(other.auth)
      .expect(403);

    await request(app)
      .delete(api(`/posts/${post.id}`))
      .set(author.auth)
      .expect(204);
    expect(fs.existsSync(postDir(post.id))).toBe(false);
    await request(app)
      .get(api(`/posts/${post.id}`))
      .expect(404);
  });

  test('món bị ẩn sau khi đăng: bài vẫn xem được nhưng không có link', async () => {
    const author = await createUser();
    const food = await createFood({ name: 'Cơm tấm' });
    const { body: post } = await postWith(author, { content: 'x', foodId: food.id }).expect(201);
    await getPool().query("UPDATE foods SET status = 'hidden' WHERE id = ?", [food.id]);
    const { body } = await request(app)
      .get(api(`/posts/${post.id}`))
      .expect(200);
    expect(body.food).toEqual({ id: null, name: 'Cơm tấm' });
    // Không gắn mới món đã ẩn.
    const res = await postWith(author, { content: 'y', foodId: food.id });
    expect(res.status).toBe(400);
  });

  test('nội dung có thẻ script được lưu và trả về dạng văn bản', async () => {
    const author = await createUser();
    const content = '<script>alert(1)</script> ngon';
    const { body } = await postWith(author, { content }).expect(201);
    expect(body.content).toBe(content);
    expect((await request(app).get(api(`/posts/${body.id}`))).headers['content-type']).toMatch(/json/);
  });

  test('bài không ảnh hưởng điểm quán', async () => {
    const author = await createUser();
    const restaurant = await createRestaurant();
    await postWith(author, { content: 'x', restaurantId: restaurant.id }).expect(201);
    const [[row]] = await getPool().query('SELECT rating_avg, review_count FROM restaurants WHERE id = ?', [
      restaurant.id,
    ]);
    expect(row).toEqual({ rating_avg: null, review_count: 0 });
  });
});

describe('P1 — bảng tin, hồ sơ, theo dõi (FR-C02, FR-C03)', () => {
  test('mới nhất trước, phân trang, bộ lọc đang theo dõi, bài ẩn không công khai', async () => {
    const a = await createUser({ name: 'An' });
    const b = await createUser({ name: 'Bình' });
    const viewer = await createUser();
    const ids = [];
    for (const [user, content] of [
      [a, 'một'],
      [b, 'hai'],
      [a, 'ba'],
    ]) {
      ids.push((await postWith(user, { content }).expect(201)).body.id);
    }
    await getPool().query('UPDATE posts SET created_at = created_at - INTERVAL (3 - id % 10) MINUTE');
    const page1 = await request(app).get(api('/posts?limit=2')).expect(200);
    expect(page1.body).toMatchObject({ total: 3, hasMore: true });
    expect(page1.body.items.map((p) => p.content)).toEqual(['ba', 'hai']);
    const page2 = await request(app).get(api('/posts?limit=2&page=2')).expect(200);
    expect(page2.body.items.map((p) => p.content)).toEqual(['một']);

    await request(app).get(api('/posts?filter=following')).expect(401);
    await request(app)
      .post(api(`/users/${a.id}/follow`))
      .set(viewer.auth)
      .expect(200);
    await request(app)
      .post(api(`/users/${a.id}/follow`))
      .set(viewer.auth)
      .expect(200);
    const following = await request(app).get(api('/posts?filter=following')).set(viewer.auth).expect(200);
    expect(following.body.items.map((p) => p.content)).toEqual(['ba', 'một']);

    const profile = await request(app)
      .get(api(`/users/${a.id}`))
      .set(viewer.auth)
      .expect(200);
    expect(profile.body).toMatchObject({ displayName: 'An', followerCount: 1, postCount: 2, isFollowing: true });
    expect(profile.body).not.toHaveProperty('email');

    await getPool().query("UPDATE posts SET status = 'hidden' WHERE id = ?", [ids[2]]);
    const after = await request(app).get(api('/posts')).expect(200);
    expect(after.body.items.map((p) => p.id)).not.toContain(ids[2]);
    await request(app)
      .get(api(`/posts/${ids[2]}`))
      .expect(404);
    expect((await request(app).get(api(`/users/${a.id}/posts`))).body.total).toBe(1);
    // Tác giả thấy bài bị ẩn trong "Bài của tôi" và không sửa được.
    const mine = await request(app).get(api('/me/posts')).set(a.auth).expect(200);
    expect(mine.body.items.find((p) => p.id === ids[2]).status).toBe('hidden');
    const edit = await request(app)
      .put(api(`/posts/${ids[2]}`))
      .set(a.auth)
      .field('content', 'hiện lại');
    expect(edit.body.error.code).toBe('POST_HIDDEN');

    await request(app)
      .delete(api(`/users/${a.id}/follow`))
      .set(viewer.auth)
      .expect(200);
    expect((await request(app).get(api(`/users/${a.id}`))).body.followerCount).toBe(0);
  });

  test('không tự theo dõi chính mình', async () => {
    const a = await createUser();
    const res = await request(app)
      .post(api(`/users/${a.id}/follow`))
      .set(a.auth);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_FOLLOW_SELF');
  });

  test('like/unlike không trùng; bình luận đúng quyền và giới hạn', async () => {
    const author = await createUser();
    const fan = await createUser();
    const { body: post } = await postWith(author, { content: 'x' }).expect(201);
    await request(app)
      .post(api(`/posts/${post.id}/like`))
      .set(fan.auth)
      .expect(200);
    const liked = await request(app)
      .post(api(`/posts/${post.id}/like`))
      .set(fan.auth)
      .expect(200);
    expect(liked.body).toEqual({ liked: true, likeCount: 1 });
    const detail = await request(app)
      .get(api(`/posts/${post.id}`))
      .set(fan.auth);
    expect(detail.body.likedByMe).toBe(true);
    const unliked = await request(app)
      .delete(api(`/posts/${post.id}/like`))
      .set(fan.auth)
      .expect(200);
    expect(unliked.body.likeCount).toBe(0);

    const tooLong = await request(app)
      .post(api(`/posts/${post.id}/comments`))
      .set(fan.auth)
      .send({ content: 'a'.repeat(501) });
    expect(tooLong.status).toBe(400);
    const { body: comment } = await request(app)
      .post(api(`/posts/${post.id}/comments`))
      .set(fan.auth)
      .send({ content: '  Ngon thật  ' })
      .expect(201);
    expect(comment.content).toBe('Ngon thật');
    const list = await request(app)
      .get(api(`/posts/${post.id}/comments`))
      .expect(200);
    expect(list.body.total).toBe(1);
    await request(app)
      .delete(api(`/comments/${comment.id}`))
      .set(author.auth)
      .expect(403);
    await request(app)
      .delete(api(`/comments/${comment.id}`))
      .set(fan.auth)
      .expect(204);

    // Bài bị ẩn: không tương tác mới.
    await getPool().query("UPDATE posts SET status = 'hidden' WHERE id = ?", [post.id]);
    await request(app)
      .post(api(`/posts/${post.id}/like`))
      .set(fan.auth)
      .expect(404);
    await request(app)
      .post(api(`/posts/${post.id}/comments`))
      .set(fan.auth)
      .send({ content: 'x' })
      .expect(404);
  });
});

describe('P1 — báo cáo và xóa tài khoản (FR-C04, FR-C05)', () => {
  test('không tự báo cáo, báo cáo trùng đang mở bị từ chối', async () => {
    const author = await createUser();
    const reporter = await createUser();
    const { body: post } = await postWith(author, { content: 'x' }).expect(201);
    const own = await request(app)
      .post(api(`/posts/${post.id}/reports`))
      .set(author.auth)
      .send({ reason: 'spam' });
    expect(own.body.error.code).toBe('CANNOT_REPORT_OWN_CONTENT');
    await request(app)
      .post(api(`/posts/${post.id}/reports`))
      .set(reporter.auth)
      .send({ reason: 'spam' })
      .expect(201);
    const dup = await request(app)
      .post(api(`/posts/${post.id}/reports`))
      .set(reporter.auth)
      .send({ reason: 'spam' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_REPORTED');
    // Báo cáo đã xử lý thì được báo cáo lại.
    await getPool().query("UPDATE content_reports SET status = 'dismissed'");
    await request(app)
      .post(api(`/posts/${post.id}/reports`))
      .set(reporter.auth)
      .send({ reason: 'spam' })
      .expect(201);

    const other = await request(app)
      .post(api(`/posts/${post.id}/reports`))
      .set((await createUser()).auth)
      .send({ reason: 'other' });
    expect(other.body.error.fields.details).toBeDefined();
  });

  test('xóa bài xóa báo cáo của bài và của bình luận trong bài', async () => {
    const author = await createUser();
    const fan = await createUser();
    const { body: post } = await postWith(author, { content: 'x' }).expect(201);
    const { body: comment } = await request(app)
      .post(api(`/posts/${post.id}/comments`))
      .set(fan.auth)
      .send({ content: 'hey' })
      .expect(201);
    await request(app)
      .post(api(`/comments/${comment.id}/reports`))
      .set(author.auth)
      .send({ reason: 'spam' })
      .expect(201);
    await request(app)
      .post(api(`/posts/${post.id}/reports`))
      .set(fan.auth)
      .send({ reason: 'spam' })
      .expect(201);
    await request(app)
      .delete(api(`/posts/${post.id}`))
      .set(author.auth)
      .expect(204);
    const [[{ n }]] = await getPool().query('SELECT COUNT(*) AS n FROM content_reports');
    expect(n).toBe(0);
  });

  test('xóa tài khoản xóa bài, ảnh, bình luận, like, theo dõi và báo cáo liên quan', async () => {
    const bcrypt = require('bcrypt');
    const author = await createUser();
    await getPool().query('UPDATE users SET password_hash = ? WHERE id = ?', [
      await bcrypt.hash('Matkhau123', 4),
      author.id,
    ]);
    const fan = await createUser();
    const { body: post } = await postWith(author, { content: 'x' }, 1).expect(201);
    const { body: fanPost } = await postWith(fan, { content: 'fan' }).expect(201);
    await request(app)
      .post(api(`/posts/${fanPost.id}/like`))
      .set(author.auth)
      .expect(200);
    const { body: c } = await request(app)
      .post(api(`/posts/${fanPost.id}/comments`))
      .set(author.auth)
      .send({ content: 'hi' })
      .expect(201);
    await request(app)
      .post(api(`/comments/${c.id}/reports`))
      .set(fan.auth)
      .send({ reason: 'spam' })
      .expect(201);
    await request(app)
      .post(api(`/posts/${post.id}/reports`))
      .set(fan.auth)
      .send({ reason: 'spam' })
      .expect(201);
    await request(app)
      .post(api(`/users/${fan.id}/follow`))
      .set(author.auth)
      .expect(200);
    expect(fs.existsSync(postDir(post.id))).toBe(true);

    await request(app).delete(api('/me')).set(author.auth).send({ password: 'Matkhau123' }).expect(204);

    expect(fs.existsSync(postDir(post.id))).toBe(false);
    const pool = getPool();
    for (const table of [
      'posts WHERE user_id = ' + author.id,
      'post_comments',
      'post_likes',
      'user_follows',
      'content_reports',
    ]) {
      const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM ${table}`);
      expect(n).toBe(0);
    }
    const detail = await request(app)
      .get(api(`/posts/${fanPost.id}`))
      .expect(200);
    expect(detail.body).toMatchObject({ likeCount: 0, commentCount: 0 });
    expect((await request(app).get(api(`/users/${fan.id}`))).body.followerCount).toBe(0);
  });
});
