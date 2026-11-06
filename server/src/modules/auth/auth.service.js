'use strict';

const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { hashPassword, verifyPassword } = require('../../services/password');
const { USER_COLUMNS } = require('../../middleware/auth');
const { toUserDto } = require('../dto');
const { issueOtp, consumeOtp } = require('./otp.service');
const { createSession, rotateRefreshToken, revokeRefreshToken, revokeAllForUser } = require('./token.service');

// requirements FR-U03: sai 10 lần / 15 phút cho một email thì chặn 15 phút.
const MAX_FAILED_LOGINS = 10;
const LOGIN_LOCK_MINUTES = 15;

async function findUserByEmail(conn, email, { forUpdate = false } = {}) {
  const [[user]] = await conn.query(
    `SELECT ${USER_COLUMNS}, password_hash, failed_login_count, login_locked_until FROM users WHERE email = ?${
      forUpdate ? ' FOR UPDATE' : ''
    }`,
    [email],
  );
  return user ?? null;
}

async function findUserById(conn, id) {
  const [[user]] = await conn.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
  return user ?? null;
}

async function sessionFor(conn, userId, userAgent) {
  const user = await findUserById(conn, userId);
  const tokens = await createSession(conn, user, userAgent);
  return { ...tokens, user: toUserDto(user) };
}

/** FR-U01: đăng ký. Email đã có nhưng chưa xác minh thì cập nhật và gửi OTP mới. */
async function register({ email, password, displayName }, { ip }) {
  const pool = getPool();
  const existing = await findUserByEmail(pool, email);
  if (existing?.email_verified_at) {
    throw AppError.conflict('EMAIL_TAKEN', 'Email này đã được đăng ký');
  }
  const passwordHash = await hashPassword(password);
  if (existing) {
    await pool.query('UPDATE users SET password_hash = ?, display_name = ? WHERE id = ?', [
      passwordHash,
      displayName,
      existing.id,
    ]);
  } else {
    try {
      await pool.query('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)', [
        email,
        passwordHash,
        displayName,
      ]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw AppError.conflict('EMAIL_TAKEN', 'Email này đã được đăng ký');
      }
      throw error;
    }
  }
  const otp = await issueOtp(email, 'verify_email', ip);
  return { email, ...otp };
}

/** FR-U02: xác minh email bằng OTP, đăng nhập luôn. */
async function verifyEmail({ email, code }, { userAgent }) {
  const user = await findUserByEmail(getPool(), email);
  if (!user) {
    throw new AppError(400, 'OTP_EXPIRED', 'Mã đã hết hạn hoặc không còn hiệu lực, vui lòng gửi lại mã mới');
  }
  if (user.email_verified_at) {
    throw AppError.conflict('EMAIL_ALREADY_VERIFIED', 'Email đã được xác minh, vui lòng đăng nhập');
  }
  await consumeOtp(email, 'verify_email', code);
  return withTransaction(async (conn) => {
    await conn.query('UPDATE users SET email_verified_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
    return sessionFor(conn, user.id, userAgent);
  });
}

/** Gửi lại OTP. Không tiết lộ email có tồn tại hay không với reset_password. */
async function resendOtp({ email, purpose }, { ip }) {
  const user = await findUserByEmail(getPool(), email);
  if (purpose === 'verify_email') {
    if (!user) {
      throw AppError.notFound('NOT_FOUND', 'Email chưa được đăng ký');
    }
    if (user.email_verified_at) {
      throw AppError.conflict('EMAIL_ALREADY_VERIFIED', 'Email đã được xác minh, vui lòng đăng nhập');
    }
    return issueOtp(email, purpose, ip);
  }
  if (user) {
    return issueOtp(email, purpose, ip);
  }
  return { otpExpiresIn: 600, resendAfter: 60 };
}

let dummyHashPromise;
/** Hash giả (tạo một lần) để so sánh khi email không tồn tại, tránh lộ email qua thời gian phản hồi. */
function dummyHash() {
  dummyHashPromise ??= hashPassword('khong-phai-mat-khau-that-123');
  return dummyHashPromise;
}

function invalidCredentials() {
  return new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
}

/** FR-U03: đăng nhập. */
async function login({ email, password }, { userAgent }) {
  const pool = getPool();
  const user = await findUserByEmail(pool, email);
  if (user?.login_locked_until && new Date(user.login_locked_until) > new Date()) {
    const seconds = (new Date(user.login_locked_until).getTime() - Date.now()) / 1000;
    throw AppError.rateLimited(seconds, 'RATE_LIMITED', 'Bạn nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút');
  }
  const valid = await verifyPassword(password, user?.password_hash ?? (await dummyHash()));
  if (!user || !valid) {
    if (user) {
      await pool.query(
        `UPDATE users SET
           login_locked_until = IF(failed_login_count + 1 >= ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE, login_locked_until),
           failed_login_count = IF(failed_login_count + 1 >= ?, 0, failed_login_count + 1)
         WHERE id = ?`,
        [MAX_FAILED_LOGINS, LOGIN_LOCK_MINUTES, MAX_FAILED_LOGINS, user.id],
      );
    }
    throw invalidCredentials();
  }
  if (user.failed_login_count > 0 || user.login_locked_until) {
    await pool.query('UPDATE users SET failed_login_count = 0, login_locked_until = NULL WHERE id = ?', [user.id]);
  }
  if (!user.email_verified_at) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Email chưa được xác minh', { details: { email } });
  }
  return withTransaction((conn) => sessionFor(conn, user.id, userAgent));
}

function refresh({ refreshToken }, { userAgent }) {
  return rotateRefreshToken(refreshToken, userAgent);
}

async function logout({ refreshToken }) {
  await revokeRefreshToken(getPool(), refreshToken);
}

/** FR-U04 bước 1: luôn thành công, chỉ gửi OTP nếu tài khoản tồn tại. */
async function forgotPassword({ email }, { ip }) {
  const user = await findUserByEmail(getPool(), email);
  if (!user) {
    return;
  }
  try {
    await issueOtp(email, 'reset_password', ip);
  } catch (error) {
    // Không lộ cooldown cho email người khác; chỉ báo lỗi mail thật.
    if (error.code !== 'OTP_COOLDOWN') {
      throw error;
    }
  }
}

/** FR-U04 bước 2: đặt lại mật khẩu, thu hồi mọi phiên cũ, đánh dấu email đã xác minh. */
async function resetPassword({ email, code, newPassword }, { userAgent }) {
  const user = await findUserByEmail(getPool(), email);
  if (!user) {
    throw new AppError(400, 'OTP_EXPIRED', 'Mã đã hết hạn hoặc không còn hiệu lực, vui lòng gửi lại mã mới');
  }
  await consumeOtp(email, 'reset_password', code);
  const passwordHash = await hashPassword(newPassword);
  return withTransaction(async (conn) => {
    await conn.query(
      `UPDATE users SET password_hash = ?, token_version = token_version + 1,
              email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()),
              failed_login_count = 0, login_locked_until = NULL
        WHERE id = ?`,
      [passwordHash, user.id],
    );
    await revokeAllForUser(conn, user.id);
    return sessionFor(conn, user.id, userAgent);
  });
}

module.exports = {
  register,
  verifyEmail,
  resendOtp,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  findUserById,
  sessionFor,
};
