'use strict';

const bcrypt = require('bcrypt');

// requirements §15: bcrypt cost 12 cho cả admin và người dùng.
const BCRYPT_COST = 12;
// bcrypt chỉ dùng 72 byte đầu; mật khẩu dài hơn phải bị từ chối khi validate.
const BCRYPT_MAX_BYTES = 72;

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { hashPassword, verifyPassword, BCRYPT_COST, BCRYPT_MAX_BYTES };
