'use strict';

const pino = require('pino');

/** Che email trong log, ví dụ "nguyen@gmail.com" → "ng***@gmail.com" (requirements §17). */
function maskEmail(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.replace(/([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2');
}

// Không bao giờ ghi các trường này (mật khẩu, token, OTP, cookie).
// Log request chỉ có method/url/status (xem app.js), không ghi body.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.otp',
  '*.otpCode',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
];

function createLogger({ level } = {}) {
  const options = {
    level: level ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
  // Khi chạy trong terminal (dev), ghi qua process.stdout để Node chuyển
  // UTF-8 sang console Windows đúng cách; ghi thẳng file descriptor sẽ làm
  // lỗi font tiếng Việt. Production (PM2, không phải TTY) dùng đích mặc định.
  return process.stdout.isTTY ? pino(options, process.stdout) : pino(options);
}

module.exports = { createLogger, maskEmail, REDACT_PATHS };
