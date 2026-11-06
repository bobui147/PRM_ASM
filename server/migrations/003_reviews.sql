-- 003: Review, ảnh review, báo cáo, nhật ký thao tác admin.
-- requirements.md §12.4, FR-R01..FR-R08, FR-A09.

CREATE TABLE reviews (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  restaurant_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  -- Món đã ăn; NULL nếu không chọn hoặc món đã bị xóa.
  food_id INT UNSIGNED NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(500) NOT NULL,
  amount_spent INT UNSIGNED NULL,
  visit_date DATE NOT NULL,
  status ENUM('pending', 'published', 'rejected', 'hidden') NOT NULL DEFAULT 'pending',
  reject_reason ENUM('spam', 'offensive', 'irrelevant', 'inappropriate_image', 'other') NULL,
  -- Ghi chú của admin khi từ chối/ẩn; tác giả thấy được.
  moderation_note VARCHAR(300) NULL,
  moderated_by INT UNSIGNED NULL,
  moderated_at DATETIME NULL,
  -- Lần duyệt đầu tiên; giữ nguyên khi sửa và duyệt lại.
  published_at DATETIME NULL,
  edited_after_publish BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Mỗi người một review cho mỗi quán (FR-R02).
  UNIQUE KEY uq_reviews_restaurant_user (restaurant_id, user_id),
  KEY idx_reviews_restaurant_newest (restaurant_id, status, created_at),
  KEY idx_reviews_restaurant_rating (restaurant_id, status, rating),
  KEY idx_reviews_status_created (status, created_at),
  KEY idx_reviews_user_created (user_id, created_at),
  KEY idx_reviews_food (food_id),
  KEY idx_reviews_moderated_by (moderated_by),
  CONSTRAINT fk_reviews_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE SET NULL,
  CONSTRAINT fk_reviews_admin FOREIGN KEY (moderated_by) REFERENCES admins (id) ON DELETE SET NULL,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_reviews_amount CHECK (amount_spent IS NULL OR amount_spent BETWEEN 1000 AND 10000000),
  CONSTRAINT chk_reviews_reject_reason CHECK (status = 'rejected' OR reject_reason IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- File trên đĩa được xóa bằng code trước khi xóa bản ghi (CASCADE không xóa file).
CREATE TABLE review_images (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  review_id INT UNSIGNED NOT NULL,
  image_path VARCHAR(255) NOT NULL,
  thumb_path VARCHAR(255) NOT NULL,
  width SMALLINT UNSIGNED NOT NULL,
  height SMALLINT UNSIGNED NOT NULL,
  sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_review_images_review (review_id, sort_order),
  CONSTRAINT fk_review_images_review FOREIGN KEY (review_id) REFERENCES reviews (id) ON DELETE CASCADE,
  CONSTRAINT chk_review_images_order CHECK (sort_order < 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE review_reports (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  review_id INT UNSIGNED NOT NULL,
  reporter_id INT UNSIGNED NOT NULL,
  reason ENUM('offensive', 'spam', 'misleading', 'inappropriate_image', 'other') NOT NULL,
  details VARCHAR(300) NULL,
  status ENUM('open', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  handled_by INT UNSIGNED NULL,
  handled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Mỗi người một báo cáo cho mỗi review (FR-R07).
  UNIQUE KEY uq_review_reports_review_reporter (review_id, reporter_id),
  KEY idx_review_reports_status_created (status, created_at),
  KEY idx_review_reports_reporter (reporter_id, created_at),
  KEY idx_review_reports_handled_by (handled_by),
  CONSTRAINT fk_review_reports_review FOREIGN KEY (review_id) REFERENCES reviews (id) ON DELETE CASCADE,
  CONSTRAINT fk_review_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_review_reports_admin FOREIGN KEY (handled_by) REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_audit_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id INT UNSIGNED NULL,
  -- Ví dụ: food.create, review.approve, user.block.
  action VARCHAR(40) CHARACTER SET ascii NOT NULL,
  target_type VARCHAR(30) CHARACTER SET ascii NOT NULL,
  target_id INT UNSIGNED NULL,
  summary VARCHAR(500) NOT NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_audit_logs_created (created_at),
  KEY idx_admin_audit_logs_admin (admin_id, created_at),
  KEY idx_admin_audit_logs_action (action, created_at),
  CONSTRAINT fk_admin_audit_logs_admin FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
