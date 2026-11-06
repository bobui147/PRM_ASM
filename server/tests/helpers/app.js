'use strict';

const { parseConfig } = require('../../src/config');
const { createLogger } = require('../../src/logger');
const { createApp } = require('../../src/app');

/** Biến môi trường tối thiểu hợp lệ cho test, không đọc file .env. */
function baseEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    PUBLIC_BASE_URL: 'http://localhost:9999',
    DB_NAME: 'homnayangi_test',
    DB_USER: 'homnayangi',
    JWT_SECRET: 'j'.repeat(32),
    OTP_SECRET: 'o'.repeat(32),
    SESSION_SECRET: 's'.repeat(32),
    LOG_LEVEL: 'silent',
    ...overrides,
  };
}

function testConfig(overrides) {
  return parseConfig(baseEnv(overrides));
}

/** App dùng cho supertest. Mặc định DB "khỏe" để test không cần MySQL. */
function buildTestApp({ env, checkDatabase = async () => {} } = {}) {
  const config = testConfig(env);
  const logger = createLogger({ level: 'silent' });
  return createApp({ config, logger, checkDatabase });
}

module.exports = { baseEnv, testConfig, buildTestApp };
