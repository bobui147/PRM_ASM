'use strict';

// S2.5: Tạo tài khoản admin. Không có trang đăng ký admin trên web (FR-A01).
//
//   npm run admin:create
//
// Hỏi username, email, mật khẩu (không hiện khi gõ) và nhập lại mật khẩu.

const { getConfig } = require('../src/config');
const { getPool } = require('../src/db');
const { createAdmin, ADMIN_MIN_PASSWORD_LENGTH } = require('../src/modules/admins/admin.service');
const { runScript, CliError } = require('./lib/cli');
const { createPrompter } = require('./lib/prompt');

runScript(async () => {
  const config = getConfig();
  console.log(`Tạo admin trên database ${config.db.database} @ ${config.db.host}:${config.db.port}`);

  const prompt = createPrompter();
  const username = await prompt.ask('Username: ');
  const email = await prompt.ask('Email: ');
  const password = await prompt.askHidden(`Mật khẩu (ít nhất ${ADMIN_MIN_PASSWORD_LENGTH} ký tự, có chữ và số): `);
  const confirm = await prompt.askHidden('Nhập lại mật khẩu: ');
  if (password !== confirm) {
    throw new CliError('Hai lần nhập mật khẩu không khớp.');
  }

  const admin = await createAdmin(getPool(), { username, email, password });
  console.log(`Đã tạo admin #${admin.id}: ${admin.username} <${admin.email}>`);
});
