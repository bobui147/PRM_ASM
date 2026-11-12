-- Quan hệ theo dõi cộng đồng: xóa tài khoản xóa cả hai phía.
CREATE TABLE community_follows (
  follower_id INT UNSIGNED NOT NULL,
  followed_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, followed_id),
  KEY idx_community_follows_followed (followed_id, follower_id),
  CONSTRAINT fk_community_follows_follower FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_community_follows_followed FOREIGN KEY (followed_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_community_follows_not_self CHECK (follower_id <> followed_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
