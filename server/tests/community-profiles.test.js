'use strict';

const request = require('supertest');
const express = require('express');

jest.mock('../src/db', () => ({ getPool: () => ({ query: mockQuery }) }));
jest.mock('../src/middleware/auth', () => ({
  optionalUser: (req, _res, next) => {
    req.user = req.get('x-user') ? { id: 1 } : null;
    next();
  },
  requireActiveUser: [
    (req, res, next) => {
      if (!req.get('x-user')) return res.sendStatus(401);
      if (req.get('x-blocked')) return res.sendStatus(403);
      req.user = { id: 1 };
      next();
    },
  ],
}));
const mockQuery = jest.fn();
const { createCommunityProfilesRouter } = require('../src/modules/users/community-profiles.routes');

function app() {
  const instance = express();
  instance.use(createCommunityProfilesRouter());
  instance.use((err, _req, res, _next) => res.status(err.status || 500).json({ code: err.code }));
  return instance;
}

test('hồ sơ công khai không lộ email và thể hiện trạng thái theo dõi', async () => {
  mockQuery.mockResolvedValueOnce([[{ id: 2, display_name: 'Lan', followers: 3, following: 4, is_following: 1 }]]);
  const res = await request(app()).get('/users/2/profile').set('x-user', '1');
  expect(res.body).toEqual({ id: 2, displayName: 'Lan', followers: 3, following: 4, isFollowing: true });
});

test('theo dõi kiểm tra đăng nhập, khóa, tự theo dõi và tài khoản đích', async () => {
  expect((await request(app()).put('/users/2/follow')).status).toBe(401);
  expect((await request(app()).put('/users/2/follow').set('x-user', '1').set('x-blocked', '1')).status).toBe(403);
  expect((await request(app()).put('/users/1/follow').set('x-user', '1')).status).toBe(400);
  mockQuery.mockResolvedValueOnce([[]]);
  expect((await request(app()).put('/users/2/follow').set('x-user', '1')).status).toBe(404);
  mockQuery.mockResolvedValueOnce([[{ id: 2 }]]).mockResolvedValueOnce([{ affectedRows: 0 }]);
  expect((await request(app()).put('/users/2/follow').set('x-user', '1')).status).toBe(204);
});
