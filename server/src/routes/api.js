'use strict';

const express = require('express');
const cors = require('cors');
const { AppError } = require('../errors');
const { createAuthRouter } = require('../modules/auth/auth.routes');
const { createMeRouter } = require('../modules/users/me.routes');
const { createCatalogRouter } = require('../modules/catalog/catalog.routes');
const { createRestaurantRouter } = require('../modules/restaurants/restaurant.routes');
const { createReviewRouter } = require('../modules/reviews/review.routes');
const { createCommunityRouter } = require('../modules/community/community.routes');
const { createGroupRouter } = require('../modules/groups/group.routes');
const { createMealPlanRouter } = require('../modules/meal-plans/meal-plan.routes');

/** Router /api/v1 (requirements §13). */
function createApiRouter({ checkDatabase, config }) {
  const router = express.Router();

  // CORS chỉ cho Flutter Web; app Android không cần (requirements §15).
  router.use(
    cors({
      origin: config?.corsOrigins?.length ? config.corsOrigins : false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'If-None-Match', 'X-App-Version', 'X-Request-Id'],
      exposedHeaders: ['ETag', 'Retry-After', 'X-Request-Id'],
      maxAge: 600,
    }),
  );

  // Body JSON tối đa 100 KB; request có ảnh dùng multipart riêng (multer).
  router.use(express.json({ limit: '100kb' }));

  // API không được cache bởi trình duyệt/proxy trừ khi route tự đặt (ví dụ ETag cho /catalog).
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/health', async (req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ok', database: 'ok' });
    } catch (error) {
      req.log?.error({ err: error }, 'Health check: database lỗi');
      res.status(503).json({ status: 'error', database: 'error' });
    }
  });

  router.use('/auth', createAuthRouter());
  // Router mở rộng có đường dẫn /me/... riêng nên gắn trước /me.
  router.use(createCommunityRouter());
  router.use(createMealPlanRouter());
  router.use(createGroupRouter());
  router.use('/me', createMeRouter());
  router.use(createCatalogRouter());
  router.use(createRestaurantRouter());
  router.use(createReviewRouter());

  // Đường dẫn /api/v1/* không tồn tại luôn trả JSON.
  router.use((_req, _res, next) => {
    next(AppError.notFound('NOT_FOUND', 'Không tìm thấy API này'));
  });

  return router;
}

module.exports = { createApiRouter };
