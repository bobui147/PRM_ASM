'use strict';

// S2.7: Tính lại rating_avg và review_count của mọi quán từ review published (FR-R08).
//
//   npm run ratings:recalculate

const { getConfig } = require('../src/config');
const { withTransaction } = require('../src/db');
const { recalculateAllRatings } = require('../src/services/rating');
const { runScript } = require('./lib/cli');

runScript(async () => {
  const config = getConfig();
  console.log(`Database: ${config.db.database} @ ${config.db.host}:${config.db.port}`);
  const { processed, changed } = await withTransaction((conn) => recalculateAllRatings(conn));
  console.log(`Đã tính lại điểm ${processed} quán, ${changed} quán có thay đổi.`);
});
