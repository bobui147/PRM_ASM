'use strict';

// 005: Chọn món theo nhóm — phòng, thành viên, đánh dấu chọn/loại, ứng viên, phiếu.
// requirements-mo-rong.md FR-G01, FR-G02. Chạy bằng `npm run migrate`
// (hoặc `node migrations/005_group_rooms.js`). Không sửa file sau khi đã chạy.

const TABLE_OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

const STATEMENTS = [
  // phase: selecting (chọn/loại món) → voting (bỏ phiếu) → finished (đã có kết quả);
  // closed = kết thúc không cần kết quả (chủ kết thúc/rời, hết hạn, admin đóng).
  // version tăng sau mỗi thay đổi để app polling chỉ tải lại khi cần.
  `CREATE TABLE group_rooms (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code CHAR(8) CHARACTER SET ascii NOT NULL,
    owner_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NULL,
    meal_period ENUM('breakfast', 'lunch', 'dinner', 'late_night') NULL,
    max_price INT UNSIGNED NULL,
    phase ENUM('selecting', 'voting', 'finished', 'closed') NOT NULL DEFAULT 'selecting',
    decision_mode ENUM('vote', 'spin') NULL,
    result_food_id INT UNSIGNED NULL,
    result_food_name VARCHAR(80) NULL,
    result_method ENUM('vote', 'spin', 'tie_spin') NULL,
    result_votes SMALLINT UNSIGNED NULL,
    closed_reason ENUM('owner_closed', 'owner_left', 'expired', 'admin') NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    expires_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_group_rooms_code (code),
    KEY idx_group_rooms_phase (phase, expires_at),
    KEY idx_group_rooms_owner (owner_id),
    CONSTRAINT fk_group_rooms_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_group_rooms_category FOREIGN KEY (category_id) REFERENCES food_categories (id) ON DELETE SET NULL,
    CONSTRAINT fk_group_rooms_result FOREIGN KEY (result_food_id) REFERENCES foods (id) ON DELETE SET NULL,
    CONSTRAINT chk_group_rooms_price CHECK (max_price IS NULL OR max_price BETWEEN 1000 AND 10000000)
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE group_room_members (
    room_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id),
    KEY idx_group_room_members_user (user_id),
    CONSTRAINT fk_group_room_members_room FOREIGN KEY (room_id) REFERENCES group_rooms (id) ON DELETE CASCADE,
    CONSTRAINT fk_group_room_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  // Mỗi thành viên một đánh dấu cho mỗi món: pick (muốn ăn) hoặc exclude (loại).
  `CREATE TABLE group_room_marks (
    room_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    food_id INT UNSIGNED NOT NULL,
    mark ENUM('pick', 'exclude') NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id, food_id),
    KEY idx_group_room_marks_food (room_id, food_id),
    CONSTRAINT fk_group_room_marks_room FOREIGN KEY (room_id) REFERENCES group_rooms (id) ON DELETE CASCADE,
    CONSTRAINT fk_group_room_marks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_group_room_marks_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  // Danh sách ứng viên chốt lúc bắt đầu bỏ phiếu (tính trên server, giống nhau cho mọi người).
  `CREATE TABLE group_room_candidates (
    room_id INT UNSIGNED NOT NULL,
    food_id INT UNSIGNED NOT NULL,
    food_name VARCHAR(80) NOT NULL,
    reference_price INT UNSIGNED NOT NULL,
    PRIMARY KEY (room_id, food_id),
    CONSTRAINT fk_group_room_candidates_room FOREIGN KEY (room_id) REFERENCES group_rooms (id) ON DELETE CASCADE,
    CONSTRAINT fk_group_room_candidates_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  // Mỗi thành viên một phiếu, đổi được trước khi chủ phòng chốt.
  `CREATE TABLE group_room_votes (
    room_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    food_id INT UNSIGNED NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id),
    KEY idx_group_room_votes_food (room_id, food_id),
    CONSTRAINT fk_group_room_votes_room FOREIGN KEY (room_id) REFERENCES group_rooms (id) ON DELETE CASCADE,
    CONSTRAINT fk_group_room_votes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_group_room_votes_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE CASCADE
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
