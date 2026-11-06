'use strict';

// Dữ liệu giả cho môi trường dev (scripts/seed-dev.js và test).
// Mọi quán mẫu có tên bắt đầu "[Mẫu] ", mọi người dùng mẫu có email @example.com,
// nên xóa và tạo lại được mà không đụng tới dữ liệu admin nhập tay.
// Dùng PRNG có seed cố định để mỗi lần tạo ra cùng một bộ dữ liệu.

const { withTransaction } = require('../../src/db');
const { hashPassword } = require('../../src/services/password');
const { recalculateAllRatings } = require('../../src/services/rating');
const { bumpCatalogVersion } = require('../../src/modules/catalog/catalog-version');
const { importLegacyFoods } = require('./legacy-foods');

const SAMPLE_PREFIX = '[Mẫu] ';
const SAMPLE_EMAIL_DOMAIN = 'example.com';
const SAMPLE_PASSWORD = 'matkhau123';
const RESTAURANT_COUNT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/** PRNG mulberry32: cùng seed cho cùng dãy số. */
function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (items) => items[Math.floor(next() * items.length)];
  const shuffle = (items) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(next() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  };
  return { next, int, pick, shuffle };
}

const SAMPLE_USERS = [
  { key: 'mau01', name: 'Minh Anh' },
  { key: 'mau02', name: 'Hoàng Nam' },
  { key: 'mau03', name: 'Thu Trang' },
  { key: 'mau04', name: 'Đức Huy' },
  { key: 'mau05', name: 'Lan Chi' },
  { key: 'mau06', name: 'Chưa Xác Minh', unverified: true },
  { key: 'mau07', name: 'Bị Khóa', blockedDays: 7 },
];

const RESTAURANT_NAMES = [
  'Cơm Bình Dân Cô Hạnh',
  'Phở Bò Gia Truyền',
  'Bún Chả Hàng Mành',
  'Bánh Mì Chảo',
  'Quán Nhậu Góc Phố',
  'Trà Sữa Ông Bụt',
  'Cà Phê Đồi Thông',
  'Lẩu Nướng Sinh Viên',
  'Ăn Vặt Cổng Trường',
  'Bún Bò Huế O Xuân',
  'Cơm Tấm Sài Gòn',
  'Chè Bà Tư',
  'Mì Quảng Phố Hội',
  'Nướng Ngói Hòa Lạc',
  'Xôi Ngon Buổi Sáng',
  'Bếp Nhà Mây',
  'Hải Sản Bình Dân',
  'Nước Ép Tươi Mát',
  'Bánh Xèo Miền Tây',
  'Quán Ốc Đêm',
];

const AREAS = [
  { area: 'fpt', address: 'Khu dân cư gần Đại học FPT, Thạch Hòa, Thạch Thất, Hà Nội' },
  { area: 'vnu', address: 'Gần ĐHQG Hà Nội cơ sở Hòa Lạc, Thạch Thất, Hà Nội' },
  { area: 'hhtp', address: 'Khu Công nghệ cao Hòa Lạc, Thạch Thất, Hà Nội' },
  { area: 'other', address: 'Thị trấn Liên Quan, Thạch Thất, Hà Nội' },
];

const OPENING_HOURS = ['06:00–22:00', '07:00–14:00', '10:00–23:00', '16:00–02:00', '06:30–21:30', null];
const TAGS = ['student_price', 'group_friendly', 'late_night', 'seating', 'takeaway'];

const COMMENTS = {
  5: [
    'Đồ ăn ngon, nóng hổi, nhân viên nhiệt tình. Lần sau sẽ quay lại cùng bạn bè.',
    'Giá sinh viên mà phần ăn rất đầy đặn, nước dùng đậm đà. Rất đáng thử!',
    'Quán sạch sẽ, lên món nhanh, vị vừa miệng. Mình chấm 5 sao không cần nghĩ.',
  ],
  4: [
    'Ngon, giá ổn. Chỉ hơi đông vào giờ trưa nên phải đợi khoảng 10 phút.',
    'Món ăn vừa miệng, chỗ ngồi thoáng. Giá nhỉnh hơn mấy quán xung quanh một chút.',
    'Nhìn chung ổn, phục vụ nhanh. Nước chấm hơi ngọt so với khẩu vị của mình.',
  ],
  3: [
    'Bình thường, không có gì đặc biệt nhưng ăn được. Hợp khi cần ăn nhanh.',
    'Vị tạm ổn, phần ăn hơi ít so với giá. Chỗ để xe hơi chật.',
  ],
  2: ['Hôm mình đến món ra khá nguội, phải nhắc mới được hâm lại. Hơi thất vọng.'],
  1: ['Đợi gần 40 phút mới có món, lại còn bị nhầm đơn. Không quay lại nữa.'],
};

const SPAM_COMMENTS = [
  'Inbox mình để nhận mã giảm giá 50% toàn bộ cửa hàng nhé, số lượng có hạn!!!',
  'Truy cập trang web của mình để kiếm tiền online mỗi ngày, uy tín 100%.',
];

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function roundToThousand(value) {
  return Math.max(1000, Math.round(value / 1000) * 1000);
}

async function hasSampleData(conn) {
  const [rows] = await conn.query(
    'SELECT EXISTS (SELECT 1 FROM restaurants WHERE name LIKE ?) OR EXISTS (SELECT 1 FROM users WHERE email LIKE ?) AS found',
    [`${SAMPLE_PREFIX}%`, `%@${SAMPLE_EMAIL_DOMAIN}`],
  );
  return Boolean(rows[0].found);
}

/** Xóa quán mẫu và người dùng mẫu. Review, thực đơn, báo cáo liên quan bị xóa theo CASCADE. */
async function removeSampleData(conn) {
  // Dữ liệu mẫu không có ảnh quán hay ảnh review nên không cần xóa file.
  const [restaurants] = await conn.query('DELETE FROM restaurants WHERE name LIKE ?', [`${SAMPLE_PREFIX}%`]);
  const [users] = await conn.query('DELETE FROM users WHERE email LIKE ?', [`%@${SAMPLE_EMAIL_DOMAIN}`]);
  return { restaurants: restaurants.affectedRows, users: users.affectedRows };
}

async function createUsers(conn, now) {
  const passwordHash = await hashPassword(SAMPLE_PASSWORD);
  const users = [];
  for (const sample of SAMPLE_USERS) {
    const blockedUntil = sample.blockedDays ? new Date(now.getTime() + sample.blockedDays * DAY_MS) : null;
    const blockReason = sample.blockedDays ? 'Spam review quảng cáo (dữ liệu mẫu)' : null;
    const [result] = await conn.query(
      `INSERT INTO users (email, password_hash, display_name, email_verified_at, blocked_until, block_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `${sample.key}@${SAMPLE_EMAIL_DOMAIN}`,
        passwordHash,
        sample.name,
        sample.unverified ? null : now,
        blockedUntil,
        blockReason,
        new Date(now.getTime() - 200 * DAY_MS),
      ],
    );
    if (sample.blockedDays) {
      await conn.query(
        "INSERT INTO user_blocks (user_id, admin_id, action, duration_days, reason) VALUES (?, NULL, 'block', ?, ?)",
        [result.insertId, sample.blockedDays, blockReason],
      );
    }
    users.push({ id: result.insertId, ...sample });
  }
  return users;
}

async function createRestaurants(conn, foods, random) {
  const restaurants = [];
  let menuItems = 0;
  for (let index = 0; index < RESTAURANT_COUNT; index += 1) {
    const location = AREAS[index % AREAS.length];
    const menu = random
      .shuffle(foods)
      .slice(0, random.int(4, 8))
      .map((food, position) => ({
        foodId: food.id,
        // Giá tại quán lệch ±15% so với giá tham khảo; vài món dùng luôn giá tham khảo (NULL).
        price: random.next() < 0.2 ? null : roundToThousand(food.reference_price * (0.85 + random.next() * 0.3)),
        referencePrice: food.reference_price,
        featured: position < 2,
        sortOrder: position,
      }));
    const prices = menu.map((item) => item.price ?? item.referencePrice);
    const tags = random.shuffle(TAGS).slice(0, random.int(1, 3));

    const [result] = await conn.query(
      `INSERT INTO restaurants (name, area, address, google_maps_url, phone, opening_hours, price_min, price_max, tags, description)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      [
        `${SAMPLE_PREFIX}${RESTAURANT_NAMES[index]}`,
        location.area,
        `Số ${random.int(1, 199)}, ${location.address}`,
        random.next() < 0.8 ? `09${String(random.int(0, 99_999_999)).padStart(8, '0')}` : null,
        random.pick(OPENING_HOURS),
        Math.min(...prices),
        Math.max(...prices),
        tags.join(','),
        'Quán mẫu để thử ứng dụng, không phải quán thật.',
      ],
    );
    await conn.query('INSERT INTO restaurant_foods (restaurant_id, food_id, price, is_featured, sort_order) VALUES ?', [
      menu.map((item) => [result.insertId, item.foodId, item.price, item.featured, item.sortOrder]),
    ]);
    menuItems += menu.length;
    restaurants.push({ id: result.insertId, menu });
  }
  return { restaurants, menuItems };
}

const REVIEW_STATUSES = [
  'published',
  'published',
  'published',
  'published',
  'published',
  'pending',
  'pending',
  'rejected',
  'hidden',
];

function ratingFor(random) {
  const roll = random.next();
  if (roll < 0.4) return 5;
  if (roll < 0.75) return 4;
  if (roll < 0.9) return 3;
  if (roll < 0.96) return 2;
  return 1;
}

async function insertReview(conn, review) {
  const [result] = await conn.query(
    `INSERT INTO reviews (restaurant_id, user_id, food_id, rating, comment, amount_spent, visit_date, status,
                          reject_reason, moderation_note, moderated_at, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      review.restaurantId,
      review.userId,
      review.foodId,
      review.rating,
      review.comment,
      review.amountSpent,
      review.visitDate,
      review.status,
      review.rejectReason ?? null,
      review.moderationNote ?? null,
      review.status === 'pending' ? null : review.moderatedAt,
      review.status === 'published' || review.status === 'hidden' ? review.moderatedAt : null,
      review.createdAt,
      review.createdAt,
    ],
  );
  return result.insertId;
}

async function createReviews(conn, { restaurants, users, random, now }) {
  const counts = { published: 0, pending: 0, rejected: 0, hidden: 0 };
  const active = users.filter((user) => !user.unverified && !user.blockedDays);
  const blocked = users.find((user) => user.blockedDays);
  const published = [];

  for (const restaurant of restaurants) {
    for (const user of random.shuffle(active).slice(0, random.int(0, active.length))) {
      const visit = new Date(now.getTime() - random.int(2, 300) * DAY_MS);
      const createdAt = new Date(visit.getTime() + random.int(0, 1) * DAY_MS + random.int(1, 20) * 3600_000);
      const item = random.pick(restaurant.menu);
      const rating = ratingFor(random);
      const status = random.pick(REVIEW_STATUSES);
      const review = {
        restaurantId: restaurant.id,
        userId: user.id,
        foodId: random.next() < 0.8 ? item.foodId : null,
        rating,
        comment: random.pick(COMMENTS[rating]),
        amountSpent:
          random.next() < 0.7 ? roundToThousand((item.price ?? item.referencePrice) * random.int(1, 2)) : null,
        visitDate: toDateString(visit),
        status,
        rejectReason: status === 'rejected' ? 'irrelevant' : null,
        moderationNote:
          status === 'rejected'
            ? 'Nội dung chưa nói về quán (dữ liệu mẫu)'
            : status === 'hidden'
              ? 'Bị ẩn sau báo cáo (dữ liệu mẫu)'
              : null,
        moderatedAt: new Date(createdAt.getTime() + 6 * 3600_000),
        createdAt,
      };
      const id = await insertReview(conn, review);
      counts[status] += 1;
      if (status === 'published') {
        published.push({ id, authorId: user.id });
      }
    }
  }

  // Người dùng bị khóa: review spam đã bị từ chối.
  for (const restaurant of restaurants.slice(0, 3)) {
    const createdAt = new Date(now.getTime() - random.int(8, 20) * DAY_MS);
    await insertReview(conn, {
      restaurantId: restaurant.id,
      userId: blocked.id,
      foodId: null,
      rating: 5,
      comment: random.pick(SPAM_COMMENTS),
      amountSpent: null,
      visitDate: toDateString(createdAt),
      status: 'rejected',
      rejectReason: 'spam',
      moderationNote: 'Quảng cáo (dữ liệu mẫu)',
      moderatedAt: new Date(createdAt.getTime() + 3600_000),
      createdAt,
    });
    counts.rejected += 1;
  }
  return { counts, published, active };
}

async function createReports(conn, { published, active, random }) {
  let reports = 0;
  for (const review of random.shuffle(published).slice(0, 4)) {
    const reporters = active.filter((user) => user.id !== review.authorId).slice(0, random.int(1, 3));
    for (const reporter of reporters) {
      await conn.query('INSERT INTO review_reports (review_id, reporter_id, reason, details) VALUES (?, ?, ?, ?)', [
        review.id,
        reporter.id,
        random.pick(['misleading', 'offensive', 'other']),
        'Báo cáo mẫu để thử trang xử lý báo cáo.',
      ]);
      reports += 1;
    }
  }
  return reports;
}

/**
 * Nhập món cũ (nếu chưa có) rồi tạo quán, người dùng, review, báo cáo mẫu.
 * Không làm gì thêm nếu đã có dữ liệu mẫu, trừ khi reset = true.
 */
async function seedDevData({ pool, storage, reset = false, seed = 20261106, now = new Date(), onFoodProgress }) {
  const foodsResult = await importLegacyFoods({ pool, storage, onProgress: onFoodProgress });

  return withTransaction(async (conn) => {
    let removed = null;
    if (await hasSampleData(conn)) {
      if (!reset) {
        return { foods: foodsResult, skipped: true };
      }
      removed = await removeSampleData(conn);
    }

    const [foods] = await conn.query("SELECT id, reference_price FROM foods WHERE status = 'active' ORDER BY id");
    if (foods.length < 8) {
      throw new Error('Cần ít nhất 8 món đang hoạt động để tạo thực đơn quán mẫu.');
    }
    const random = createRandom(seed);
    const users = await createUsers(conn, now);
    const { restaurants, menuItems } = await createRestaurants(conn, foods, random);
    const { counts, published, active } = await createReviews(conn, { restaurants, users, random, now });
    const reports = await createReports(conn, { published, active, random });
    await recalculateAllRatings(conn);
    await bumpCatalogVersion(conn);

    return {
      foods: foodsResult,
      skipped: false,
      removed,
      created: { restaurants: restaurants.length, menuItems, users: users.length, reviews: counts, reports },
    };
  });
}

module.exports = { seedDevData, removeSampleData, createRandom, SAMPLE_PREFIX, SAMPLE_EMAIL_DOMAIN, SAMPLE_PASSWORD };
