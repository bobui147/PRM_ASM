'use strict';

// Phiên bản danh mục món, dùng làm ETag cho GET /catalog (requirements FR-P01).
// Tăng mỗi khi admin sửa nhóm món, món hoặc thực đơn quán.

async function bumpCatalogVersion(conn) {
  await conn.query(
    "UPDATE app_settings SET value = CAST(CAST(value AS UNSIGNED) + 1 AS CHAR) WHERE `key` = 'catalog_version'",
  );
}

async function getCatalogVersion(conn) {
  const [rows] = await conn.query("SELECT value FROM app_settings WHERE `key` = 'catalog_version'");
  return rows.length > 0 ? rows[0].value : '0';
}

module.exports = { bumpCatalogVersion, getCatalogVersion };
