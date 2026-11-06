'use strict';

// Thao tác DB dùng chung cho món ăn (seed, web admin ở Phase 4).

const RARITIES = Object.freeze(['common', 'rare', 'epic', 'legendary', 'ancient']);
const MEAL_PERIODS = Object.freeze(['breakfast', 'lunch', 'dinner', 'late_night']);

/** Độ hiếm mặc định suy ra từ giá, giống bảng của app (requirements FR-A04). */
function rarityForPrice(price) {
  if (price < 50000) return 'common';
  if (price < 80000) return 'rare';
  if (price < 130000) return 'epic';
  if (price < 170000) return 'legendary';
  return 'ancient';
}

async function findCategoriesBySlug(conn) {
  const [rows] = await conn.query('SELECT id, slug, uses_meal_periods FROM food_categories');
  return new Map(rows.map((row) => [row.slug, { id: row.id, usesMealPeriods: Boolean(row.uses_meal_periods) }]));
}

async function findFoodIdByName(conn, categoryId, name) {
  const [rows] = await conn.query('SELECT id FROM foods WHERE category_id = ? AND name = ?', [categoryId, name]);
  return rows.length > 0 ? rows[0].id : null;
}

/**
 * Thêm một món và các bữa ăn của món. Gọi trong transaction để món và
 * bữa ăn cùng được ghi hoặc cùng không. Trả về id món mới.
 */
async function insertFood(conn, food) {
  const [result] = await conn.query(
    `INSERT INTO foods (category_id, name, reference_price, rarity, image_path, thumb_path, description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      food.categoryId,
      food.name,
      food.referencePrice,
      food.rarity,
      food.imagePath ?? null,
      food.thumbPath ?? null,
      food.description ?? null,
      food.status ?? 'active',
    ],
  );
  const foodId = result.insertId;
  const meals = [...new Set(food.mealPeriods ?? [])];
  if (meals.length > 0) {
    await conn.query('INSERT INTO food_meal_periods (food_id, meal_period) VALUES ?', [
      meals.map((meal) => [foodId, meal]),
    ]);
  }
  return foodId;
}

module.exports = { RARITIES, MEAL_PERIODS, rarityForPrice, findCategoriesBySlug, findFoodIdByName, insertFood };
