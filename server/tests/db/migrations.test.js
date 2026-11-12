'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getPool } = require('../../src/db');
const { runMigrations, listMigrationFiles, MIGRATIONS_DIR } = require('../../src/migrator');
const { getTestConfig, resetTestDatabase, truncateDataTables, closeTestDatabase } = require('../helpers/db');

const EXPECTED_TABLES = [
  'meal_wishlist',
  'meal_plan_entries',
  'group_votes',
  'group_choices',
  'group_candidates',
  'group_members',
  'group_rooms',
  'admin_audit_logs',
  'admins',
  'app_settings',
  'community_follows',
  'community_actions',
  'community_comments',
  'community_images',
  'community_likes',
  'community_posts',
  'community_reports',
  'email_otps',
  'food_categories',
  'food_meal_periods',
  'foods',
  'refresh_tokens',
  'restaurant_foods',
  'restaurants',
  'review_images',
  'review_reports',
  'reviews',
  'schema_migrations',
  'sessions',
  'user_blocks',
  'users',
];

beforeAll(resetTestDatabase);
afterEach(truncateDataTables);
afterAll(closeTestDatabase);

describe('migration (S2.10)', () => {
  test('DB trống sau khi migrate có đủ bảng, charset utf8mb4', async () => {
    const [rows] = await getPool().query(
      'SELECT table_name AS name, table_collation AS co FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY name',
    );
    expect(rows.map((row) => row.name)).toEqual([...EXPECTED_TABLES].sort());
    expect(new Set(rows.map((row) => row.co))).toEqual(new Set(['utf8mb4_unicode_ci']));
  });

  test('chạy lại không lỗi và không chạy file nào', async () => {
    expect(await runMigrations({ db: getTestConfig().db })).toEqual([]);
  });

  test('có 4 nhóm món mặc định và catalog_version', async () => {
    const [categories] = await getPool().query(
      'SELECT slug, uses_meal_periods FROM food_categories ORDER BY sort_order',
    );
    expect(categories).toEqual([
      { slug: 'mon-chinh', uses_meal_periods: 1 },
      { slug: 'do-uong', uses_meal_periods: 0 },
      { slug: 'an-vat', uses_meal_periods: 0 },
      { slug: 'do-nhau', uses_meal_periods: 0 },
    ]);
    const [[setting]] = await getPool().query("SELECT value FROM app_settings WHERE `key` = 'catalog_version'");
    expect(setting.value).toBe('1');
  });

  test('từ chối chạy khi file migration đã chạy bị sửa', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'migrations-'));
    try {
      for (const file of await listMigrationFiles()) {
        await fs.copyFile(path.join(MIGRATIONS_DIR, file.name), path.join(dir, file.name));
      }
      await fs.appendFile(path.join(dir, '001_init.sql'), '\n-- sửa sau khi đã chạy\n');
      await expect(runMigrations({ db: getTestConfig().db, dir })).rejects.toThrow(/đã bị sửa/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('ràng buộc schema', () => {
  async function insertBase() {
    const pool = getPool();
    const [user] = await pool.query(
      "INSERT INTO users (email, password_hash, display_name) VALUES ('a@x.vn', 'h', 'A')",
    );
    const [restaurant] = await pool.query(
      "INSERT INTO restaurants (name, area, address, price_min, price_max) VALUES ('Q', 'fpt', 'Đ/c', 20000, 50000)",
    );
    return { userId: user.insertId, restaurantId: restaurant.insertId };
  }

  const insertReview = (restaurantId, userId, rating = 5) =>
    getPool().query(
      "INSERT INTO reviews (restaurant_id, user_id, rating, comment, visit_date) VALUES (?, ?, ?, 'Ngon lắm nhé', '2026-11-01')",
      [restaurantId, userId, rating],
    );

  test('mỗi người một review cho mỗi quán', async () => {
    const { userId, restaurantId } = await insertBase();
    await insertReview(restaurantId, userId);
    await expect(insertReview(restaurantId, userId)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  test('số sao phải từ 1 đến 5', async () => {
    const { userId, restaurantId } = await insertBase();
    await expect(insertReview(restaurantId, userId, 6)).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });

  test('giá tối thiểu không lớn hơn giá tối đa', async () => {
    await expect(
      getPool().query(
        "INSERT INTO restaurants (name, area, address, price_min, price_max) VALUES ('Q', 'fpt', 'Đ/c', 90000, 50000)",
      ),
    ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });

  test('không xóa được nhóm món còn món', async () => {
    await getPool().query(
      "INSERT INTO foods (category_id, name, reference_price, rarity) VALUES (1, 'Phở bò', 50000, 'rare')",
    );
    await expect(getPool().query('DELETE FROM food_categories WHERE id = 1')).rejects.toMatchObject({
      code: 'ER_ROW_IS_REFERENCED_2',
    });
  });

  test('xóa người dùng thì xóa luôn review của người đó', async () => {
    const { userId, restaurantId } = await insertBase();
    await insertReview(restaurantId, userId);
    await getPool().query('DELETE FROM users WHERE id = ?', [userId]);
    const [[row]] = await getPool().query('SELECT COUNT(*) AS n FROM reviews');
    expect(row.n).toBe(0);
  });
});
