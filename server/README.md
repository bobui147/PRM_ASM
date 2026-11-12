# Hôm nay ăn gì? — Server

Phần mở rộng cộng đồng, phòng chọn món nhóm và thực đơn: xem [API, quy tắc và cách chạy](docs/extensions.md), [request mẫu](docs/extensions.http). Cần chạy migration `004`–`007` trước khi dùng API mới.

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

- `npm run migrate`: chạy các file `migrations/*.sql` chưa chạy. Không sửa file migration đã chạy; muốn đổi schema thì tạo file mới (ví dụ `004_...sql`).
- `npm run admin:create`: tạo tài khoản admin (mật khẩu ít nhất 12 ký tự, có chữ và số, không hiện khi gõ).
- `npm run seed:legacy-foods`: nhập 57 món cũ của app kèm ảnh. Chạy lại không tạo trùng.
- `npm run seed:dev`: chỉ khi `NODE_ENV=development`. Nhập món cũ, tạo 20 quán "[Mẫu]", 7 người dùng `mau01`–`mau07@example.com` (mật khẩu `matkhau123`) và review đủ trạng thái. Thêm `-- --reset` để xóa dữ liệu mẫu và tạo lại.
- `npm run ratings:recalculate`: tính lại điểm mọi quán từ review đã đăng.
- `node scripts/export-legacy-foods.js`: xuất lại `seed/legacy-foods/` từ `lib/data/sample_foods.dart` (chỉ chạy được khi app còn file đó).

`npm test` dùng `.env.test` và DB có tên kết thúc bằng `_test`. Test xóa toàn bộ bảng của DB đó, nên không bao giờ trỏ `.env.test` vào DB dev hay production.

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

## Quy ước

### API hồ sơ cộng đồng (đang phát triển)

- `GET /api/v1/users/{id}/profile`: tên hiển thị, số người theo dõi/đang theo dõi và trạng thái theo dõi của người gọi; không trả email.
- `PUT /api/v1/users/{id}/follow`: theo dõi; `DELETE` cùng đường dẫn để bỏ theo dõi. Cần tài khoản đã xác minh và không bị khóa; hai thao tác có thể gọi lặp. Không thể tự theo dõi.
- Chạy `npm run migrate` để tạo các bảng mới; API và giao diện mở rộng được mô tả trong `docs/extensions.md`.

- Lỗi API luôn có dạng `{ "error": { "code", "message", "fields"? } }` (requirements §13.1). Trong route, ném `AppError`, không tự gửi response lỗi.
- Kiểm tra input bằng `validate({ body, query, params })`, đọc dữ liệu đã chuẩn hóa từ `req.valid`.
- SQL chỉ dùng placeholder `?`.
- EJS dùng `<%= %>` cho mọi dữ liệu người dùng. CSP chặn script và style inline, nên style viết thành class trong `public/css/admin.css`.
