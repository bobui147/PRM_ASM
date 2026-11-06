'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const FILE_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/;
const LOCK_NAME = 'homnayangi_migrate';
const LOCK_TIMEOUT_SECONDS = 30;

const silentLogger = { info() {}, warn() {} };

/** Checksum không phụ thuộc kiểu xuống dòng (CRLF trên Windows, LF trên Linux). */
function checksum(sql) {
  return crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/** Đọc và kiểm tra tên các file migration, sắp xếp theo số thứ tự. */
async function listMigrationFiles(dir = MIGRATIONS_DIR) {
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  const invalid = names.filter((name) => !FILE_PATTERN.test(name));
  if (invalid.length > 0) {
    throw new Error(`Tên file migration không hợp lệ: ${invalid.join(', ')} (cần dạng 001_ten_file.sql)`);
  }
  const seen = new Map();
  for (const name of names) {
    const number = FILE_PATTERN.exec(name)[1];
    if (seen.has(number)) {
      throw new Error(`Hai file migration trùng số ${number}: ${seen.get(number)}, ${name}`);
    }
    seen.set(number, name);
  }
  return Promise.all(
    names.map(async (name) => {
      const sql = await fs.readFile(path.join(dir, name), 'utf8');
      return { name, sql, checksum: checksum(sql) };
    }),
  );
}

/** Kết nối riêng cho migrate: cần multipleStatements, không dùng cho request. */
async function openMigrationConnection(db) {
  const conn = await mysql.createConnection({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    charset: 'utf8mb4',
    timezone: 'Z',
    multipleStatements: true,
  });
  await conn.query("SET time_zone = '+00:00'");
  return conn;
}

/**
 * Chạy các migration chưa chạy theo thứ tự. Trả về danh sách tên file vừa chạy.
 *
 * MySQL tự commit sau mỗi lệnh DDL (CREATE/ALTER/DROP) nên không bọc được cả
 * file trong transaction. Nếu một file lỗi giữa chừng, các lệnh trước đó đã có
 * hiệu lực và file đó chưa được ghi vào schema_migrations.
 */
async function runMigrations({ db, dir = MIGRATIONS_DIR, logger = silentLogger }) {
  const files = await listMigrationFiles(dir);
  const conn = await openMigrationConnection(db);
  try {
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, ?) AS ok', [LOCK_NAME, LOCK_TIMEOUT_SECONDS]);
    if (lock.ok !== 1) {
      throw new Error('Một tiến trình migrate khác đang chạy, thử lại sau');
    }
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name VARCHAR(100) CHARACTER SET ascii NOT NULL,
          checksum CHAR(64) CHARACTER SET ascii NOT NULL,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

      const [rows] = await conn.query('SELECT name, checksum FROM schema_migrations');
      const applied = new Map(rows.map((row) => [row.name, row.checksum]));

      for (const file of files) {
        if (applied.has(file.name) && applied.get(file.name) !== file.checksum) {
          throw new Error(
            `Migration ${file.name} đã chạy nhưng nội dung file đã bị sửa. Hãy tạo file migration mới thay vì sửa file cũ.`,
          );
        }
      }
      const onDisk = new Set(files.map((file) => file.name));
      for (const name of applied.keys()) {
        if (!onDisk.has(name)) {
          logger.warn(`Migration ${name} có trong DB nhưng không còn file trên đĩa`);
        }
      }

      const ran = [];
      for (const file of files.filter((candidate) => !applied.has(candidate.name))) {
        logger.info(`Đang chạy ${file.name}`);
        try {
          await conn.query(file.sql);
        } catch (error) {
          throw new Error(
            `Migration ${file.name} lỗi: ${error.message}. ` +
              'Các lệnh DDL trước chỗ lỗi đã có hiệu lực; kiểm tra lại DB trước khi chạy lại.',
            { cause: error },
          );
        }
        await conn.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [file.name, file.checksum]);
        ran.push(file.name);
      }
      return ran;
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
    }
  } finally {
    await conn.end();
  }
}

module.exports = { runMigrations, listMigrationFiles, checksum, MIGRATIONS_DIR };
