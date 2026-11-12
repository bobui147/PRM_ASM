'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { getConfig } = require('../../src/config');
const { getPool, closePool } = require('../../src/db');
const { runMigrations } = require('../../src/migrator');

// Bảng dữ liệu sinh ra khi chạy app/test. Không xóa schema_migrations và dữ liệu
// khởi tạo của migration (food_categories, app_settings) để giữ đúng trạng thái
// sau khi migrate.
const DATA_TABLES = [
  'meal_wishlist',
  'meal_plan_entries',
  'group_votes',
  'group_choices',
  'group_candidates',
  'group_members',
  'group_rooms',
  'community_reports',
  'community_actions',
  'community_likes',
  'community_images',
  'community_comments',
  'community_posts',
  'community_follows',
  'admin_audit_logs',
  'review_reports',
  'review_images',
  'reviews',
  'restaurant_foods',
  'restaurants',
  'food_meal_periods',
  'foods',
  'refresh_tokens',
  'email_otps',
  'user_blocks',
  'users',
  'sessions',
  'admins',
];

/** Cấu hình test đọc từ server/.env.test. Dừng ngay nếu DB không phải DB test. */
function getTestConfig() {
  const config = getConfig();
  if (!config.isTest || !/_test$/.test(config.db.database)) {
    throw new Error(
      `Test DB phải chạy với NODE_ENV=test và DB_NAME kết thúc bằng "_test" (hiện tại: ${config.env}, ${config.db.database}). ` +
        'Không chạy test trên DB dev hoặc production.',
    );
  }
  return config;
}

/** Xóa sạch DB test rồi chạy lại toàn bộ migration. Gọi trong beforeAll. */
async function resetTestDatabase() {
  const config = getTestConfig();
  const pool = getPool();
  const [tables] = await pool.query(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of tables) {
      await conn.query('DROP TABLE IF EXISTS ??', [name]);
    }
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();
  }
  await runMigrations({ db: config.db });
  await fs.rm(config.uploadDir, { recursive: true, force: true });
}

/** Xóa dữ liệu giữa các test, giữ schema và dữ liệu khởi tạo của migration. */
async function truncateDataTables() {
  getTestConfig();
  const conn = await getPool().getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of DATA_TABLES) {
      await conn.query('TRUNCATE TABLE ??', [table]);
    }
    await conn.query("UPDATE app_settings SET value = '1' WHERE `key` = 'catalog_version'");
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();
  }
}

async function closeTestDatabase() {
  await closePool();
}

/** Thư mục upload riêng cho từng file test để test chạy song song không đụng nhau. */
function testUploadDir(name) {
  return path.join(getTestConfig().uploadDir, name);
}

module.exports = {
  getTestConfig,
  resetTestDatabase,
  truncateDataTables,
  closeTestDatabase,
  testUploadDir,
  DATA_TABLES,
};
