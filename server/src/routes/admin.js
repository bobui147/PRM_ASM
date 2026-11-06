'use strict';

const express = require('express');
const {
  createAdminSession,
  csrfToken,
  checkCsrfUnlessMultipart,
  flashMessages,
  loadAdmin,
  requireAdmin,
} = require('../middleware/admin');
const labels = require('../modules/dto');
const { createAdminAuthRouter } = require('../modules/admin/auth.admin');
const { createDashboardRouter } = require('../modules/admin/dashboard.admin');
const { createCategoriesRouter } = require('../modules/admin/categories.admin');
const { createFoodsRouter } = require('../modules/admin/foods.admin');
const { createRestaurantsRouter } = require('../modules/admin/restaurants.admin');
const { createReviewsRouter } = require('../modules/admin/reviews.admin');
const { createReportsRouter } = require('../modules/admin/reports.admin');
const { createUsersRouter } = require('../modules/admin/users.admin');
const { createAuditRouter } = require('../modules/admin/audit.admin');

const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** Hàm và dữ liệu dùng chung cho mọi view admin. */
function viewHelpers(req, res, next) {
  const path = req.originalUrl.split('?')[0];
  res.locals.currentPath = path;
  res.locals.currentUrl = req.originalUrl;
  res.locals.labels = labels;
  res.locals.uploadUrl = labels.uploadUrl;
  res.locals.fmtDate = (value) => (value ? dateFormat.format(new Date(value)) : '');
  res.locals.fmtMoney = (value) => (value == null || value === '' ? '' : `${Number(value).toLocaleString('vi-VN')}đ`);
  res.locals.asArray = (value) => (value == null || value === '' ? [] : [].concat(value).map(String));
  res.locals.pageUrl = (page) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'page' && typeof value === 'string' && value !== '') {
        query.set(key, value);
      }
    }
    query.set('page', String(page));
    return `${path}?${query}`;
  };
  res.locals.fields = {};
  res.locals.values = {};
  next();
}

/** Router /admin (requirements §14). */
function createAdminRouter({ config }) {
  const router = express.Router();

  // Trang admin không bao giờ được cache.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(createAdminSession(config));
  router.use(express.urlencoded({ extended: true, limit: '100kb' }));
  router.use(viewHelpers, csrfToken, flashMessages, loadAdmin, checkCsrfUnlessMultipart);

  router.use(createAdminAuthRouter());
  router.use(requireAdmin);
  router.use(createDashboardRouter());
  router.use('/categories', createCategoriesRouter());
  router.use('/foods', createFoodsRouter());
  router.use('/restaurants', createRestaurantsRouter());
  router.use('/reviews', createReviewsRouter());
  router.use('/reports', createReportsRouter());
  router.use('/users', createUsersRouter());
  router.use('/audit-logs', createAuditRouter());

  return router;
}

module.exports = { createAdminRouter };
