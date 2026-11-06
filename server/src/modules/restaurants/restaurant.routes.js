'use strict';

const express = require('express');
const { z } = require('zod');
const { getPool } = require('../../db');
const { AppError } = require('../../errors');
const { validate } = require('../../middleware/validate');
const { optionalUser } = require('../../middleware/auth');
const { idParams, pageQuery, pageResult } = require('../../utils/http');
const { uploadUrl, parseTags, AREA_LABELS } = require('../dto');
const { findActiveFood } = require('../catalog/catalog.routes');
const { listRestaurantReviews } = require('../reviews/review.service');

const area = z.enum(['fpt', 'vnu', 'hhtp', 'other']).optional().catch(undefined);

const RESTAURANT_COLUMNS = `r.id, r.name, r.area, r.address, r.google_maps_url, r.phone, r.opening_hours,
  r.price_min, r.price_max, r.tags, r.cover_path, r.cover_thumb_path, r.description, r.rating_avg, r.review_count`;

function toRestaurantDto(row) {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    areaLabel: AREA_LABELS[row.area],
    address: row.address,
    googleMapsUrl: row.google_maps_url,
    phone: row.phone,
    openingHours: row.opening_hours,
    priceMin: row.price_min,
    priceMax: row.price_max,
    tags: parseTags(row.tags),
    coverUrl: uploadUrl(row.cover_path),
    coverThumbUrl: uploadUrl(row.cover_thumb_path),
    description: row.description,
    ratingAvg: row.rating_avg == null ? null : Number(row.rating_avg),
    reviewCount: row.review_count,
  };
}

/** Tối đa 2 món nổi bật cho mỗi quán trong danh sách. */
async function featuredFoods(pool, restaurantIds) {
  if (restaurantIds.length === 0) {
    return new Map();
  }
  const [rows] = await pool.query(
    `SELECT rf.restaurant_id, f.id, f.name, COALESCE(rf.price, f.reference_price) AS price
       FROM restaurant_foods rf JOIN foods f ON f.id = rf.food_id
      WHERE rf.restaurant_id IN (?) AND f.status = 'active'
      ORDER BY rf.restaurant_id, rf.is_featured DESC, rf.sort_order, f.name`,
    [restaurantIds],
  );
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.restaurant_id) ?? [];
    if (list.length < 2) {
      list.push({ id: row.id, name: row.name, price: row.price });
    }
    map.set(row.restaurant_id, list);
  }
  return map;
}

// Quán chưa có review đứng sau cùng (FR-P02).
const SORTS = {
  rating: 'r.rating_avg IS NULL, r.rating_avg DESC, r.review_count DESC, r.id',
  reviews: 'r.review_count DESC, r.rating_avg DESC, r.id',
  price: 'food_price ASC, r.price_min ASC, r.id',
};

async function assertActiveRestaurant(pool, id) {
  const [[row]] = await pool.query(
    `SELECT ${RESTAURANT_COLUMNS} FROM restaurants r WHERE r.id = ? AND r.status = 'active'`,
    [id],
  );
  if (!row) {
    throw AppError.notFound('RESTAURANT_NOT_FOUND', 'Không tìm thấy quán');
  }
  return row;
}

async function withFeatured(pool, rows, extra = () => ({})) {
  const featured = await featuredFoods(
    pool,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...toRestaurantDto(row), ...extra(row), featuredFoods: featured.get(row.id) ?? [] }));
}

const foodRestaurantsQuery = z.object({
  area,
  sort: z.enum(['rating', 'reviews', 'price']).catch('rating').default('rating'),
  budget: z.coerce.number().int().min(0).max(100_000_000).optional().catch(undefined),
  ...pageQuery(10, 50),
});

const reviewsQuery = z.object({
  sort: z.enum(['newest', 'highest', 'lowest']).catch('newest').default('newest'),
  withImages: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  ...pageQuery(10, 30),
});

function createRestaurantRouter() {
  const router = express.Router();

  // FR-P02: quán bán món này. Có ngân sách thì quán có giá thấp nhất trong ngân sách lên trước.
  router.get(
    '/foods/:id/restaurants',
    validate({ params: idParams, query: foodRestaurantsQuery }),
    async (req, res) => {
      const pool = getPool();
      const foodId = req.valid.params.id;
      await findActiveFood(foodId);
      const { area: filterArea, sort, budget, page, limit } = req.valid.query;
      const where = ['rf.food_id = ?', "r.status = 'active'"];
      const params = [foodId];
      if (filterArea) {
        where.push('r.area = ?');
        params.push(filterArea);
      }
      const from = `FROM restaurant_foods rf JOIN restaurants r ON r.id = rf.restaurant_id
                  JOIN foods f ON f.id = rf.food_id WHERE ${where.join(' AND ')}`;
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, params);
      const budgetOrder = budget != null ? 'r.price_min > ?, ' : '';
      const [rows] = await pool.query(
        `SELECT ${RESTAURANT_COLUMNS}, COALESCE(rf.price, f.reference_price) AS food_price ${from}
        ORDER BY ${budgetOrder}${SORTS[sort]} LIMIT ? OFFSET ?`,
        [...params, ...(budget != null ? [budget] : []), limit, (page - 1) * limit],
      );
      const items = await withFeatured(pool, rows, (row) => ({ foodPrice: row.food_price }));
      res.json(pageResult(items, { page, limit }, total));
    },
  );

  // FR-P03: danh sách quán.
  router.get(
    '/restaurants',
    validate({
      query: z.object({ area, q: z.string().trim().max(100).optional().catch(undefined), ...pageQuery(10, 50) }),
    }),
    async (req, res) => {
      const pool = getPool();
      const { area: filterArea, q, page, limit } = req.valid.query;
      const where = ["r.status = 'active'"];
      const params = [];
      if (filterArea) {
        where.push('r.area = ?');
        params.push(filterArea);
      }
      if (q) {
        where.push('r.name LIKE ?');
        params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
      }
      const whereSql = where.join(' AND ');
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM restaurants r WHERE ${whereSql}`, params);
      const [rows] = await pool.query(
        `SELECT ${RESTAURANT_COLUMNS} FROM restaurants r WHERE ${whereSql} ORDER BY ${SORTS.rating} LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      res.json(pageResult(await withFeatured(pool, rows), { page, limit }, total));
    },
  );

  // FR-P03: chi tiết quán, thực đơn, phân bố sao.
  router.get('/restaurants/:id', validate({ params: idParams }), async (req, res) => {
    const pool = getPool();
    const row = await assertActiveRestaurant(pool, req.valid.params.id);
    const [menu] = await pool.query(
      `SELECT f.id, f.name, c.slug AS category_slug, f.thumb_path, COALESCE(rf.price, f.reference_price) AS price, rf.is_featured
         FROM restaurant_foods rf JOIN foods f ON f.id = rf.food_id JOIN food_categories c ON c.id = f.category_id
        WHERE rf.restaurant_id = ? AND f.status = 'active'
        ORDER BY rf.is_featured DESC, rf.sort_order, f.name`,
      [row.id],
    );
    const [dist] = await pool.query(
      "SELECT rating, COUNT(*) AS n FROM reviews WHERE restaurant_id = ? AND status = 'published' GROUP BY rating",
      [row.id],
    );
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const item of dist) {
      ratingDistribution[item.rating] = Number(item.n);
    }
    res.json({
      ...toRestaurantDto(row),
      menu: menu.map((item) => ({
        foodId: item.id,
        name: item.name,
        categorySlug: item.category_slug,
        thumbUrl: uploadUrl(item.thumb_path),
        price: item.price,
        featured: Boolean(item.is_featured),
      })),
      ratingDistribution,
    });
  });

  // FR-P04: review đã đăng, kèm myReview nếu có token hợp lệ.
  router.get(
    '/restaurants/:id/reviews',
    optionalUser,
    validate({ params: idParams, query: reviewsQuery }),
    async (req, res) => {
      await assertActiveRestaurant(getPool(), req.valid.params.id);
      res.json(await listRestaurantReviews(req.valid.params.id, req.valid.query, req.user));
    },
  );

  return router;
}

module.exports = { createRestaurantRouter, toRestaurantDto };
