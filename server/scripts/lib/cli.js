'use strict';

const { ConfigError } = require('../../src/config');
const { AppError } = require('../../src/errors');
const { closePool } = require('../../src/db');

/** Lỗi do người chạy lệnh (tham số sai, dữ liệu thiếu), in ra không kèm stack. */
class CliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliError';
  }
}

function printError(error) {
  if (error instanceof ConfigError || error instanceof CliError) {
    console.error(error.message);
    return;
  }
  if (error instanceof AppError) {
    console.error(error.message);
    for (const [field, message] of Object.entries(error.fields ?? {})) {
      console.error(`  - ${field}: ${message}`);
    }
    return;
  }
  console.error(error);
}

/**
 * Chạy hàm main của một script CLI: in lỗi gọn, luôn đóng pool MySQL,
 * đặt exit code 1 khi lỗi.
 */
function runScript(main) {
  Promise.resolve()
    .then(main)
    .catch((error) => {
      printError(error);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}

/** Đọc giá trị của tham số dạng `--ten gia-tri` hoặc `--ten=gia-tri`. */
function readArg(name, argv = process.argv.slice(2)) {
  const flag = `--${name}`;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === flag) {
      return argv[index + 1];
    }
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

function hasFlag(name, argv = process.argv.slice(2)) {
  return argv.includes(`--${name}`);
}

module.exports = { runScript, CliError, readArg, hasFlag };
