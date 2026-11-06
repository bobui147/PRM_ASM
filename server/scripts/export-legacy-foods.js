'use strict';

// S2.8: Xuất 57 món viết cứng của app Flutter (lib/data/sample_foods.dart)
// thành server/seed/legacy-foods/foods.json và chép 10 atlas ảnh sang
// server/seed/legacy-foods/atlases/. Chạy một lần trước khi xóa dữ liệu món khỏi app.
//
//   node scripts/export-legacy-foods.js

const fs = require('node:fs');
const path = require('node:path');
const { runScript, CliError } = require('./lib/cli');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DART_FILE = path.join(REPO_ROOT, 'lib', 'data', 'sample_foods.dart');
const ASSET_DIR = path.join(REPO_ROOT, 'assets', 'images');
const OUT_DIR = path.join(__dirname, '..', 'seed', 'legacy-foods');

// FoodCategory của app → slug nhóm món trên server (migration 002).
const CATEGORY_SLUG = { lunch: 'mon-chinh', drink: 'do-uong', snack: 'an-vat', drinking: 'do-nhau' };
// Tên file atlas theo FoodItem.imageAsset của app.
const ATLAS_PREFIX = { lunch: 'foods-lunch', drink: 'foods-drinks', snack: 'foods-snacks', drinking: 'foods-drinking' };
const MEAL = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', lateNight: 'late_night' };
// Giá trị mặc định của FoodItem.mealPeriods trong app.
const DEFAULT_MEALS = ['lunch', 'dinner'];

function parseMealSets(source) {
  const sets = {};
  const pattern = /const (_\w+) = \{([^}]*)\};/g;
  for (const match of source.matchAll(pattern)) {
    sets[match[1]] = [...match[2].matchAll(/MealPeriod\.(\w+)/g)].map((m) => MEAL[m[1]]);
  }
  return sets;
}

function atlasFor(category, imageIndex) {
  const sheet = Math.floor(imageIndex / 6) + 1;
  return `${ATLAS_PREFIX[category]}${sheet === 1 ? '' : `-${sheet}`}.png`;
}

function parseFoods(source) {
  const mealSets = parseMealSets(source);
  const blocks = [...source.matchAll(/FoodItem\(([\s\S]*?)\n {2}\),/g)].map((m) => m[1]);
  return blocks.map((block) => {
    const field = (name) => new RegExp(`${name}: ([^,\\n]+),`).exec(block)?.[1].trim();
    const category = field('category')?.replace('FoodCategory.', '');
    const mealRef = field('mealPeriods');
    const imageIndex = Number(field('imageIndex'));
    const food = {
      legacyId: field('id')?.replace(/'/g, ''),
      name: field('name')?.replace(/^'|'$/g, ''),
      categorySlug: CATEGORY_SLUG[category],
      referencePrice: Number(field('price')),
      rarity: field('rarity')?.replace('FoodRarity.', ''),
      // Bữa ăn chỉ có ý nghĩa với nhóm Món chính (uses_meal_periods).
      mealPeriods: category === 'lunch' ? (mealRef ? mealSets[mealRef] : DEFAULT_MEALS) : [],
      atlas: atlasFor(category, imageIndex),
      // Atlas 3 cột × 2 hàng; ô đánh số 0..5 từ trái sang phải, trên xuống dưới.
      cell: imageIndex % 6,
    };
    const missing = Object.entries(food).filter(([, value]) => value === undefined || Number.isNaN(value));
    if (missing.length > 0 || (mealRef && !mealSets[mealRef])) {
      throw new CliError(`Không đọc được món: ${block.trim().slice(0, 80)}...`);
    }
    return food;
  });
}

runScript(async () => {
  if (!fs.existsSync(DART_FILE)) {
    throw new CliError(`Không thấy ${DART_FILE}. Dữ liệu món có thể đã bị xóa khỏi app; dùng foods.json đã xuất.`);
  }
  const foods = parseFoods(fs.readFileSync(DART_FILE, 'utf8'));
  const legacyIds = new Set(foods.map((food) => food.legacyId));
  if (legacyIds.size !== foods.length) {
    throw new CliError('Có ID món bị trùng trong sample_foods.dart');
  }

  fs.mkdirSync(path.join(OUT_DIR, 'atlases'), { recursive: true });
  const atlases = [...new Set(foods.map((food) => food.atlas))].sort();
  for (const atlas of atlases) {
    const source = path.join(ASSET_DIR, atlas);
    if (!fs.existsSync(source)) {
      throw new CliError(`Thiếu atlas ${source}`);
    }
    fs.copyFileSync(source, path.join(OUT_DIR, 'atlases', atlas));
  }

  const payload = {
    source: 'lib/data/sample_foods.dart',
    note: 'Ảnh là tài nguyên AI tạo bằng ImageGen, mang tính minh họa; giá là giá tham khảo.',
    atlasGrid: { columns: 3, rows: 2 },
    foods,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'foods.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Đã xuất ${foods.length} món và ${atlases.length} atlas vào ${path.relative(process.cwd(), OUT_DIR)}`);
});
