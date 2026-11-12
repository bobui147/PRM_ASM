'use strict';

const request = require('supertest');
const { getPool } = require('../../src/db');
const { computeCandidates } = require('../../src/modules/groups/group.service');
const { resetTestDatabase, truncateDataTables, closeTestDatabase } = require('../helpers/db');
const { buildApiApp, createUser, createFood } = require('../helpers/fixtures');

let app;

beforeAll(async () => {
  await resetTestDatabase();
  app = buildApiApp();
});
afterEach(truncateDataTables);
afterAll(closeTestDatabase);

const api = (p) => `/api/v1${p}`;

async function setupRoom(memberCount = 2) {
  const foods = [
    await createFood({ name: 'Bún' }),
    await createFood({ name: 'Phở' }),
    await createFood({ name: 'Cơm' }),
  ];
  const owner = await createUser({ name: 'Chủ' });
  const { body: room } = await request(app)
    .post(api('/rooms'))
    .set(owner.auth)
    .send({ categorySlug: 'mon-chinh' })
    .expect(201);
  const members = [];
  for (let i = 0; i < memberCount - 1; i += 1) {
    const member = await createUser();
    await request(app).post(api('/rooms/join')).set(member.auth).send({ code: room.code }).expect(200);
    members.push(member);
  }
  return { room, owner, members, foods };
}

describe('computeCandidates', () => {
  const foods = [{ id: 1 }, { id: 2 }, { id: 3 }];
  test('một người loại là loại; không ai chọn thì lấy mọi món còn lại', () => {
    expect(computeCandidates(foods, [{ food_id: 2, mark: 'exclude' }]).map((f) => f.id)).toEqual([1, 3]);
  });
  test('có món được chọn thì chỉ lấy món được chọn chưa bị loại', () => {
    const marks = [
      { food_id: 1, mark: 'pick' },
      { food_id: 2, mark: 'pick' },
      { food_id: 2, mark: 'exclude' },
    ];
    expect(computeCandidates(foods, marks).map((f) => f.id)).toEqual([1]);
  });
});

describe('P2 — phòng và thành viên (FR-G01)', () => {
  test('tạo phòng, tham gia bằng mã, người ngoài không truy cập được', async () => {
    const { room, owner, members } = await setupRoom(2);
    expect(room.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(room.isOwner).toBe(true);
    const { body: state } = await request(app)
      .get(api(`/rooms/${room.id}`))
      .set(members[0].auth)
      .expect(200);
    expect(state.members.map((m) => m.isOwner)).toEqual([true, false]);
    expect(state.foods).toHaveLength(3);

    const outsider = await createUser();
    const res = await request(app)
      .get(api(`/rooms/${room.id}`))
      .set(outsider.auth);
    expect(res.status).toBe(404);
    await request(app)
      .get(api(`/rooms/${room.id}`))
      .expect(401);

    // Mã có dấu cách/chữ thường vẫn nhận; mã sai trả 404.
    const third = await createUser();
    await request(app)
      .post(api('/rooms/join'))
      .set(third.auth)
      .send({ code: ` ${room.code.slice(0, 4).toLowerCase()} ${room.code.slice(4)}` })
      .expect(200);
    const wrong = await request(app).post(api('/rooms/join')).set(outsider.auth).send({ code: 'ZZZZZZZZ' });
    expect(wrong.status).toBe(404);

    // Đã ở phòng thì không tạo phòng khác.
    const again = await request(app).post(api('/rooms')).set(owner.auth).send({});
    expect(again.body.error.code).toBe('ALREADY_IN_ROOM');
  });

  test('polling theo version: không đổi thì changed=false', async () => {
    const { room, members } = await setupRoom(2);
    const { body: s1 } = await request(app)
      .get(api(`/rooms/${room.id}`))
      .set(members[0].auth);
    const { body: same } = await request(app)
      .get(api(`/rooms/${room.id}?version=${s1.version}`))
      .set(members[0].auth);
    expect(same).toEqual({ changed: false, version: s1.version });
  });

  test('chỉ chủ phòng đổi bộ lọc/bắt đầu/kết thúc; chủ rời thì phòng kết thúc', async () => {
    const { room, owner, members } = await setupRoom(3);
    const [m1, m2] = members;
    await request(app)
      .post(api(`/rooms/${room.id}/start`))
      .set(m1.auth)
      .send({ mode: 'spin' })
      .expect(403);
    await request(app)
      .patch(api(`/rooms/${room.id}/filters`))
      .set(m1.auth)
      .send({ maxPrice: 30000 })
      .expect(403);
    await request(app)
      .post(api(`/rooms/${room.id}/close`))
      .set(m1.auth)
      .expect(403);

    await request(app)
      .post(api(`/rooms/${room.id}/leave`))
      .set(m2.auth)
      .expect(204);
    const { body: afterLeave } = await request(app)
      .get(api(`/rooms/${room.id}`))
      .set(m1.auth);
    expect(afterLeave.members).toHaveLength(2);

    await request(app)
      .post(api(`/rooms/${room.id}/leave`))
      .set(owner.auth)
      .expect(204);
    const { body: closed } = await request(app)
      .get(api(`/rooms/${room.id}`))
      .set(m1.auth)
      .expect(200);
    expect(closed).toMatchObject({ phase: 'closed', closedReason: 'owner_left' });
    expect((await request(app).get(api('/rooms/current')).set(m1.auth)).body.room).toBeNull();
  });

  test('phòng đủ 10 người thì từ chối; người bị khóa không tham gia được', async () => {
    const { room } = await setupRoom(10);
    const late = await createUser();
    const full = await request(app).post(api('/rooms/join')).set(late.auth).send({ code: room.code });
    expect(full.body.error.code).toBe('ROOM_FULL');
    const blocked = await createUser({ blocked: true });
    const res = await request(app).post(api('/rooms/join')).set(blocked.auth).send({ code: room.code });
    expect(res.body.error.code).toBe('ACCOUNT_BLOCKED');
  });

  test('phòng hết hạn tự đóng khi truy cập', async () => {
    const { room, owner } = await setupRoom(1);
    await getPool().query('UPDATE group_rooms SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE id = ?', [
      room.id,
    ]);
    const { body } = await request(app)
      .get(api(`/rooms/${room.id}`))
      .set(owner.auth);
    expect(body).toMatchObject({ phase: 'closed', closedReason: 'expired' });
  });
});

describe('P2 — chọn món và kết quả (FR-G02)', () => {
  test('loại món làm thay đổi ứng viên; loại hết thì không bắt đầu được', async () => {
    const { room, owner, members, foods } = await setupRoom(2);
    for (const food of foods) {
      await request(app)
        .put(api(`/rooms/${room.id}/marks/${food.id}`))
        .set(members[0].auth)
        .send({ mark: 'exclude' })
        .expect(200);
    }
    const res = await request(app)
      .post(api(`/rooms/${room.id}/start`))
      .set(owner.auth)
      .send({ mode: 'vote' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_CANDIDATES');

    await request(app)
      .put(api(`/rooms/${room.id}/marks/${foods[1].id}`))
      .set(members[0].auth)
      .send({ mark: 'none' })
      .expect(200);
    const { body } = await request(app)
      .post(api(`/rooms/${room.id}/start`))
      .set(owner.auth)
      .send({ mode: 'spin' });
    expect(body.phase).toBe('finished');
    expect(body.result).toMatchObject({ foodId: foods[1].id, method: 'spin' });
    // Mọi thành viên thấy cùng kết quả.
    const { body: other } = await request(app)
      .get(api(`/rooms/${room.id}`))
      .set(members[0].auth);
    expect(other.result.foodId).toBe(foods[1].id);
  });

  test('bỏ phiếu: đổi phiếu, đa số thắng, hòa thì quay trong món hòa', async () => {
    const { room, owner, members, foods } = await setupRoom(3);
    const { body: voting } = await request(app)
      .post(api(`/rooms/${room.id}/start`))
      .set(owner.auth)
      .send({ mode: 'vote' });
    expect(voting.phase).toBe('voting');
    expect(voting.candidates).toHaveLength(3);

    await request(app)
      .post(api(`/rooms/${room.id}/finalize`))
      .set(owner.auth)
      .expect(409);
    await request(app)
      .put(api(`/rooms/${room.id}/vote`))
      .set(owner.auth)
      .send({ foodId: foods[0].id })
      .expect(200);
    await request(app)
      .put(api(`/rooms/${room.id}/vote`))
      .set(members[0].auth)
      .send({ foodId: foods[2].id })
      .expect(200);
    // Hòa 1–1, người thứ ba không bỏ phiếu bị bỏ qua.
    const { body: tie } = await request(app)
      .post(api(`/rooms/${room.id}/finalize`))
      .set(owner.auth)
      .expect(200);
    expect(tie.result.method).toBe('tie_spin');
    expect([foods[0].id, foods[2].id]).toContain(tie.result.foodId);
    // Đã chốt thì không bỏ phiếu được nữa.
    const late = await request(app)
      .put(api(`/rooms/${room.id}/vote`))
      .set(members[1].auth)
      .send({ foodId: foods[0].id });
    expect(late.body.error.code).toBe('ROOM_PHASE_CHANGED');
  });

  test('đa số thắng và quay lại bước chọn xóa phiếu', async () => {
    const { room, owner, members, foods } = await setupRoom(3);
    await request(app)
      .post(api(`/rooms/${room.id}/start`))
      .set(owner.auth)
      .send({ mode: 'vote' })
      .expect(200);
    await request(app)
      .put(api(`/rooms/${room.id}/vote`))
      .set(owner.auth)
      .send({ foodId: foods[0].id });
    const back = await request(app)
      .post(api(`/rooms/${room.id}/back`))
      .set(owner.auth)
      .expect(200);
    expect(back.body.phase).toBe('selecting');
    await request(app)
      .post(api(`/rooms/${room.id}/start`))
      .set(owner.auth)
      .send({ mode: 'vote' })
      .expect(200);
    for (const [user, food] of [
      [owner, foods[1]],
      [members[0], foods[1]],
      [members[1], foods[0]],
    ]) {
      await request(app)
        .put(api(`/rooms/${room.id}/vote`))
        .set(user.auth)
        .send({ foodId: food.id })
        .expect(200);
    }
    // Đổi phiếu trước khi chốt.
    await request(app)
      .put(api(`/rooms/${room.id}/vote`))
      .set(members[1].auth)
      .send({ foodId: foods[1].id })
      .expect(200);
    const { body } = await request(app)
      .post(api(`/rooms/${room.id}/finalize`))
      .set(owner.auth)
      .expect(200);
    expect(body.result).toMatchObject({ foodId: foods[1].id, method: 'vote', votes: 3 });
  });

  test('chốt đồng thời chỉ ra một kết quả', async () => {
    const { room, owner, foods } = await setupRoom(2);
    await request(app)
      .post(api(`/rooms/${room.id}/start`))
      .set(owner.auth)
      .send({ mode: 'vote' })
      .expect(200);
    await request(app)
      .put(api(`/rooms/${room.id}/vote`))
      .set(owner.auth)
      .send({ foodId: foods[0].id });
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app)
          .post(api(`/rooms/${room.id}/finalize`))
          .set(owner.auth),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);

    const spins = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app)
          .post(api(`/rooms/${room.id}/start`))
          .set(owner.auth)
          .send({ mode: 'spin' }),
      ),
    );
    expect(spins.every((r) => r.status === 409)).toBe(true);
  });

  test('kết nối lại: /rooms/current trả phòng đang hoạt động', async () => {
    const { room, members } = await setupRoom(2);
    const { body } = await request(app).get(api('/rooms/current')).set(members[0].auth).expect(200);
    expect(body.room.id).toBe(room.id);
  });
});
