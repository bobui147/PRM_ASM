'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { pinoHttp } = require('pino-http');

const { maskEmail } = require('./logger');
const { getPool } = require('./db');
const { createApiRouter } = require('./routes/api');
const { createAdminRouter } = require('./routes/admin');
const { notFoundHandler, createErrorHandler } = require('./middleware/error-handler');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;
const HEALTH_PATH = '/api/v1/health';

/** Kiểm tra MySQL còn trả lời, dừng chờ sau timeoutMs để health check không treo. */
async function pingDatabase(timeoutMs = 2000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Database ping timeout')), timeoutMs);
  });
  try {
    await Promise.race([getPool().query('SELECT 1'), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function buildHelmet(config) {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        // Chỉ ép HTTPS ở production; dev chạy http://localhost.
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    // HSTS chỉ có ý nghĩa qua HTTPS ở production.
    strictTransportSecurity: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
    // Ảnh /uploads sẽ được app Flutter Web ở origin khác tải về.
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
}

function buildRequestLogger(logger) {
  return pinoHttp({
    logger,
    genReqId(req, res) {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customLogLevel(_req, res, error) {
      if (error || res.statusCode >= 500) {
        return 'error';
      }
      return res.statusCode >= 400 ? 'warn' : 'info';
    },
    autoLogging: { ignore: (req) => req.url === HEALTH_PATH },
    // Chỉ ghi thông tin cần thiết; không ghi header (token, cookie) hay body.
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: maskEmail(req.url.replace(/([?&]_csrf=)[^&]*/g, '$1[redacted]')),
        remoteAddress: req.remoteAddress,
        userAgent: req.headers?.['user-agent'],
      }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  });
}

/**
 * Tạo Express app. Không mở cổng, để test dùng trực tiếp với supertest.
 *
 * @param {object} deps
 * @param {object} deps.config   Kết quả getConfig()/parseConfig()
 * @param {import('pino').Logger} deps.logger
 * @param {() => Promise<void>} [deps.checkDatabase]  Ném lỗi nếu DB không dùng được
 */
function createApp({ config, logger, checkDatabase = pingDatabase }) {
  const app = express();

  // Chạy sau Nginx: lấy IP thật từ X-Forwarded-For của đúng một proxy.
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.locals.appName = 'Hôm nay ăn gì?';

  app.use(buildRequestLogger(logger));
  app.use(buildHelmet(config));

  const staticOptions = { index: false, maxAge: config.isProduction ? '7d' : 0 };
  app.use('/static', express.static(path.join(__dirname, '..', 'public'), staticOptions));
  // Bootstrap đóng gói cục bộ từ node_modules, phiên bản khóa trong package-lock.json.
  app.use(
    '/static/vendor/bootstrap',
    express.static(path.join(path.dirname(require.resolve('bootstrap/package.json')), 'dist'), staticOptions),
  );

  // Ở production Nginx phục vụ /uploads trực tiếp (requirements §16.4).
  if (!config.isProduction) {
    app.use('/uploads', express.static(config.uploadDir, { index: false, dotfiles: 'deny' }));
  }

  app.use('/api/v1', createApiRouter({ checkDatabase, config }));
  app.use('/admin', createAdminRouter({ config }));
  app.get('/', (_req, res) => res.redirect('/admin'));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ isProduction: config.isProduction }));

  return app;
}

module.exports = { createApp, pingDatabase };
