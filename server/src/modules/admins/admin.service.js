'use strict';

const { z } = require('zod');
const { AppError } = require('../../errors');
const { issuesToFields } = require('../../middleware/validate');
const { hashPassword, BCRYPT_MAX_BYTES } = require('../../services/password');

const ADMIN_MIN_PASSWORD_LENGTH = 12;

const adminInputSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9._-]{3,40}$/,
      'Username 3–40 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới, gạch ngang',
    ),
  email: z.string().trim().toLowerCase().max(254, 'Email tối đa 254 ký tự').pipe(z.email('Email không hợp lệ')),
  password: z
    .string()
    .min(ADMIN_MIN_PASSWORD_LENGTH, `Mật khẩu admin phải có ít nhất ${ADMIN_MIN_PASSWORD_LENGTH} ký tự`)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_BYTES, 'Mật khẩu tối đa 72 byte')
    .refine((value) => /\p{L}/u.test(value) && /\d/.test(value), 'Mật khẩu phải có cả chữ cái và chữ số'),
});

/**
 * Tạo tài khoản admin (dùng bởi `npm run admin:create`). Không có trang đăng ký
 * admin trên web (requirements FR-A01).
 */
async function createAdmin(conn, input) {
  const parsed = adminInputSchema.safeParse(input);
  if (!parsed.success) {
    throw AppError.validation(issuesToFields(parsed.error.issues), 'Thông tin admin không hợp lệ');
  }
  const { username, email, password } = parsed.data;

  const [existing] = await conn.query('SELECT username, email FROM admins WHERE username = ? OR email = ?', [
    username,
    email,
  ]);
  if (existing.length > 0) {
    const field = existing.some((row) => row.username === username) ? 'username' : 'email';
    throw AppError.conflict('ADMIN_EXISTS', `Đã có admin với ${field} này`);
  }

  const passwordHash = await hashPassword(password);
  try {
    const [result] = await conn.query('INSERT INTO admins (username, email, password_hash) VALUES (?, ?, ?)', [
      username,
      email,
      passwordHash,
    ]);
    return { id: result.insertId, username, email };
  } catch (error) {
    // Hai lệnh tạo cùng lúc với cùng username/email.
    if (error.code === 'ER_DUP_ENTRY') {
      throw AppError.conflict('ADMIN_EXISTS', 'Đã có admin với username hoặc email này');
    }
    throw error;
  }
}

module.exports = { createAdmin, adminInputSchema, ADMIN_MIN_PASSWORD_LENGTH };
