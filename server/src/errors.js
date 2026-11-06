'use strict';

/**
 * Lỗi nghiệp vụ có mã ổn định để app Flutter xử lý (requirements §13.1).
 * `fields` chứa lỗi theo từng trường; `details` chứa dữ liệu bổ sung
 * như `retryAfter`, `reason`, `blockedUntil`.
 */
class AppError extends Error {
  constructor(status, code, message, { fields, details, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }

  static validation(fields, message = 'Dữ liệu không hợp lệ') {
    return new AppError(400, 'VALIDATION_ERROR', message, { fields });
  }

  static unauthenticated(message = 'Bạn cần đăng nhập') {
    return new AppError(401, 'UNAUTHENTICATED', message);
  }

  static forbidden(message = 'Bạn không có quyền thực hiện thao tác này') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(code = 'NOT_FOUND', message = 'Không tìm thấy dữ liệu') {
    return new AppError(404, code, message);
  }

  static conflict(code, message, details) {
    return new AppError(409, code, message, { details });
  }

  static rateLimited(
    retryAfterSeconds,
    code = 'RATE_LIMITED',
    message = 'Bạn thao tác quá nhanh, vui lòng thử lại sau',
  ) {
    return new AppError(429, code, message, { details: { retryAfter: Math.max(1, Math.ceil(retryAfterSeconds)) } });
  }
}

module.exports = { AppError };
