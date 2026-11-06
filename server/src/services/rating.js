'use strict';

// requirements FR-R08: điểm chỉ tính từ review published, làm tròn 1 chữ số.
// Giữ nguyên updated_at của quán vì đây không phải thao tác sửa quán của admin.
const RECALCULATE_SQL = `
  UPDATE restaurants r
  LEFT JOIN (
    SELECT restaurant_id, ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS published_count
      FROM reviews
     WHERE status = 'published' %FILTER%
     GROUP BY restaurant_id
  ) s ON s.restaurant_id = r.id
  SET r.rating_avg = s.avg_rating,
      r.review_count = COALESCE(s.published_count, 0),
      r.updated_at = r.updated_at
  %WHERE%`;

/**
 * Tính lại điểm của một quán. Gọi trong cùng transaction với thao tác làm
 * thay đổi tập review published (duyệt, ẩn, hiện, sửa, xóa).
 *
 * @param {import('mysql2/promise').PoolConnection | import('mysql2/promise').Pool} conn
 */
async function recalculateRestaurantRating(conn, restaurantId) {
  const sql = RECALCULATE_SQL.replace('%FILTER%', 'AND restaurant_id = ?').replace('%WHERE%', 'WHERE r.id = ?');
  await conn.query(sql, [restaurantId, restaurantId]);
}

/**
 * Tính lại điểm của mọi quán.
 * Trả về { processed: số quán, changed: số quán có điểm hoặc số review thay đổi }.
 */
async function recalculateAllRatings(conn) {
  const sql = RECALCULATE_SQL.replace('%FILTER%', '').replace('%WHERE%', '');
  const [result] = await conn.query(sql);
  // mysql2 bật CLIENT_FOUND_ROWS nên affectedRows là số dòng khớp, changedRows là số dòng thật sự đổi.
  return { processed: result.affectedRows, changed: result.changedRows };
}

module.exports = { recalculateRestaurantRating, recalculateAllRatings };
