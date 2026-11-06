'use strict';

const path = require('node:path');
const { parseConfig, ConfigError, SERVER_ROOT } = require('../src/config');
const { baseEnv } = require('./helpers/app');

function issuePaths(fn) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error.issues.map((issue) => issue.path.join('.'));
  }
  throw new Error('Mong đợi ConfigError nhưng không có lỗi');
}

describe('parseConfig', () => {
  test('chấp nhận cấu hình tối thiểu và điền giá trị mặc định', () => {
    const config = parseConfig(baseEnv());
    expect(config.env).toBe('test');
    expect(config.isTest).toBe(true);
    expect(config.port).toBe(3000);
    expect(config.host).toBe('127.0.0.1');
    expect(config.db.port).toBe(3306);
    expect(config.auth.accessTokenTtlSeconds).toBe(900);
    expect(config.mail.transport).toBe('console');
    expect(config.uploadDir).toBe(path.join(SERVER_ROOT, 'uploads'));
    expect(Object.isFrozen(config)).toBe(true);
  });

  test('báo đủ mọi secret còn thiếu trong một lần', () => {
    const env = baseEnv();
    delete env.JWT_SECRET;
    delete env.OTP_SECRET;
    delete env.SESSION_SECRET;
    expect(issuePaths(() => parseConfig(env))).toEqual(
      expect.arrayContaining(['JWT_SECRET', 'OTP_SECRET', 'SESSION_SECRET']),
    );
  });

  test('từ chối secret ngắn hơn 32 byte', () => {
    expect(issuePaths(() => parseConfig(baseEnv({ JWT_SECRET: 'x'.repeat(31) })))).toEqual(['JWT_SECRET']);
  });

  test('thông báo lỗi không chứa giá trị secret', () => {
    const shortSecret = 'bi-mat-ngan';
    try {
      parseConfig(baseEnv({ OTP_SECRET: shortSecret }));
    } catch (error) {
      expect(error.message).not.toContain(shortSecret);
      return;
    }
    throw new Error('Mong đợi ConfigError');
  });

  test('bắt buộc thông tin SMTP khi MAIL_TRANSPORT=smtp', () => {
    expect(issuePaths(() => parseConfig(baseEnv({ MAIL_TRANSPORT: 'smtp' })))).toEqual(
      expect.arrayContaining(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']),
    );
  });

  test('production bắt buộc https, smtp và secret khác nhau', () => {
    const same = 'z'.repeat(40);
    const paths = issuePaths(() =>
      parseConfig(
        baseEnv({
          NODE_ENV: 'production',
          PUBLIC_BASE_URL: 'http://homnayangi.site',
          JWT_SECRET: same,
          OTP_SECRET: same,
          SESSION_SECRET: same,
        }),
      ),
    );
    expect(paths).toEqual(expect.arrayContaining(['MAIL_TRANSPORT', 'PUBLIC_BASE_URL', 'JWT_SECRET']));
  });

  test('chấp nhận cấu hình production đầy đủ', () => {
    const config = parseConfig(
      baseEnv({
        NODE_ENV: 'production',
        PUBLIC_BASE_URL: 'https://homnayangi.site/',
        MAIL_TRANSPORT: 'smtp',
        SMTP_HOST: 'smtp.hostinger.com',
        SMTP_USER: 'contact@homnayangi.site',
        SMTP_PASSWORD: 'mat-khau',
        SMTP_SECURE: 'false',
        SMTP_PORT: '587',
        UPLOAD_DIR: '/var/www/homnayangi/uploads',
      }),
    );
    expect(config.isProduction).toBe(true);
    expect(config.publicBaseUrl).toBe('https://homnayangi.site');
    expect(config.mail.secure).toBe(false);
    expect(config.mail.port).toBe(587);
    expect(config.uploadDir).toBe(path.resolve('/var/www/homnayangi/uploads'));
  });

  test('tách CORS_ORIGINS và bỏ khoảng trắng, giá trị rỗng', () => {
    const config = parseConfig(baseEnv({ CORS_ORIGINS: ' https://a.site , ,https://b.site ' }));
    expect(config.corsOrigins).toEqual(['https://a.site', 'https://b.site']);
  });

  test('từ chối PORT và NODE_ENV không hợp lệ', () => {
    expect(issuePaths(() => parseConfig(baseEnv({ PORT: 'abc', NODE_ENV: 'staging' })))).toEqual(
      expect.arrayContaining(['PORT', 'NODE_ENV']),
    );
  });
});
