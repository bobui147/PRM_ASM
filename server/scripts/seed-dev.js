'use strict';

// S2.6: Tạo dữ liệu giả cho môi trường dev: 57 món cũ, 20 quán "[Mẫu]",
// 7 người dùng mẫu (@example.com), review đủ 4 trạng thái và vài báo cáo.
//
//   npm run seed:dev               # bỏ qua nếu đã có dữ liệu mẫu
//   npm run seed:dev -- --reset    # xóa quán và người dùng mẫu rồi tạo lại

const { getConfig } = require('../src/config');
const { getPool } = require('../src/db');
const { createStorage } = require('../src/services/storage');
const { seedDevData, SAMPLE_PASSWORD, SAMPLE_EMAIL_DOMAIN } = require('./lib/dev-seed');
const { runScript, CliError, hasFlag } = require('./lib/cli');

runScript(async () => {
  const config = getConfig();
  if (!config.isDevelopment) {
    throw new CliError(`seed:dev chỉ chạy khi NODE_ENV=development (hiện tại: ${config.env}).`);
  }
  console.log(`Database: ${config.db.database} @ ${config.db.host}:${config.db.port}`);

  const result = await seedDevData({
    pool: getPool(),
    storage: createStorage({ uploadDir: config.uploadDir }),
    reset: hasFlag('reset'),
    onFoodProgress: ({ inserted, total, name }) => console.log(`  Món [${inserted}/${total}] ${name}`),
  });

  console.log(`Món ăn: thêm ${result.foods.inserted}, đã có ${result.foods.skipped}.`);
  if (result.skipped) {
    console.log('Đã có dữ liệu mẫu, không tạo lại. Chạy "npm run seed:dev -- --reset" để xóa và tạo lại.');
    return;
  }
  if (result.removed) {
    console.log(`Đã xóa dữ liệu mẫu cũ: ${result.removed.restaurants} quán, ${result.removed.users} người dùng.`);
  }
  const { created } = result;
  const reviews = created.reviews;
  console.log(
    `Đã tạo ${created.restaurants} quán (${created.menuItems} món trong thực đơn), ${created.users} người dùng.`,
  );
  console.log(
    `Review: ${reviews.published} đã đăng, ${reviews.pending} chờ duyệt, ${reviews.rejected} bị từ chối, ${reviews.hidden} bị ẩn. Báo cáo: ${created.reports}.`,
  );
  console.log(
    `Đăng nhập thử: mau01@${SAMPLE_EMAIL_DOMAIN} ... mau07@${SAMPLE_EMAIL_DOMAIN}, mật khẩu "${SAMPLE_PASSWORD}".`,
  );
  console.log(`  mau06: chưa xác minh email. mau07: đang bị khóa 7 ngày.`);
});
