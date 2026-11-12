'use strict';

const { rateLimit } = require('express-rate-limit');
const { AppError } = require('../errors');

function retryAfterSeconds(req, windowMs) {
  const reset = req.rateLimit?.resetTime;
  return reset ? (reset.getTime() - Date.now()) / 1000 : windowMs / 1000;
}

/**
 * Giới hạn theo IP (mặc định) hoặc theo khóa riêng. Bộ đếm nằm trong bộ nhớ
 * nên reset khi khởi động lại server; đủ cho một tiến trình PM2.
 */
function createLimiter({ windowMs, limit, keyGenerator, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler(req, _res, next) {
      next(AppError.rateLimited(retryAfterSeconds(req, windowMs), 'RATE_LIMITED', message));
    },
  });
}

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// requirements FR-R06: 60 request ghi / 15 phút / IP.
const writeLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 60,
  message: 'Bạn thao tác quá nhiều, vui lòng thử lại sau',
});

// Nhóm /auth: chặn dò mật khẩu và spam đăng ký từ một IP.
const authLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 30,
  message: 'Bạn thử quá nhiều lần, vui lòng thử lại sau 15 phút',
});

// requirements FR-R06: tối đa 20 lần sửa review / 24 giờ / người dùng.
const reviewEditLimiter = createLimiter({
  windowMs: DAY,
  limit: 20,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: 'Bạn đã sửa review quá nhiều lần hôm nay, vui lòng thử lại sau',
});

// requirements-mo-rong.md: mỗi nhóm chức năng mới có bộ đếm IP riêng để thao tác nhanh
// (thích, chọn món trong phòng) không làm cạn quota ghi của review.
const communityWriteLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 60,
  message: 'Bạn thao tác quá nhiều, vui lòng thử lại sau',
});

const interactionLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 300,
  message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau',
});

const roomLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 400,
  message: 'Bạn thao tác trong phòng quá nhanh, vui lòng thử lại sau',
});

const mealPlanLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 200,
  message: 'Bạn thao tác quá nhiều, vui lòng thử lại sau',
});

module.exports = {
  createLimiter,
  writeLimiter,
  authLimiter,
  reviewEditLimiter,
  communityWriteLimiter,
  interactionLimiter,
  roomLimiter,
  mealPlanLimiter,
};
