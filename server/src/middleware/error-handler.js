'use strict';

const { AppError } = require('../errors');

const API_PREFIX = '/api/';

function isApiRequest(req) {
  return req.originalUrl.startsWith(API_PREFIX) || req.originalUrl === '/api';
}

/** Chuyển lỗi thư viện (body-parser...) thành AppError có mã ổn định. */
function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }
  // body-parser: JSON hỏng hoặc body quá lớn.
  if (error?.type === 'entity.parse.failed') {
    return new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu gửi lên không phải JSON hợp lệ');
  }
  if (error?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn');
  }
  if (error?.type === 'encoding.unsupported' || error?.type === 'charset.unsupported') {
    return new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Định dạng dữ liệu không được hỗ trợ');
  }
  return null;
}

/** Thân JSON lỗi theo requirements §13.1. */
function toErrorBody(appError) {
  const body = { code: appError.code, message: appError.message };
  if (appError.fields && Object.keys(appError.fields).length > 0) {
    body.fields = appError.fields;
  }
  if (appError.details) {
    Object.assign(body, appError.details);
  }
  return { error: body };
}

/** Route không tồn tại. Đặt sau mọi router. */
function notFoundHandler(req, _res, next) {
  next(AppError.notFound('NOT_FOUND', 'Không tìm thấy đường dẫn này'));
}

/** Middleware lỗi cuối cùng. Phải có đủ 4 tham số để Express nhận ra. */
function createErrorHandler({ isProduction }) {
  return function errorHandler(error, req, res, _next) {
    const known = normalizeError(error);
    const appError = known ?? new AppError(500, 'INTERNAL_ERROR', 'Đã có lỗi xảy ra, vui lòng thử lại sau');

    if (appError.status >= 500) {
      req.log?.error({ err: error }, 'Lỗi không xử lý được');
    } else {
      req.log?.debug({ code: appError.code, status: appError.status }, 'Lỗi yêu cầu');
    }

    if (res.headersSent) {
      // Không ghi thêm được; để Express đóng kết nối.
      res.end();
      return;
    }

    if (appError.status === 429 && appError.details?.retryAfter) {
      res.set('Retry-After', String(appError.details.retryAfter));
    }
    res.status(appError.status);

    if (isApiRequest(req)) {
      res.json(toErrorBody(appError));
      return;
    }

    res.render(
      'error',
      {
        title: appError.status === 404 ? 'Không tìm thấy trang' : 'Đã có lỗi xảy ra',
        status: appError.status,
        message: appError.message,
        // Chỉ hiện stack ở môi trường dev để dễ sửa lỗi.
        stack: !isProduction && appError.status >= 500 ? error?.stack : undefined,
      },
      (renderError, html) => {
        if (renderError) {
          req.log?.error({ err: renderError }, 'Không render được trang lỗi');
          res.type('text/plain; charset=utf-8').send(appError.message);
          return;
        }
        res.send(html);
      },
    );
  };
}

module.exports = { notFoundHandler, createErrorHandler, toErrorBody, normalizeError, isApiRequest };
