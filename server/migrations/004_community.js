'use strict';

// 004: Cộng đồng ẩm thực — bài đăng, ảnh, lượt thích, bình luận, theo dõi, báo cáo.
// requirements-mo-rong.md FR-C01..FR-C05. Chạy bằng `npm run migrate`
// (hoặc `node migrations/004_community.js`). Không sửa file này sau khi đã chạy;
// cần đổi schema thì tạo migration mới.
//
// Lưu ý MySQL: cột có FOREIGN KEY ... ON DELETE CASCADE/SET NULL không được dùng
// trong CHECK, nên các quy tắc như "không tự theo dõi" được kiểm tra trong code.

const TABLE_OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

const STATEMENTS = [
  `CREATE TABLE posts (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    -- NULL khi bài chỉ có ảnh. Tối đa 2.000 ký tự (FR-C01).
    content VARCHAR(2000) NULL,
    -- Món/quán được gắn; NULL khi không gắn hoặc đã bị xóa. Tên lưu lại để
    -- bài vẫn hiển thị nhãn khi món/quán bị ẩn hoặc xóa (không dẫn link).
    food_id INT UNSIGNED NULL,
    food_name VARCHAR(80) NULL,
    restaurant_id INT UNSIGNED NULL,
    restaurant_name VARCHAR(120) NULL,
    status ENUM('visible', 'hidden') NOT NULL DEFAULT 'visible',
    moderation_note VARCHAR(300) NULL,
    moderated_by INT UNSIGNED NULL,
    moderated_at DATETIME NULL,
    edited_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_posts_status_created (status, created_at, id),
    KEY idx_posts_user_created (user_id, created_at),
    KEY idx_posts_food (food_id),
    KEY idx_posts_restaurant (restaurant_id),
    CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_posts_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE SET NULL,
    CONSTRAINT fk_posts_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE SET NULL,
    CONSTRAINT fk_posts_admin FOREIGN KEY (moderated_by) REFERENCES admins (id) ON DELETE SET NULL
  ) ${TABLE_OPTIONS}`,

  // File trên đĩa (uploads/posts/{id}) được xóa bằng code; CASCADE chỉ xóa bản ghi.
  `CREATE TABLE post_images (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    post_id INT UNSIGNED NOT NULL,
    image_path VARCHAR(255) NOT NULL,
    thumb_path VARCHAR(255) NOT NULL,
    width SMALLINT UNSIGNED NOT NULL,
    height SMALLINT UNSIGNED NOT NULL,
    sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_post_images_post (post_id, sort_order),
    CONSTRAINT fk_post_images_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
    CONSTRAINT chk_post_images_order CHECK (sort_order < 3)
  ) ${TABLE_OPTIONS}`,

  // Mỗi tài khoản tối đa một lượt thích trên một bài (FR-C03).
  `CREATE TABLE post_likes (
    post_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    KEY idx_post_likes_user (user_id),
    CONSTRAINT fk_post_likes_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
    CONSTRAINT fk_post_likes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE post_comments (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    post_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    content VARCHAR(500) NOT NULL,
    status ENUM('visible', 'hidden') NOT NULL DEFAULT 'visible',
    moderated_by INT UNSIGNED NULL,
    moderated_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_post_comments_post (post_id, status, created_at, id),
    KEY idx_post_comments_user (user_id, created_at),
    KEY idx_post_comments_status_created (status, created_at),
    CONSTRAINT fk_post_comments_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
    CONSTRAINT fk_post_comments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_post_comments_admin FOREIGN KEY (moderated_by) REFERENCES admins (id) ON DELETE SET NULL
  ) ${TABLE_OPTIONS}`,

  // Mỗi cặp chỉ một quan hệ theo dõi (FR-C03).
  `CREATE TABLE user_follows (
    follower_id INT UNSIGNED NOT NULL,
    followee_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, followee_id),
    KEY idx_user_follows_followee (followee_id, created_at),
    CONSTRAINT fk_user_follows_follower FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_follows_followee FOREIGN KEY (followee_id) REFERENCES users (id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  // Báo cáo bài hoặc bình luận (FR-C04). target_id không có FK vì trỏ tới hai bảng;
  // code xóa báo cáo khi nội dung bị xóa. open_key = 1 khi đang mở, NULL khi đã xử lý,
  // để UNIQUE chặn báo cáo trùng đang mở nhưng vẫn cho báo cáo lại sau khi xử lý.
  `CREATE TABLE content_reports (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    target_type ENUM('post', 'comment') NOT NULL,
    target_id INT UNSIGNED NOT NULL,
    reporter_id INT UNSIGNED NOT NULL,
    reason ENUM('offensive', 'spam', 'misleading', 'inappropriate_image', 'other') NOT NULL,
    details VARCHAR(300) NULL,
    status ENUM('open', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
    open_key TINYINT AS (IF(status = 'open', 1, NULL)) STORED,
    handled_by INT UNSIGNED NULL,
    handled_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_content_reports_open (target_type, target_id, reporter_id, open_key),
    KEY idx_content_reports_status_created (status, created_at),
    KEY idx_content_reports_target (target_type, target_id, status),
    KEY idx_content_reports_reporter (reporter_id, created_at),
    CONSTRAINT fk_content_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_content_reports_admin FOREIGN KEY (handled_by) REFERENCES admins (id) ON DELETE SET NULL
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
