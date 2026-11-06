'use strict';

const crypto = require('node:crypto');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const { getPool } = require('../db');
const { AppError } = require('../errors');

const MySQLStore = MySQLStoreFactory(session);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Session admin lưu trong bảng `sessions` (migration 001), hết hạn sau 8 giờ không hoạt động (FR-A01). */
function createAdminSession(config) {
  const store = new MySQLStore(
    {
      createDatabaseTable: false,
      expiration: SESSION_TTL_MS,
      clearExpired: !config.isTest,
      checkExpirationInterval: 15 * 60 * 1000,
      endConnectionOnClose: false,
    },
    getPool(),
  );
  return session({
    name: 'hnag.admin',
    secret: config.auth.sessionSecret,
    store,
    // Không chạy timer dọn session khi test (giữ Jest mở); production dọn mỗi 15 phút.
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: config.isProduction,
    cookie: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: SESSION_TTL_MS,
      path: '/admin',
    },
  });
}

/**
 * CSRF synchronizer token trong session (requirements §15).
 * View gọi `csrf()` để lấy token; token chỉ được tạo khi trang có form,
 * nên khách chưa đăng nhập không làm phát sinh session.
 */
function csrfToken(req, res, next) {
  res.locals.csrf = () => {
    req.session.csrfToken ??= crypto.randomBytes(32).toString('base64url');
    return req.session.csrfToken;
  };
  next();
}

function isMultipart(req) {
  return /^multipart\/form-data/i.test(req.get('content-type') ?? '');
}

/** Kiểm tra token của request ghi. Route multipart gọi lại sau multer (xem checkCsrfUnlessMultipart). */
function checkCsrf(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  const expected = req.session?.csrfToken;
  const sent = req.body?._csrf ?? req.get('x-csrf-token');
  const valid =
    typeof expected === 'string' &&
    typeof sent === 'string' &&
    sent.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!valid) {
    next(
      new AppError(
        403,
        'CSRF_INVALID',
        'Phiên làm việc đã hết hạn hoặc form không hợp lệ. Hãy tải lại trang và thử lại.',
      ),
    );
    return;
  }
  next();
}

/** Body multipart chỉ có sau multer, nên route upload tự gắn checkCsrf sau middleware upload. */
function checkCsrfUnlessMultipart(req, res, next) {
  if (isMultipart(req)) {
    next();
    return;
  }
  checkCsrf(req, res, next);
}

/** Flash message qua session: req.flash(type, message); view nhận `flash`. */
function flashMessages(req, res, next) {
  req.flash = (type, message) => {
    req.session.flash ??= [];
    req.session.flash.push({ type, message });
  };
  res.locals.flash = req.session.flash ?? [];
  delete req.session.flash;
  next();
}

/** Nạp admin đang đăng nhập vào res.locals.admin. */
async function loadAdmin(req, res, next) {
  const adminId = req.session.adminId;
  if (adminId) {
    const [[admin]] = await getPool().query('SELECT id, username, email FROM admins WHERE id = ?', [adminId]);
    if (admin) {
      req.admin = admin;
      res.locals.admin = admin;
    } else {
      delete req.session.adminId;
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.admin) {
    const target = req.method === 'GET' ? req.originalUrl : '/admin';
    res.redirect(`/admin/login?next=${encodeURIComponent(target)}`);
    return;
  }
  next();
}

module.exports = {
  createAdminSession,
  csrfToken,
  checkCsrf,
  checkCsrfUnlessMultipart,
  flashMessages,
  loadAdmin,
  requireAdmin,
};
