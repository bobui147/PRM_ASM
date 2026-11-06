'use strict';

const { AppError } = require('../../errors');
const { issuesToFields } = require('../../middleware/validate');
const { processImage } = require('../../services/image');
const { uploadSingleImage } = require('../../middleware/upload');
const { checkCsrf } = require('../../middleware/admin');

/** Kiểm tra form bằng zod; trả { data } hoặc { fields } để render lại form kèm lỗi. */
function parseForm(schema, body) {
  const result = schema.safeParse(body ?? {});
  return result.success ? { data: result.data } : { fields: issuesToFields(result.error.issues) };
}

/** Thông tin phân trang cho view. */
function paginate(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, offset: (page - 1) * limit };
}

/** Upload một ảnh từ form admin rồi mới kiểm tra CSRF (body multipart chỉ có sau multer). */
function adminImageUpload(field) {
  return [uploadSingleImage(field), checkCsrf];
}

/** Xử lý ảnh upload; lỗi định dạng/kích thước trả về lỗi trường thay vì trang lỗi. */
async function processUploadedImage(file, fieldName = 'image') {
  if (!file) {
    return { image: null };
  }
  try {
    return { image: await processImage(file.path) };
  } catch (error) {
    if (error instanceof AppError) {
      return { fields: { [fieldName]: error.message } };
    }
    throw error;
  }
}

/** Lỗi trùng UNIQUE của MySQL → lỗi trường. */
function duplicateField(error, field, message) {
  return error?.code === 'ER_DUP_ENTRY' ? { [field]: message } : null;
}

module.exports = { parseForm, paginate, adminImageUpload, processUploadedImage, duplicateField };
