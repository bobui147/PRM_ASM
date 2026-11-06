'use strict';

const fs = require('node:fs/promises');
const sharp = require('sharp');
const { AppError } = require('../errors');

// requirements FR-R05.
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const LARGE_SIZE = 1600;
const THUMB_SIZE = 400;
const WEBP_QUALITY = 80;
// Chặn ảnh "bom giải nén": ~50 megapixel là quá đủ cho ảnh điện thoại.
const MAX_INPUT_PIXELS = 50_000_000;

function unsupportedImage(cause) {
  return new AppError(415, 'UNSUPPORTED_IMAGE', 'Chỉ nhận ảnh JPEG, PNG hoặc WebP', { cause });
}

async function readMetadata(input) {
  try {
    return await sharp(input).metadata();
  } catch (error) {
    throw unsupportedImage(error);
  }
}

async function renderWebp(input, size) {
  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    // Xoay theo EXIF Orientation. Output không giữ metadata (EXIF, GPS, ICC) vì không gọi keepMetadata().
    .autoOrient()
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Kiểm tra ảnh theo nội dung file (không tin đuôi file hay Content-Type),
 * rồi tạo bản lớn và thumbnail WebP đã xóa metadata.
 *
 * @param {Buffer|string} input  Buffer hoặc đường dẫn file tạm
 * @returns {Promise<{ large: {data, width, height}, thumb: {data, width, height} }>}
 */
async function processImage(source, { largeSize = LARGE_SIZE, thumbSize = THUMB_SIZE } = {}) {
  // Đọc file vào bộ nhớ trước (ảnh tối đa 5 MB). Nếu đưa đường dẫn cho sharp,
  // libvips giữ file mở và trên Windows không xóa được file tạm sau đó.
  const input = typeof source === 'string' ? await fs.readFile(source) : source;
  const metadata = await readMetadata(input);
  if (!ACCEPTED_FORMATS.has(metadata.format)) {
    throw unsupportedImage();
  }
  if ((metadata.width ?? 0) * (metadata.height ?? 0) > MAX_INPUT_PIXELS) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Ảnh có độ phân giải quá lớn');
  }
  try {
    const [large, thumb] = await Promise.all([renderWebp(input, largeSize), renderWebp(input, thumbSize)]);
    return { large, thumb };
  } catch (error) {
    // Header hợp lệ nhưng dữ liệu ảnh hỏng.
    throw unsupportedImage(error);
  }
}

module.exports = { processImage, LARGE_SIZE, THUMB_SIZE, MAX_INPUT_PIXELS };
