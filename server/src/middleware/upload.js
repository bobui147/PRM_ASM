'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const { SERVER_ROOT } = require('../config');
const { AppError } = require('../errors');

// requirements FR-R05: mỗi ảnh tối đa 5 MB.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const TEMP_DIR = path.join(SERVER_ROOT, 'tmp', 'uploads');

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdir(TEMP_DIR, { recursive: true }, (error) => cb(error, TEMP_DIR));
  },
  // Không dùng tên file gốc của người dùng.
  filename(_req, _file, cb) {
    cb(null, `${crypto.randomUUID()}.upload`);
  },
});

function mapMulterError(error, maxCount) {
  if (!(error instanceof multer.MulterError)) {
    return error;
  }
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Mỗi ảnh tối đa 5 MB');
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return AppError.validation({ [error.field || 'images']: `Tối đa ${maxCount} ảnh` });
    default:
      return AppError.validation({ _: 'Dữ liệu tải lên không hợp lệ' });
  }
}

function flattenFiles(files) {
  if (Array.isArray(files)) {
    return files;
  }
  return Object.values(files ?? {}).flat();
}

function cleanup(req) {
  for (const file of flattenFiles(req.files)) {
    fs.unlink(file.path, () => {});
  }
}

/**
 * Nhận tối đa maxCount ảnh ở trường `field` hoặc `field[]` (multipart).
 * File tạm luôn bị xóa sau khi response kết thúc; route tự xử lý ảnh bằng processImage().
 * `maxFields`: số trường text tối đa (form admin có một ô giá cho mỗi quán).
 */
function uploadImages(field, maxCount, { maxFields = 40 } = {}) {
  const handler = multer({
    storage,
    limits: { fileSize: MAX_FILE_BYTES, files: maxCount, fields: maxFields, fieldSize: 64 * 1024 },
  }).fields([
    { name: field, maxCount },
    { name: `${field}[]`, maxCount },
  ]);
  return (req, res, next) => {
    res.on('close', () => cleanup(req));
    handler(req, res, (error) => {
      req.files = flattenFiles(req.files);
      req.body ??= {};
      next(error ? mapMulterError(error, maxCount) : undefined);
    });
  };
}

/** Một ảnh ở trường `field` (form admin), kết quả nằm ở req.files[0] (nếu có). */
function uploadSingleImage(field) {
  return uploadImages(field, 1, { maxFields: 2000 });
}

module.exports = { uploadImages, uploadSingleImage, MAX_FILE_BYTES, TEMP_DIR };
