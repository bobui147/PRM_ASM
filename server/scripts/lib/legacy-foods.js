'use strict';

// Nhập 57 món cũ của app (seed/legacy-foods) vào MySQL kèm ảnh cắt từ atlas.
// Dùng bởi scripts/seed-legacy-foods.js, scripts/seed-dev.js và test.

const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { z } = require('zod');

const { withTransaction } = require('../../src/db');
const { processImage } = require('../../src/services/image');
const { bumpCatalogVersion } = require('../../src/modules/catalog/catalog-version');
const {
  RARITIES,
  MEAL_PERIODS,
  findCategoriesBySlug,
  findFoodIdByName,
  insertFood,
} = require('../../src/modules/catalog/food.service');

const SEED_DIR = path.join(__dirname, '..', '..', 'seed', 'legacy-foods');

const seedSchema = z.object({
  atlasGrid: z.object({ columns: z.number().int().positive(), rows: z.number().int().positive() }),
  foods: z
    .array(
      z.object({
        legacyId: z.string().min(1),
        name: z.string().trim().min(2).max(80),
        categorySlug: z.string().min(1),
        referencePrice: z.number().int().min(1000).max(10_000_000),
        rarity: z.enum(RARITIES),
        mealPeriods: z.array(z.enum(MEAL_PERIODS)),
        atlas: z.string().regex(/^[a-z0-9-]+\.png$/),
        cell: z.number().int().min(0),
      }),
    )
    .min(1),
});

async function readSeed(seedDir) {
  const raw = await fs.readFile(path.join(seedDir, 'foods.json'), 'utf8');
  const result = seedSchema.safeParse(JSON.parse(raw));
  if (!result.success) {
    throw new Error(`foods.json không hợp lệ:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Cắt một ô của atlas thành buffer PNG. Atlas được đọc một lần rồi giữ trong cache. */
function createAtlasCropper(seedDir, grid) {
  const cache = new Map();
  async function loadAtlas(file) {
    if (!cache.has(file)) {
      // Đọc buffer trước để sharp không giữ file atlas mở.
      const buffer = await fs.readFile(path.join(seedDir, 'atlases', file));
      const { width, height } = await sharp(buffer).metadata();
      cache.set(file, {
        buffer,
        cellWidth: Math.floor(width / grid.columns),
        cellHeight: Math.floor(height / grid.rows),
      });
    }
    return cache.get(file);
  }
  return async function crop(file, cell) {
    if (cell >= grid.columns * grid.rows) {
      throw new Error(`Ô ${cell} nằm ngoài lưới ${grid.columns}×${grid.rows} của ${file}`);
    }
    const atlas = await loadAtlas(file);
    const column = cell % grid.columns;
    const row = Math.floor(cell / grid.columns);
    return sharp(atlas.buffer)
      .extract({
        left: column * atlas.cellWidth,
        top: row * atlas.cellHeight,
        width: atlas.cellWidth,
        height: atlas.cellHeight,
      })
      .png()
      .toBuffer();
  };
}

/**
 * Nhập món chưa có (so theo nhóm món + tên). Chạy nhiều lần không tạo trùng.
 *
 * @param {object} deps
 * @param {import('mysql2/promise').Pool} deps.pool
 * @param {ReturnType<import('../../src/services/storage').createStorage>} deps.storage
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
async function importLegacyFoods({ pool, storage, seedDir = SEED_DIR, onProgress = () => {} }) {
  const seed = await readSeed(seedDir);
  const categories = await findCategoriesBySlug(pool);
  const missing = [...new Set(seed.foods.map((food) => food.categorySlug))].filter((slug) => !categories.has(slug));
  if (missing.length > 0) {
    throw new Error(`Thiếu nhóm món trong DB: ${missing.join(', ')}. Hãy chạy npm run migrate trước.`);
  }

  const crop = createAtlasCropper(seedDir, seed.atlasGrid);
  let inserted = 0;
  let skipped = 0;

  for (const food of seed.foods) {
    const category = categories.get(food.categorySlug);
    if ((await findFoodIdByName(pool, category.id, food.name)) !== null) {
      skipped += 1;
      continue;
    }

    const image = await processImage(await crop(food.atlas, food.cell));
    const saved = await storage.saveImagePair('foods', image);
    try {
      await withTransaction((conn) =>
        insertFood(conn, {
          categoryId: category.id,
          name: food.name,
          referencePrice: food.referencePrice,
          rarity: food.rarity,
          imagePath: saved.imagePath,
          thumbPath: saved.thumbPath,
          mealPeriods: category.usesMealPeriods ? food.mealPeriods : [],
        }),
      );
    } catch (error) {
      // Không để lại ảnh mồ côi khi ghi DB lỗi.
      await storage.removeFiles([saved.imagePath, saved.thumbPath]);
      throw error;
    }
    inserted += 1;
    onProgress({ inserted, skipped, total: seed.foods.length, name: food.name });
  }

  if (inserted > 0) {
    await bumpCatalogVersion(pool);
  }
  return { inserted, skipped };
}

module.exports = { importLegacyFoods, SEED_DIR };
