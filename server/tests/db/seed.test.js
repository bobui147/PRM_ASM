'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { getPool } = require('../../src/db');
const { createStorage } = require('../../src/services/storage');
const { createAdmin } = require('../../src/modules/admins/admin.service');
const { verifyPassword } = require('../../src/services/password');
const { importLegacyFoods } = require('../../scripts/lib/legacy-foods');
const { seedDevData } = require('../../scripts/lib/dev-seed');
const { resetTestDatabase, truncateDataTables, closeTestDatabase, testUploadDir } = require('../helpers/db');

// Cắt ảnh 57 món và băm bcrypt tốn vài giây.
jest.setTimeout(60_000);

const uploadDir = testUploadDir('seed');
const storage = createStorage({ uploadDir });

beforeAll(resetTestDatabase);
afterEach(async () => {
  await truncateDataTables();
  fs.rmSync(uploadDir, { recursive: true, force: true, maxRetries: 3 });
});
afterAll(closeTestDatabase);

async function count(sql) {
  const [[row]] = await getPool().query(sql);
  return row.n;
}

describe('seed:legacy-foods (S2.9)', () => {
  test('chạy 2 lần vẫn đúng 57 món, mỗi món có ảnh WebP không EXIF', async () => {
    const first = await importLegacyFoods({ pool: getPool(), storage });
    const second = await importLegacyFoods({ pool: getPool(), storage });
    expect(first).toEqual({ inserted: 57, skipped: 0 });
    expect(second).toEqual({ inserted: 0, skipped: 57 });
    expect(await count('SELECT COUNT(*) AS n FROM foods')).toBe(57);
    expect(await count('SELECT COUNT(*) AS n FROM foods WHERE image_path IS NULL')).toBe(0);
    expect(fs.readdirSync(path.join(uploadDir, 'foods'))).toHaveLength(114);

    const [[food]] = await getPool().query(
      `SELECT f.image_path, f.thumb_path, GROUP_CONCAT(m.meal_period ORDER BY m.meal_period) AS meals
         FROM foods f LEFT JOIN food_meal_periods m ON m.food_id = f.id WHERE f.name = 'Bún chả Hà Nội' GROUP BY f.id`,
    );
    // ORDER BY trên ENUM theo thứ tự khai báo (breakfast, lunch, dinner, late_night).
    expect(food.meals).toBe('lunch,dinner');
    // Đọc buffer thay vì đưa đường dẫn cho sharp để không giữ file mở (Windows).
    const large = await sharp(fs.readFileSync(storage.resolve(food.image_path))).metadata();
    const thumb = await sharp(fs.readFileSync(storage.resolve(food.thumb_path))).metadata();
    expect(large).toMatchObject({ format: 'webp', width: 512, height: 512 });
    expect(large.exif).toBeUndefined();
    expect(thumb).toMatchObject({ format: 'webp', width: 400, height: 400 });
  });

  test('chỉ món chính có bữa ăn', async () => {
    await importLegacyFoods({ pool: getPool(), storage });
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM food_meal_periods m JOIN foods f ON f.id = m.food_id
           JOIN food_categories c ON c.id = f.category_id WHERE c.uses_meal_periods = FALSE`,
      ),
    ).toBe(0);
  });
});

describe('seed:dev (S2.6)', () => {
  test('tạo 20 quán mẫu, review đủ trạng thái, điểm khớp review published', async () => {
    const result = await seedDevData({ pool: getPool(), storage });
    expect(result.created.restaurants).toBe(20);
    expect(result.created.users).toBe(7);
    for (const status of ['published', 'pending', 'rejected', 'hidden']) {
      expect(result.created.reviews[status]).toBeGreaterThan(0);
    }
    expect(await count("SELECT COUNT(*) AS n FROM restaurants WHERE name NOT LIKE '[Mẫu] %'")).toBe(0);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM restaurants r
           LEFT JOIN (SELECT restaurant_id, ROUND(AVG(rating), 1) AS a, COUNT(*) AS c
                        FROM reviews WHERE status = 'published' GROUP BY restaurant_id) s ON s.restaurant_id = r.id
          WHERE NOT (r.rating_avg <=> s.a) OR r.review_count <> COALESCE(s.c, 0)`,
      ),
    ).toBe(0);
  });

  test('chạy lại thì bỏ qua; --reset thì tạo lại cùng số lượng', async () => {
    const first = await seedDevData({ pool: getPool(), storage });
    expect((await seedDevData({ pool: getPool(), storage })).skipped).toBe(true);
    const reset = await seedDevData({ pool: getPool(), storage, reset: true });
    expect(reset.removed).toEqual({ restaurants: 20, users: 7 });
    expect(reset.created).toEqual(first.created);
    expect(await count('SELECT COUNT(*) AS n FROM restaurants')).toBe(20);
  });
});

describe('admin:create (S2.5)', () => {
  const valid = { username: ' Admin01 ', email: 'Admin@HomNayAnGi.site', password: 'matkhauadmin2026' };

  test('chuẩn hóa username/email và băm mật khẩu bằng bcrypt', async () => {
    const admin = await createAdmin(getPool(), valid);
    expect(admin).toMatchObject({ username: 'admin01', email: 'admin@homnayangi.site' });
    const [[row]] = await getPool().query('SELECT password_hash FROM admins WHERE id = ?', [admin.id]);
    expect(row.password_hash).toMatch(/^\$2b\$12\$/);
    expect(await verifyPassword(valid.password, row.password_hash)).toBe(true);
  });

  test('từ chối trùng username hoặc email', async () => {
    await createAdmin(getPool(), valid);
    await expect(createAdmin(getPool(), { ...valid, email: 'khac@homnayangi.site' })).rejects.toMatchObject({
      code: 'ADMIN_EXISTS',
    });
  });

  test('từ chối mật khẩu yếu và email sai', async () => {
    await expect(
      createAdmin(getPool(), { username: 'ab', email: 'khong-phai-email', password: 'ngan' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { username: expect.any(String), email: expect.any(String), password: expect.any(String) },
    });
  });
});
