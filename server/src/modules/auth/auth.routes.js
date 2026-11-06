'use strict';

const express = require('express');
const { validate } = require('../../middleware/validate');
const { authLimiter } = require('../../middleware/rate-limit');
const schema = require('./auth.schema');
const service = require('./auth.service');

function context(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

/** /api/v1/auth (requirements §13.2). */
function createAuthRouter() {
  const router = express.Router();
  router.use(authLimiter);

  router.post('/register', validate({ body: schema.registerBody }), async (req, res) => {
    res.status(201).json(await service.register(req.valid.body, context(req)));
  });

  router.post('/verify-email', validate({ body: schema.verifyEmailBody }), async (req, res) => {
    res.json(await service.verifyEmail(req.valid.body, context(req)));
  });

  router.post('/resend-otp', validate({ body: schema.resendOtpBody }), async (req, res) => {
    res.json(await service.resendOtp(req.valid.body, context(req)));
  });

  router.post('/login', validate({ body: schema.loginBody }), async (req, res) => {
    res.json(await service.login(req.valid.body, context(req)));
  });

  router.post('/refresh', validate({ body: schema.refreshBody }), async (req, res) => {
    res.json(await service.refresh(req.valid.body, context(req)));
  });

  router.post('/logout', validate({ body: schema.refreshBody }), async (req, res) => {
    await service.logout(req.valid.body);
    res.status(204).end();
  });

  router.post('/forgot-password', validate({ body: schema.forgotPasswordBody }), async (req, res) => {
    await service.forgotPassword(req.valid.body, context(req));
    res.json({ message: 'Nếu email đã đăng ký, mã đặt lại mật khẩu đã được gửi tới hộp thư của bạn' });
  });

  router.post('/reset-password', validate({ body: schema.resetPasswordBody }), async (req, res) => {
    res.json(await service.resetPassword(req.valid.body, context(req)));
  });

  return router;
}

module.exports = { createAuthRouter };
