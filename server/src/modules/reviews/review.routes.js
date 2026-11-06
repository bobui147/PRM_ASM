'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../../middleware/validate');
const { requireUser, requireActiveUser } = require('../../middleware/auth');
const { uploadImages } = require('../../middleware/upload');
const { writeLimiter, reviewEditLimiter } = require('../../middleware/rate-limit');
const {
  idParams,
  text,
  optionalText,
  optionalInt,
  requiredInt,
  stringArray,
  todayInVietnam,
} = require('../../utils/http');
const service = require('./review.service');

// requirements FR-R02: ngày ghé không ở tương lai, không cũ hơn 1 năm.
const visitDate = z
  .string({ error: 'Chọn ngày ghé quán' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày ghé không hợp lệ')
  .refine((value) => value <= todayInVietnam(), 'Ngày ghé không được ở tương lai')
  .refine((value) => value >= todayInVietnam(-365), 'Ngày ghé không được cũ hơn 1 năm');

const reviewBody = z.object({
  rating: requiredInt(1, 5, 'Chọn từ 1 đến 5 sao'),
  comment: text(10, 500, 'Nội dung phải từ 10 đến 500 ký tự'),
  visitDate,
  foodId: optionalInt(1, 4_294_967_295, 'Món không hợp lệ'),
  amountSpent: optionalInt(1000, 10_000_000, 'Chi phí phải từ 1.000đ đến 10.000.000đ'),
});

const updateBody = reviewBody.extend({
  keepImageIds: stringArray.pipe(z.array(z.coerce.number().int().positive())),
});

const reportBody = z
  .object({
    reason: z.enum(['offensive', 'spam', 'misleading', 'inappropriate_image', 'other'], {
      error: 'Chọn lý do báo cáo',
    }),
    details: optionalText(300, 'Ghi chú tối đa 300 ký tự'),
  })
  .refine((body) => body.reason !== 'other' || body.details, {
    path: ['details'],
    message: 'Nhập ghi chú khi chọn Lý do khác',
  });

/** POST /restaurants/:id/reviews, PUT/DELETE /reviews/:id, POST /reviews/:id/reports (§13.5). */
function createReviewRouter() {
  const router = express.Router();

  router.post(
    '/restaurants/:id/reviews',
    writeLimiter,
    ...requireActiveUser,
    uploadImages('images', service.MAX_IMAGES),
    validate({ params: idParams, body: reviewBody }),
    async (req, res) => {
      res.status(201).json(await service.createReview(req.valid.params.id, req.user, req.valid.body, req.files));
    },
  );

  router.put(
    '/reviews/:id',
    writeLimiter,
    ...requireActiveUser,
    reviewEditLimiter,
    uploadImages('images', service.MAX_IMAGES),
    validate({ params: idParams, body: updateBody }),
    async (req, res) => {
      res.json(await service.updateReview(req.valid.params.id, req.user, req.valid.body, req.files));
    },
  );

  // Người bị khóa vẫn xóa được review của mình.
  router.delete('/reviews/:id', writeLimiter, requireUser, validate({ params: idParams }), async (req, res) => {
    await service.deleteReviewById(req.valid.params.id, { ownerId: req.user.id });
    res.status(204).end();
  });

  router.post(
    '/reviews/:id/reports',
    writeLimiter,
    ...requireActiveUser,
    validate({ params: idParams, body: reportBody }),
    async (req, res) => {
      await service.reportReview(req.valid.params.id, req.user, req.valid.body);
      res.status(201).json({ message: 'Đã tiếp nhận báo cáo' });
    },
  );

  return router;
}

module.exports = { createReviewRouter };
