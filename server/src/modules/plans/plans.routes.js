'use strict';
const express = require('express');
const { z } = require('zod');
const { getPool } = require('../../db');
const { AppError } = require('../../errors');
const { requireActiveUser, requireUser, requireVerified } = require('../../middleware/auth');
const { writeLimiter } = require('../../middleware/rate-limit');
const { validate } = require('../../middleware/validate');
const { idParams, pageQuery, pageResult } = require('../../utils/http');
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Ngày không hợp lệ');
const meal = z.enum(['breakfast', 'lunch', 'dinner', 'other']);
async function activeFood(id) {
  const [[food]] = await getPool().query(
    "SELECT f.id,f.name,f.reference_price FROM foods f JOIN food_categories c ON c.id=f.category_id WHERE f.id=? AND f.status='active' AND c.status='active'",
    [id],
  );
  if (!food) throw AppError.notFound('FOOD_NOT_FOUND', 'Món không còn hoạt động');
  return food;
}
function createPlansRouter() {
  const router = express.Router();
  router.use('/plans', requireUser, requireVerified);
  router.get(
    '/plans/entries',
    validate({
      query: z
        .object({ ...pageQuery(100, 200), from: date, to: date, eaten: z.enum(['true', 'false']).optional() })
        .refine(
          (v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 31 * 86400000,
          'Chọn khoảng tối đa 31 ngày',
        ),
    }),
    async (req, res) => {
      const { from, to, eaten, page, limit } = req.valid.query;
      const filter = 'user_id=? AND planned_date BETWEEN ? AND ?' + (eaten === undefined ? '' : ' AND eaten=?');
      const params = [req.user.id, from, to, ...(eaten === undefined ? [] : [eaten === 'true'])];
      const [[{ total }]] = await getPool().query(
        `SELECT COUNT(*) AS total FROM meal_plan_entries WHERE ${filter}`,
        params,
      );
      const [rows] = await getPool().query(
        `SELECT id,food_id AS foodId,food_name AS foodName,reference_price AS referencePrice,planned_date AS date,meal,eaten FROM meal_plan_entries WHERE ${filter} ORDER BY planned_date,meal,id LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      res.json(
        pageResult(
          rows.map((r) => ({ ...r, eaten: Boolean(r.eaten) })),
          { page, limit },
          total,
        ),
      );
    },
  );
  router.get('/plans/history', validate({ query: z.object(pageQuery(20, 50)) }), async (req, res) => {
    const { page, limit } = req.valid.query;
    const [[{ total }]] = await getPool().query(
      'SELECT COUNT(*) AS total FROM meal_plan_entries WHERE user_id=? AND eaten=TRUE',
      [req.user.id],
    );
    const [rows] = await getPool().query(
      'SELECT id,food_name AS foodName,planned_date AS date,meal FROM meal_plan_entries WHERE user_id=? AND eaten=TRUE ORDER BY planned_date DESC,id DESC LIMIT ? OFFSET ?',
      [req.user.id, limit, (page - 1) * limit],
    );
    res.json(pageResult(rows, { page, limit }, total));
  });
  router.post(
    '/plans/entries',
    writeLimiter,
    ...requireActiveUser,
    validate({ body: z.object({ foodId: z.number().int().positive(), date, meal }) }),
    async (req, res) => {
      const b = req.valid.body;
      const food = await activeFood(b.foodId);
      const [r] = await getPool().query(
        'INSERT INTO meal_plan_entries (user_id,food_id,food_name,reference_price,planned_date,meal) VALUES (?,?,?,?,?,?)',
        [req.user.id, food.id, food.name, food.reference_price, b.date, b.meal],
      );
      res.status(201).json({ id: r.insertId });
    },
  );
  router.patch(
    '/plans/entries/:id',
    writeLimiter,
    ...requireActiveUser,
    validate({
      params: idParams,
      body: z
        .object({ date: date.optional(), meal: meal.optional(), eaten: z.boolean().optional() })
        .refine((v) => Object.keys(v).length > 0, 'Chọn thay đổi'),
    }),
    async (req, res) => {
      const b = req.valid.body;
      const columns = [];
      const params = [];
      for (const [key, col] of [
        ['date', 'planned_date'],
        ['meal', 'meal'],
        ['eaten', 'eaten'],
      ])
        if (b[key] !== undefined) {
          columns.push(`${col}=?`);
          params.push(b[key]);
        }
      const [r] = await getPool().query(`UPDATE meal_plan_entries SET ${columns.join(',')} WHERE id=? AND user_id=?`, [
        ...params,
        req.valid.params.id,
        req.user.id,
      ]);
      if (!r.affectedRows) throw AppError.notFound();
      res.status(204).end();
    },
  );
  router.delete(
    '/plans/entries/:id',
    writeLimiter,
    ...requireActiveUser,
    validate({ params: idParams }),
    async (req, res) => {
      const [r] = await getPool().query('DELETE FROM meal_plan_entries WHERE id=? AND user_id=?', [
        req.valid.params.id,
        req.user.id,
      ]);
      if (!r.affectedRows) throw AppError.notFound();
      res.status(204).end();
    },
  );
  router.get('/plans/wishlist', validate({ query: z.object(pageQuery(20, 50)) }), async (req, res) => {
    const { page, limit } = req.valid.query;
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM meal_wishlist WHERE user_id=?', [
      req.user.id,
    ]);
    const [rows] = await getPool().query(
      "SELECT w.id,w.food_id AS foodId,w.food_name AS foodName,COALESCE(f.status='active' AND c.status='active',FALSE) AS active FROM meal_wishlist w LEFT JOIN foods f ON f.id=w.food_id LEFT JOIN food_categories c ON c.id=f.category_id WHERE w.user_id=? ORDER BY w.id DESC LIMIT ? OFFSET ?",
      [req.user.id, limit, (page - 1) * limit],
    );
    res.json(
      pageResult(
        rows.map((r) => ({ ...r, active: Boolean(r.active) })),
        { page, limit },
        total,
      ),
    );
  });
  router.put(
    '/plans/wishlist/:id',
    writeLimiter,
    ...requireActiveUser,
    validate({ params: idParams }),
    async (req, res) => {
      const food = await activeFood(req.valid.params.id);
      await getPool().query(
        'INSERT INTO meal_wishlist (user_id,food_id,food_name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE food_name=VALUES(food_name)',
        [req.user.id, food.id, food.name],
      );
      res.status(204).end();
    },
  );
  router.delete(
    '/plans/wishlist/:id',
    writeLimiter,
    ...requireActiveUser,
    validate({ params: idParams }),
    async (req, res) => {
      await getPool().query('DELETE FROM meal_wishlist WHERE id=? AND user_id=?', [req.valid.params.id, req.user.id]);
      res.status(204).end();
    },
  );
  return router;
}
module.exports = { createPlansRouter };
