'use strict';

// 006: Lập thực đơn — kế hoạch theo ngày/bữa, đánh dấu đã ăn, danh sách muốn thử.
// requirements-mo-rong.md FR-PM01, FR-PM02. Chạy bằng `npm run migrate`
// (hoặc `node migrations/006_meal_plans.js`). Không sửa file sau khi đã chạy.

const TABLE_OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

const STATEMENTS = [
  // food_name lưu lại để mục vẫn hiển thị tên khi món bị ẩn/xóa khỏi danh mục (FR-PM01).
  // eaten_at != NULL = đã ăn; lịch sử đã ăn đọc từ đây (FR-PM02).
  `CREATE TABLE meal_plan_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    food_id INT UNSIGNED NULL,
    food_name VARCHAR(80) NOT NULL,
    plan_date DATE NOT NULL,
    meal ENUM('breakfast', 'lunch', 'dinner', 'other') NOT NULL,
    note VARCHAR(200) NULL,
    eaten_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_meal_plan_items_user_date (user_id, plan_date, meal),
    KEY idx_meal_plan_items_user_eaten (user_id, eaten_at),
    KEY idx_meal_plan_items_food (food_id),
    CONSTRAINT fk_meal_plan_items_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_meal_plan_items_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE SET NULL
  ) ${TABLE_OPTIONS}`,

  // Mỗi món chỉ xuất hiện một lần trong danh sách muốn thử của một người.
  `CREATE TABLE want_to_try (
    user_id INT UNSIGNED NOT NULL,
    food_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, food_id),
    KEY idx_want_to_try_user_created (user_id, created_at),
    CONSTRAINT fk_want_to_try_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_want_to_try_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,
];

/** @param {import('mysql2/promise').Connection} conn */
async function up(conn) {
  for (const sql of STATEMENTS) {
    await conn.query(sql);
  }
}

module.exports = { up };

if (require.main === module) {
  require('../scripts/migrate');
}
