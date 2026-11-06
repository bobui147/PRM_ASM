'use strict';

const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const { validate } = require('../src/middleware/validate');
const { AppError } = require('../src/errors');
const { createErrorHandler } = require('../src/middleware/error-handler');

function appWith(schemas) {
  const app = express();
  app.use(express.json());
  app.post('/api/items/:id', validate(schemas), (req, res) => res.json(req.valid));
  app.get('/api/boom', () => {
    throw AppError.rateLimited(12.2);
  });
  app.get('/api/crash', async () => {
    throw new Error('mật khẩu DB là abc');
  });
  app.use(createErrorHandler({ isProduction: true }));
  return app;
}

describe('validate middleware', () => {
  const schemas = {
    params: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
    body: z.object({ name: z.string().trim().min(2, 'Tên phải có ít nhất 2 ký tự') }),
  };

  test('gán dữ liệu đã chuẩn hóa vào req.valid', async () => {
    const res = await request(appWith(schemas)).post('/api/items/7?page=3').send({ name: '  Phở  ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ params: { id: 7 }, query: { page: 3 }, body: { name: 'Phở' } });
  });

  test('gom lỗi của params, query và body thành fields', async () => {
    const res = await request(appWith(schemas)).post('/api/items/abc?page=0').send({ name: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['id', 'name', 'page']);
    expect(res.body.error.fields.name).toBe('Tên phải có ít nhất 2 ký tự');
  });

  test('body thiếu được coi là object rỗng', async () => {
    const res = await request(appWith({ body: schemas.body })).post('/api/items/1');
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('name');
  });
});

describe('error handler', () => {
  test('429 có Retry-After và retryAfter làm tròn lên', async () => {
    const res = await request(appWith({})).get('/api/boom');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('13');
    expect(res.body).toEqual({
      error: { code: 'RATE_LIMITED', message: expect.any(String), retryAfter: 13 },
    });
  });

  test('lỗi không lường trước trả 500 chung, không lộ nội dung lỗi', async () => {
    const res = await request(appWith({})).get('/api/crash');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('abc');
  });
});
