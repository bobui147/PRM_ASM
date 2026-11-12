'use strict';
const express = require('express');
const { z } = require('zod');
const { getPool, withTransaction } = require('../../db');
const { AppError } = require('../../errors');
const { getStorage } = require('../../services/storage');
const { validate } = require('../../middleware/validate');
const { pageQuery, optionalText } = require('../../utils/http');
const { logAdminAction } = require('../audit/audit.service');
const TABLES = { posts: 'community_posts', comments: 'community_comments' };
const transitions = {
  approve: ['pending', 'published'],
  reject: ['pending', 'rejected'],
  hide: ['published', 'hidden'],
  unhide: ['hidden', 'published'],
};
function createCommunityAdminRouter() {
  const router = express.Router();
  router.get(
    '/',
    validate({
      query: z.object({
        ...pageQuery(20, 20),
        type: z.enum(['posts', 'comments', 'reports']).default('posts'),
        status: z.enum(['pending', 'published', 'hidden', 'rejected', 'open', 'resolved', 'dismissed']).optional(),
        userId: z.coerce.number().int().positive().optional(),
      }),
    }),
    async (req, res) => {
      const { type, status, userId, page, limit } = req.valid.query;
      const params = [];
      const table = type === 'reports' ? 'community_reports' : TABLES[type];
      const where = [];
      if (status) {
        where.push('t.status = ?');
        params.push(status);
      }
      if (userId) {
        where.push(type === 'reports' ? 't.reporter_id = ?' : 't.user_id = ?');
        params.push(userId);
      }
      const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total FROM ${table} t ${filter}`, params);
      const [rows] = await getPool().query(
        `SELECT t.* FROM ${table} t ${filter} ORDER BY t.created_at, t.id LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      for (const row of rows) {
        if (type === 'reports') {
          const targetTable = row.post_id ? TABLES.posts : TABLES.comments;
          const [[target]] = await getPool().query(`SELECT content, user_id FROM ${targetTable} WHERE id = ?`, [
            row.post_id ?? row.comment_id,
          ]);
          row.content = target?.content;
          row.user_id = target?.user_id;
        }
        const [[user]] = await getPool().query('SELECT display_name FROM users WHERE id = ?', [row.user_id ?? null]);
        row.author_name = user?.display_name;
        row.images =
          type === 'posts'
            ? (await getPool().query('SELECT image_path FROM community_images WHERE post_id = ?', [row.id]))[0]
            : [];
      }
      res.render('admin/community', {
        title: 'Cộng đồng',
        rows,
        type,
        status,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    },
  );
  router.post(
    '/:type/:id/:action',
    validate({
      params: z.object({
        type: z.enum(['posts', 'comments', 'reports']),
        id: z.coerce.number().int().positive(),
        action: z.enum(['approve', 'reject', 'hide', 'unhide', 'delete', 'resolve', 'dismiss']),
      }),
      body: z.object({ note: optionalText(300, 'Tối đa 300 ký tự'), confirm: z.enum(['yes']).optional() }),
    }),
    async (req, res) => {
      const { type, id, action } = req.valid.params;
      let deletedPost;
      await withTransaction(async (conn) => {
        const table = type === 'reports' ? 'community_reports' : TABLES[type];
        const [[row]] = await conn.query(`SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
        if (!row) throw AppError.notFound();
        if (type === 'reports') {
          if (!['resolve', 'dismiss'].includes(action) || row.status !== 'open')
            throw AppError.conflict('INVALID_TRANSITION', 'Báo cáo đã xử lý hoặc thao tác không hợp lệ');
          if (action === 'resolve') {
            const targetTable = row.post_id ? TABLES.posts : TABLES.comments;
            await conn.query(`UPDATE ${targetTable} SET status = 'hidden' WHERE id = ?`, [
              row.post_id ?? row.comment_id,
            ]);
          }
          await conn.query('UPDATE community_reports SET status = ? WHERE id = ?', [
            action === 'resolve' ? 'resolved' : 'dismissed',
            id,
          ]);
        } else if (action === 'delete') {
          if (req.valid.body.confirm !== 'yes') throw AppError.validation({ confirm: 'Xác nhận xóa vĩnh viễn' });
          await conn.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
          if (type === 'posts') deletedPost = id;
        } else {
          const rule = transitions[action];
          if (!rule || row.status !== rule[0])
            throw AppError.conflict('INVALID_TRANSITION', 'Trạng thái không cho phép thao tác này');
          if (action === 'reject' && !req.valid.body.note) throw AppError.validation({ note: 'Nhập lý do từ chối' });
          await conn.query(`UPDATE ${table} SET status = ?, moderation_note = ? WHERE id = ?`, [
            rule[1],
            req.valid.body.note,
            id,
          ]);
        }
        await logAdminAction(conn, req, {
          action: `community_${action}`,
          targetType: `community_${type}`,
          targetId: id,
          summary: `Cộng đồng: ${action} #${id}`,
        });
      });
      if (deletedPost) await getStorage().removeDir(`community/${deletedPost}`);
      res.redirect(`/admin/community?type=${type}`);
    },
  );
  return router;
}
module.exports = { createCommunityAdminRouter };
