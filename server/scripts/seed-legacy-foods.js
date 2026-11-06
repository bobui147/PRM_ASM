'use strict';

// S2.9: Nhập 57 món cũ của app vào MySQL, ảnh cắt từ atlas trong seed/legacy-foods.
// Chạy nhiều lần không tạo trùng (so theo nhóm món + tên món).
//
//   npm run seed:legacy-foods

const { getConfig } = require('../src/config');
const { getPool } = require('../src/db');
const { createStorage } = require('../src/services/storage');
const { importLegacyFoods } = require('./lib/legacy-foods');
const { runScript } = require('./lib/cli');

runScript(async () => {
  const config = getConfig();
  console.log(`Database: ${config.db.database} @ ${config.db.host}:${config.db.port}`);
  console.log(`Thư mục ảnh: ${config.uploadDir}`);

  const { inserted, skipped } = await importLegacyFoods({
    pool: getPool(),
    storage: createStorage({ uploadDir: config.uploadDir }),
    onProgress: ({ inserted: count, total, name }) => console.log(`  [${count}/${total}] ${name}`),
  });
  console.log(`Xong: thêm ${inserted} món, bỏ qua ${skipped} món đã có.`);
});
