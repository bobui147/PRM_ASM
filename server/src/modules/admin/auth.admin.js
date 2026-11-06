'use strict';

const express = require('express');
const { z } = require('zod');
const { getPool } = require('../../db');
const { hashPassword, verifyPassword } = require('../../services/password');
const { logAdminAction } = require('../audit/audit.service');
const { parseForm } = require('./helpers');

// FR-A01: sai 5 lần / 15 phút theo tài khoản thì khóa 15 phút; theo IP dùng bộ đếm trong bộ nhớ.
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const ipFailures = new Map();

function ipLocked(ip) {
  const entry = ipFailures.get(ip);
  if (!entry || entry.until < Date.now()) {
    return false;
  }
  return entry.count >= MAX_FAILED;
}

function recordIpFailure(ip) {
  const now = Date.now();
  const entry = ipFailures.get(ip);
  if (!entry || entry.until < now) {
    ipFailures.set(ip, { count: 1, until: now + LOCK_MINUTES * 60_000 });
  } else {
    entry.count += 1;
  }
}

function safeNext(value) {
  return typeof value === 'string' && /^\/admin(\/|$|\?)/.test(value) && !value.startsWith('//') ? value : '/admin';
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'),
    newPassword: z
      .string()
      .min(12, 'Mật khẩu mới ít nhất 12 ký tự')
      .max(72, 'Mật khẩu tối đa 72 ký tự')
      .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), 'Mật khẩu phải có chữ và số'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  });

function createAdminAuthRouter() {
  const router = express.Router();

  router.get('/login', (req, res) => {
    if (req.admin) {
      res.redirect('/admin');
      return;
    }
    res.render('admin/login', { title: 'Đăng nhập', next: safeNext(req.query.next), error: null, login: '' });
  });

  router.post('/login', async (req, res, nextMiddleware) => {
    const login = String(req.body.login ?? '')
      .trim()
      .toLowerCase();
    const password = String(req.body.password ?? '');
    const next = safeNext(req.body.next);
    const fail = (error) => res.status(401).render('admin/login', { title: 'Đăng nhập', next, error, login });

    if (ipLocked(req.ip)) {
      fail(`Đăng nhập sai quá nhiều lần. Thử lại sau ${LOCK_MINUTES} phút.`);
      return;
    }
    const pool = getPool();
    const [[admin]] = await pool.query(
      'SELECT id, username, password_hash, failed_login_count, locked_until FROM admins WHERE username = ? OR email = ?',
      [login, login],
    );
    if (admin?.locked_until && new Date(admin.locked_until) > new Date()) {
      fail(`Tài khoản tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ${LOCK_MINUTES} phút.`);
      return;
    }
    if (!admin || !(await verifyPassword(password, admin.password_hash))) {
      recordIpFailure(req.ip);
      if (admin) {
        await pool.query(
          `UPDATE admins SET
             locked_until = IF(failed_login_count + 1 >= ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE, locked_until),
             failed_login_count = IF(failed_login_count + 1 >= ?, 0, failed_login_count + 1)
           WHERE id = ?`,
          [MAX_FAILED, LOCK_MINUTES, MAX_FAILED, admin.id],
        );
      }
      fail('Tên đăng nhập hoặc mật khẩu không đúng.');
      return;
    }
    await pool.query(
      'UPDATE admins SET failed_login_count = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?',
      [admin.id],
    );
    ipFailures.delete(req.ip);
    // Tạo lại session ID sau khi đăng nhập để chống session fixation.
    req.session.regenerate((error) => {
      if (error) {
        nextMiddleware(error);
        return;
      }
      req.session.adminId = admin.id;
      req.admin = admin;
      logAdminAction(pool, req, {
        action: 'admin.login',
        targetType: 'admin',
        targetId: admin.id,
        summary: 'Đăng nhập',
      })
        .catch(() => {})
        .finally(() => req.session.save(() => res.redirect(next)));
    });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('hnag.admin', { path: '/admin' });
      res.redirect('/admin/login');
    });
  });

  router.get('/account/password', (req, res, next) => {
    if (!req.admin) {
      next();
      return;
    }
    res.render('admin/account-password', { title: 'Đổi mật khẩu' });
  });

  router.post('/account/password', async (req, res, next) => {
    if (!req.admin) {
      next();
      return;
    }
    const { data, fields } = parseForm(passwordSchema, req.body);
    const pool = getPool();
    if (fields) {
      res.status(400).render('admin/account-password', { title: 'Đổi mật khẩu', fields });
      return;
    }
    const [[row]] = await pool.query('SELECT password_hash FROM admins WHERE id = ?', [req.admin.id]);
    if (!(await verifyPassword(data.currentPassword, row.password_hash))) {
      res.status(400).render('admin/account-password', {
        title: 'Đổi mật khẩu',
        fields: { currentPassword: 'Mật khẩu hiện tại không đúng' },
      });
      return;
    }
    await pool.query('UPDATE admins SET password_hash = ? WHERE id = ?', [
      await hashPassword(data.newPassword),
      req.admin.id,
    ]);
    await logAdminAction(pool, req, {
      action: 'admin.password',
      targetType: 'admin',
      targetId: req.admin.id,
      summary: 'Đổi mật khẩu',
    });
    req.flash('success', 'Đã đổi mật khẩu.');
    res.redirect('/admin');
  });

  return router;
}

module.exports = { createAdminAuthRouter };
