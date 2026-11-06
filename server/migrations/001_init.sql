-- 001: Tài khoản admin, người dùng app, OTP, refresh token, session admin.
-- requirements.md §12.2. Thời gian lưu UTC.

CREATE TABLE admins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(40) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  failed_login_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_username (username),
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng session của express-mysql-session (createDatabaseTable sẽ tắt).
CREATE TABLE sessions (
  session_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id),
  KEY idx_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  display_name VARCHAR(40) NOT NULL,
  email_verified_at DATETIME NULL,
  token_version INT UNSIGNED NOT NULL DEFAULT 0,
  blocked_until DATETIME NULL,
  blocked_permanent BOOLEAN NOT NULL DEFAULT FALSE,
  block_reason VARCHAR(255) NULL,
  failed_login_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  login_locked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  -- Job dọn tài khoản chưa xác minh quá 7 ngày (FR-U01).
  KEY idx_users_unverified (email_verified_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_blocks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  admin_id INT UNSIGNED NULL,
  action ENUM('block', 'unblock') NOT NULL,
  -- NULL = vĩnh viễn (khi action = block) hoặc không áp dụng (unblock).
  duration_days SMALLINT UNSIGNED NULL,
  reason VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_blocks_user (user_id, created_at),
  CONSTRAINT fk_user_blocks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_blocks_admin FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE email_otps (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  purpose ENUM('verify_email', 'reset_password') NOT NULL,
  -- HMAC-SHA256(OTP, OTP_SECRET) dạng hex. Không lưu OTP gốc.
  code_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  -- IP người yêu cầu, để giới hạn 20 lần/giờ/IP (FR-U02).
  request_ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_email_otps_lookup (email, purpose, created_at),
  KEY idx_email_otps_ip (request_ip, created_at),
  KEY idx_email_otps_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refresh_tokens (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  -- SHA-256 của token dạng hex. Không lưu token gốc.
  token_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  -- Mọi token sinh ra từ cùng một lần đăng nhập có chung family_id (UUID).
  family_id CHAR(36) CHARACTER SET ascii NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  replaced_by_id INT UNSIGNED NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_user (user_id),
  KEY idx_refresh_tokens_family (family_id),
  KEY idx_refresh_tokens_expires (expires_at),
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_refresh_tokens_replaced FOREIGN KEY (replaced_by_id) REFERENCES refresh_tokens (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
