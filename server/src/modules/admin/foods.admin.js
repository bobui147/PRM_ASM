'use strict';

const express = require('express');
const { z } = require('zod');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { getStorage } = require('../../services/storage');
const { line, optionalText, stringArray, idParams } = require('../../utils/http');
const { RARITIES, MEAL_PERIODS, rarityForPrice } = require('../catalog/food.service');
const { bumpCatalogVersion } = require('../catalog/catalog-version');
const { logAdminAction } = require('../audit/audit.service');
const { parseForm, paginate, adminImageUpload, processUploadedImage, duplicateField } = require('./helpers');

const PAGE_SIZE = 20;

const foodSchema = z.object({
  name: line(2, 80, 'Tên món phải từ 2 đến 80 ký tự'),
  categoryId: z.coerce.number({ error: 'Chọn nhóm món' }).int().positive('Chọn nhóm món'),
  referencePrice: z.coerce
    .number({ error: 'Giá phải là số' })
    .int('Giá phải là số nguyên')
    .min(1000, 'Giá từ 1.000đ đến 10.000.000đ')
    .max(10_000_000, 'Giá từ 1.000đ đến 10.000.000đ'),
  rarity: z.union([z.enum(RARITIES), z.literal('')]).default(''),
  mealPeriods: stringArray.pipe(z.array(z.enum(MEAL_PERIODS))),
  description: optionalText(300, 'Mô tả tối đa 300 ký tự'),
  status: z.enum(['active', 'hidden']).default('active'),
});

async function loadCategories() {
  const [rows] = await getPool().query(
    'SELECT id, name, uses_meal_periods FROM food_categories ORDER BY sort_order, id',
  );
  return rows;
}

async function findFood(id) {
  const [[row]] = await getPool().query(
    `SELECT f.*, (SELECT GROUP_CONCAT(meal_period) FROM food_meal_periods WHERE food_id = f.id) AS meals
       FROM foods f WHERE f.id = ?`,
    [id],
  );
  if (!row) throw AppError.notFound('NOT_FOUND', 'Không tìm thấy món');
  return row;
}

async function renderForm(res, locals, status = 200) {
  const pool = getPool();
  const categories = await loadCategories();
  // Mọi quán để tích chọn; quán đang hoạt động đứng trước.
  const [allRestaurants] = await pool.query(
    "SELECT id, name, area, status FROM restaurants ORDER BY status = 'hidden', name",
  );
  let restaurants = [];
  if (locals.food) {
    [restaurants] = await pool.query(
      `SELECT r.id, r.name, r.status, rf.price FROM restaurant_foods rf JOIN restaurants r ON r.id = rf.restaurant_id
        WHERE rf.food_id = ? ORDER BY r.name`,
      [locals.food.id],
    );
  }
  res.status(status).render('admin/foods/form', {
    categories,
    rarities: RARITIES,
    meals: MEAL_PERIODS,
    restaurants,
    allRestaurants,
    ...locals,
  });
}

/**
 * Đọc các quán được tích (restaurantIds) và giá tại từng quán (price_<id>).
 * Giá để trống = dùng giá tham khảo của món.
 */
function parseRestaurantLinks(body) {
  const ids = [...new Set(stringArray.parse(body.restaurantIds).map(Number))].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  const links = [];
  for (const restaurantId of ids) {
    const raw = String(body[`price_${restaurantId}`] ?? '').trim();
    const price = raw === '' ? null : Number(raw);
    if (price !== null && (!Number.isInteger(price) || price < 1000 || price > 10_000_000)) {
      return { fields: { restaurants: 'Giá tại quán phải là số nguyên từ 1.000đ đến 10.000.000đ' } };
    }
    links.push({ restaurantId, price });
  }
  return { links };
}

/**
 * Đồng bộ quán bán món: gỡ quán bị bỏ tích, thêm quán mới, cập nhật giá.
 * Giữ nguyên "nổi bật" và thứ tự đã đặt ở trang quán.
 */
async function syncRestaurantLinks(conn, foodId, links) {
  const [existingRows] = await conn.query('SELECT restaurant_id FROM restaurant_foods WHERE food_id = ?', [foodId]);
  const existing = new Set(existingRows.map((row) => row.restaurant_id));
  let valid = [];
  if (links.length > 0) {
    // Bỏ qua id quán không tồn tại (quán vừa bị xóa trong lúc đang sửa form).
    const [rows] = await conn.query('SELECT id FROM restaurants WHERE id IN (?)', [links.map((l) => l.restaurantId)]);
    const known = new Set(rows.map((row) => row.id));
    valid = links.filter((link) => known.has(link.restaurantId));
  }
  const keep = new Set(valid.map((link) => link.restaurantId));
  const removed = [...existing].filter((id) => !keep.has(id));
  if (removed.length > 0) {
    await conn.query('DELETE FROM restaurant_foods WHERE food_id = ? AND restaurant_id IN (?)', [foodId, removed]);
  }
  if (valid.length > 0) {
    await conn.query(
      `INSERT INTO restaurant_foods (restaurant_id, food_id, price) VALUES ?
         AS incoming ON DUPLICATE KEY UPDATE price = incoming.price`,
      [valid.map((link) => [link.restaurantId, foodId, link.price])],
    );
  }
  return {
    added: valid.filter((link) => !existing.has(link.restaurantId)).length,
    removed: removed.length,
    total: valid.length,
  };
}

/** Kiểm tra bữa ăn theo nhóm; trả lỗi trường hoặc null. */
async function checkMeals(data) {
  const [[category]] = await getPool().query('SELECT uses_meal_periods FROM food_categories WHERE id = ?', [
    data.categoryId,
  ]);
  if (!category) return { categoryId: 'Nhóm món không tồn tại' };
  if (!category.uses_meal_periods) {
    data.mealPeriods = [];
  } else if (data.mealPeriods.length === 0) {
    return { mealPeriods: 'Chọn ít nhất một bữa ăn' };
  }
  return null;
}

async function saveMeals(conn, foodId, meals) {
  await conn.query('DELETE FROM food_meal_periods WHERE food_id = ?', [foodId]);
  if (meals.length > 0) {
    await conn.query('INSERT INTO food_meal_periods (food_id, meal_period) VALUES ?', [meals.map((m) => [foodId, m])]);
  }
}

function createFoodsRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const categoryId = Number(req.query.category) || null;
    const status = ['active', 'hidden'].includes(req.query.status) ? req.query.status : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const where = ['1 = 1'];
    const params = [];
    if (q) {
      where.push('f.name LIKE ?');
      params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (categoryId) {
      where.push('f.category_id = ?');
      params.push(categoryId);
    }
    if (status) {
      where.push('f.status = ?');
      params.push(status);
    }
    const pool = getPool();
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM foods f WHERE ${where.join(' AND ')}`,
      params,
    );
    const pager = paginate(total, page, PAGE_SIZE);
    const [rows] = await pool.query(
      `SELECT f.id, f.name, f.reference_price, f.rarity, f.thumb_path, f.status, c.name AS category_name,
              (SELECT COUNT(*) FROM restaurant_foods rf WHERE rf.food_id = f.id) AS restaurant_count
         FROM foods f JOIN food_categories c ON c.id = f.category_id
        WHERE ${where.join(' AND ')} ORDER BY f.updated_at DESC, f.id DESC LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, pager.offset],
    );
    res.render('admin/foods/index', {
      title: 'Món ăn',
      rows,
      pager,
      categories: await loadCategories(),
      query: { q, categoryId, status },
    });
  });

  router.get('/new', async (_req, res) => {
    await renderForm(res, {
      title: 'Thêm món',
      action: '/admin/foods/new',
      values: { status: 'active', mealPeriods: [] },
    });
  });

  router.post('/new', ...adminImageUpload('image'), async (req, res) => {
    const { data, fields } = parseForm(foodSchema, req.body);
    const linkResult = parseRestaurantLinks(req.body);
    const formError = fields ?? linkResult.fields ?? (await checkMeals(data));
    const upload = formError ? {} : await processUploadedImage(req.files[0]);
    const errors = formError ?? upload.fields;
    if (errors) {
      await renderForm(res, { title: 'Thêm món', action: '/admin/foods/new', values: req.body, fields: errors }, 400);
      return;
    }
    const storage = getStorage();
    const saved = upload.image ? await storage.saveImagePair('foods', upload.image) : null;
    try {
      await withTransaction(async (conn) => {
        const [result] = await conn.query(
          `INSERT INTO foods (category_id, name, reference_price, rarity, image_path, thumb_path, description, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.categoryId,
            data.name,
            data.referencePrice,
            data.rarity || rarityForPrice(data.referencePrice),
            saved?.imagePath ?? null,
            saved?.thumbPath ?? null,
            data.description,
            data.status,
          ],
        );
        await saveMeals(conn, result.insertId, data.mealPeriods);
        const sync = await syncRestaurantLinks(conn, result.insertId, linkResult.links);
        await bumpCatalogVersion(conn);
        await logAdminAction(conn, req, {
          action: 'food.create',
          targetType: 'food',
          targetId: result.insertId,
          summary: `Thêm món "${data.name}", gắn ${sync.total} quán`,
        });
      });
    } catch (error) {
      await storage.removeFiles([saved?.imagePath, saved?.thumbPath]);
      const dup = duplicateField(error, 'name', 'Nhóm này đã có món cùng tên');
      if (!dup) throw error;
      await renderForm(res, { title: 'Thêm món', action: '/admin/foods/new', values: req.body, fields: dup }, 400);
      return;
    }
    req.flash('success', `Đã thêm món "${data.name}".`);
    res.redirect('/admin/foods');
  });

  router.get('/:id/edit', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const food = await findFood(id);
    const [links] = await getPool().query('SELECT restaurant_id, price FROM restaurant_foods WHERE food_id = ?', [id]);
    const values = {
      name: food.name,
      categoryId: food.category_id,
      referencePrice: food.reference_price,
      rarity: food.rarity,
      mealPeriods: food.meals ? food.meals.split(',') : [],
      description: food.description,
      status: food.status,
      restaurantIds: links.map((link) => String(link.restaurant_id)),
    };
    for (const link of links) {
      values[`price_${link.restaurant_id}`] = link.price;
    }
    await renderForm(res, { title: `Sửa món: ${food.name}`, action: `/admin/foods/${id}/edit`, values, food });
  });

  router.post('/:id/edit', ...adminImageUpload('image'), async (req, res) => {
    const { id } = idParams.parse(req.params);
    const food = await findFood(id);
    const locals = { title: `Sửa món: ${food.name}`, action: `/admin/foods/${id}/edit`, values: req.body, food };
    const { data, fields } = parseForm(foodSchema, req.body);
    const linkResult = parseRestaurantLinks(req.body);
    const formError = fields ?? linkResult.fields ?? (await checkMeals(data));
    const upload = formError ? {} : await processUploadedImage(req.files[0]);
    const errors = formError ?? upload.fields;
    if (errors) {
      await renderForm(res, { ...locals, fields: errors }, 400);
      return;
    }
    const storage = getStorage();
    const saved = upload.image ? await storage.saveImagePair('foods', upload.image) : null;
    try {
      await withTransaction(async (conn) => {
        await conn.query(
          `UPDATE foods SET category_id = ?, name = ?, reference_price = ?, rarity = ?, description = ?, status = ?,
                  image_path = COALESCE(?, image_path), thumb_path = COALESCE(?, thumb_path) WHERE id = ?`,
          [
            data.categoryId,
            data.name,
            data.referencePrice,
            data.rarity || rarityForPrice(data.referencePrice),
            data.description,
            data.status,
            saved?.imagePath ?? null,
            saved?.thumbPath ?? null,
            id,
          ],
        );
        await saveMeals(conn, id, data.mealPeriods);
        const sync = await syncRestaurantLinks(conn, id, linkResult.links);
        await bumpCatalogVersion(conn);
        await logAdminAction(conn, req, {
          action: 'food.update',
          targetType: 'food',
          targetId: id,
          summary: `Sửa món "${data.name}": ${sync.total} quán (thêm ${sync.added}, gỡ ${sync.removed})`,
        });
      });
    } catch (error) {
      await storage.removeFiles([saved?.imagePath, saved?.thumbPath]);
      const dup = duplicateField(error, 'name', 'Nhóm này đã có món cùng tên');
      if (!dup) throw error;
      await renderForm(res, { ...locals, fields: dup }, 400);
      return;
    }
    if (saved) await storage.removeFiles([food.image_path, food.thumb_path]);
    req.flash('success', `Đã lưu món "${data.name}".`);
    res.redirect('/admin/foods');
  });

  router.post('/:id/image/delete', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const food = await findFood(id);
    await withTransaction(async (conn) => {
      await conn.query('UPDATE foods SET image_path = NULL, thumb_path = NULL WHERE id = ?', [id]);
      await bumpCatalogVersion(conn);
      await logAdminAction(conn, req, {
        action: 'food.image_delete',
        targetType: 'food',
        targetId: id,
        summary: `Xóa ảnh món "${food.name}"`,
      });
    });
    await getStorage().removeFiles([food.image_path, food.thumb_path]);
    req.flash('success', 'Đã xóa ảnh món.');
    res.redirect(`/admin/foods/${id}/edit`);
  });

  router.post('/:id/delete', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const food = await findFood(id);
    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM foods WHERE id = ?', [id]);
      await bumpCatalogVersion(conn);
      await logAdminAction(conn, req, {
        action: 'food.delete',
        targetType: 'food',
        targetId: id,
        summary: `Xóa món "${food.name}"`,
      });
    });
    await getStorage().removeFiles([food.image_path, food.thumb_path]);
    req.flash('success', `Đã xóa món "${food.name}".`);
    res.redirect('/admin/foods');
  });

  return router;
}

module.exports = { createFoodsRouter };
