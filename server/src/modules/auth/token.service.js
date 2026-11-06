'use strict';

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { getConfig } = require('../../config');
const { withTransaction } = require('../../db');
const { AppError } = require('../../errors');

// requirements FR-U03.
const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(user) {
  const { jwtSecret, accessTokenTtlSeconds } = getConfig().auth;
  return jwt.sign({ tv: user.token_version }, jwtSecret, {
    algorithm: 'HS256',
    subject: String(user.id),
    expiresIn: accessTokenTtlSeconds,
  });
}

/** Trả payload hoặc ném TOKEN_EXPIRED / UNAUTHENTICATED. */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, getConfig().auth.jwtSecret, { algorithms: ['HS256'] });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Phiên đăng nhập đã hết hạn');
    }
    throw AppError.unauthenticated('Phiên đăng nhập không hợp lệ');
  }
}

async function insertRefreshToken(conn, userId, familyId, userAgent) {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + getConfig().auth.refreshTokenTtlDays * DAY_MS);
  const [result] = await conn.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
    [userId, hashToken(token), familyId, expiresAt, userAgent ? String(userAgent).slice(0, 255) : null],
  );
  return { token, id: result.insertId };
}

/** Phiên mới sau đăng nhập/xác minh. `user` cần id và token_version. */
async function createSession(conn, user, userAgent) {
  const { token } = await insertRefreshToken(conn, user.id, crypto.randomUUID(), userAgent);
  return {
    accessToken: signAccessToken(user),
    refreshToken: token,
    expiresIn: getConfig().auth.accessTokenTtlSeconds,
  };
}

async function revokeAllForUser(conn, userId) {
  await conn.query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [
    userId,
  ]);
}

function invalidRefresh() {
  return AppError.unauthenticated('Phiên đăng nhập không hợp lệ hoặc đã hết hạn, vui lòng đăng nhập lại');
}

/**
 * Xoay vòng refresh token: thu hồi token cũ, cấp token mới cùng family.
 * Token đã thu hồi bị dùng lại → thu hồi mọi phiên của người dùng.
 */
async function rotateRefreshToken(token, userAgent) {
  const outcome = await withTransaction(async (conn) => {
    const [[row]] = await conn.query(
      `SELECT rt.id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at, u.token_version
         FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = ? FOR UPDATE`,
      [hashToken(token)],
    );
    if (!row) {
      return { error: invalidRefresh() };
    }
    if (row.revoked_at) {
      // Có thể token đã bị đánh cắp: thu hồi hết, commit rồi mới báo lỗi.
      await revokeAllForUser(conn, row.user_id);
      return { error: invalidRefresh() };
    }
    if (new Date(row.expires_at) <= new Date()) {
      return { error: invalidRefresh() };
    }
    const next = await insertRefreshToken(conn, row.user_id, row.family_id, userAgent);
    await conn.query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(), replaced_by_id = ? WHERE id = ?', [
      next.id,
      row.id,
    ]);
    return {
      session: {
        accessToken: signAccessToken({ id: row.user_id, token_version: row.token_version }),
        refreshToken: next.token,
        expiresIn: getConfig().auth.accessTokenTtlSeconds,
      },
    };
  });
  if (outcome.error) {
    throw outcome.error;
  }
  return outcome.session;
}

async function revokeRefreshToken(conn, token) {
  await conn.query(
    'UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = ? AND revoked_at IS NULL',
    [hashToken(token)],
  );
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  createSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  hashToken,
};
