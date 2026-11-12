'use strict';

const express = require('express');
const { z } = require('zod');
const { getPool } = require('../../db');
const { AppError } = require('../../errors');
const { validate } = require('../../middleware/validate');
const { requireUser, requireVerified, requireActiveUser } = require('../../middleware/auth');
const { mealPlanLimiter } = require('../../middleware/rate-limit');
const { idParams, cleanLine, optionalLine, pageQuery, pageResult, todayInVietnam } = require('../../utils/http');
const { uploadUrl } = require('../dto');

// requirements-mo-rong.md FR-PM01, FR-PM02. Dữ liệu chỉ chủ tài khoản đọc/sửa được:
// mọi truy vấn đều lọc theo user_id của token.
const MEALS = ['breakfast', 'lunch', 'dinner', 'other'];
const MAX_RANGE_DAYS = 31;
const MAX_ITEMS_PER_DAY = 30;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const planDate = z
  .string({ error: 'Chọn ngày' })
  .regex(DATE_PATTERN, 'Ngày không hợp lệ')
  .refine(isRealDate, 'Ngày không hợp lệ')
  .refine((value) => value >= todayInVietnam(-365) && value <= todayInVietnam(365), 'Ngày phải trong vòng 1 năm');

const meal = z.enum(MEALS, { error: 'Chọn bữa sáng, trưa, tối hoặc bữa khác' });
const note = optionalLine(200, 'Ghi chú tối đa 200 ký tự');

const addBody = z.object({
  foodId: z.coerce.number({ error: 'Chọn món' }).int().positive(),
  date: planDate,
  meal,
  note,
});

// PATCH: trường thiếu = giữ nguyên (undefined), null/'' = xóa ghi chú.
const noteUpdate = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value === null ? null : cleanLine(value) || null))
  .pipe(z.string().max(200, 'Ghi chú tối đa 200 ký tự').nullable().optional());

const moveBody = z
  .object({ date: planDate.optional(), meal: meal.optional(), note: noteUpdate })
  .refine((body) => body.date || body.meal || body.note !== undefined, { message: 'Không có gì để cập nhật' });

const rangeQuery = z
  .object({
    from: planDate.optional(),
    to: planDate.optional(),
  })
  .transform(({ from, to }) => {
    const start = from ?? todayInVietnam();
    const end = to ?? addDays(start, 6);
    return { from: start, to: end };
  })
  .refine(({ from, to }) => from <= to && daysBetween(from, to) < MAX_RANGE_DAYS, {
    path: ['to'],
    message: `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày`,
  });

const foodParams = z.object({ foodId: z.coerce.number().int().positive() });

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000);
}

const ITEM_SELECT = `
  SELECT mp.id, mp.food_id, mp.food_name, mp.plan_date, mp.meal, mp.note, mp.eaten_at, mp.created_at,
         (f.id IS NOT NULL AND f.status = 'active' AND c.status = 'active') AS available,
         f.reference_price, f.thumb_path
    FROM meal_plan_items mp
    LEFT JOIN foods f ON f.id = mp.food_id
    LEFT JOIN food_categories c ON c.id = f.category_id`;

function toItemDto(row) {
  const available = Boolean(row.available);
  return {
    id: row.id,
    food: {
      // id/giá chỉ có khi món còn trong danh mục công khai (FR-PM01).
      id: available ? row.food_id : null,
      name: row.food_name,
      referencePrice: available ? row.reference_price : null,
      thumbUrl: available ? uploadUrl(row.thumb_path) : null,
    },
    available,
    date: row.plan_date,
    meal: row.meal,
    note: row.note,
    eaten: row.eaten_at != null,
    eatenAt: row.eaten_at,
  };
}

async function findActiveFood(conn, foodId) {
  const [[food]] = await conn.query(
    `SELECT f.id, f.name FROM foods f JOIN food_categories c ON c.id = f.category_id
      WHERE f.id = ? AND f.status = 'active' AND c.status = 'active'`,
    [foodId],
  );
  if (!food) {
    throw AppError.validation({ foodId: 'Món này không còn trong danh mục' });
  }
  return food;
}

async function loadOwnItem(conn, id, userId) {
  const [[row]] = await conn.query(`${ITEM_SELECT} WHERE mp.id = ? AND mp.user_id = ?`, [id, userId]);
  if (!row) {
    // Không phân biệt "không tồn tại" và "của người khác".
    throw AppError.notFound('PLAN_ITEM_NOT_FOUND', 'Không tìm thấy món trong thực đơn');
  }
  return row;
}

async function assertDayCapacity(conn, userId, date) {
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM meal_plan_items WHERE user_id = ? AND plan_date = ?', [
    userId,
    date,
  ]);
  if (n >= MAX_ITEMS_PER_DAY) {
    throw AppError.validation({ date: `Mỗi ngày tối đa ${MAX_ITEMS_PER_DAY} món` });
  }
}

/** /api/v1/me/meal-plan, /me/eaten, /me/want-to-try. */
function createMealPlanRouter() {
  const router = express.Router();
  const reader = [requireUser, requireVerified];
  const writer = [mealPlanLimiter, ...requireActiveUser];

  router.get('/me/meal-plan', ...reader, validate({ query: rangeQuery }), async (req, res) => {
    const { from, to } = req.valid.query;
    const [rows] = await getPool().query(
      `${ITEM_SELECT} WHERE mp.user_id = ? AND mp.plan_date BETWEEN ? AND ?
        ORDER BY mp.plan_date, FIELD(mp.meal, 'breakfast', 'lunch', 'dinner', 'other'), mp.created_at, mp.id`,
      [req.user.id, from, to],
    );
    res.json({ from, to, items: rows.map(toItemDto) });
  });

  router.post('/me/meal-plan', ...writer, validate({ body: addBody }), async (req, res) => {
    const pool = getPool();
    const { foodId, date, meal: mealName, note: noteText } = req.valid.body;
    const food = await findActiveFood(pool, foodId);
    await assertDayCapacity(pool, req.user.id, date);
    const [result] = await pool.query(
      'INSERT INTO meal_plan_items (user_id, food_id, food_name, plan_date, meal, note) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, food.id, food.name, date, mealName, noteText],
    );
    res.status(201).json(toItemDto(await loadOwnItem(pool, result.insertId, req.user.id)));
  });

  // Chuyển sang ngày/bữa khác hoặc sửa ghi chú.
  router.patch('/me/meal-plan/:id', ...writer, validate({ params: idParams, body: moveBody }), async (req, res) => {
    const pool = getPool();
    const item = await loadOwnItem(pool, req.valid.params.id, req.user.id);
    const body = req.valid.body;
    if (body.date && body.date !== item.plan_date) {
      await assertDayCapacity(pool, req.user.id, body.date);
    }
    await pool.query('UPDATE meal_plan_items SET plan_date = ?, meal = ?, note = ? WHERE id = ? AND user_id = ?', [
      body.date ?? item.plan_date,
      body.meal ?? item.meal,
      body.note === undefined ? item.note : body.note,
      item.id,
      req.user.id,
    ]);
    res.json(toItemDto(await loadOwnItem(pool, item.id, req.user.id)));
  });

  router.delete('/me/meal-plan/:id', ...writer, validate({ params: idParams }), async (req, res) => {
    const [result] = await getPool().query('DELETE FROM meal_plan_items WHERE id = ? AND user_id = ?', [
      req.valid.params.id,
      req.user.id,
    ]);
    if (result.affectedRows === 0) {
      throw AppError.notFound('PLAN_ITEM_NOT_FOUND', 'Không tìm thấy món trong thực đơn');
    }
    res.status(204).end();
  });

  // FR-PM02: chỉ đánh dấu khi người dùng xác nhận; không đánh dấu trước cho ngày tương lai.
  router.put('/me/meal-plan/:id/eaten', ...writer, validate({ params: idParams }), async (req, res) => {
    const pool = getPool();
    const item = await loadOwnItem(pool, req.valid.params.id, req.user.id);
    if (item.plan_date > todayInVietnam()) {
      throw new AppError(400, 'FUTURE_DATE', 'Chưa tới ngày này nên chưa đánh dấu đã ăn được');
    }
    await pool.query(
      'UPDATE meal_plan_items SET eaten_at = COALESCE(eaten_at, UTC_TIMESTAMP()) WHERE id = ? AND user_id = ?',
      [item.id, req.user.id],
    );
    res.json(toItemDto(await loadOwnItem(pool, item.id, req.user.id)));
  });

  router.delete('/me/meal-plan/:id/eaten', ...writer, validate({ params: idParams }), async (req, res) => {
    const pool = getPool();
    const item = await loadOwnItem(pool, req.valid.params.id, req.user.id);
    await pool.query('UPDATE meal_plan_items SET eaten_at = NULL WHERE id = ? AND user_id = ?', [item.id, req.user.id]);
    res.json(toItemDto(await loadOwnItem(pool, item.id, req.user.id)));
  });

  // Lịch sử đã ăn, ngày gần nhất trước.
  router.get('/me/eaten', ...reader, validate({ query: z.object(pageQuery(20, 50)) }), async (req, res) => {
    const pool = getPool();
    const { page, limit } = req.valid.query;
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM meal_plan_items WHERE user_id = ? AND eaten_at IS NOT NULL',
      [req.user.id],
    );
    const [rows] = await pool.query(
      `${ITEM_SELECT} WHERE mp.user_id = ? AND mp.eaten_at IS NOT NULL
        ORDER BY mp.plan_date DESC, mp.eaten_at DESC, mp.id DESC LIMIT ? OFFSET ?`,
      [req.user.id, limit, (page - 1) * limit],
    );
    res.json(pageResult(rows.map(toItemDto), { page, limit }, total));
  });

  router.get('/me/want-to-try', ...reader, validate({ query: z.object(pageQuery(50, 100)) }), async (req, res) => {
    const pool = getPool();
    const { page, limit } = req.valid.query;
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM want_to_try WHERE user_id = ?', [
      req.user.id,
    ]);
    const [rows] = await pool.query(
      `SELECT w.food_id, w.created_at, f.name, f.reference_price, f.thumb_path,
              (f.status = 'active' AND c.status = 'active') AS available
         FROM want_to_try w JOIN foods f ON f.id = w.food_id JOIN food_categories c ON c.id = f.category_id
        WHERE w.user_id = ? ORDER BY w.created_at DESC, w.food_id DESC LIMIT ? OFFSET ?`,
      [req.user.id, limit, (page - 1) * limit],
    );
    res.json(
      pageResult(
        rows.map((row) => ({
          foodId: row.food_id,
          name: row.name,
          referencePrice: row.reference_price,
          thumbUrl: uploadUrl(row.thumb_path),
          // Món bị ẩn vẫn nằm trong danh sách nhưng không thêm vào kế hoạch được.
          available: Boolean(row.available),
          savedAt: row.created_at,
        })),
        { page, limit },
        total,
      ),
    );
  });

  router.put('/me/want-to-try/:foodId', ...writer, validate({ params: foodParams }), async (req, res) => {
    const pool = getPool();
    await findActiveFood(pool, req.valid.params.foodId);
    await pool.query('INSERT IGNORE INTO want_to_try (user_id, food_id) VALUES (?, ?)', [
      req.user.id,
      req.valid.params.foodId,
    ]);
    res.json({ foodId: req.valid.params.foodId, saved: true });
  });

  router.delete('/me/want-to-try/:foodId', ...writer, validate({ params: foodParams }), async (req, res) => {
    await getPool().query('DELETE FROM want_to_try WHERE user_id = ? AND food_id = ?', [
      req.user.id,
      req.valid.params.foodId,
    ]);
    res.json({ foodId: req.valid.params.foodId, saved: false });
  });

  return router;
}

module.exports = { createMealPlanRouter, MEALS };
