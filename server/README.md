# Hôm nay ăn gì? — Server

Web admin (EJS) và REST API (`/api/v1`) cho app Flutter. Yêu cầu chi tiết ở `../requirements.md`, tiến độ ở `../TASKS.md`.

## Yêu cầu

- Node.js ≥ 22.13 (khuyến nghị 22 LTS trên VPS)
- MySQL 8.0

## Chạy local

```bash
cd server
npm ci
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
```

Điền `.env`:

- `DB_NAME`, `DB_USER`, `DB_PASSWORD`: database MySQL dev và user riêng của app.
- `JWT_SECRET`, `OTP_SECRET`, `SESSION_SECRET`: mỗi biến một chuỗi ngẫu nhiên khác nhau, tạo bằng
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.

Chạy server:

```bash
npm run dev               # tự khởi động lại khi sửa code
```

Kiểm tra:

- `http://localhost:3000/api/v1/health` trả `{"status":"ok","database":"ok"}` khi kết nối được MySQL, `503` khi không.
- `http://localhost:3000/admin` là trang web admin (Phase 1 mới có trang giữ chỗ).

Server từ chối khởi động và liệt kê mọi biến sai nếu `.env` thiếu hoặc không hợp lệ.

## Lệnh

| Lệnh             | Việc                         |
| ---------------- | ---------------------------- |
| `npm run dev`    | Chạy dev với `node --watch`  |
| `npm start`      | Chạy production              |
| `npm test`       | Jest + supertest             |
| `npm run lint`   | ESLint + kiểm tra Prettier   |
| `npm run format` | Định dạng code bằng Prettier |

Lệnh database (dùng DB trong `.env`):

- `npm run migrate`: chạy các file `migrations/*.sql` và `migrations/*.js` chưa chạy, theo số thứ tự. Không sửa file migration đã chạy (có kiểm tra checksum); muốn đổi schema thì tạo file mới.
  - Từ `004` trở đi migration viết bằng Node.js: file `NNN_ten.js` export `async up(conn)` và gọi `conn.query(...)` từng lệnh. Chạy trực tiếp `node migrations/005_group_rooms.js` cũng được (lệnh này chạy mọi migration còn thiếu).
  - `004_community.js`: bài đăng, ảnh, lượt thích, bình luận, theo dõi, báo cáo cộng đồng. `005_group_rooms.js`: phòng chọn món theo nhóm. `006_meal_plans.js`: thực đơn, muốn thử, đã ăn.
- `npm run admin:create`: tạo tài khoản admin (mật khẩu ít nhất 12 ký tự, có chữ và số, không hiện khi gõ).
- `npm run seed:legacy-foods`: nhập 57 món cũ của app kèm ảnh. Chạy lại không tạo trùng.
- `npm run seed:dev`: chỉ khi `NODE_ENV=development`. Nhập món cũ, tạo 20 quán "[Mẫu]", 7 người dùng `mau01`–`mau07@example.com` (mật khẩu `matkhau123`) và review đủ trạng thái. Thêm `-- --reset` để xóa dữ liệu mẫu và tạo lại.
- `npm run ratings:recalculate`: tính lại điểm mọi quán từ review đã đăng.
- `node scripts/export-legacy-foods.js`: xuất lại `seed/legacy-foods/` từ `lib/data/sample_foods.dart` (chỉ chạy được khi app còn file đó).

`npm test` dùng `.env.test` và DB có tên kết thúc bằng `_test`. Nếu Jest không tự thoát sau khi chạy xong, dùng `npx jest --runInBand --forceExit`. Test xóa toàn bộ bảng của DB đó, nên không bao giờ trỏ `.env.test` vào DB dev hay production.

## Cấu trúc

```
src/
├── app.js               # Tạo Express app (helmet, log, static, router, lỗi)
├── server.js            # Mở cổng, tắt server an toàn khi nhận SIGTERM/SIGINT
├── config.js            # Đọc và kiểm tra .env bằng zod
├── db.js                # Pool mysql2, withTransaction()
├── errors.js            # AppError với mã lỗi ổn định cho app
├── logger.js            # pino, che token/mật khẩu/email
├── middleware/          # validate (zod), xử lý lỗi
├── routes/              # api.js (/api/v1), admin.js (/admin)
└── views/               # EJS
public/                  # CSS riêng; Bootstrap phục vụ từ node_modules
tests/
```

## API mở rộng (requirements-mo-rong.md)

Mọi đường dẫn nằm dưới `/api/v1`. Đọc công khai dùng token nếu có; ghi cần tài khoản đã xác minh và không bị khóa (`ACCOUNT_BLOCKED`).

| Nhóm       | Endpoint                                                                                                                                                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bài đăng   | `GET /posts?filter=latest\|following`, `GET/PUT/DELETE /posts/:id`, `POST /posts` (multipart `content`, `foodId`, `restaurantId`, `images[]`, sửa thêm `keepImageIds[]`), `GET /me/posts`                                                                                                                                                     |
| Tương tác  | `POST/DELETE /posts/:id/like`, `GET/POST /posts/:id/comments`, `DELETE /comments/:id`, `POST /posts/:id/reports`, `POST /comments/:id/reports`                                                                                                                                                                                                |
| Hồ sơ      | `GET /users/:id`, `GET /users/:id/posts`, `POST/DELETE /users/:id/follow`                                                                                                                                                                                                                                                                     |
| Phòng nhóm | `POST /rooms`, `POST /rooms/join`, `GET /rooms/current`, `GET /rooms/:id?version=` (trả `{ changed: false }` khi không đổi), `PATCH /rooms/:id/filters`, `PUT /rooms/:id/marks/:foodId`, `POST /rooms/:id/start`, `PUT /rooms/:id/vote`, `POST /rooms/:id/finalize`, `POST /rooms/:id/back`, `POST /rooms/:id/close`, `POST /rooms/:id/leave` |
| Thực đơn   | `GET/POST /me/meal-plan`, `PATCH/DELETE /me/meal-plan/:id`, `PUT/DELETE /me/meal-plan/:id/eaten`, `GET /me/eaten`, `GET /me/want-to-try`, `PUT/DELETE /me/want-to-try/:foodId`                                                                                                                                                                |

Web admin thêm các trang `/admin/community/posts`, `/admin/community/comments`, `/admin/community/reports` và `/admin/rooms`.

## Quy ước

- Lỗi API luôn có dạng `{ "error": { "code", "message", "fields"? } }` (requirements §13.1). Trong route, ném `AppError`, không tự gửi response lỗi.
- Kiểm tra input bằng `validate({ body, query, params })`, đọc dữ liệu đã chuẩn hóa từ `req.valid`.
- SQL chỉ dùng placeholder `?`.
- EJS dùng `<%= %>` cho mọi dữ liệu người dùng. CSP chặn script và style inline, nên style viết thành class trong `public/css/admin.css`.
