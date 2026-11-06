'use strict';

const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

const SERVER_ROOT = path.resolve(__dirname, '..');
const MIN_SECRET_BYTES = 32;

// Thông báo lỗi mặc định của zod bằng tiếng Việt (dùng chung toàn server).
z.config(z.locales.vi());

const secret = (name) =>
  z.string({ error: `${name} là bắt buộc` }).refine((value) => Buffer.byteLength(value, 'utf8') >= MIN_SECRET_BYTES, {
    message: `${name} phải dài ít nhất ${MIN_SECRET_BYTES} byte`,
  });

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, '')),

    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(''),
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),

    JWT_SECRET: secret('JWT_SECRET'),
    OTP_SECRET: secret('OTP_SECRET'),
    SESSION_SECRET: secret('SESSION_SECRET'),
    ACCESS_TOKEN_TTL: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    MAIL_TRANSPORT: z.enum(['smtp', 'console']).default('console'),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    SMTP_SECURE: z.stringbool().default(true),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    MAIL_FROM: z.string().default('"Hôm nay ăn gì" <contact@homnayangi.site>'),

    UPLOAD_DIR: z.string().default('uploads'),
    CORS_ORIGINS: z.string().default(''),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_TRANSPORT === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} là bắt buộc khi MAIL_TRANSPORT=smtp` });
        }
      }
    }
    if (env.NODE_ENV === 'production') {
      if (env.MAIL_TRANSPORT !== 'smtp') {
        ctx.addIssue({ code: 'custom', path: ['MAIL_TRANSPORT'], message: 'Production phải dùng MAIL_TRANSPORT=smtp' });
      }
      if (!env.PUBLIC_BASE_URL.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['PUBLIC_BASE_URL'], message: 'Production phải dùng https://' });
      }
      const secrets = [env.JWT_SECRET, env.OTP_SECRET, env.SESSION_SECRET];
      if (new Set(secrets).size !== secrets.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET, OTP_SECRET, SESSION_SECRET phải khác nhau',
        });
      }
    }
  });

class ConfigError extends Error {
  constructor(issues) {
    const lines = issues.map((issue) => `  - ${issue.path.join('.') || '(env)'}: ${issue.message}`);
    super(`Cấu hình môi trường không hợp lệ:\n${lines.join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Kiểm tra biến môi trường và trả về cấu hình đã chuẩn hóa (không đọc file).
 * Ném ConfigError liệt kê mọi biến sai để sửa một lần.
 */
function parseConfig(env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues);
  }
  const e = result.data;
  return Object.freeze({
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    isDevelopment: e.NODE_ENV === 'development',
    isTest: e.NODE_ENV === 'test',
    host: e.HOST,
    port: e.PORT,
    publicBaseUrl: e.PUBLIC_BASE_URL,
    db: Object.freeze({
      host: e.DB_HOST,
      port: e.DB_PORT,
      database: e.DB_NAME,
      user: e.DB_USER,
      password: e.DB_PASSWORD,
      connectionLimit: e.DB_CONNECTION_LIMIT,
    }),
    auth: Object.freeze({
      jwtSecret: e.JWT_SECRET,
      otpSecret: e.OTP_SECRET,
      sessionSecret: e.SESSION_SECRET,
      accessTokenTtlSeconds: e.ACCESS_TOKEN_TTL,
      refreshTokenTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
    }),
    mail: Object.freeze({
      transport: e.MAIL_TRANSPORT,
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      user: e.SMTP_USER,
      password: e.SMTP_PASSWORD,
      from: e.MAIL_FROM,
    }),
    uploadDir: path.resolve(SERVER_ROOT, e.UPLOAD_DIR),
    corsOrigins: Object.freeze(
      e.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
    logLevel: e.LOG_LEVEL,
  });
}

/**
 * Đọc file .env (hoặc .env.test khi NODE_ENV=test) rồi kiểm tra.
 * Biến đã có sẵn trong môi trường (PM2, shell) được ưu tiên hơn file.
 */
function loadConfig() {
  const fileName = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
  dotenv.config({ path: path.join(SERVER_ROOT, fileName), quiet: true });
  return parseConfig(process.env);
}

let cached;

/** Cấu hình dùng chung cho toàn app, chỉ đọc một lần. */
function getConfig() {
  cached ??= loadConfig();
  return cached;
}

module.exports = { getConfig, parseConfig, ConfigError, SERVER_ROOT };
