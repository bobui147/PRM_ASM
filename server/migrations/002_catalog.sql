-- 002: Nhóm món, món, quán, thực đơn quán, cài đặt chung.
-- requirements.md §12.3, FR-A03.

CREATE TABLE food_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(40) CHARACTER SET ascii NOT NULL,
  name VARCHAR(40) NOT NULL,
  icon VARCHAR(40) CHARACTER SET ascii NOT NULL DEFAULT 'restaurant',
  uses_meal_periods BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  status ENUM('active', 'hidden') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_food_categories_slug (slug),
  CONSTRAINT chk_food_categories_icon CHECK (
    icon IN ('restaurant', 'local_cafe', 'fastfood', 'sports_bar', 'icecream', 'ramen_dining', 'bakery_dining', 'local_bar')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE foods (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  reference_price INT UNSIGNED NOT NULL,
  rarity ENUM('common', 'rare', 'epic', 'legendary', 'ancient') NOT NULL,
  image_path VARCHAR(255) NULL,
  thumb_path VARCHAR(255) NULL,
  description VARCHAR(300) NULL,
  status ENUM('active', 'hidden') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_foods_category_name (category_id, name),
  KEY idx_foods_status (status),
  CONSTRAINT fk_foods_category FOREIGN KEY (category_id) REFERENCES food_categories (id) ON DELETE RESTRICT,
  CONSTRAINT chk_foods_price CHECK (reference_price BETWEEN 1000 AND 10000000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE food_meal_periods (
  food_id INT UNSIGNED NOT NULL,
  meal_period ENUM('breakfast', 'lunch', 'dinner', 'late_night') NOT NULL,
  PRIMARY KEY (food_id, meal_period),
  CONSTRAINT fk_food_meal_periods_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE restaurants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  area ENUM('fpt', 'vnu', 'hhtp', 'other') NOT NULL,
  address VARCHAR(255) NOT NULL,
  google_maps_url VARCHAR(500) NULL,
  phone VARCHAR(15) NULL,
  opening_hours VARCHAR(100) NULL,
  price_min INT UNSIGNED NOT NULL,
  price_max INT UNSIGNED NOT NULL,
  tags SET('student_price', 'group_friendly', 'late_night', 'seating', 'takeaway') NOT NULL DEFAULT '',
  cover_path VARCHAR(255) NULL,
  cover_thumb_path VARCHAR(255) NULL,
  description VARCHAR(500) NULL,
  -- Chỉ tính từ review published (FR-R08). NULL khi chưa có review.
  rating_avg DECIMAL(2,1) NULL,
  review_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active', 'hidden') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_restaurants_area (area),
  KEY idx_restaurants_status_rating (status, rating_avg, review_count),
  CONSTRAINT chk_restaurants_price CHECK (price_min <= price_max),
  CONSTRAINT chk_restaurants_rating CHECK (rating_avg IS NULL OR rating_avg BETWEEN 1.0 AND 5.0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE restaurant_foods (
  restaurant_id INT UNSIGNED NOT NULL,
  food_id INT UNSIGNED NOT NULL,
  -- NULL = dùng giá tham khảo của món.
  price INT UNSIGNED NULL,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, food_id),
  KEY idx_restaurant_foods_food (food_id),
  CONSTRAINT fk_restaurant_foods_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE,
  CONSTRAINT fk_restaurant_foods_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE CASCADE,
  CONSTRAINT chk_restaurant_foods_price CHECK (price IS NULL OR price BETWEEN 1000 AND 10000000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_settings (
  `key` VARCHAR(40) CHARACTER SET ascii NOT NULL,
  value VARCHAR(255) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dữ liệu khởi tạo.
INSERT INTO food_categories (slug, name, icon, uses_meal_periods, sort_order) VALUES
  ('mon-chinh', 'Món chính', 'restaurant', TRUE, 1),
  ('do-uong', 'Đồ uống', 'local_cafe', FALSE, 2),
  ('an-vat', 'Ăn vặt', 'fastfood', FALSE, 3),
  ('do-nhau', 'Đồ nhậu', 'sports_bar', FALSE, 4);

-- Tăng mỗi khi admin sửa nhóm món, món hoặc thực đơn quán (FR-P01, ETag của /catalog).
INSERT INTO app_settings (`key`, value) VALUES ('catalog_version', '1');
