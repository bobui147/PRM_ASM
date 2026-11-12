'use strict';
const { getPool, closePool } = require('../src/db');
async function main() {
  try {
    await getPool().query('DELETE FROM community_reports WHERE created_at < UTC_TIMESTAMP() - INTERVAL 90 DAY');
    await getPool().query('DELETE FROM admin_audit_logs WHERE created_at < UTC_TIMESTAMP() - INTERVAL 90 DAY');
    await getPool().query('DELETE FROM community_actions WHERE created_at < UTC_TIMESTAMP() - INTERVAL 1 DAY');
  } finally {
    await closePool();
  }
}
main().catch(() => {
  process.exitCode = 1;
});
