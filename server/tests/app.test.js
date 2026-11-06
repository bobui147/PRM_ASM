'use strict';

const request = require('supertest');
const { buildTestApp } = require('./helpers/app');
const { maskEmail } = require('../src/logger');

describe('GET /api/v1/health', () => {
  test('200 khi DB trả lời', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('503 khi DB lỗi, không lộ chi tiết lỗi', async () => {
    const app = buildTestApp({
      checkDatabase: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:3306');
      },
    });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', database: 'error' });
  });
});

describe('API chung', () => {
  test('đường dẫn API không tồn tại trả JSON 404', async () => {
    const res = await request(buildTestApp()).get('/api/v1/khong-co');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('JSON hỏng trả 400 VALIDATION_ERROR', async () => {
    const res = await request(buildTestApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('body lớn hơn 100 KB trả 413', async () => {
    const res = await request(buildTestApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'a'.repeat(110 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('mỗi response có X-Request-Id; giữ id hợp lệ từ client', async () => {
    const app = buildTestApp();
    const generated = await request(app).get('/api/v1/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const kept = await request(app).get('/api/v1/health').set('X-Request-Id', 'abc12345-req');
    expect(kept.headers['x-request-id']).toBe('abc12345-req');

    const rejected = await request(app).get('/api/v1/health').set('X-Request-Id', '<script>');
    expect(rejected.headers['x-request-id']).not.toBe('<script>');
  });
});

describe('Header bảo mật', () => {
  test('có CSP chỉ cho phép cùng origin và không lộ X-Powered-By', async () => {
    const res = await request(buildTestApp()).get('/admin');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  test('production bật HSTS và upgrade-insecure-requests', async () => {
    const app = buildTestApp({
      env: {
        NODE_ENV: 'production',
        PUBLIC_BASE_URL: 'https://homnayangi.site',
        MAIL_TRANSPORT: 'smtp',
        SMTP_HOST: 'smtp.hostinger.com',
        SMTP_USER: 'contact@homnayangi.site',
        SMTP_PASSWORD: 'x',
      },
    });
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  });
});

describe('Web admin khung', () => {
  test('/ chuyển hướng tới /admin', async () => {
    const res = await request(buildTestApp()).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  test('/admin render HTML tiếng Việt, không cache', async () => {
    const res = await request(buildTestApp()).get('/admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toContain('<html lang="vi">');
    expect(res.text).toContain('/static/vendor/bootstrap/css/bootstrap.min.css');
  });

  test('trang admin không tồn tại trả trang lỗi HTML 404', async () => {
    const res = await request(buildTestApp()).get('/admin/khong-co');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Không tìm thấy trang');
  });

  test('phục vụ Bootstrap và CSS cục bộ', async () => {
    const app = buildTestApp();
    const css = await request(app).get('/static/vendor/bootstrap/css/bootstrap.min.css');
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toMatch(/text\/css/);
    const js = await request(app).get('/static/vendor/bootstrap/js/bootstrap.bundle.min.js');
    expect(js.status).toBe(200);
    const own = await request(app).get('/static/css/admin.css');
    expect(own.status).toBe(200);
  });
});

describe('maskEmail', () => {
  test('che phần tên của email', () => {
    expect(maskEmail('nguyenvana@gmail.com')).toBe('ng***@gmail.com');
    expect(maskEmail('/api/v1/x?email=a@b.vn')).toBe('/api/v1/x?email=a***@b.vn');
    expect(maskEmail('khong co email')).toBe('khong co email');
  });
});
