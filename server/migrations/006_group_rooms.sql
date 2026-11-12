CREATE TABLE group_rooms (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code CHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  host_id INT UNSIGNED NULL,
  category_id INT UNSIGNED NULL,
  budget INT UNSIGNED NULL,
  status ENUM('choosing','voting','decided','ended') NOT NULL DEFAULT 'choosing',
  result_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES food_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE group_members (
  room_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id,user_id),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE group_candidates (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_id INT UNSIGNED NOT NULL,
  food_id INT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  price INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_gc_food (room_id,food_id),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE group_choices (
  room_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  candidate_id INT UNSIGNED NOT NULL,
  choice ENUM('select','exclude') NOT NULL,
  PRIMARY KEY (room_id,user_id,candidate_id),
  FOREIGN KEY (room_id,user_id) REFERENCES group_members(room_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (candidate_id) REFERENCES group_candidates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE group_votes (
  room_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  candidate_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (room_id,user_id),
  FOREIGN KEY (room_id,user_id) REFERENCES group_members(room_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (candidate_id) REFERENCES group_candidates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
