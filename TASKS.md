# TASKS — Hôm nay ăn gì? v2.0

Danh sách việc cần làm theo `requirements.md` v2.0. Đánh dấu `[x]` khi task xong **và** đã kiểm tra theo cột "Xong khi". Task bị hoãn ghi `[-]` kèm lý do.

- Mã task: `S` = server/web admin, `D` = deploy, `F` = Flutter.
- Cột tham chiếu dùng mã yêu cầu trong `requirements.md` (FR-A, FR-U, FR-P, FR-R, FR-M, mục §).
- Thứ tự: Phase 0 → 9 (server), rồi Phase 10 → 15 (Flutter). Trong một phase có thể làm song song.

## Tổng quan tiến độ

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Chuẩn bị môi trường và hạ tầng | Đang làm (S0.2 xong) |
| 1 | Khung server | Xong |
| 2 | Database và script | Xong |
| 3 | API xác thực người dùng | Đã code, chưa có test tự động |
| 4 | Web admin phần 1: đăng nhập, món, quán | Đã code, chưa có test tự động |
| 5 | Deploy staging lên VPS | Chưa bắt đầu |
| 6 | API công khai | Đã code, chưa có test tự động |
| 7 | API review và báo cáo | Đã code, chưa có test tự động |
| 8 | Web admin phần 2: duyệt, báo cáo, người dùng, nhật ký | Đã code, chưa có test tự động |
| 9 | Bảo mật, test, deploy production | Chưa bắt đầu |
| 10 | Flutter: nền tảng API và dữ liệu | Đã code, chưa có test tự động |
| 11 | Flutter: chuyển kho món sang server | Đã code, chưa có test tự động |
| 12 | Flutter: quán và review (đọc) | Đã code, chưa có test tự động |
| 13 | Flutter: tài khoản | Đã code, chưa có test tự động |
| 14 | Flutter: viết review và báo cáo | Đã code, chưa có test tự động |
| 15 | Flutter: test, build, tài liệu | Chưa bắt đầu |

## Phase 0 — Chuẩn bị (người làm: nhóm)

- [ ] **S0.1** Cài MySQL 8 trên máy dev, tạo DB `homnayangi_dev` và `homnayangi_test` với user riêng. Xong khi: đăng nhập được bằng user đó. (§12.1)
- [x] **S0.2** Kiểm tra Node.js 22 LTS trên máy dev (`node -v`). Xong khi: phiên bản ≥ 22. _(Máy dev: Node 24.16.0, npm 11.13.0. MySQL 8.0 đã cài, service `MySQL80` đang chạy.)_
- [ ] **S0.3** Thêm Flutter SDK vào `PATH` của terminal dùng để chạy lệnh. Xong khi: `flutter --version` chạy được.
- [ ] **D0.1** VPS: tạo user deploy, SSH bằng key, tắt đăng nhập root và mật khẩu, bật `ufw` (22, 80, 443). (§16.4)
- [ ] **D0.2** DNS: bản ghi `A` cho `@` và `www` trỏ về IP VPS. Xong khi: `nslookup homnayangi.site` ra đúng IP.
- [ ] **D0.3** Tạo hộp thư `contact@homnayangi.site` trên Hostinger Email, lấy thông tin SMTP; cấu hình MX, SPF, DKIM, DMARC. Xong khi: gửi thử từ webmail tới Gmail không vào thư rác. (FR-U02)
- [ ] **D0.4** Kiểm tra giới hạn số email gửi mỗi ngày của gói Hostinger Email, ghi con số vào `server/README.md`.

## Phase 1 — Khung server

- [x] **S1.1** Tạo `server/` với `package.json` (`"type": "commonjs"`, scripts `dev`, `start`, `test`, `lint`, `migrate`, `admin:create`, `seed:dev`, `seed:legacy-foods`, `ratings:recalculate`), `.gitignore` (`node_modules`, `.env`, `uploads/`, `tmp/`). (§16.2)
- [x] **S1.2** Cài dependency theo §16.1, khóa phiên bản, commit `package-lock.json`. _(Đã khóa phiên bản và tạo `package-lock.json`; chưa commit.)_
- [x] **S1.3** `src/config.js`: đọc `.env` bằng `dotenv`, kiểm tra bằng `zod`, dừng server nếu thiếu hoặc secret ngắn hơn 32 byte. Tạo `.env.example` đủ biến ở §16.3.
- [x] **S1.4** `src/db.js`: pool `mysql2/promise` (`timezone: 'Z'`, `charset: 'utf8mb4'`), helper `withTransaction(fn)`.
- [x] **S1.5** `src/app.js` và `src/server.js`: `helmet` (CSP cùng origin), `trust proxy`, `express.json` giới hạn 100 KB, log `pino-http` (che email, bỏ header `Authorization`), `GET /api/v1/health`.
- [x] **S1.6** Middleware lỗi chung: định dạng lỗi API theo §13.1; trang lỗi 404/500 cho admin; lỗi không lộ stack ở production.
- [x] **S1.7** Lớp `AppError(status, code, message, fields)` và helper `validate(schema)` cho body/query/params.
- [x] **S1.8** Cấu hình EJS: layout chung, partial header/sidebar/flash, Bootstrap 5 đóng gói trong `public/vendor/`. _(Sidebar làm ở S4.5 khi có menu. Bootstrap phục vụ từ `node_modules` tại `/static/vendor/bootstrap`, xem ghi chú cuối file.)_
- [x] **S1.9** ESLint + Prettier, `npm run lint` sạch.
- [x] **S1.10** Jest + supertest: setup DB test (chạy migration, xóa dữ liệu giữa các test), test `GET /health`. Xong khi: `npm test` xanh. _(`tests/helpers/db.js` dựng lại `homnayangi_test` từ migration và xóa dữ liệu giữa các test; từ chối chạy nếu DB không kết thúc bằng `_test`.)_

## Phase 2 — Database và script

- [x] **S2.1** `scripts/migrate.js` + bảng `schema_migrations`; chạy các file `migrations/*.sql` theo thứ tự, mỗi file trong transaction nếu được. (§12.1) _(MySQL tự commit DDL nên không bọc được transaction; thay bằng khóa `GET_LOCK` và checksum chặn sửa file đã chạy.)_
- [x] **S2.2** `001_init.sql`: bảng tài khoản và phiên (`admins`, `sessions`, `users`, `user_blocks`, `email_otps`, `refresh_tokens`). (§12.2)
- [x] **S2.3** `002_catalog.sql`: `food_categories`, `foods`, `food_meal_periods`, `restaurants`, `restaurant_foods`, `app_settings`; seed 4 nhóm món mặc định và `catalog_version`. (§12.3, FR-A03)
- [x] **S2.4** `003_reviews.sql`: `reviews`, `review_images`, `review_reports`, `admin_audit_logs` với đủ UNIQUE, CHECK, index. (§12.4)
- [x] **S2.5** `scripts/create-admin.js`: hỏi username, email, mật khẩu (ẩn khi gõ), kiểm tra độ mạnh, băm bcrypt. (§18)
- [x] **S2.6** `scripts/seed-dev.js`: chỉ chạy khi `NODE_ENV=development`; tạo món, 20 quán "[Mẫu]", người dùng mẫu, review đủ trạng thái. (§18)
- [x] **S2.7** `scripts/recalc-ratings.js` (`npm run ratings:recalculate`). (FR-R08)
- [x] **S2.8** Xuất 57 món từ `lib/data/sample_foods.dart` thành `server/seed/legacy-foods/foods.json`, chép 10 atlas vào `server/seed/legacy-foods/atlases/`. (§18)
- [x] **S2.9** `scripts/seed-legacy-foods.js`: cắt ảnh từng ô atlas bằng `sharp`, xử lý như ảnh upload, nhập món không trùng. Xong khi: chạy 2 lần vẫn đúng 57 món.
- [x] **S2.10** Test migration chạy được trên DB trống và chạy lại không lỗi.

## Phase 3 — API xác thực người dùng

- [x] **S3.1** `services/mailer.js`: transport `smtp` (nodemailer, SMTP Hostinger) và `console` (dev) cùng một transport giả cho test; template OTP bản HTML và text. (FR-U02)
- [x] **S3.2** `modules/auth/otp.service.js`: sinh OTP bằng `crypto.randomInt`, HMAC-SHA256, hết hạn 10 phút, tối đa 5 lần sai, OTP mới vô hiệu OTP cũ. (FR-U02)
- [x] **S3.3** Giới hạn gửi OTP: cách nhau 60 giây, 5 lần/giờ/email, 20 lần/giờ/IP; trả `429 OTP_COOLDOWN` kèm `retryAfter`. Lỗi gửi mail trả `503 MAIL_UNAVAILABLE`. (FR-U02, §17)
- [x] **S3.4** `POST /auth/register` và xử lý đăng ký lại khi email chưa xác minh. (FR-U01)
- [x] **S3.5** `POST /auth/verify-email` và `POST /auth/resend-otp`. (FR-U02)
- [x] **S3.6** `modules/auth/token.service.js`: JWT access token (`sub`, `tv`, 15 phút); refresh token 48 byte, lưu hash, `family_id`, xoay vòng, phát hiện dùng lại thì thu hồi cả family. (FR-U03)
- [x] **S3.7** `POST /auth/login` (lỗi chung `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, tạm chặn sau 10 lần sai), `POST /auth/refresh`, `POST /auth/logout`. (FR-U03)
- [x] **S3.8** `POST /auth/forgot-password` (luôn trả 200) và `POST /auth/reset-password` (tăng `token_version`, thu hồi phiên). (FR-U04)
- [x] **S3.9** Middleware `requireUser`, `optionalUser`, `requireVerified`, `requireNotBlocked`; phân biệt `TOKEN_EXPIRED` và `UNAUTHENTICATED`. (§13.1)
- [x] **S3.10** `GET /me`, `PATCH /me`, `POST /me/change-password`, `DELETE /me` (xóa cả file ảnh review). `GET /me/reviews` làm ở S7.6. (FR-U05, §13.3)
- [x] **S3.11** Rate limit IP cho nhóm `/auth/*`.
- [ ] **S3.12** Test: đăng ký → OTP → đăng nhập → refresh → dùng lại token cũ bị thu hồi → đăng xuất; OTP sai/hết hạn/cooldown; quên mật khẩu; đổi mật khẩu làm access token cũ hết hiệu lực; xóa tài khoản.

## Phase 4 — Web admin phần 1

- [x] **S4.1** Session admin bằng `express-session` + `express-mysql-session` (cookie `httpOnly`, `secure` ở production, `sameSite=lax`, 8 giờ). (FR-A01)
- [x] **S4.2** Middleware CSRF synchronizer token cho mọi `POST` dưới `/admin`; partial chèn token vào form. (§15)
- [x] **S4.3** Trang đăng nhập, đăng xuất, tái tạo session ID, tạm khóa sau 5 lần sai trong 15 phút theo IP và tài khoản. (FR-A01)
- [x] **S4.4** Trang đổi mật khẩu admin. (FR-A01)
- [x] **S4.5** Layout admin: sidebar (Dashboard, Nhóm món, Món ăn, Quán ăn, Duyệt review, Review, Báo cáo, Người dùng, Nhật ký), flash message, phân trang dùng chung, hộp xác nhận xóa.
- [x] **S4.6** `modules/audit/audit.service.js`: hàm `logAdminAction(...)` dùng trong mọi thao tác admin từ đây trở đi. (FR-A09)
- [x] **S4.7** `services/image.js`: kiểm tra ảnh bằng `sharp`, xoay EXIF, xóa metadata, WebP 1600 px + thumbnail 400 px, tên UUID; `services/storage.js`: lưu, xóa file trong `UPLOAD_DIR`. (FR-R05)
- [x] **S4.8** Middleware upload `multer` (thư mục tạm, giới hạn kích thước và số file, dọn file tạm khi lỗi). (FR-R05, §15)
- [x] **S4.9** Trong dev, Express phục vụ `/uploads` từ `UPLOAD_DIR` (production do Nginx phục vụ).
- [x] **S4.10** Nhóm món: danh sách, thêm, sửa, sắp xếp, ẩn, chặn xóa khi còn món. Tăng `catalog_version` khi thay đổi. (FR-A03)
- [x] **S4.11** Món ăn: danh sách (tìm, lọc, phân trang), thêm, sửa, ẩn, xóa (xóa file ảnh), độ hiếm tự suy ra từ giá, bữa ăn bắt buộc theo nhóm, xem/thay/xóa ảnh, danh sách quán đang bán. (FR-A04)
- [x] **S4.12** Quán ăn: danh sách (tìm, lọc, phân trang), thêm, sửa, ẩn, xóa (đếm và xóa review, ảnh, báo cáo liên quan), ảnh bìa, kiểm tra URL Google Maps theo danh sách host. (FR-A05)
- [x] **S4.13** Thực đơn quán: thêm món, sửa giá tại quán và món nổi bật, xóa món khỏi quán. Tăng `catalog_version`. (FR-A05)
- [x] **S4.14** Dashboard bản đầu: số món, số quán. Phần review, báo cáo, người dùng bổ sung ở S8.1. (FR-A02)
- [ ] **S4.15** Test: đăng nhập admin, khóa tạm, CSRF thiếu bị từ chối, CRUD nhóm món/món/quán/thực đơn, upload file giả mạo bị từ chối, nhật ký được ghi.

## Phase 5 — Deploy staging lên VPS

- [ ] **D5.1** Cài Node.js 22 LTS, MySQL 8 (chỉ nghe `127.0.0.1`, chạy `mysql_secure_installation`), Nginx, PM2, Certbot trên VPS. (§16.4)
- [ ] **D5.2** Tạo DB production và user DB chỉ có quyền trên DB đó.
- [ ] **D5.3** Clone repo, tạo `.env` production (secret sinh bằng `openssl rand -base64 48`), thư mục `UPLOAD_DIR` thuộc user deploy.
- [ ] **D5.4** `ecosystem.config.cjs` cho PM2, `pm2 startup` + `pm2 save`. Xong khi: reboot VPS thì app tự chạy lại.
- [ ] **D5.5** Cấu hình Nginx (proxy, `/uploads/`, `client_max_body_size 20m`, chuyển www về không www), mẫu file đặt trong `server/deploy/nginx.conf`.
- [ ] **D5.6** Certbot cấp chứng chỉ, chuyển HTTP sang HTTPS, kiểm tra tự gia hạn (`certbot renew --dry-run`).
- [ ] **D5.7** Chạy migration, tạo admin, nhập món (`seed:legacy-foods` hoặc nhập tay).
- [ ] **D5.8** Gửi OTP thật từ server tới Gmail và Outlook. Xong khi: email tới hộp thư chính, không vào thư rác.
- [ ] **D5.9** Viết phần deploy trong `server/README.md` theo đúng các bước đã làm.

## Phase 6 — API công khai

- [x] **S6.1** `GET /catalog`: nhóm món và món `active`, URL ảnh tuyệt đối từ `PUBLIC_BASE_URL`, `restaurantCount`, `ETag` theo `catalog_version`, trả `304`. (FR-P01)
- [x] **S6.2** `GET /foods/{id}`. (§13.4)
- [x] **S6.3** `GET /foods/{id}/restaurants`: lọc `area`, sắp xếp `rating`/`reviews`/`price`, ưu tiên `budget`, quán chưa có review đứng sau, tối đa 2 món nổi bật, phân trang. (FR-P02)
- [x] **S6.4** `GET /restaurants` (lọc `area`, tìm `q`, phân trang) và `GET /restaurants/{id}` (thực đơn, `ratingDistribution`). (FR-P03)
- [x] **S6.5** `GET /restaurants/{id}/reviews`: chỉ `published`, sắp xếp, lọc `withImages`, phân trang, `myReview` khi có token hợp lệ, bỏ qua token lỗi. (FR-P04)
- [x] **S6.6** CORS cho `/api/v1` theo `CORS_ORIGINS`. (§15)
- [ ] **S6.7** Test: món/quán `hidden` không xuất hiện, thứ tự sắp xếp và ưu tiên ngân sách, ETag/304, phân trang, `myReview`.

## Phase 7 — API review và báo cáo

- [x] **S7.1** `services/rating.js`: tính lại `rating_avg`, `review_count` trong transaction được truyền vào. (FR-R08)
- [x] **S7.2** `POST /restaurants/{id}/reviews`: multipart, validation, món thuộc thực đơn quán, ngày ghé hợp lệ, `409 REVIEW_EXISTS`, xử lý ảnh xong mới ghi DB, lỗi thì xóa file đã xử lý. Trạng thái `pending`. (FR-R02, FR-R05)
- [x] **S7.3** `PUT /reviews/{id}`: chỉ tác giả, chặn review `hidden`, `keepImageIds` + ảnh mới ≤ 3, xóa file ảnh bị bỏ sau khi commit, chuyển `pending`, `edited_after_publish`, tính lại điểm nếu từng `published`. (FR-R01, FR-R03)
- [x] **S7.4** `DELETE /reviews/{id}`: chỉ tác giả, xóa file ảnh, tính lại điểm nếu đang `published`. (FR-R04)
- [x] **S7.5** `POST /reviews/{id}/reports`: chỉ review `published` của người khác, `409 ALREADY_REPORTED`, `400 CANNOT_REPORT_OWN_REVIEW`, `details` bắt buộc khi `other`. (FR-R07)
- [x] **S7.6** `GET /me/reviews`: mọi trạng thái, kèm quán, lý do từ chối, phân trang. (FR-U05)
- [x] **S7.7** Giới hạn theo người dùng: 5 review mới, 20 lần sửa, 10 báo cáo mỗi 24 giờ; giới hạn IP 60 request ghi/15 phút. Trả `429 RATE_LIMITED` kèm `retryAfter`. (FR-R06)
- [x] **S7.8** Làm sạch nội dung: trim, bỏ ký tự điều khiển, lưu dạng text. (FR-R02)
- [ ] **S7.9** Test: tạo/sửa/xóa kèm ảnh, quyền sở hữu, review thứ hai bị chặn, ảnh thứ tư/quá 5 MB/file đổi đuôi bị từ chối, không còn file mồ côi, EXIF bị xóa, người bị khóa nhận `403`, rate limit `429`, báo cáo trùng.

## Phase 8 — Web admin phần 2

- [x] **S8.1** Dashboard đầy đủ: review chờ duyệt, báo cáo mở, review có ≥ 3 báo cáo, tổng người dùng, số bị khóa, 10 thao tác gần nhất. (FR-A02, FR-A07)
- [x] **S8.2** Hàng chờ duyệt: cũ nhất trước, thông tin người viết (số review đã duyệt và bị từ chối, cờ "nghi spam"), ảnh xem lớn, đánh dấu "đã sửa sau khi duyệt". (FR-A06, FR-R06)
- [x] **S8.3** Duyệt, từ chối (bắt buộc lý do), từ chối và khóa người dùng; thao tác hàng loạt. Cập nhật điểm và ghi nhật ký. (FR-A06)
- [x] **S8.4** Trang tất cả review: lọc trạng thái, quán, người dùng, số sao; ẩn, hiện lại, xóa vĩnh viễn kèm file ảnh. Chỉ cho phép các chuyển trạng thái hợp lệ. (FR-A06, FR-R01)
- [x] **S8.5** Báo cáo: gom theo review, sắp theo số báo cáo; ẩn review (`resolved`), bỏ qua (`dismissed`), ẩn và khóa tác giả. (FR-A07)
- [x] **S8.6** Người dùng: danh sách (tìm, lọc trạng thái), chi tiết (review, báo cáo đã gửi, lịch sử khóa). (FR-A08)
- [x] **S8.7** Khóa (thời hạn, lý do, tùy chọn ẩn review đã đăng và từ chối review chờ duyệt, thu hồi refresh token) và mở khóa. Ghi `user_blocks`. (FR-A08)
- [x] **S8.8** Trang nhật ký admin có lọc theo admin, thao tác, thời gian. (FR-A09)
- [x] **S8.9** Kiểm tra lại mọi view EJS chỉ dùng `<%= %>` cho dữ liệu người dùng. (§15)
- [ ] **S8.10** Test: duyệt cập nhật điểm, ẩn/hiện cập nhật điểm, khóa thu hồi token và chặn API ghi, khóa hết hạn tự mở, xử lý báo cáo, thao tác hàng loạt.

## Phase 9 — Bảo mật, test, deploy production

- [ ] **S9.1** Script cron trong `server/scripts/`: dọn OTP, refresh token, file tạm (mỗi giờ); xóa tài khoản chưa xác minh quá 7 ngày (mỗi ngày). (§16.5)
- [ ] **S9.2** Script backup: `mysqldump` nén gzip giữ 14 bản (mỗi ngày 03:00), nén `uploads/` (mỗi tuần). (§15)
- [ ] **D9.3** Cài crontab trên VPS cho S9.1 và S9.2. Xong khi: có file backup mới sau một ngày.
- [ ] **D9.4** Thử khôi phục DB từ backup vào một DB tạm. Ghi lại các bước vào `server/README.md`.
- [ ] **S9.5** Rà soát bảo mật theo §15: secret, header `helmet`, CSP, cookie, CSRF, rate limit, SQL placeholder, upload, log không chứa dữ liệu nhạy cảm, `npm audit` không còn lỗ hổng mức high/critical.
- [ ] **S9.6** Đo thời gian phản hồi API đọc với dữ liệu giả cỡ §17 (1.000 món, 200 quán, 20.000 review). Xong khi: p95 dưới 300 ms hoặc đã ghi rõ chỗ chưa đạt.
- [ ] **S9.7** Chạy đủ `npm test` và `npm run lint`, đối chiếu tiêu chí nghiệm thu 1–16 trong §19.
- [ ] **D9.8** Deploy bản server hoàn chỉnh lên production, kiểm tra lại HTTPS, OTP thật, upload ảnh, web admin trên điện thoại.
- [ ] **S9.9** Viết tài liệu API cho nhóm Flutter: thêm file `server/docs/api.http` (hoặc collection Postman) chứa request mẫu cho mọi endpoint ở §13.

## Phase 10 — Flutter: nền tảng API và dữ liệu

- [ ] **F10.1** Thêm package `http`, `flutter_secure_storage`, `cached_network_image`, `image_picker`; chạy `flutter pub get`, build Android debug để kiểm tra tương thích AGP 9.1 / Kotlin 2.4 trước khi viết tính năng. (FR-M05, FR-M11, FR-M12)
- [ ] **F10.2** `lib/config/api_config.dart`: đọc `API_BASE_URL` từ `--dart-define`, mặc định production. Cấu hình HTTP cho bản debug (`network_security_config`) và quyền `INTERNET`. (FR-M14)
- [ ] **F10.3** `lib/services/api_client.dart`: gửi JSON/multipart, parse lỗi theo §13.1 thành `ApiException(code, message, fields)`, timeout, phân biệt lỗi mạng và lỗi server.
- [ ] **F10.4** `lib/services/token_store.dart` (secure storage) và cơ chế tự refresh khi `401 TOKEN_EXPIRED`, gom nhiều request về một lần refresh. (FR-M11)
- [ ] **F10.5** Model: `FoodCategory` (từ server), `FoodItem` (id chuỗi, URL ảnh), `Restaurant`, `RestaurantDetail`, `Review`, `AppUser`, `Page<T>`; `fromJson` chịu được trường thiếu.
- [ ] **F10.6** Unit test model và API client (mock HTTP): parse lỗi, refresh token, refresh thất bại thì đăng xuất.

## Phase 11 — Flutter: chuyển kho món sang server

- [ ] **F11.1** `lib/services/catalog_repository.dart`: đọc cache, gọi `/catalog` với `If-None-Match`, lưu cache khi `200`. (FR-M01)
- [ ] **F11.2** Migrate dữ liệu cũ: xóa khóa cũ theo FR-M03, đặt `data_schema_version = 2`.
- [ ] **F11.3** Sửa `FoodLibrary` dùng danh mục từ repository; bỏ món tự tạo (`customFoods`, `addCustomFood`, `updateCustomFood`, `deleteCustomFood`). (FR-M03, FR-M04)
- [ ] **F11.4** Xóa `lib/data/sample_foods.dart`, `lib/pages/food_form_page.dart`, atlas `assets/images/foods-*.png`, khai báo asset tương ứng trong `pubspec.yaml`. Chỉ xóa sau khi S2.8 đã chép dữ liệu sang `server/seed/`. (FR-M01)
- [ ] **F11.5** Nhóm món động: chip nhóm, icon map, bộ lọc bữa ăn chỉ hiện với nhóm `usesMealPeriods`. (FR-M02)
- [ ] **F11.6** `FoodPhoto` dùng `cached_network_image`, thumbnail ở dải quay và lưới, ảnh lớn ở kết quả, fallback icon nhóm. (FR-M05)
- [ ] **F11.7** Màn hình khởi động: trạng thái tải, lỗi lần đầu có **Thử lại**, danh mục trống, thông báo "Đang dùng dữ liệu đã lưu". Không áp dụng danh mục mới khi đang quay hoặc đang mở kết quả. (FR-M01)
- [ ] **F11.8** Tab Món ăn: bỏ nút thêm/sửa/xóa, thêm pull-to-refresh và số quán đang bán. (FR-M04)
- [ ] **F11.9** Kiểm tra vòng quay giữ nguyên animation 5 giây, trọng số ngân sách, yêu thích, món ẩn, lịch sử. (FR-M06)
- [ ] **F11.10** Cập nhật test hiện có trong `test/` theo mô hình dữ liệu mới, thêm test cache và migrate.

## Phase 12 — Flutter: quán và review (đọc)

- [ ] **F12.1** `lib/services/restaurant_repository.dart`: quán theo món, chi tiết quán, review của quán.
- [ ] **F12.2** Widget thẻ quán và phần **Quán phù hợp tại Hòa Lạc** trong hộp kết quả: skeleton, lỗi + thử lại, trống + Google Maps, nút **Xem tất cả quán (N)**; hộp kết quả cuộn được. (FR-M07)
- [ ] **F12.3** Mở Google Maps bằng `openExternalUrl` hiện có: dùng `googleMapsUrl` nếu có, nếu không thì tìm "tên quán Hòa Lạc". (FR-M07, FR-M09)
- [ ] **F12.4** Màn hình danh sách quán: lọc khu vực, sắp xếp, cuộn vô hạn. (FR-M08)
- [ ] **F12.5** Màn hình chi tiết quán: thông tin, thực đơn, phân bố sao, danh sách review (sắp xếp, lọc có ảnh, cuộn vô hạn), xem ảnh lớn. (FR-M09)
- [ ] **F12.6** Widget test: hộp kết quả có quán / không có quán / lỗi mạng, không overflow ở 390 × 844 và 360 × 640.

## Phase 13 — Flutter: tài khoản

- [ ] **F13.1** `lib/services/auth_service.dart` (`ChangeNotifier`): trạng thái đăng nhập, user hiện tại, đăng ký, xác minh, đăng nhập, đăng xuất, quên/đặt lại mật khẩu.
- [ ] **F13.2** Thêm tab **Tài khoản** vào `HomeShell`. (FR-M10)
- [ ] **F13.3** Màn hình đăng ký, đăng nhập, OTP (đếm ngược gửi lại), quên mật khẩu, đặt lại mật khẩu; validation giống server, hiển thị lỗi theo trường. (FR-M10)
- [ ] **F13.4** Màn hình tài khoản: đổi tên, đổi mật khẩu, đăng xuất, xóa tài khoản, hiển thị trạng thái khóa. (FR-M10, FR-U05)
- [ ] **F13.5** Màn hình **Review của tôi** với trạng thái và lý do từ chối. (FR-U05)
- [ ] **F13.6** Widget test màn hình OTP và form đăng ký.

## Phase 14 — Flutter: viết review và báo cáo

- [ ] **F14.1** Nút review trên trang quán theo `myReview`; khách bấm thì sang đăng nhập rồi quay lại. (FR-M09)
- [ ] **F14.2** Form review: sao, nội dung có bộ đếm, món đã ăn, chi phí, ngày ghé, tối đa 3 ảnh (xem trước, xóa), thông báo công khai lần đầu, cảnh báo khi sửa review đã đăng. (FR-M12)
- [ ] **F14.3** Gửi multipart, khóa nút và hiện tiến trình, giữ nội dung khi lỗi, hiển thị lỗi `ACCOUNT_BLOCKED`, `RATE_LIMITED`, `REVIEW_EXISTS`. (FR-M12)
- [ ] **F14.4** Sửa (giữ ảnh cũ bằng `keepImageIds`) và xóa review có xác nhận. (FR-R03, FR-R04)
- [ ] **F14.5** Bottom sheet báo cáo review. (FR-M13)
- [ ] **F14.6** Widget test form review: validation, chặn ảnh thứ tư và ảnh quá 5 MB.

## Phase 15 — Flutter: test, build, tài liệu

- [ ] **F15.1** `flutter analyze` không lỗi, `flutter test` xanh.
- [ ] **F15.2** Build APK release và Flutter Web; chạy Flutter Web với CORS production.
- [ ] **F15.3** Thử tay trên Android emulator với server local và trên điện thoại thật với server production theo tiêu chí nghiệm thu 17–25 (§19).
- [ ] **F15.4** Cập nhật `README.md` gốc: kiến trúc mới, cách chạy app với `API_BASE_URL`, bỏ phần dữ liệu món cục bộ và món tự tạo.
- [ ] **F15.5** Đánh dấu hoàn tất toàn bộ `TASKS.md` và cập nhật bảng tổng quan.

## Ghi chú và quyết định phát sinh

Ghi lại ở đây những thay đổi so với `requirements.md` trong quá trình làm (ngày, nội dung, lý do), rồi cập nhật lại `requirements.md` cho khớp.

- **06/11/2026, Phase 1:** Bootstrap không chép vào `public/vendor/` mà phục vụ thẳng từ `node_modules/bootstrap/dist` tại `/static/vendor/bootstrap`. Phiên bản khóa trong `package-lock.json`, không phải commit file build. Vẫn đáp ứng §15 (không dùng CDN).
- **06/11/2026, Phase 1:** `package.json` khai báo `engines.node >= 22.13.0` (theo yêu cầu của ESLint 10). Máy dev chạy Node 24, VPS dùng Node 22 LTS.
- **06/11/2026, Phase 1:** CSP chặn `style` và `script` inline, nên view EJS chỉ dùng class CSS (file `public/css/admin.css`).
- **06/11/2026, Phase 1:** `server/.gitattributes` ép LF khi commit (server chạy Linux). Prettier dùng `endOfLine: auto` vì máy dev Windows bật `core.autocrlf=true`.
- **06/11/2026, Phase 1:** Thêm `HOST` (mặc định `127.0.0.1`) và `DB_CONNECTION_LIMIT` (mặc định 10) vào `.env.example`. Production bắt buộc `https://`, `MAIL_TRANSPORT=smtp` và ba secret khác nhau. Đã bổ sung vào bảng §16.3 của `requirements.md`.

---

# TASKS mở rộng — theo `requirements-mo-rong.md`

Mã task: `X` = server/web admin, `G` = Flutter. Tham chiếu `FR-C`, `FR-G`, `FR-PM`.

## Quy tắc đã chốt (mục 7, 13/11/2026)

- **Cộng đồng:** bài và bình luận hiển thị ngay, admin xử lý theo báo cáo (không hàng chờ duyệt). Bài tối đa 2.000 ký tự, 3 ảnh × 5 MB; bình luận tối đa 500 ký tự. Mỗi người tối đa 10 bài, 60 bình luận và 10 báo cáo cộng đồng / 24 giờ. Xóa bài/bình luận thì xóa luôn báo cáo của nội dung đó; nhật ký admin chỉ ghi mã nội dung, không ghi nội dung.
- **Nhóm:** 1 thành viên loại món = món bị loại khỏi kết quả chung. Nếu có ít nhất một món được "chọn" thì ứng viên = các món được chọn và không bị ai loại; nếu không ai chọn thì ứng viên = mọi món khớp bộ lọc và không bị loại. Bỏ phiếu hòa → server quay ngẫu nhiên trong các món hòa; người không bỏ phiếu bị bỏ qua; không có phiếu nào thì không chốt được. Tối đa 10 thành viên, phòng hết hạn sau 24 giờ, mỗi người ở tối đa 1 phòng đang hoạt động, chỉ tài khoản đã xác minh. Đồng bộ bằng polling 2–3 giây theo `version` của phòng.
- **Thực đơn:** đồng bộ theo tài khoản trên server. Không có nhắc giờ, dinh dưỡng, tự tạo món.
- **Thông báo:** không có push notification.
- **DB:** từ migration 004 trở đi viết bằng file Node.js (`migrations/NNN_ten.js`, export `up(conn)`), chạy bằng `npm run migrate` như file `.sql` cũ.

## Phase X0 — Nền tảng

- [x] **X0.1** `migrator.js` hỗ trợ migration `.js` (checksum, khóa, thứ tự chung với `.sql`); chạy trực tiếp `node migrations/NNN_x.js` cũng được.
- [x] **X0.2** Cập nhật test migration và helper xóa dữ liệu test cho bảng mới.

## P1 — Cộng đồng ẩm thực

- [x] **X1.1** `004_community.js`: `posts`, `post_images`, `post_likes`, `post_comments`, `user_follows`, `content_reports`. (FR-C01..C04)
- [x] **X1.2** API bài đăng: tạo/sửa (multipart, `keepImageIds`), xóa (xóa ảnh), chi tiết, gắn món/quán còn công khai. (FR-C01)
- [x] **X1.3** Bảng tin `latest`/`following`, `GET /me/posts`, hồ sơ công khai `GET /users/:id`, `GET /users/:id/posts`. (FR-C02)
- [x] **X1.4** Thích/bỏ thích, bình luận (thêm, xóa, phân trang), theo dõi/bỏ theo dõi. (FR-C03)
- [x] **X1.5** Báo cáo bài/bình luận, chặn tự báo cáo và báo cáo trùng đang mở. (FR-C04)
- [x] **X1.6** Web admin: danh sách bài, bình luận, báo cáo cộng đồng; ẩn, hiện, xóa, bỏ qua, khóa tác giả; ghi nhật ký. (FR-C04)
- [x] **X1.7** Xóa tài khoản xóa dữ liệu cộng đồng, ảnh bài và báo cáo mồ côi. (FR-C05)
- [x] **X1.8** Test server P1 (tiêu chí 1–6).
- [x] **G1.1** Model + `CommunityRepository`; `ApiClient.put`.
- [x] **G1.2** Tab **Cộng đồng**: bảng tin Mới nhất/Đang theo dõi, cuộn vô hạn, trạng thái tải/trống/lỗi.
- [x] **G1.3** Form đăng/sửa bài (bộ đếm, 3 ảnh, chọn món/quán, thông báo công khai lần đầu), chi tiết bài (ảnh lớn, thích, bình luận, báo cáo, xóa có xác nhận).
- [x] **G1.4** Hồ sơ công khai (theo dõi) và **Bài của tôi** (thấy trạng thái bị ẩn).
- [x] **G1.5** Widget test P1.

## P2 — Chọn món theo nhóm

- [x] **X2.1** `005_group_rooms.js`: `group_rooms`, `group_room_members`, `group_room_marks`, `group_room_candidates`, `group_room_votes`. (FR-G01, FR-G02)
- [x] **X2.2** API phòng: tạo, tham gia bằng mã, phòng hiện tại, trạng thái theo `version`, đổi bộ lọc, rời, kết thúc. (FR-G01)
- [x] **X2.3** Chọn/loại món, bắt đầu bỏ phiếu hoặc quay, bỏ phiếu, chốt (khóa dòng chống chốt đồng thời), quay lại bước chọn. (FR-G02)
- [x] **X2.4** Web admin: danh sách phòng, kết thúc phòng, ghi nhật ký.
- [x] **X2.5** Test server P2 (tiêu chí 7–8).
- [x] **G2.1** Model + `GroupRepository`; màn hình tạo/tham gia phòng (chia sẻ, sao chép mã) từ tab Quay.
- [x] **G2.2** Màn hình phòng: polling, thành viên, chọn/loại món, bỏ phiếu, kết quả, rời/kết thúc, khôi phục phòng khi mở lại app.
- [x] **G2.3** Widget test P2.

## P3 — Lập thực đơn

- [x] **X3.1** `006_meal_plans.js`: `meal_plan_items`, `want_to_try`. (FR-PM01, FR-PM02)
- [x] **X3.2** API kế hoạch theo khoảng ngày, thêm, chuyển, xóa, đánh dấu/hoàn tác đã ăn, lịch sử đã ăn, danh sách muốn thử.
- [x] **X3.3** Test server P3 (tiêu chí 9–10).
- [x] **G3.1** Model + `MealPlanRepository`; tab **Thực đơn**: ngày/tuần, thêm món, chuyển, xóa, đã ăn.
- [x] **G3.2** Danh sách **Muốn thử** (thêm bằng hộp chọn món trong tab) và **Lịch sử đã ăn**.
- [x] **G3.3** Widget test P3.

## Hoàn tất

- [-] **XG.1** `npm run lint` sạch; 37 test API mới (`tests/api/*`) và test migration xanh; `flutter analyze lib` sạch; `test/extensions_test.dart` 15/15 xanh; đã cập nhật README server. _Còn lại (có từ trước, không thuộc phần mở rộng):_ `tests/app.test.js` mong `/admin` trả 200 nhưng trang cần đăng nhập (302); `tests/config.test.js` lệch hoa/thường ổ đĩa trên Windows; `test/widget_test.dart` và `test/features_test.dart` còn dùng API cũ (`data/sample_foods.dart`, `food_form_page.dart` đã xóa) nên không biên dịch. Jest cần `--forceExit` vì còn kết nối mở sau khi chạy.
- [ ] **XG.2** Thử tay Android + Flutter Web, nhiều thiết bị cùng phòng (người làm: nhóm).

## Ghi chú triển khai mở rộng

- Chạy `cd server && npm run migrate` để áp dụng `004_community.js`, `005_group_rooms.js`, `006_meal_plans.js` (hoặc chạy trực tiếp `node migrations/004_community.js`, lệnh này chạy mọi migration còn thiếu theo thứ tự).
- Ảnh bài viết lưu ở `uploads/posts/{id}/`, xử lý giống ảnh review (kiểm tra nội dung file, xoay EXIF, xóa metadata, WebP).
- Mỗi nhóm chức năng mới có bộ đếm tần suất IP riêng (`communityWriteLimiter`, `interactionLimiter`, `roomLimiter`, `mealPlanLimiter`) để thao tác nhanh (thích, chọn món trong phòng) không làm cạn quota 60 request ghi của review. Tham gia phòng bằng mã giới hạn 30 lần / 15 phút / người để chống dò mã.
- Thanh điều hướng app có 6 tab (Quay · Cộng đồng · Thực đơn · Lịch sử · Món ăn · Tài khoản), chỉ hiện nhãn tab đang chọn. Nút **Chọn món cùng nhóm** nằm dưới nút quay ở tab Quay.
