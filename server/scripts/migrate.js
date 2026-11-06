'use strict';

// Chạy các file migrations/*.sql chưa chạy. Dùng DB trong .env (NODE_ENV=development mặc định).
const { getConfig } = require('../src/config');
const { runMigrations } = require('../src/migrator');
const { runScript } = require('./lib/cli');

runScript(async () => {
  const config = getConfig();
  console.log(`Database: ${config.db.database} @ ${config.db.host}:${config.db.port}`);
  const ran = await runMigrations({
    db: config.db,
    logger: { info: (message) => console.log(message), warn: (message) => console.warn(message) },
  });
  console.log(ran.length === 0 ? 'Không có migration mới.' : `Đã chạy ${ran.length} migration.`);
});
