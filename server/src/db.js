'use strict';

const mysql = require('mysql2/promise');
const { getConfig } = require('./config');

let pool;

/** Pool kết nối dùng chung. Tạo lần đầu khi được gọi. */
function getPool() {
  if (!pool) {
    const { db } = getConfig();
    pool = mysql.createPool({
      host: db.host,
      port: db.port,
      database: db.database,
      user: db.user,
      password: db.password,
      connectionLimit: db.connectionLimit,
      waitForConnections: true,
      charset: 'utf8mb4',
      // Mọi DATETIME lưu và đọc theo UTC (requirements §12.1).
      timezone: 'Z',
      dateStrings: ['DATE'],
      decimalNumbers: true,
      supportBigNumbers: true,
      enableKeepAlive: true,
    });
    pool.on('connection', (connection) => {
      connection.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
}

/**
 * Chạy fn(conn) trong một transaction. Commit nếu fn thành công,
 * rollback và ném lại lỗi nếu fn lỗi. Luôn trả kết nối về pool.
 */
async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // Kết nối đã hỏng; lỗi gốc quan trọng hơn.
    }
    throw error;
  } finally {
    conn.release();
  }
}

/** Đóng pool (khi tắt server hoặc kết thúc test). */
async function closePool() {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}

module.exports = { getPool, withTransaction, closePool };
