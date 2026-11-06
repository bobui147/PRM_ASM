'use strict';

const express = require('express');
const { z } = require('zod');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { line, checkbox, idParams } = require('../../utils/http');
const { bumpCatalogVersion } = require('../catalog/catalog-version');
const { logAdminAction } = require('../audit/audit.service');
const { parseForm, duplicateField } = require('./helpers');

// FR-A03: danh sách icon app hỗ trợ (khớp CHECK trong migration 002).
const ICONS = [
  'restaurant',
  'local_cafe',
  'fastfood',
  'sports_bar',
  'icecream',
  'ramen_dining',
  'bakery_dining',
  'local_bar',
];

const categorySchema = z.object({
  name: line(2, 40, 'Tên nhóm phải từ 2 đến 40 ký tự'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Mã chỉ gồm chữ thường không dấu, số và dấu gạch ngang')
    .max(40, 'Mã tối đa 40 ký tự'),
  icon: z.enum(ICONS, { error: 'Chọn icon' }),
  usesMealPeriods: checkbox,
  sortOrder: z.coerce.number({ error: 'Thứ tự là số' }).int('Thứ tự là số nguyên').min(-999).max(999).default(0),
  status: z.enum(['active', 'hidden']).default('active'),
});

function render(res, view, locals) {
  res.render(`admin/categories/${view}`, { icons: ICONS, ...locals });
}

async function findCategory(id) {
  const [[row]] = await getPool().query('SELECT * FROM food_categories WHERE id = ?', [id]);
  if (!row) {
    throw AppError.notFound('NOT_FOUND', 'Không tìm thấy nhóm món');
  }
  return row;
}

function toValues(row) {
  return {
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    usesMealPeriods: Boolean(row.uses_meal_periods),
    sortOrder: row.sort_order,
    status: row.status,
  };
}

function createCategoriesRouter() {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT c.*, (SELECT COUNT(*) FROM foods f WHERE f.category_id = c.id) AS food_count
         FROM food_categories c ORDER BY c.sort_order, c.id`,
    );
    render(res, 'index', { title: 'Nhóm món', rows });
  });

  router.get('/new', (_req, res) => {
    render(res, 'form', {
      title: 'Thêm nhóm món',
      values: { icon: 'restaurant', status: 'active', sortOrder: 0 },
      action: '/admin/categories/new',
    });
  });

  router.post('/new', async (req, res) => {
    const { data, fields } = parseForm(categorySchema, req.body);
    if (fields) {
      render(res.status(400), 'form', {
        title: 'Thêm nhóm món',
        values: req.body,
        fields,
        action: '/admin/categories/new',
      });
      return;
    }
    try {
      await withTransaction(async (conn) => {
        const [result] = await conn.query(
          'INSERT INTO food_categories (slug, name, icon, uses_meal_periods, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)',
          [data.slug, data.name, data.icon, data.usesMealPeriods, data.sortOrder, data.status],
        );
        await bumpCatalogVersion(conn);
        await logAdminAction(conn, req, {
          action: 'category.create',
          targetType: 'category',
          targetId: result.insertId,
          summary: `Thêm nhóm "${data.name}"`,
        });
      });
    } catch (error) {
      const dup = duplicateField(error, 'slug', 'Mã này đã được dùng');
      if (!dup) throw error;
      render(res.status(400), 'form', {
        title: 'Thêm nhóm món',
        values: req.body,
        fields: dup,
        action: '/admin/categories/new',
      });
      return;
    }
    req.flash('success', `Đã thêm nhóm "${data.name}".`);
    res.redirect('/admin/categories');
  });

  router.get('/:id/edit', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const row = await findCategory(id);
    render(res, 'form', {
      title: `Sửa nhóm: ${row.name}`,
      values: toValues(row),
      action: `/admin/categories/${id}/edit`,
    });
  });

  router.post('/:id/edit', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const row = await findCategory(id);
    const action = `/admin/categories/${id}/edit`;
    const { data, fields } = parseForm(categorySchema, req.body);
    if (fields) {
      render(res.status(400), 'form', { title: `Sửa nhóm: ${row.name}`, values: req.body, fields, action });
      return;
    }
    try {
      await withTransaction(async (conn) => {
        await conn.query(
          'UPDATE food_categories SET slug = ?, name = ?, icon = ?, uses_meal_periods = ?, sort_order = ?, status = ? WHERE id = ?',
          [data.slug, data.name, data.icon, data.usesMealPeriods, data.sortOrder, data.status, id],
        );
        await bumpCatalogVersion(conn);
        await logAdminAction(conn, req, {
          action: 'category.update',
          targetType: 'category',
          targetId: id,
          summary: `Sửa nhóm "${data.name}"`,
        });
      });
    } catch (error) {
      const dup = duplicateField(error, 'slug', 'Mã này đã được dùng');
      if (!dup) throw error;
      render(res.status(400), 'form', { title: `Sửa nhóm: ${row.name}`, values: req.body, fields: dup, action });
      return;
    }
    req.flash('success', `Đã lưu nhóm "${data.name}".`);
    res.redirect('/admin/categories');
  });

  router.post('/:id/delete', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const row = await findCategory(id);
    const [[{ n }]] = await getPool().query('SELECT COUNT(*) AS n FROM foods WHERE category_id = ?', [id]);
    if (n > 0) {
      req.flash('danger', `Nhóm "${row.name}" còn ${n} món. Hãy chuyển hoặc xóa món trước.`);
      res.redirect('/admin/categories');
      return;
    }
    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM food_categories WHERE id = ?', [id]);
      await bumpCatalogVersion(conn);
      await logAdminAction(conn, req, {
        action: 'category.delete',
        targetType: 'category',
        targetId: id,
        summary: `Xóa nhóm "${row.name}"`,
      });
    });
    req.flash('success', `Đã xóa nhóm "${row.name}".`);
    res.redirect('/admin/categories');
  });

  return router;
}

module.exports = { createCategoriesRouter, ICONS };
