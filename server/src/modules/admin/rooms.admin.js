'use strict';

const express = require('express');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { idParams } = require('../../utils/http');
const { logAdminAction } = require('../audit/audit.service');
const { closeRoomTx } = require('../groups/group.service');
const { paginate } = require('./helpers');

const PAGE_SIZE = 20;
const PHASE_LABELS = {
  selecting: 'Đang chọn món',
  voting: 'Đang bỏ phiếu',
  finished: 'Đã có kết quả',
  closed: 'Đã kết thúc',
};
const CLOSED_LABELS = {
  owner_closed: 'Chủ phòng kết thúc',
  owner_left: 'Chủ phòng rời',
  expired: 'Hết hạn',
  admin: 'Admin đóng',
};

/** Web admin: theo dõi và đóng phòng chọn món theo nhóm (P2). */
function createRoomsAdminRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const pool = getPool();
    const phase = Object.hasOwn(PHASE_LABELS, req.query.phase) ? req.query.phase : '';
    const where = phase ? 'WHERE g.phase = ?' : '';
    const params = phase ? [phase] : [];
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM group_rooms g ${where}`, params);
    const pager = paginate(total, Math.max(1, Number(req.query.page) || 1), PAGE_SIZE);
    const [items] = await pool.query(
      `SELECT g.id, g.code, g.phase, g.decision_mode, g.result_food_name, g.result_method, g.closed_reason,
              g.expires_at, g.created_at, g.owner_id, u.display_name AS owner_name, c.name AS category_name,
              g.max_price, (SELECT COUNT(*) FROM group_room_members gm WHERE gm.room_id = g.id) AS member_count
         FROM group_rooms g JOIN users u ON u.id = g.owner_id LEFT JOIN food_categories c ON c.id = g.category_id
         ${where} ORDER BY g.created_at DESC, g.id DESC LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, pager.offset],
    );
    res.render('admin/rooms/index', {
      title: 'Phòng chọn món',
      items,
      pager,
      phase,
      phaseLabels: PHASE_LABELS,
      closedLabels: CLOSED_LABELS,
    });
  });

  router.post('/:id/close', async (req, res) => {
    const { id } = idParams.parse({ id: req.params.id });
    try {
      await withTransaction(async (conn) => {
        const [[room]] = await conn.query('SELECT id, phase FROM group_rooms WHERE id = ? FOR UPDATE', [id]);
        if (!room) {
          throw AppError.notFound('NOT_FOUND', 'Phòng không còn tồn tại');
        }
        if (room.phase === 'closed') {
          throw AppError.conflict('NO_CHANGE', 'Phòng đã kết thúc rồi');
        }
        await closeRoomTx(conn, id, 'admin');
        await logAdminAction(conn, req, {
          action: 'room.close',
          targetType: 'room',
          targetId: id,
          summary: `Đóng phòng #${id}`,
        });
      });
      req.flash('success', `Đã đóng phòng #${id}.`);
    } catch (error) {
      if (!(error instanceof AppError) || error.status >= 500) throw error;
      req.flash('danger', error.message);
    }
    res.redirect('/admin/rooms');
  });

  return router;
}

module.exports = { createRoomsAdminRouter };
