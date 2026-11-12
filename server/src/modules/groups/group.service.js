'use strict';

const crypto = require('node:crypto');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { uploadUrl } = require('../dto');

// requirements-mo-rong.md FR-G01, FR-G02, mục 7 (đã chốt 13/11/2026).
const MAX_MEMBERS = 10;
const ROOM_TTL_HOURS = 24;
// Bỏ ký tự dễ nhầm (0/O, 1/I/L). 31^8 ≈ 8,5·10^11 mã; join còn bị giới hạn tần suất.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const ACTIVE_PHASES = ['selecting', 'voting', 'finished'];

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function roomNotFound() {
  return AppError.notFound('ROOM_NOT_FOUND', 'Không tìm thấy phòng hoặc phòng đã kết thúc');
}

function phaseChanged(message = 'Phòng đã chuyển sang bước khác, hãy tải lại') {
  return AppError.conflict('ROOM_PHASE_CHANGED', message);
}

const ROOM_SELECT = `
  SELECT g.*, c.slug AS category_slug, c.name AS category_name, c.uses_meal_periods,
         u.display_name AS owner_name
    FROM group_rooms g
    JOIN users u ON u.id = g.owner_id
    LEFT JOIN food_categories c ON c.id = g.category_id`;

/** Đóng phòng hết hạn (gọi khi truy cập, không cần cron). */
async function expireIfNeeded(conn, room) {
  if (room.phase !== 'closed' && new Date(room.expires_at) <= new Date()) {
    await conn.query(
      `UPDATE group_rooms SET phase = 'closed', closed_reason = 'expired', ended_at = UTC_TIMESTAMP(),
              version = version + 1 WHERE id = ? AND phase <> 'closed'`,
      [room.id],
    );
    const [[fresh]] = await conn.query(`${ROOM_SELECT} WHERE g.id = ?`, [room.id]);
    return fresh;
  }
  return room;
}

/** Phòng mà user là thành viên; `forUpdate` khóa dòng phòng để tuần tự hóa thao tác ghi. */
async function loadMemberRoom(conn, roomId, userId, { forUpdate = false } = {}) {
  const [[room]] = await conn.query(`${ROOM_SELECT} WHERE g.id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [roomId]);
  if (!room) {
    throw roomNotFound();
  }
  const [[member]] = await conn.query('SELECT 1 AS ok FROM group_room_members WHERE room_id = ? AND user_id = ?', [
    roomId,
    userId,
  ]);
  if (!member) {
    throw roomNotFound();
  }
  return expireIfNeeded(conn, room);
}

function assertOwner(room, userId) {
  if (room.owner_id !== userId) {
    throw AppError.forbidden('Chỉ chủ phòng được thực hiện thao tác này');
  }
}

function assertPhase(room, ...phases) {
  if (room.phase === 'closed') {
    throw AppError.conflict('ROOM_CLOSED', 'Phòng đã kết thúc');
  }
  if (!phases.includes(room.phase)) {
    throw phaseChanged();
  }
}

async function bumpVersion(conn, roomId) {
  await conn.query('UPDATE group_rooms SET version = version + 1 WHERE id = ?', [roomId]);
}

/** Món khớp bộ lọc của phòng (món và nhóm còn active). */
async function filteredFoods(conn, room) {
  const where = ["f.status = 'active'", "c.status = 'active'"];
  const params = [];
  if (room.category_id != null) {
    where.push('f.category_id = ?');
    params.push(room.category_id);
  }
  if (room.meal_period != null) {
    // Bữa chỉ áp dụng cho nhóm dùng bữa ăn (giống app quay một mình).
    where.push(
      '(c.uses_meal_periods = FALSE OR EXISTS (SELECT 1 FROM food_meal_periods m WHERE m.food_id = f.id AND m.meal_period = ?))',
    );
    params.push(room.meal_period);
  }
  if (room.max_price != null) {
    where.push('f.reference_price <= ?');
    params.push(room.max_price);
  }
  const [rows] = await conn.query(
    `SELECT f.id, f.name, f.reference_price, f.thumb_path FROM foods f JOIN food_categories c ON c.id = f.category_id
      WHERE ${where.join(' AND ')} ORDER BY f.name, f.id`,
    params,
  );
  return rows;
}

async function loadMarks(conn, roomId) {
  const [rows] = await conn.query(
    `SELECT mk.user_id, mk.food_id, mk.mark FROM group_room_marks mk
       JOIN group_room_members gm ON gm.room_id = mk.room_id AND gm.user_id = mk.user_id
      WHERE mk.room_id = ?`,
    [roomId],
  );
  return rows;
}

/**
 * Quy tắc ứng viên (mục 7): một người loại là món bị loại. Nếu có món được chọn
 * thì ứng viên = các món được chọn không bị loại; nếu không ai chọn thì ứng viên
 * = mọi món khớp bộ lọc không bị loại.
 */
function computeCandidates(foods, marks) {
  const excluded = new Set(marks.filter((m) => m.mark === 'exclude').map((m) => m.food_id));
  const picked = new Set(marks.filter((m) => m.mark === 'pick').map((m) => m.food_id));
  const open = foods.filter((food) => !excluded.has(food.id));
  const pickedOpen = open.filter((food) => picked.has(food.id));
  return pickedOpen.length > 0 ? pickedOpen : open;
}

/** Trạng thái đầy đủ của phòng cho một thành viên. */
async function buildState(conn, room, userId) {
  const [members] = await conn.query(
    `SELECT gm.user_id, u.display_name, gm.joined_at,
            EXISTS (SELECT 1 FROM group_room_votes v WHERE v.room_id = gm.room_id AND v.user_id = gm.user_id) AS voted
       FROM group_room_members gm JOIN users u ON u.id = gm.user_id
      WHERE gm.room_id = ? ORDER BY gm.joined_at, gm.user_id`,
    [room.id],
  );
  const state = {
    id: room.id,
    code: room.code,
    phase: room.phase,
    mode: room.decision_mode,
    version: room.version,
    expiresAt: room.expires_at,
    closedReason: room.closed_reason,
    isOwner: room.owner_id === userId,
    owner: { id: room.owner_id, displayName: room.owner_name },
    maxMembers: MAX_MEMBERS,
    filters: {
      categorySlug: room.category_slug ?? null,
      categoryName: room.category_name ?? null,
      mealPeriod: room.meal_period,
      maxPrice: room.max_price,
    },
    members: members.map((m) => ({
      id: m.user_id,
      displayName: m.display_name,
      isOwner: m.user_id === room.owner_id,
      hasVoted: Boolean(m.voted),
    })),
    foods: [],
    candidates: [],
    myVote: null,
    result: null,
  };

  if (room.phase === 'selecting') {
    const foods = await filteredFoods(conn, room);
    const marks = await loadMarks(conn, room.id);
    const candidateIds = new Set(computeCandidates(foods, marks).map((food) => food.id));
    state.foods = foods.map((food) => {
      const own = marks.filter((m) => m.food_id === food.id);
      return {
        id: food.id,
        name: food.name,
        referencePrice: food.reference_price,
        thumbUrl: uploadUrl(food.thumb_path),
        picks: own.filter((m) => m.mark === 'pick').length,
        excludes: own.filter((m) => m.mark === 'exclude').length,
        myMark: own.find((m) => m.user_id === userId)?.mark ?? null,
        isCandidate: candidateIds.has(food.id),
      };
    });
    state.candidates = state.foods
      .filter((food) => food.isCandidate)
      .map((food) => ({
        id: food.id,
        name: food.name,
        referencePrice: food.referencePrice,
        votes: 0,
      }));
  } else if (room.phase === 'voting') {
    const [candidates] = await conn.query(
      `SELECT gc.food_id, gc.food_name, gc.reference_price,
              (SELECT COUNT(*) FROM group_room_votes v WHERE v.room_id = gc.room_id AND v.food_id = gc.food_id) AS votes
         FROM group_room_candidates gc WHERE gc.room_id = ? ORDER BY gc.food_name, gc.food_id`,
      [room.id],
    );
    state.candidates = candidates.map((c) => ({
      id: c.food_id,
      name: c.food_name,
      referencePrice: c.reference_price,
      votes: Number(c.votes),
    }));
    const [[vote]] = await conn.query('SELECT food_id FROM group_room_votes WHERE room_id = ? AND user_id = ?', [
      room.id,
      userId,
    ]);
    state.myVote = vote?.food_id ?? null;
  }

  if (room.result_food_name) {
    const [[food]] = room.result_food_id
      ? await conn.query(
          `SELECT f.id, f.reference_price, f.thumb_path FROM foods f JOIN food_categories c ON c.id = f.category_id
            WHERE f.id = ? AND f.status = 'active' AND c.status = 'active'`,
          [room.result_food_id],
        )
      : [[]];
    state.result = {
      // id chỉ có khi món còn công khai, để app không mở món đã bị ẩn/xóa.
      foodId: food?.id ?? null,
      name: room.result_food_name,
      referencePrice: food?.reference_price ?? null,
      thumbUrl: food ? uploadUrl(food.thumb_path) : null,
      method: room.result_method,
      votes: room.result_votes,
    };
  }
  return state;
}

async function stateFor(roomId, userId) {
  const pool = getPool();
  const room = await loadMemberRoom(pool, roomId, userId);
  return buildState(pool, room, userId);
}

/** Phòng đang hoạt động (chưa đóng, chưa hết hạn) của user, nếu có. */
async function findActiveRoomId(conn, userId) {
  const [[row]] = await conn.query(
    `SELECT g.id FROM group_room_members gm JOIN group_rooms g ON g.id = gm.room_id
      WHERE gm.user_id = ? AND g.phase IN (?) AND g.expires_at > UTC_TIMESTAMP()
      ORDER BY gm.joined_at DESC LIMIT 1`,
    [userId, ACTIVE_PHASES],
  );
  return row?.id ?? null;
}

async function assertNotInOtherRoom(conn, userId, exceptRoomId = null) {
  const activeId = await findActiveRoomId(conn, userId);
  if (activeId != null && activeId !== exceptRoomId) {
    throw AppError.conflict('ALREADY_IN_ROOM', 'Bạn đang ở một phòng khác, hãy rời phòng đó trước', {
      roomId: activeId,
    });
  }
}

/** categorySlug → id (nhóm phải active). */
async function resolveFilters(conn, { categorySlug, mealPeriod, maxPrice }) {
  let categoryId = null;
  if (categorySlug) {
    const [[category]] = await conn.query("SELECT id FROM food_categories WHERE slug = ? AND status = 'active'", [
      categorySlug,
    ]);
    if (!category) {
      throw AppError.validation({ categorySlug: 'Nhóm món không tồn tại' });
    }
    categoryId = category.id;
  }
  return { categoryId, mealPeriod: mealPeriod ?? null, maxPrice: maxPrice ?? null };
}

async function getCurrentRoom(userId) {
  const pool = getPool();
  const roomId = await findActiveRoomId(pool, userId);
  return roomId == null ? null : stateFor(roomId, userId);
}

/** GET trạng thái; trả { changed: false } nếu version không đổi (polling). */
async function getRoomState(roomId, userId, knownVersion) {
  const pool = getPool();
  const room = await loadMemberRoom(pool, roomId, userId);
  if (knownVersion != null && knownVersion === room.version) {
    return { changed: false, version: room.version };
  }
  return buildState(pool, room, userId);
}

/** FR-G01: tạo phòng, người tạo là chủ phòng và thành viên đầu tiên. */
async function createRoom(user, body) {
  const roomId = await withTransaction(async (conn) => {
    // Khóa dòng user để hai request tạo/tham gia song song không vượt "một phòng / người".
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [user.id]);
    await assertNotInOtherRoom(conn, user.id);
    const filters = await resolveFilters(conn, body);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const [result] = await conn.query(
          `INSERT INTO group_rooms (code, owner_id, category_id, meal_period, max_price, expires_at)
           VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? HOUR)`,
          [generateCode(), user.id, filters.categoryId, filters.mealPeriod, filters.maxPrice, ROOM_TTL_HOURS],
        );
        await conn.query('INSERT INTO group_room_members (room_id, user_id) VALUES (?, ?)', [result.insertId, user.id]);
        return result.insertId;
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') {
          throw error;
        }
      }
    }
    throw new Error('Không sinh được mã phòng không trùng');
  });
  return stateFor(roomId, user.id);
}

/** FR-G01: tham gia bằng mã mời. Mã sai, phòng đóng hoặc đã có kết quả đều trả ROOM_NOT_FOUND. */
async function joinRoom(user, code) {
  const roomId = await withTransaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [user.id]);
    const [[room]] = await conn.query(`${ROOM_SELECT} WHERE g.code = ? FOR UPDATE`, [code]);
    if (!room) {
      throw roomNotFound();
    }
    const current = await expireIfNeeded(conn, room);
    const [[member]] = await conn.query('SELECT 1 AS ok FROM group_room_members WHERE room_id = ? AND user_id = ?', [
      room.id,
      user.id,
    ]);
    if (member && current.phase !== 'closed') {
      return room.id;
    }
    if (!['selecting', 'voting'].includes(current.phase)) {
      throw roomNotFound();
    }
    await assertNotInOtherRoom(conn, user.id);
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM group_room_members WHERE room_id = ?', [room.id]);
    if (n >= MAX_MEMBERS) {
      throw AppError.conflict('ROOM_FULL', `Phòng đã đủ ${MAX_MEMBERS} người`);
    }
    await conn.query('INSERT INTO group_room_members (room_id, user_id) VALUES (?, ?)', [room.id, user.id]);
    await bumpVersion(conn, room.id);
    return room.id;
  });
  return stateFor(roomId, user.id);
}

/** Chạy thao tác ghi trong transaction đã khóa phòng, rồi trả trạng thái mới. */
async function mutate(roomId, userId, fn) {
  await withTransaction(async (conn) => {
    const room = await loadMemberRoom(conn, roomId, userId, { forUpdate: true });
    const changed = await fn(conn, room);
    if (changed !== false) {
      await bumpVersion(conn, roomId);
    }
  });
  return stateFor(roomId, userId);
}

function updateFilters(roomId, user, body) {
  return mutate(roomId, user.id, async (conn, room) => {
    assertOwner(room, user.id);
    assertPhase(room, 'selecting');
    const filters = await resolveFilters(conn, body);
    await conn.query('UPDATE group_rooms SET category_id = ?, meal_period = ?, max_price = ? WHERE id = ?', [
      filters.categoryId,
      filters.mealPeriod,
      filters.maxPrice,
      roomId,
    ]);
  });
}

/** FR-G02: chọn/loại/bỏ đánh dấu một món, chỉ trong bước chọn. */
function setMark(roomId, user, foodId, mark) {
  return mutate(roomId, user.id, async (conn, room) => {
    assertPhase(room, 'selecting');
    if (mark === 'none') {
      await conn.query('DELETE FROM group_room_marks WHERE room_id = ? AND user_id = ? AND food_id = ?', [
        roomId,
        user.id,
        foodId,
      ]);
      return;
    }
    const foods = await filteredFoods(conn, room);
    if (!foods.some((food) => food.id === foodId)) {
      throw AppError.validation({ foodId: 'Món không thuộc bộ lọc của phòng' });
    }
    await conn.query(
      `INSERT INTO group_room_marks (room_id, user_id, food_id, mark) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE mark = VALUES(mark)`,
      [roomId, user.id, foodId, mark],
    );
  });
}

function pickRandom(list) {
  return list[crypto.randomInt(list.length)];
}

async function finish(conn, roomId, food, method, votes) {
  await conn.query(
    `UPDATE group_rooms SET phase = 'finished', result_food_id = ?, result_food_name = ?, result_method = ?,
            result_votes = ?, ended_at = UTC_TIMESTAMP() WHERE id = ?`,
    [food.id, food.name, method, votes, roomId],
  );
}

/** FR-G02: chủ phòng bắt đầu bỏ phiếu hoặc quay. Quay chốt kết quả ngay trên server. */
function startDecision(roomId, user, mode) {
  return mutate(roomId, user.id, async (conn, room) => {
    assertOwner(room, user.id);
    assertPhase(room, 'selecting');
    const candidates = computeCandidates(await filteredFoods(conn, room), await loadMarks(conn, roomId));
    if (candidates.length === 0) {
      throw AppError.conflict(
        'NO_CANDIDATES',
        'Không còn món ứng viên nào. Hãy bỏ bớt món bị loại hoặc đổi bộ lọc rồi thử lại.',
      );
    }
    await conn.query('UPDATE group_rooms SET decision_mode = ? WHERE id = ?', [mode, roomId]);
    if (mode === 'spin') {
      await finish(conn, roomId, pickRandom(candidates), 'spin', null);
      return;
    }
    await conn.query('DELETE FROM group_room_candidates WHERE room_id = ?', [roomId]);
    await conn.query('INSERT INTO group_room_candidates (room_id, food_id, food_name, reference_price) VALUES ?', [
      candidates.map((food) => [roomId, food.id, food.name, food.reference_price]),
    ]);
    await conn.query("UPDATE group_rooms SET phase = 'voting' WHERE id = ?", [roomId]);
  });
}

/** Mỗi thành viên một phiếu, đổi được trước khi chốt. */
function castVote(roomId, user, foodId) {
  return mutate(roomId, user.id, async (conn, room) => {
    assertPhase(room, 'voting');
    const [[candidate]] = await conn.query(
      'SELECT 1 AS ok FROM group_room_candidates WHERE room_id = ? AND food_id = ?',
      [roomId, foodId],
    );
    if (!candidate) {
      throw AppError.validation({ foodId: 'Món này không phải ứng viên' });
    }
    await conn.query(
      `INSERT INTO group_room_votes (room_id, user_id, food_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE food_id = VALUES(food_id)`,
      [roomId, user.id, foodId],
    );
  });
}

/**
 * Chủ phòng chốt phiếu. Nhiều phiếu nhất thắng; hòa thì server quay ngẫu nhiên trong
 * các món hòa; người không bỏ phiếu bị bỏ qua; không có phiếu nào thì không chốt.
 * Dòng phòng bị khóa FOR UPDATE nên hai request chốt đồng thời chỉ một request thành công.
 */
function finalizeVote(roomId, user) {
  return mutate(roomId, user.id, async (conn, room) => {
    assertOwner(room, user.id);
    assertPhase(room, 'voting');
    const [tally] = await conn.query(
      `SELECT gc.food_id AS id, gc.food_name AS name, COUNT(v.user_id) AS votes
         FROM group_room_candidates gc
         JOIN group_room_votes v ON v.room_id = gc.room_id AND v.food_id = gc.food_id
         JOIN group_room_members gm ON gm.room_id = v.room_id AND gm.user_id = v.user_id
        WHERE gc.room_id = ? GROUP BY gc.food_id, gc.food_name`,
      [roomId],
    );
    if (tally.length === 0) {
      throw AppError.conflict('NO_VOTES', 'Chưa có ai bỏ phiếu');
    }
    const top = Math.max(...tally.map((row) => Number(row.votes)));
    const leaders = tally.filter((row) => Number(row.votes) === top);
    await finish(conn, roomId, pickRandom(leaders), leaders.length > 1 ? 'tie_spin' : 'vote', top);
  });
}

/** Quay về bước chọn món (khi bỏ phiếu chưa chốt). Xóa phiếu và ứng viên. */
function backToSelecting(roomId, user) {
  return mutate(roomId, user.id, async (conn, room) => {
    assertOwner(room, user.id);
    assertPhase(room, 'voting');
    await conn.query('DELETE FROM group_room_votes WHERE room_id = ?', [roomId]);
    await conn.query('DELETE FROM group_room_candidates WHERE room_id = ?', [roomId]);
    await conn.query("UPDATE group_rooms SET phase = 'selecting', decision_mode = NULL WHERE id = ?", [roomId]);
  });
}

async function closeRoomTx(conn, roomId, reason) {
  await conn.query(
    `UPDATE group_rooms SET phase = 'closed', closed_reason = ?, ended_at = COALESCE(ended_at, UTC_TIMESTAMP()),
            version = version + 1 WHERE id = ? AND phase <> 'closed'`,
    [reason, roomId],
  );
}

function closeRoom(roomId, user) {
  return mutate(roomId, user.id, async (conn, room) => {
    assertOwner(room, user.id);
    if (room.phase === 'closed') {
      return false;
    }
    await closeRoomTx(conn, roomId, 'owner_closed');
    return false;
  });
}

/** Rời phòng. Chủ rời thì phòng kết thúc cho mọi người (FR-G01). */
async function leaveRoom(roomId, user) {
  await withTransaction(async (conn) => {
    const room = await loadMemberRoom(conn, roomId, user.id, { forUpdate: true });
    if (room.owner_id === user.id && room.phase !== 'closed') {
      await closeRoomTx(conn, roomId, 'owner_left');
    }
    await conn.query('DELETE FROM group_room_marks WHERE room_id = ? AND user_id = ?', [roomId, user.id]);
    if (room.phase === 'voting') {
      await conn.query('DELETE FROM group_room_votes WHERE room_id = ? AND user_id = ?', [roomId, user.id]);
    }
    await conn.query('DELETE FROM group_room_members WHERE room_id = ? AND user_id = ?', [roomId, user.id]);
    if (room.owner_id !== user.id) {
      await bumpVersion(conn, roomId);
    }
  });
}

module.exports = {
  MAX_MEMBERS,
  CODE_ALPHABET,
  CODE_LENGTH,
  computeCandidates,
  closeRoomTx,
  getCurrentRoom,
  getRoomState,
  createRoom,
  joinRoom,
  updateFilters,
  setMark,
  startDecision,
  castVote,
  finalizeVote,
  backToSelecting,
  closeRoom,
  leaveRoom,
};
