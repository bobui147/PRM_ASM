'use strict';

const sharp = require('sharp');
const { getConfig } = require('../../src/config');
const { createLogger } = require('../../src/logger');
const { createApp } = require('../../src/app');
const { getPool } = require('../../src/db');
const { signAccessToken } = require('../../src/modules/auth/token.service');

/** App thật đọc .env.test (DB và UPLOAD_DIR của test). */
function buildApiApp() {
  return createApp({ config: getConfig(), logger: createLogger({ level: 'silent' }), checkDatabase: async () => {} });
}

let seq = 0;

/** Tạo user (mặc định đã xác minh) và trả kèm header Authorization. */
async function createUser({ name, verified = true, blocked = false } = {}) {
  seq += 1;
  const displayName = name ?? `User ${seq}`;
  const [result] = await getPool().query(
    `INSERT INTO users (email, password_hash, display_name, email_verified_at, blocked_permanent, block_reason)
     VALUES (?, 'x', ?, ?, ?, ?)`,
    [`user${seq}_${Date.now()}@test.vn`, displayName, verified ? new Date() : null, blocked, blocked ? 'Spam' : null],
  );
  const user = { id: result.insertId, token_version: 0, display_name: displayName };
  return { ...user, auth: { Authorization: `Bearer ${signAccessToken(user)}` } };
}

/** Món active trong nhóm (mặc định nhóm 1 "Món chính", dùng bữa ăn). */
async function createFood({ name, price = 40000, categoryId = 1, meals = ['lunch'], status = 'active' } = {}) {
  seq += 1;
  const [result] = await getPool().query(
    "INSERT INTO foods (category_id, name, reference_price, rarity, status) VALUES (?, ?, ?, 'common', ?)",
    [categoryId, name ?? `Món ${seq}`, price, status],
  );
  for (const meal of meals) {
    await getPool().query('INSERT INTO food_meal_periods (food_id, meal_period) VALUES (?, ?)', [
      result.insertId,
      meal,
    ]);
  }
  return { id: result.insertId, name: name ?? `Món ${seq}` };
}

async function createRestaurant({ name = 'Quán test', status = 'active' } = {}) {
  const [result] = await getPool().query(
    "INSERT INTO restaurants (name, area, address, price_min, price_max, status) VALUES (?, 'fpt', 'Hòa Lạc', 20000, 60000, ?)",
    [name, status],
  );
  return { id: result.insertId, name };
}

/** Ảnh PNG nhỏ hợp lệ. */
function pngBuffer(color = { r: 200, g: 120, b: 40 }) {
  return sharp({ create: { width: 32, height: 24, channels: 3, background: color } })
    .png()
    .toBuffer();
}

module.exports = { buildApiApp, createUser, createFood, createRestaurant, pngBuffer };
