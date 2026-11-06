'use strict';

const { z } = require('zod');

// Ký tự điều khiển trừ xuống dòng (\n). \r bị bỏ để chuẩn hóa xuống dòng.
// eslint-disable-next-line no-control-regex -- cố ý khớp ký tự điều khiển để loại bỏ
const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

/** Chuẩn hóa văn bản người dùng nhập: bỏ ký tự điều khiển, trim (requirements FR-R02). */
function cleanText(value) {
  return String(value).replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim();
}

/** Chuỗi một dòng: gộp mọi khoảng trắng thành một dấu cách. */
function cleanLine(value) {
  return cleanText(value).replace(/\s+/g, ' ');
}

const text = (min, max, message) =>
  z.string({ error: message }).transform(cleanText).pipe(z.string().min(min, message).max(max, message));

const line = (min, max, message) =>
  z.string({ error: message }).transform(cleanLine).pipe(z.string().min(min, message).max(max, message));

/** Chuỗi không bắt buộc: rỗng → null. */
// Lưu ý zod 4: union có z.undefined() KHÔNG làm trường thành tùy chọn trong z.object;
// phải dùng .nullish()/.optional() trước .transform() để trường thiếu được chấp nhận.

const optionalLine = (max, message) =>
  z
    .string()
    .nullish()
    .transform((value) => (value == null ? null : cleanLine(value) || null))
    .pipe(z.string().max(max, message).nullable());

const optionalText = (max, message) =>
  z
    .string()
    .nullish()
    .transform((value) => (value == null ? null : cleanText(value) || null))
    .pipe(z.string().max(max, message).nullable());

/** Số nguyên không bắt buộc từ form/multipart: '' → null. */
const optionalInt = (min, max, message) =>
  z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value) => (value === '' || value == null ? null : Number(value)))
    .pipe(z.number({ error: message }).int(message).min(min, message).max(max, message).nullable());

const requiredInt = (min, max, message) =>
  z.coerce.number({ error: message }).int(message).min(min, message).max(max, message);

/** Giá trị form có thể là một chuỗi hoặc mảng (checkbox, keepImageIds[]). */
const stringArray = z
  .union([z.string(), z.array(z.string())])
  .nullish()
  .transform((value) => (value == null || value === '' ? [] : Array.isArray(value) ? value : [value]));

const checkbox = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((value) => value === true || value === 'on' || value === '1' || value === 'true');

const idParams = z.object({ id: z.coerce.number().int().positive() });

function pageQuery(defaultLimit, maxLimit) {
  return {
    page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
    limit: z.coerce.number().int().min(1).max(maxLimit).catch(defaultLimit).default(defaultLimit),
  };
}

function pageResult(items, { page, limit }, total) {
  return { items, page, limit, total, hasMore: page * limit < total };
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
function todayInVietnam(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}

module.exports = {
  cleanText,
  cleanLine,
  text,
  line,
  optionalLine,
  optionalText,
  optionalInt,
  requiredInt,
  stringArray,
  checkbox,
  idParams,
  pageQuery,
  pageResult,
  todayInVietnam,
};
