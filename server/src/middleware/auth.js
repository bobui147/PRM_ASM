'use strict';

const { getPool } = require('../db');
const { AppError } = require('../errors');
const { verifyAccessToken } = require('../modules/auth/token.service');
const { isBlocked, blockInfo } = require('../modules/dto');

const USER_COLUMNS =
  'id, email, display_name, email_verified_at, token_version, blocked_until, blocked_permanent, block_reason, created_at';

async function loadUser(req) {
  const header = req.get('authorization');
  if (!header) {
    throw AppError.unauthenticated();
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) {
    throw AppError.unauthenticated('Phiên đăng nhập không hợp lệ');
  }
  const payload = verifyAccessToken(match[1]);
  const [[user]] = await getPool().query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [Number(payload.sub)]);
  // Đổi mật khẩu tăng token_version → mọi access token cũ hết hiệu lực.
  if (!user || user.token_version !== payload.tv) {
    throw AppError.unauthenticated('Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại');
  }
  return user;
}

/** Bắt buộc đăng nhập. Gán req.user. */
async function requireUser(req, _res, next) {
  req.user = await loadUser(req);
  next();
}

/** Không bắt buộc: token thiếu, sai hoặc hết hạn thì coi như khách. */
async function optionalUser(req, _res, next) {
  try {
    req.user = req.get('authorization') ? await loadUser(req) : null;
  } catch {
    req.user = null;
  }
  next();
}

function requireVerified(req, _res, next) {
  if (!req.user?.email_verified_at) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Bạn cần xác minh email trước');
  }
  next();
}

function requireNotBlocked(req, _res, next) {
  if (isBlocked(req.user)) {
    const info = blockInfo(req.user);
    throw new AppError(403, 'ACCOUNT_BLOCKED', 'Tài khoản của bạn đang bị khóa', {
      details: { reason: info.reason, blockedUntil: info.until },
    });
  }
  next();
}

/** Chuỗi kiểm tra cho mọi API ghi của người dùng. */
const requireActiveUser = [requireUser, requireVerified, requireNotBlocked];

module.exports = { requireUser, optionalUser, requireVerified, requireNotBlocked, requireActiveUser, USER_COLUMNS };
