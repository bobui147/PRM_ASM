'use strict';

const { z } = require('zod');
const { BCRYPT_MAX_BYTES } = require('../../services/password');
const { line } = require('../../utils/http');

// requirements FR-U01..FR-U05.
const email = z
  .string({ error: 'Email là bắt buộc' })
  .trim()
  .toLowerCase()
  .max(254, 'Email tối đa 254 ký tự')
  .pipe(z.email({ error: 'Email không hợp lệ' }));

const newPassword = z
  .string({ error: 'Mật khẩu là bắt buộc' })
  .min(8, 'Mật khẩu phải từ 8 đến 72 ký tự')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_BYTES, 'Mật khẩu phải từ 8 đến 72 ký tự')
  .refine((value) => /\p{L}/u.test(value) && /\d/.test(value), 'Mật khẩu phải có ít nhất một chữ cái và một chữ số');

const currentPassword = z.string({ error: 'Nhập mật khẩu' }).min(1, 'Nhập mật khẩu').max(200, 'Mật khẩu không đúng');
const displayName = line(2, 40, 'Tên hiển thị phải từ 2 đến 40 ký tự');
const code = z
  .string({ error: 'Mã xác minh gồm 6 chữ số' })
  .trim()
  .regex(/^\d{6}$/, 'Mã xác minh gồm 6 chữ số');
const refreshToken = z.string({ error: 'Thiếu refresh token' }).min(20, 'Refresh token không hợp lệ').max(200);

module.exports = {
  registerBody: z.object({ email, password: newPassword, displayName }),
  verifyEmailBody: z.object({ email, code }),
  resendOtpBody: z.object({
    email,
    purpose: z.enum(['verify_email', 'reset_password'], { error: 'Mục đích không hợp lệ' }).default('verify_email'),
  }),
  loginBody: z.object({ email, password: currentPassword }),
  refreshBody: z.object({ refreshToken }),
  forgotPasswordBody: z.object({ email }),
  resetPasswordBody: z.object({ email, code, newPassword }),
  updateMeBody: z.object({ displayName }),
  changePasswordBody: z.object({ currentPassword, newPassword }),
  deleteMeBody: z.object({ password: currentPassword }),
};
