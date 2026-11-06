'use strict';

const express = require('express');
const { getPool } = require('../../db');
const { AppError } = require('../../errors');
const { validate } = require('../../middleware/validate');
const { idParams } = require('../../utils/http');
const { uploadUrl } = require('../dto');
const { getCatalogVersion } = require('./catalog-version');

const FOOD_SELECT = `
  SELECT f.id, f.name, c.slug AS category_slug, f.reference_price, f.rarity, f.image_path, f.thumb_path, f.description,
         (SELECT GROUP_CONCAT(m.meal_period ORDER BY m.meal_period) FROM food_meal_periods m WHERE m.food_id = f.id) AS meals,
         (SELECT COUNT(*) FROM restaurant_foods rf JOIN restaurants r ON r.id = rf.restaurant_id
           WHERE rf.food_id = f.id AND r.status = 'active') AS restaurant_count
    FROM foods f JOIN food_categories c ON c.id = f.category_id
   WHERE f.status = 'active' AND c.status = 'active'`;

function toFoodDto(row) {
  return {
    id: row.id,
    name: row.name,
    categorySlug: row.category_slug,
    mealPeriods: row.meals ? row.meals.split(',') : [],
    referencePrice: row.reference_price,
    rarity: row.rarity,
    imageUrl: uploadUrl(row.image_path),
    thumbUrl: uploadUrl(row.thumb_path),
    description: row.description,
    restaurantCount: Number(row.restaurant_count),
  };
}

/** Món đang hoạt động hoặc ném FOOD_NOT_FOUND. */
async function findActiveFood(id) {
  const [[row]] = await getPool().query(`${FOOD_SELECT} AND f.id = ?`, [id]);
  if (!row) {
    throw AppError.notFound('FOOD_NOT_FOUND', 'Không tìm thấy món ăn');
  }
  return row;
}

/** GET /catalog và GET /foods/:id (requirements FR-P01). */
function createCatalogRouter() {
  const router = express.Router();

  router.get('/catalog', async (req, res) => {
    const pool = getPool();
    const version = await getCatalogVersion(pool);
    // Số quán bán món thay đổi khi admin sửa thực đơn → cũng tăng catalog_version.
    const etag = `W/"catalog-${version}"`;
    res.set('Cache-Control', 'no-cache');
    res.set('ETag', etag);
    if (req.get('if-none-match') === etag) {
      res.status(304).end();
      return;
    }
    const [categories] = await pool.query(
      "SELECT id, slug, name, icon, uses_meal_periods FROM food_categories WHERE status = 'active' ORDER BY sort_order, id",
    );
    const [foods] = await pool.query(`${FOOD_SELECT} ORDER BY c.sort_order, f.name`);
    res.json({
      version,
      categories: categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        icon: c.icon,
        usesMealPeriods: Boolean(c.uses_meal_periods),
      })),
      foods: foods.map(toFoodDto),
    });
  });

  router.get('/foods/:id', validate({ params: idParams }), async (req, res) => {
    res.json(toFoodDto(await findActiveFood(req.valid.params.id)));
  });

  return router;
}

module.exports = { createCatalogRouter, findActiveFood, toFoodDto };
