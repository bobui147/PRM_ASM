'use strict';

const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { processImage } = require('../../services/image');
const { getStorage } = require('../../services/storage');
const { recalculateRestaurantRating } = require('../../services/rating');
const { pageResult } = require('../../utils/http');
const { uploadUrl, REJECT_REASON_LABELS } = require('../dto');

// requirements FR-R02, FR-R06.
const MAX_IMAGES = 3;
const MAX_NEW_REVIEWS_PER_DAY = 5;

const REVIEW_SELECT = `
  SELECT rv.id, rv.restaurant_id, rv.user_id, rv.food_id, rv.rating, rv.comment, rv.amount_spent,
         DATE_FORMAT(rv.visit_date, '%Y-%m-%d') AS visit_date, rv.status, rv.reject_reason, rv.moderation_note,
         rv.published_at, rv.edited_after_publish, rv.created_at, rv.updated_at,
         u.display_name AS author_name, f.name AS food_name
    FROM reviews rv
    JOIN users u ON u.id = rv.user_id
    LEFT JOIN foods f ON f.id = rv.food_id`;

async function loadImages(conn, reviewIds) {
  if (reviewIds.length === 0) {
    return new Map();
  }
  const [rows] = await conn.query(
    'SELECT id, review_id, image_path, thumb_path, width, height FROM review_images WHERE review_id IN (?) ORDER BY sort_order, id',
    [reviewIds],
  );
  const byReview = new Map();
  for (const row of rows) {
    const list = byReview.get(row.review_id) ?? [];
    list.push({
      id: row.id,
      url: uploadUrl(row.image_path),
      thumbUrl: uploadUrl(row.thumb_path),
      width: row.width,
      height: row.height,
    });
    byReview.set(row.review_id, list);
  }
  return byReview;
}

function toReviewDto(row, images, { includeModeration = false } = {}) {
  const dto = {
    id: row.id,
    restaurantId: row.restaurant_id,
    author: { id: row.user_id, displayName: row.author_name },
    rating: row.rating,
    comment: row.comment,
    food: row.food_id ? { id: row.food_id, name: row.food_name } : null,
    amountSpent: row.amount_spent,
    visitDate: row.visit_date,
    images: images ?? [],
    createdAt: row.published_at ?? row.created_at,
    edited: Boolean(row.edited_after_publish),
  };
  if (includeModeration) {
    dto.status = row.status;
    dto.rejectReason = row.reject_reason;
    dto.rejectReasonLabel = row.reject_reason ? REJECT_REASON_LABELS[row.reject_reason] : null;
    dto.moderationNote = row.moderation_note;
    dto.submittedAt = row.created_at;
    dto.updatedAt = row.updated_at;
  }
  return dto;
}

async function withImages(conn, rows, options) {
  const images = await loadImages(
    conn,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toReviewDto(row, images.get(row.id), options));
}

async function findReviewForOwner(conn, reviewId, userId, { forUpdate = false } = {}) {
  const [[row]] = await conn.query(`${REVIEW_SELECT} WHERE rv.id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [reviewId]);
  if (!row) {
    throw AppError.notFound('REVIEW_NOT_FOUND', 'Không tìm thấy review');
  }
  if (row.user_id !== userId) {
    throw AppError.forbidden('Bạn chỉ được sửa hoặc xóa review của chính mình');
  }
  return row;
}

/** Review đầy đủ (kèm trạng thái) để trả cho chính tác giả. */
async function getOwnReview(conn, reviewId) {
  const [[row]] = await conn.query(`${REVIEW_SELECT} WHERE rv.id = ?`, [reviewId]);
  const [dto] = await withImages(conn, [row], { includeModeration: true });
  return dto;
}

const SORTS = {
  newest: 'COALESCE(rv.published_at, rv.created_at) DESC, rv.id DESC',
  highest: 'rv.rating DESC, rv.id DESC',
  lowest: 'rv.rating ASC, rv.id DESC',
};

/** FR-P04: review published của quán, kèm myReview nếu có người dùng. */
async function listRestaurantReviews(restaurantId, { sort, withImages: onlyWithImages, page, limit }, user) {
  const pool = getPool();
  const where = ['rv.restaurant_id = ?', "rv.status = 'published'"];
  if (onlyWithImages) {
    where.push('EXISTS (SELECT 1 FROM review_images ri WHERE ri.review_id = rv.id)');
  }
  const whereSql = where.join(' AND ');
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM reviews rv WHERE ${whereSql}`, [restaurantId]);
  const [rows] = await pool.query(`${REVIEW_SELECT} WHERE ${whereSql} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`, [
    restaurantId,
    limit,
    (page - 1) * limit,
  ]);
  const result = pageResult(await withImages(pool, rows), { page, limit }, total);
  if (user) {
    const [[mine]] = await pool.query(`${REVIEW_SELECT} WHERE rv.restaurant_id = ? AND rv.user_id = ?`, [
      restaurantId,
      user.id,
    ]);
    result.myReview = mine ? (await withImages(pool, [mine], { includeModeration: true }))[0] : null;
  }
  return result;
}

async function listMyReviews(userId, { status, page, limit }) {
  const pool = getPool();
  const where = status ? 'rv.user_id = ? AND rv.status = ?' : 'rv.user_id = ?';
  const params = status ? [userId, status] : [userId];
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM reviews rv WHERE ${where}`, params);
  const [rows] = await pool.query(
    `${REVIEW_SELECT.replace('FROM reviews rv', ', r.name AS restaurant_name FROM reviews rv JOIN restaurants r ON r.id = rv.restaurant_id')}
      WHERE ${where} ORDER BY rv.updated_at DESC, rv.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  const items = await withImages(pool, rows, { includeModeration: true });
  items.forEach((item, index) => {
    item.restaurant = { id: rows[index].restaurant_id, name: rows[index].restaurant_name };
  });
  return pageResult(items, { page, limit }, total);
}

function tooManyImages() {
  return AppError.validation({ images: `Tối đa ${MAX_IMAGES} ảnh` });
}

async function assertActiveRestaurant(conn, restaurantId) {
  const [[row]] = await conn.query("SELECT id FROM restaurants WHERE id = ? AND status = 'active'", [restaurantId]);
  if (!row) {
    throw AppError.notFound('RESTAURANT_NOT_FOUND', 'Không tìm thấy quán');
  }
}

async function assertFoodInMenu(conn, restaurantId, foodId) {
  if (foodId == null) {
    return;
  }
  const [[row]] = await conn.query('SELECT 1 AS ok FROM restaurant_foods WHERE restaurant_id = ? AND food_id = ?', [
    restaurantId,
    foodId,
  ]);
  if (!row) {
    throw AppError.validation({ foodId: 'Món này không có trong thực đơn của quán' });
  }
}

/** Kiểm tra và chuyển ảnh sang WebP trước khi mở transaction (FR-R05). */
function processUploads(files) {
  return Promise.all(files.map((file) => processImage(file.path)));
}

/** Ghi ảnh vào reviews/{id} và bảng review_images; đường dẫn đã ghi được đẩy vào `written` để dọn khi lỗi. */
async function saveImages(conn, reviewId, processed, startOrder, written) {
  const storage = getStorage();
  for (const [index, image] of processed.entries()) {
    const saved = await storage.saveImagePair(`reviews/${reviewId}`, image);
    written.push(saved.imagePath, saved.thumbPath);
    await conn.query(
      'INSERT INTO review_images (review_id, image_path, thumb_path, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [reviewId, saved.imagePath, saved.thumbPath, saved.width, saved.height, startOrder + index],
    );
  }
}

/** FR-R02: viết review mới, trạng thái pending. */
async function createReview(restaurantId, user, body, files) {
  if (files.length > MAX_IMAGES) {
    throw tooManyImages();
  }
  const pool = getPool();
  await assertActiveRestaurant(pool, restaurantId);
  await assertFoodInMenu(pool, restaurantId, body.foodId);

  const [[existing]] = await pool.query('SELECT id FROM reviews WHERE restaurant_id = ? AND user_id = ?', [
    restaurantId,
    user.id,
  ]);
  if (existing) {
    throw AppError.conflict('REVIEW_EXISTS', 'Bạn đã viết review cho quán này', { reviewId: existing.id });
  }
  const [[recent]] = await pool.query(
    'SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM reviews WHERE user_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY',
    [user.id],
  );
  if (recent.n >= MAX_NEW_REVIEWS_PER_DAY) {
    const retry = (new Date(recent.oldest).getTime() + 24 * 3600_000 - Date.now()) / 1000;
    throw AppError.rateLimited(retry, 'RATE_LIMITED', 'Bạn đã viết tối đa 5 review trong 24 giờ, vui lòng thử lại sau');
  }

  const processed = await processUploads(files);
  const written = [];
  let reviewId;
  try {
    reviewId = await withTransaction(async (conn) => {
      let result;
      try {
        [result] = await conn.query(
          `INSERT INTO reviews (restaurant_id, user_id, food_id, rating, comment, amount_spent, visit_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [restaurantId, user.id, body.foodId, body.rating, body.comment, body.amountSpent, body.visitDate],
        );
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          throw AppError.conflict('REVIEW_EXISTS', 'Bạn đã viết review cho quán này');
        }
        throw error;
      }
      await saveImages(conn, result.insertId, processed, 0, written);
      return result.insertId;
    });
  } catch (error) {
    await getStorage().removeFiles(written);
    throw error;
  }
  return getOwnReview(pool, reviewId);
}

/** FR-R03: tác giả sửa review; review quay về pending. */
async function updateReview(reviewId, user, body, files) {
  const processed = await processUploads(files);
  const written = [];
  let removedPaths = [];
  try {
    await withTransaction(async (conn) => {
      const row = await findReviewForOwner(conn, reviewId, user.id, { forUpdate: true });
      if (row.status === 'hidden') {
        throw AppError.forbidden('Review đã bị ẩn nên không sửa được, bạn chỉ có thể xóa');
      }
      await assertFoodInMenu(conn, row.restaurant_id, body.foodId);

      const [images] = await conn.query('SELECT id, image_path, thumb_path FROM review_images WHERE review_id = ?', [
        reviewId,
      ]);
      const keep = new Set(body.keepImageIds);
      if ([...keep].some((id) => !images.some((image) => image.id === id))) {
        throw AppError.validation({ keepImageIds: 'Ảnh cần giữ không thuộc review này' });
      }
      if (keep.size + processed.length > MAX_IMAGES) {
        throw tooManyImages();
      }
      const removed = images.filter((image) => !keep.has(image.id));
      if (removed.length > 0) {
        await conn.query('DELETE FROM review_images WHERE id IN (?)', [removed.map((image) => image.id)]);
      }
      removedPaths = removed.flatMap((image) => [image.image_path, image.thumb_path]);

      await conn.query(
        `UPDATE reviews SET food_id = ?, rating = ?, comment = ?, amount_spent = ?, visit_date = ?, status = 'pending',
                reject_reason = NULL, moderation_note = NULL,
                edited_after_publish = edited_after_publish OR published_at IS NOT NULL
          WHERE id = ?`,
        [body.foodId, body.rating, body.comment, body.amountSpent, body.visitDate, reviewId],
      );
      await saveImages(conn, reviewId, processed, keep.size, written);
      if (row.status === 'published') {
        await recalculateRestaurantRating(conn, row.restaurant_id);
      }
    });
  } catch (error) {
    await getStorage().removeFiles(written);
    throw error;
  }
  await getStorage().removeFiles(removedPaths);
  return getOwnReview(getPool(), reviewId);
}

/** Xóa review kèm ảnh, tính lại điểm nếu đang published. ownerId = null khi admin xóa. */
async function deleteReviewById(reviewId, { ownerId = null } = {}) {
  await withTransaction(async (conn) => {
    let row;
    if (ownerId == null) {
      [[row]] = await conn.query('SELECT id, restaurant_id, status FROM reviews WHERE id = ? FOR UPDATE', [reviewId]);
      if (!row) {
        throw AppError.notFound('REVIEW_NOT_FOUND', 'Không tìm thấy review');
      }
    } else {
      row = await findReviewForOwner(conn, reviewId, ownerId, { forUpdate: true });
    }
    await conn.query('DELETE FROM reviews WHERE id = ?', [reviewId]);
    if (row.status === 'published') {
      await recalculateRestaurantRating(conn, row.restaurant_id);
    }
  });
  await getStorage().removeDir(`reviews/${reviewId}`);
}

/** FR-R07: báo cáo review published của người khác. */
async function reportReview(reviewId, user, { reason, details }) {
  const pool = getPool();
  const [[review]] = await pool.query('SELECT id, user_id, status FROM reviews WHERE id = ?', [reviewId]);
  if (!review || review.status !== 'published') {
    throw AppError.notFound('REVIEW_NOT_FOUND', 'Không tìm thấy review');
  }
  if (review.user_id === user.id) {
    throw new AppError(400, 'CANNOT_REPORT_OWN_REVIEW', 'Bạn không thể báo cáo review của chính mình');
  }
  const [[recent]] = await pool.query(
    'SELECT COUNT(*) AS n FROM review_reports WHERE reporter_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY',
    [user.id],
  );
  if (recent.n >= 10) {
    throw AppError.rateLimited(3600, 'RATE_LIMITED', 'Bạn đã gửi quá nhiều báo cáo hôm nay, vui lòng thử lại sau');
  }
  try {
    await pool.query('INSERT INTO review_reports (review_id, reporter_id, reason, details) VALUES (?, ?, ?, ?)', [
      reviewId,
      user.id,
      reason,
      details,
    ]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw AppError.conflict('ALREADY_REPORTED', 'Bạn đã báo cáo review này');
    }
    throw error;
  }
}

module.exports = {
  MAX_IMAGES,
  REVIEW_SELECT,
  listRestaurantReviews,
  listMyReviews,
  createReview,
  updateReview,
  deleteReviewById,
  reportReview,
  withImages,
};
