'use strict';

const crypto = require('node:crypto');
const { getConfig } = require('../../config');
const { getPool } = require('../../db');
const { AppError } = require('../../errors');
const { sendOtpEmail } = require('../../services/mailer');

// requirements FR-U02.
const OTP_TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_PER_HOUR_EMAIL = 5;
const MAX_PER_HOUR_IP = 20;
const HOUR_MS = 60 * 60 * 1000;

function hashCode(code) {
  return crypto.createHmac('sha256', getConfig().auth.otpSecret).update(code).digest('hex');
}

function cooldown(seconds) {
  return AppError.rateLimited(seconds, 'OTP_COOLDOWN', 'Bạn yêu cầu mã quá nhiều lần, vui lòng thử lại sau');
}

/** Ném OTP_COOLDOWN nếu email/IP đã yêu cầu mã quá nhiều. */
async function assertCanSendOtp(email, purpose, ip) {
  const pool = getPool();
  const now = Date.now();
  const since = new Date(now - HOUR_MS);

  const [[last]] = await pool.query(
    'SELECT created_at FROM email_otps WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1',
    [email, purpose],
  );
  if (last) {
    const elapsed = (now - new Date(last.created_at).getTime()) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      throw cooldown(RESEND_COOLDOWN_SECONDS - elapsed);
    }
  }

  const [[byEmail]] = await pool.query(
    'SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM email_otps WHERE email = ? AND created_at > ?',
    [email, since],
  );
  if (byEmail.n >= MAX_PER_HOUR_EMAIL) {
    throw cooldown((new Date(byEmail.oldest).getTime() + HOUR_MS - now) / 1000);
  }

  if (ip) {
    const [[byIp]] = await pool.query(
      'SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM email_otps WHERE request_ip = ? AND created_at > ?',
      [ip, since],
    );
    if (byIp.n >= MAX_PER_HOUR_IP) {
      throw cooldown((new Date(byIp.oldest).getTime() + HOUR_MS - now) / 1000);
    }
  }
}

/**
 * Tạo và gửi OTP. Gửi email lỗi thì xóa OTP vừa tạo và trả 503, OTP cũ vẫn dùng được.
 * Gửi thành công thì mọi OTP cũ cùng mục đích mất hiệu lực.
 */
async function issueOtp(email, purpose, ip) {
  await assertCanSendOtp(email, purpose, ip);
  const pool = getPool();
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
  const [result] = await pool.query(
    'INSERT INTO email_otps (email, purpose, code_hash, expires_at, request_ip) VALUES (?, ?, ?, ?, ?)',
    [email, purpose, hashCode(code), expiresAt, ip ?? null],
  );
  try {
    await sendOtpEmail(email, code, purpose, OTP_TTL_SECONDS / 60);
  } catch (error) {
    await pool.query('DELETE FROM email_otps WHERE id = ?', [result.insertId]);
    throw new AppError(503, 'MAIL_UNAVAILABLE', 'Chưa gửi được email, vui lòng thử lại sau ít phút', { cause: error });
  }
  await pool.query(
    'UPDATE email_otps SET consumed_at = UTC_TIMESTAMP() WHERE email = ? AND purpose = ? AND id < ? AND consumed_at IS NULL',
    [email, purpose, result.insertId],
  );
  return { otpExpiresIn: OTP_TTL_SECONDS, resendAfter: RESEND_COOLDOWN_SECONDS };
}

/**
 * Kiểm tra OTP và đánh dấu đã dùng. Mỗi lần sai được ghi ngay (không nằm
 * trong transaction của nơi gọi) để không bị rollback mất số lần sai.
 */
async function consumeOtp(email, purpose, code) {
  const pool = getPool();
  const [[otp]] = await pool.query(
    `SELECT id, code_hash, attempts, expires_at FROM email_otps
      WHERE email = ? AND purpose = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`,
    [email, purpose],
  );
  if (!otp || otp.attempts >= MAX_ATTEMPTS || new Date(otp.expires_at) <= new Date()) {
    throw new AppError(400, 'OTP_EXPIRED', 'Mã đã hết hạn hoặc không còn hiệu lực, vui lòng gửi lại mã mới');
  }

  const expected = Buffer.from(otp.code_hash, 'hex');
  const actual = Buffer.from(hashCode(String(code)), 'hex');
  if (!crypto.timingSafeEqual(expected, actual)) {
    const attempts = otp.attempts + 1;
    await pool.query(
      'UPDATE email_otps SET attempts = ?, consumed_at = IF(? >= ?, UTC_TIMESTAMP(), consumed_at) WHERE id = ?',
      [attempts, attempts, MAX_ATTEMPTS, otp.id],
    );
    throw new AppError(400, 'OTP_INVALID', 'Mã xác minh không đúng', {
      details: { attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts) },
    });
  }

  const [used] = await pool.query(
    'UPDATE email_otps SET consumed_at = UTC_TIMESTAMP() WHERE id = ? AND consumed_at IS NULL',
    [otp.id],
  );
  if (used.affectedRows !== 1) {
    throw new AppError(400, 'OTP_EXPIRED', 'Mã đã được sử dụng, vui lòng gửi lại mã mới');
  }
}

module.exports = { issueOtp, consumeOtp, assertCanSendOtp, OTP_TTL_SECONDS, RESEND_COOLDOWN_SECONDS };
