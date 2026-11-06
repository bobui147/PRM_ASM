'use strict';

const { z } = require('zod');
const { AppError } = require('../errors');

// Thông báo lỗi mặc định của zod bằng tiếng Việt.
z.config(z.locales.vi());

/** Chuyển issues của zod thành { "tenTruong": "thông báo đầu tiên" }. */
function issuesToFields(issues) {
  const fields = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

/**
 * Middleware kiểm tra req.body / req.query / req.params bằng zod.
 * Dữ liệu đã chuẩn hóa được gán vào req.valid.{body,query,params}.
 * Express 5 không cho ghi đè req.query nên không sửa trực tiếp các trường gốc.
 *
 * Ví dụ: router.post('/x', validate({ body: schema }), handler)
 */
function validate(schemas) {
  return (req, _res, next) => {
    const valid = { ...req.valid };
    const fields = {};
    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) {
        continue;
      }
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        valid[part] = result.data;
      } else {
        Object.assign(fields, issuesToFields(result.error.issues));
      }
    }
    if (Object.keys(fields).length > 0) {
      next(AppError.validation(fields));
      return;
    }
    req.valid = valid;
    next();
  };
}

module.exports = { validate, issuesToFields };
