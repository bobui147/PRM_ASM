'use strict';

const { getConfig, ConfigError } = require('./config');
const { createLogger } = require('./logger');
const { closePool } = require('./db');
const { createApp } = require('./app');

const SHUTDOWN_TIMEOUT_MS = 10_000;

function start() {
  let config;
  try {
    config = getConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      // Không có logger khi cấu hình sai; in thẳng ra stderr rồi dừng.
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger({ level: config.logLevel });
  const app = createApp({ config, logger });

  const server = app.listen(config.port, config.host, () => {
    logger.info({ host: config.host, port: config.port, env: config.env }, 'Server đã khởi động');
  });

  server.on('error', (error) => {
    logger.fatal({ err: error }, 'Không mở được cổng');
    process.exit(1);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Đang tắt server');
    const forceExit = setTimeout(() => {
      logger.error('Tắt server quá lâu, buộc dừng');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(async (error) => {
      try {
        await closePool();
      } catch (poolError) {
        logger.error({ err: poolError }, 'Lỗi khi đóng pool MySQL');
      }
      process.exit(error ? 1 : 0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Promise bị từ chối mà không được xử lý');
  });
}

start();
