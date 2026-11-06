'use strict';

const express = require('express');
const { z } = require('zod');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { getStorage } = require('../../services/storage');
const { line, optionalLine, optionalText, stringArray, checkbox, idParams } = require('../../utils/http');
const { bumpCatalogVersion } = require('../catalog/catalog-version');
const { logAdminAction } = require('../audit/audit.service');
const { AREA_LABELS, TAG_LABELS, parseTags } = require('../dto');
const { parseForm, paginate, adminImageUpload, processUploadedImage } = require('./helpers');

const PAGE_SIZE = 20;
const AREAS = Object.keys(AREA_LABELS);
const TAGS = Object.keys(TAG_LABELS);
// FR-A05: chỉ nhận link Google Maps https với các host này.
const MAPS_HOSTS = new Set(['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl']);

const price = (label) =>
  z.coerce
    .number({ error: `${label} phải là số` })
    .int(`${label} phải là số nguyên`)
    .min(0, `${label} không hợp lệ`)
    .max(10_000_000, `${label} tối đa 10.000.000đ`);

const mapsUrl = z
  .string()
  .optional()
  .transform((value) => (value ?? '').trim() || null)
  .refine((value) => {
    if (value == null) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && MAPS_HOSTS.has(url.hostname) && value.length <= 500;
    } catch {
      return false;
    }
  }, 'Chỉ nhận link https của Google Maps (google.com, maps.google.com, maps.app.goo.gl, goo.gl)');

const restaurantSchema = z
  .object({
    name: line(2, 120, 'Tên quán phải từ 2 đến 120 ký tự'),
    area: z.enum(AREAS, { error: 'Chọn khu vực' }),
    address: line(5, 255, 'Địa chỉ phải từ 5 đến 255 ký tự'),
    googleMapsUrl: mapsUrl,
    phone: z
      .string()
      .optional()
      .transform((value) => (value ?? '').replace(/[\s.-]/g, '') || null)
      .refine((value) => value == null || /^\+?\d{9,15}$/.test(value), 'Số điện thoại gồm 9 đến 15 chữ số'),
    openingHours: optionalLine(100, 'Giờ mở cửa tối đa 100 ký tự'),
    priceMin: price('Giá thấp nhất'),
    priceMax: price('Giá cao nhất'),
    tags: stringArray.pipe(z.array(z.enum(TAGS))),
    description: optionalText(500, 'Mô tả tối đa 500 ký tự'),
    status: z.enum(['active', 'hidden']).default('active'),
  })
  .refine((v) => v.priceMin <= v.priceMax, {
    path: ['priceMax'],
    message: 'Giá cao nhất phải lớn hơn hoặc bằng giá thấp nhất',
  });

const menuSchema = z.object({
  foodId: z.coerce.number({ error: 'Chọn món' }).int().positive('Chọn món'),
  price: z
    .string()
    .optional()
    .transform((value) => (value == null || value.trim() === '' ? null : Number(value)))
    .pipe(
      z
        .number({ error: 'Giá phải là số' })
        .int()
        .min(1000, 'Giá từ 1.000đ')
        .max(10_000_000, 'Giá tối đa 10.000.000đ')
        .nullable(),
    ),
  isFeatured: checkbox,
  sortOrder: z.coerce.number().int().min(-999).max(999).catch(0).default(0),
});

async function findRestaurant(id) {
  const [[row]] = await getPool().query('SELECT * FROM restaurants WHERE id = ?', [id]);
  if (!row) throw AppError.notFound('RESTAURANT_NOT_FOUND', 'Không tìm thấy quán');
  return row;
}

function toValues(row) {
  return {
    name: row.name,
    area: row.area,
    address: row.address,
    googleMapsUrl: row.google_maps_url,
    phone: row.phone,
    openingHours: row.opening_hours,
    priceMin: row.price_min,
    priceMax: row.price_max,
    tags: parseTags(row.tags),
    description: row.description,
    status: row.status,
  };
}

async function loadMenu(restaurantId) {
  const pool = getPool();
  const [menu] = await pool.query(
    `SELECT rf.food_id, rf.price, rf.is_featured, rf.sort_order, f.name, f.reference_price, f.status, c.name AS category_name
       FROM restaurant_foods rf JOIN foods f ON f.id = rf.food_id JOIN food_categories c ON c.id = f.category_id
      WHERE rf.restaurant_id = ? ORDER BY rf.is_featured DESC, rf.sort_order, f.name`,
    [restaurantId],
  );
  const [available] = await pool.query(
    `SELECT f.id, f.name, f.reference_price, c.name AS category_name FROM foods f JOIN food_categories c ON c.id = f.category_id
      WHERE f.id NOT IN (SELECT food_id FROM restaurant_foods WHERE restaurant_id = ?) ORDER BY c.sort_order, f.name`,
    [restaurantId],
  );
  return { menu, available };
}

async function renderForm(res, locals, status = 200) {
  const extra = locals.restaurant ? await loadMenu(locals.restaurant.id) : { menu: [], available: [] };
  res
    .status(status)
    .render('admin/restaurants/form', { areas: AREAS, tags: TAGS, menuFields: {}, ...extra, ...locals });
}

function restaurantParams(data) {
  return [
    data.name,
    data.area,
    data.address,
    data.googleMapsUrl,
    data.phone,
    data.openingHours,
    data.priceMin,
    data.priceMax,
    data.tags.join(','),
    data.description,
    data.status,
  ];
}

const INSERT_SQL = `INSERT INTO restaurants (name, area, address, google_maps_url, phone, opening_hours, price_min, price_max,
  tags, description, status, cover_path, cover_thumb_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const UPDATE_SQL = `UPDATE restaurants SET name = ?, area = ?, address = ?, google_maps_url = ?, phone = ?, opening_hours = ?,
  price_min = ?, price_max = ?, tags = ?, description = ?, status = ?,
  cover_path = COALESCE(?, cover_path), cover_thumb_path = COALESCE(?, cover_thumb_path) WHERE id = ?`;

function createRestaurantsRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const area = AREAS.includes(req.query.area) ? req.query.area : null;
    const status = ['active', 'hidden'].includes(req.query.status) ? req.query.status : null;
    const foodId = Number(req.query.food) || null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const where = ['1 = 1'];
    const params = [];
    if (q) {
      where.push('r.name LIKE ?');
      params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (area) {
      where.push('r.area = ?');
      params.push(area);
    }
    if (status) {
      where.push('r.status = ?');
      params.push(status);
    }
    if (foodId) {
      where.push('EXISTS (SELECT 1 FROM restaurant_foods rf WHERE rf.restaurant_id = r.id AND rf.food_id = ?)');
      params.push(foodId);
    }
    const pool = getPool();
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM restaurants r WHERE ${whereSql}`, params);
    const pager = paginate(total, page, PAGE_SIZE);
    const [rows] = await pool.query(
      `SELECT r.id, r.name, r.area, r.address, r.price_min, r.price_max, r.rating_avg, r.review_count, r.status, r.cover_thumb_path,
              (SELECT COUNT(*) FROM restaurant_foods rf WHERE rf.restaurant_id = r.id) AS menu_count
         FROM restaurants r WHERE ${whereSql} ORDER BY r.updated_at DESC, r.id DESC LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, pager.offset],
    );
    const [foods] = await pool.query('SELECT id, name FROM foods ORDER BY name');
    res.render('admin/restaurants/index', {
      title: 'Quán ăn',
      rows,
      pager,
      areas: AREAS,
      foods,
      query: { q, area, status, foodId },
    });
  });

  router.get('/new', async (_req, res) => {
    await renderForm(res, {
      title: 'Thêm quán',
      action: '/admin/restaurants/new',
      values: { status: 'active', tags: [] },
    });
  });

  router.post('/new', ...adminImageUpload('cover'), async (req, res) => {
    const { data, fields } = parseForm(restaurantSchema, req.body);
    const upload = fields ? {} : await processUploadedImage(req.files[0], 'cover');
    const errors = fields ?? upload.fields;
    if (errors) {
      await renderForm(
        res,
        { title: 'Thêm quán', action: '/admin/restaurants/new', values: req.body, fields: errors },
        400,
      );
      return;
    }
    const storage = getStorage();
    const saved = upload.image ? await storage.saveImagePair('restaurants', upload.image) : null;
    let id;
    try {
      id = await withTransaction(async (conn) => {
        const [result] = await conn.query(INSERT_SQL, [
          ...restaurantParams(data),
          saved?.imagePath ?? null,
          saved?.thumbPath ?? null,
        ]);
        await logAdminAction(conn, req, {
          action: 'restaurant.create',
          targetType: 'restaurant',
          targetId: result.insertId,
          summary: `Thêm quán "${data.name}"`,
        });
        return result.insertId;
      });
    } catch (error) {
      await storage.removeFiles([saved?.imagePath, saved?.thumbPath]);
      throw error;
    }
    req.flash('success', `Đã thêm quán "${data.name}". Thêm món vào thực đơn ở bên dưới.`);
    res.redirect(`/admin/restaurants/${id}/edit`);
  });

  router.get('/:id/edit', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const restaurant = await findRestaurant(id);
    await renderForm(res, {
      title: `Sửa quán: ${restaurant.name}`,
      action: `/admin/restaurants/${id}/edit`,
      values: toValues(restaurant),
      restaurant,
    });
  });

  router.post('/:id/edit', ...adminImageUpload('cover'), async (req, res) => {
    const { id } = idParams.parse(req.params);
    const restaurant = await findRestaurant(id);
    const locals = {
      title: `Sửa quán: ${restaurant.name}`,
      action: `/admin/restaurants/${id}/edit`,
      values: req.body,
      restaurant,
    };
    const { data, fields } = parseForm(restaurantSchema, req.body);
    const upload = fields ? {} : await processUploadedImage(req.files[0], 'cover');
    const errors = fields ?? upload.fields;
    if (errors) {
      await renderForm(res, { ...locals, fields: errors }, 400);
      return;
    }
    const storage = getStorage();
    const saved = upload.image ? await storage.saveImagePair('restaurants', upload.image) : null;
    try {
      await withTransaction(async (conn) => {
        await conn.query(UPDATE_SQL, [
          ...restaurantParams(data),
          saved?.imagePath ?? null,
          saved?.thumbPath ?? null,
          id,
        ]);
        // Ẩn/hiện quán đổi số quán bán món trong /catalog.
        if (data.status !== restaurant.status) await bumpCatalogVersion(conn);
        await logAdminAction(conn, req, {
          action: 'restaurant.update',
          targetType: 'restaurant',
          targetId: id,
          summary: `Sửa quán "${data.name}"`,
        });
      });
    } catch (error) {
      await storage.removeFiles([saved?.imagePath, saved?.thumbPath]);
      throw error;
    }
    if (saved) await storage.removeFiles([restaurant.cover_path, restaurant.cover_thumb_path]);
    req.flash('success', `Đã lưu quán "${data.name}".`);
    res.redirect(`/admin/restaurants/${id}/edit`);
  });

  router.post('/:id/cover/delete', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const restaurant = await findRestaurant(id);
    await withTransaction(async (conn) => {
      await conn.query('UPDATE restaurants SET cover_path = NULL, cover_thumb_path = NULL WHERE id = ?', [id]);
      await logAdminAction(conn, req, {
        action: 'restaurant.cover_delete',
        targetType: 'restaurant',
        targetId: id,
        summary: `Xóa ảnh bìa "${restaurant.name}"`,
      });
    });
    await getStorage().removeFiles([restaurant.cover_path, restaurant.cover_thumb_path]);
    req.flash('success', 'Đã xóa ảnh bìa.');
    res.redirect(`/admin/restaurants/${id}/edit`);
  });

  // Xóa quán: xóa luôn review, ảnh review, báo cáo (CASCADE) và file ảnh trên đĩa (FR-A05).
  router.post('/:id/delete', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const restaurant = await findRestaurant(id);
    const reviewIds = await withTransaction(async (conn) => {
      const [reviews] = await conn.query('SELECT id FROM reviews WHERE restaurant_id = ?', [id]);
      await conn.query('DELETE FROM restaurants WHERE id = ?', [id]);
      await bumpCatalogVersion(conn);
      await logAdminAction(conn, req, {
        action: 'restaurant.delete',
        targetType: 'restaurant',
        targetId: id,
        summary: `Xóa quán "${restaurant.name}" kèm ${reviews.length} review`,
      });
      return reviews.map((review) => review.id);
    });
    const storage = getStorage();
    await storage.removeFiles([restaurant.cover_path, restaurant.cover_thumb_path]);
    for (const reviewId of reviewIds) {
      await storage.removeDir(`reviews/${reviewId}`);
    }
    req.flash('success', `Đã xóa quán "${restaurant.name}".`);
    res.redirect('/admin/restaurants');
  });

  // Thực đơn quán (FR-A05).
  router.post('/:id/menu', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const restaurant = await findRestaurant(id);
    const { data, fields } = parseForm(menuSchema, req.body);
    if (fields) {
      await renderForm(
        res,
        {
          title: `Sửa quán: ${restaurant.name}`,
          action: `/admin/restaurants/${id}/edit`,
          values: toValues(restaurant),
          restaurant,
          menuFields: fields,
        },
        400,
      );
      return;
    }
    try {
      await withTransaction(async (conn) => {
        await conn.query(
          'INSERT INTO restaurant_foods (restaurant_id, food_id, price, is_featured, sort_order) VALUES (?, ?, ?, ?, ?)',
          [id, data.foodId, data.price, data.isFeatured, data.sortOrder],
        );
        await bumpCatalogVersion(conn);
        await logAdminAction(conn, req, {
          action: 'menu.add',
          targetType: 'restaurant',
          targetId: id,
          summary: `Thêm món #${data.foodId} vào "${restaurant.name}"`,
        });
      });
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' && error.code !== 'ER_NO_REFERENCED_ROW_2') throw error;
      req.flash('danger', error.code === 'ER_DUP_ENTRY' ? 'Món này đã có trong thực đơn.' : 'Món không tồn tại.');
    }
    res.redirect(`/admin/restaurants/${id}/edit#menu`);
  });

  router.post('/:id/menu/:foodId', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const restaurant = await findRestaurant(id);
    const { data, fields } = parseForm(menuSchema, { ...req.body, foodId: req.params.foodId });
    if (fields) {
      req.flash('danger', Object.values(fields)[0]);
      res.redirect(`/admin/restaurants/${id}/edit#menu`);
      return;
    }
    await withTransaction(async (conn) => {
      await conn.query(
        'UPDATE restaurant_foods SET price = ?, is_featured = ?, sort_order = ? WHERE restaurant_id = ? AND food_id = ?',
        [data.price, data.isFeatured, data.sortOrder, id, data.foodId],
      );
      await logAdminAction(conn, req, {
        action: 'menu.update',
        targetType: 'restaurant',
        targetId: id,
        summary: `Sửa món #${data.foodId} trong "${restaurant.name}"`,
      });
    });
    req.flash('success', 'Đã lưu thực đơn.');
    res.redirect(`/admin/restaurants/${id}/edit#menu`);
  });

  router.post('/:id/menu/:foodId/delete', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const foodId = Number(req.params.foodId);
    const restaurant = await findRestaurant(id);
    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM restaurant_foods WHERE restaurant_id = ? AND food_id = ?', [id, foodId]);
      await bumpCatalogVersion(conn);
      await logAdminAction(conn, req, {
        action: 'menu.remove',
        targetType: 'restaurant',
        targetId: id,
        summary: `Bỏ món #${foodId} khỏi "${restaurant.name}"`,
      });
    });
    req.flash('success', 'Đã bỏ món khỏi thực đơn.');
    res.redirect(`/admin/restaurants/${id}/edit#menu`);
  });

  return router;
}

module.exports = { createRestaurantsRouter, MAPS_HOSTS };
