# Yêu cầu sản phẩm: Hôm nay ăn gì? — Server, Web Admin và App Flutter

## 1. Thông tin tài liệu

- **Phiên bản:** 2.1 (bổ sung phạm vi tại mục 23; bản 1.0 dùng Firebase lưu tại `docs/archive/requirements-v1-firebase.md`)
- **Ngày:** 06/11/2026
- **Trạng thái:** Các yêu cầu phiên bản 2.0 giữ nguyên; các quyết định phần mở rộng đã được xác nhận trong `requirements-mo-rong.md` ngày 12/11/2026.
- **Thành phần:**
  - `server/`: Node.js + Express + EJS + MySQL (web admin và REST API).
  - `lib/`: app Flutter (Android ưu tiên, Flutter Web vẫn phải chạy).
- **Domain:** `https://homnayangi.site`
  - Web admin: `https://homnayangi.site/admin`
  - API: `https://homnayangi.site/api/v1`
  - Ảnh: `https://homnayangi.site/uploads/...`
- **Email gửi OTP:** `contact@homnayangi.site` qua SMTP Hostinger.
- **Hosting:** VPS (Ubuntu, Nginx, PM2, MySQL 8).
- **Ngôn ngữ giao diện:** Tiếng Việt.
- **Thứ tự triển khai:** Server và web admin → deploy → app Flutter.
- **Theo dõi tiến độ:** `TASKS.md`. Mã yêu cầu trong tài liệu này (FR-A, FR-P, FR-M...) được tham chiếu trong `TASKS.md`.

## 2. Bối cảnh

App hiện tại quay ngẫu nhiên một món từ 57 món viết cứng trong `lib/data/sample_foods.dart`. Ảnh nằm trong các atlas ở `assets/images/`. Toàn bộ dữ liệu (yêu thích, món ẩn, món tự tạo, lịch sử) lưu bằng `shared_preferences` trên một thiết bị. Kết quả quay chỉ mở tìm kiếm Google Maps.

Phiên bản 2.0:

- Kho món chuyển lên server. Admin quản lý toàn bộ món, quán, ảnh và review trên web admin.
- App bỏ dữ liệu món viết cứng và tải món qua API.
- Sau khi quay, app hiển thị các quán ở Hòa Lạc bán món vừa quay, kèm review đã được duyệt.
- Người dùng đăng ký bằng email, mật khẩu và OTP. Đã đăng nhập mới được viết review và báo cáo.
- Review mới phải được admin duyệt trước khi hiển thị.

## 3. Mục tiêu

1. Admin quản lý được mọi dữ liệu dùng chung trên web, không phải sửa code app.
2. Hành trình trên app: **quay món → xem quán → xem review → đến quán → viết review**.
3. Nội dung công khai chỉ gồm review đã duyệt; spam bị chặn bằng duyệt bài, giới hạn tần suất và khóa tài khoản.
4. App vẫn quay được khi mất mạng nếu đã tải danh sách món ít nhất một lần.
5. Giữ nguyên trải nghiệm vòng quay hiện tại (animation 5 giây, trọng số ngân sách, yêu thích, món ẩn, lịch sử).

## 4. Phạm vi

### 4.1. Trong phạm vi

- Web admin: đăng nhập, dashboard, quản lý món, quản lý quán, gắn món vào quán kèm giá, duyệt review, ẩn/xóa review, xử lý báo cáo, khóa/mở khóa người dùng, nhật ký thao tác.
- REST API v1 cho app.
- Đăng ký, xác minh email bằng OTP, đăng nhập, đăng xuất, quên mật khẩu bằng OTP, đổi tên hiển thị, đổi mật khẩu.
- App: tải món từ server, cache cục bộ, vòng quay, phần quán sau kết quả, danh sách quán, chi tiết quán, review, đăng ký/đăng nhập, viết/sửa/xóa review kèm tối đa 3 ảnh, báo cáo review.
- Deploy trên VPS với HTTPS và backup DB.
- Phần mở rộng theo thứ tự ưu tiên: cộng đồng ẩm thực, chọn món theo nhóm, lập thực đơn; xem mục 23.

### 4.2. Ngoài phạm vi

- Đăng nhập Google/Facebook.
- Ảnh đại diện người dùng (app hiển thị chữ cái đầu của tên).
- Trả lời review, like/dislike review và chat. Like bài đăng và theo dõi người dùng thuộc phạm vi mở rộng tại mục 23.
- Đặt bàn, đặt món, thanh toán.
- GPS, tính khoảng cách, bản đồ nhúng trong app.
- Người dùng tự đề xuất quán hoặc món mới.
- Món tự tạo trên app (bị bỏ, xem mục 15).
- Lấy dữ liệu hoặc ảnh từ Google Maps.
- AI kiểm duyệt nội dung.
- Push notification.
- Phân quyền nhiều cấp admin (MVP chỉ có một vai trò admin).
- Chia sẻ kết quả trên Flutter Web (giữ nguyên giới hạn hiện tại).

## 5. Vai trò

| Vai trò | Quyền |
|---|---|
| Khách | Dùng vòng quay, xem món, quán, review đã duyệt, mở Google Maps. |
| Người dùng chưa xác minh email | Như khách. Chỉ được xác minh OTP hoặc gửi lại OTP. |
| Người dùng | Như khách, cộng thêm: viết, sửa, xóa review của mình; báo cáo review người khác; sửa hồ sơ. |
| Người dùng bị khóa | Như khách. Đăng nhập được nhưng mọi thao tác ghi trả lỗi `ACCOUNT_BLOCKED` kèm lý do và thời hạn. |
| Admin | Toàn quyền trên web admin. Tài khoản admin tách biệt khỏi tài khoản người dùng app, không đăng ký được qua giao diện. |

## 6. Luồng chính

### 6.1. Admin chuẩn bị dữ liệu

1. Admin đăng nhập `/admin`.
2. Tạo hoặc sửa nhóm món (mặc định có 4 nhóm: Món chính, Đồ uống, Ăn vặt, Đồ nhậu).
3. Tạo món: tên, nhóm, bữa ăn (nếu nhóm dùng bữa ăn), giá tham khảo, độ hiếm, ảnh, mô tả.
4. Tạo quán: tên, khu vực, địa chỉ, link Google Maps, khoảng giá, giờ mở cửa, ảnh.
5. Gắn món vào quán, kèm giá tại quán và đánh dấu món nổi bật.

### 6.2. Người dùng quay món và xem quán

1. App mở lên, hiển thị ngay danh sách món trong cache (nếu có), đồng thời gọi `GET /catalog` để cập nhật.
2. Người dùng chọn nhóm món, bữa ăn, ngân sách rồi bấm quay. Vòng quay chạy cục bộ, không gọi mạng.
3. Hộp kết quả hiển thị món thắng. Ngay dưới đó, app gọi `GET /foods/{id}/restaurants` và hiển thị tối đa 3 quán.
4. Người dùng mở một quán để xem chi tiết và review đã duyệt, hoặc mở Google Maps.

### 6.3. Đăng ký và đăng nhập

1. Người dùng nhập email, mật khẩu, tên hiển thị.
2. Server tạo tài khoản ở trạng thái chưa xác minh và gửi OTP 6 số từ `contact@homnayangi.site`.
3. Người dùng nhập OTP. Server xác minh, trả access token và refresh token.
4. Những lần sau, người dùng đăng nhập bằng email và mật khẩu. Nếu email chưa xác minh, app chuyển sang màn hình nhập OTP.

### 6.4. Viết review và duyệt

1. Người dùng đã đăng nhập bấm **Viết review** trên trang quán.
2. Gửi review kèm tối đa 3 ảnh. Review ở trạng thái `pending`, chỉ tác giả thấy, kèm nhãn **Đang chờ duyệt**.
3. Admin mở hàng chờ duyệt và chọn:
   - **Duyệt:** review chuyển `published`, điểm quán được tính lại.
   - **Từ chối:** review chuyển `rejected` kèm lý do; tác giả thấy lý do và có thể sửa để gửi lại.
   - **Từ chối và khóa người dùng:** dùng cho spam.
4. Tác giả sửa review đã duyệt thì review quay về `pending` và tạm ẩn khỏi trang quán cho tới khi được duyệt lại.

### 6.5. Báo cáo

1. Người dùng báo cáo review của người khác, chọn lý do.
2. Admin xử lý báo cáo: ẩn review (báo cáo `resolved`) hoặc bỏ qua (báo cáo `dismissed`).

## 7. Yêu cầu chức năng — Web Admin (FR-A)

Giao diện: EJS + Bootstrap 5 (đóng gói cục bộ, không dùng CDN), responsive, tiếng Việt. Mọi form có validation phía server, hiển thị lỗi theo từng trường và giữ lại dữ liệu đã nhập. Mọi thao tác xóa có hộp xác nhận.

### FR-A01 — Đăng nhập admin

- Đăng nhập bằng username hoặc email và mật khẩu.
- Không có trang đăng ký. Admin đầu tiên tạo bằng lệnh `npm run admin:create`.
- Session lưu trong MySQL, cookie `httpOnly`, `secure` (production), `sameSite=lax`, hết hạn sau 8 giờ không hoạt động.
- Sai mật khẩu 5 lần trong 15 phút từ cùng IP hoặc cùng tài khoản thì tạm khóa đăng nhập 15 phút.
- Tạo lại session ID sau khi đăng nhập thành công.
- Có trang đổi mật khẩu admin và nút đăng xuất.

### FR-A02 — Dashboard

- Số review chờ duyệt, số báo cáo đang mở, tổng người dùng, số người dùng bị khóa, số món, số quán đang hoạt động.
- Đường tắt tới hàng chờ duyệt và danh sách báo cáo.
- 10 thao tác admin gần nhất.

### FR-A03 — Nhóm món

- Thêm, sửa, sắp xếp, ẩn nhóm món.
- Trường: tên, mã (`slug`, duy nhất), icon (chọn từ danh sách icon app hỗ trợ: `restaurant`, `local_cafe`, `fastfood`, `sports_bar`, `icecream`, `ramen_dining`, `bakery_dining`, `local_bar`), có dùng bữa ăn hay không, thứ tự hiển thị, trạng thái.
- Không xóa được nhóm còn món; phải chuyển hoặc xóa món trước.
- Dữ liệu khởi tạo: `mon-chinh` (dùng bữa ăn), `do-uong`, `an-vat`, `do-nhau`.

### FR-A04 — Món ăn

- Danh sách có tìm theo tên, lọc theo nhóm và trạng thái, phân trang 20 dòng.
- Trường:
  - Tên (2–80 ký tự, bắt buộc).
  - Nhóm món (bắt buộc).
  - Bữa ăn: một hoặc nhiều trong Ăn sáng, Ăn trưa, Ăn tối, Ăn đêm. Bắt buộc nếu nhóm dùng bữa ăn, bị bỏ qua nếu không.
  - Giá tham khảo (1.000–10.000.000đ, bắt buộc). Dùng cho trọng số ngân sách của vòng quay.
  - Độ hiếm: Thường, Hiếm, Sử thi, Huyền thoại, Cổ vật. Mặc định tự suy ra từ giá theo bảng hiện có trong app (< 50k Thường, < 80k Hiếm, < 130k Sử thi, < 170k Huyền thoại, còn lại Cổ vật); admin có thể chọn khác.
  - Ảnh (một ảnh, JPEG/PNG/WebP, tối đa 5 MB). Có xem trước, thay, xóa ảnh.
  - Mô tả ngắn (tối đa 300 ký tự, không bắt buộc).
  - Trạng thái: `active` hoặc `hidden`.
- Màn hình sửa món hiển thị danh sách quán đang bán món đó.
- Xóa món: xóa liên kết quán–món; review đang tham chiếu món này giữ nguyên nhưng trường món đã ăn thành rỗng; ảnh món bị xóa khỏi ổ đĩa.

### FR-A05 — Quán ăn

- Danh sách có tìm theo tên, lọc theo khu vực, trạng thái, món bán; phân trang 20 dòng.
- Trường:
  - Tên quán (2–120 ký tự, bắt buộc).
  - Khu vực (bắt buộc): `fpt` (Gần Đại học FPT), `vnu` (Gần ĐHQG Hà Nội), `hhtp` (Khu Công nghệ cao Hòa Lạc), `other` (Khu vực Hòa Lạc khác).
  - Địa chỉ (bắt buộc, tối đa 255 ký tự).
  - Link Google Maps (không bắt buộc). Chỉ chấp nhận `https://` với host `google.com`, `www.google.com`, `maps.google.com`, `maps.app.goo.gl`, `goo.gl`. Nếu để trống, app tìm theo "tên quán + Hòa Lạc".
  - Số điện thoại (không bắt buộc, 9–15 chữ số).
  - Giờ mở cửa dạng văn bản (không bắt buộc, ví dụ "06:00–22:00").
  - Giá tối thiểu và tối đa mỗi người (bắt buộc, tối thiểu ≤ tối đa).
  - Nhãn (không bắt buộc): Giá sinh viên, Phù hợp nhóm đông, Mở khuya, Có chỗ ngồi, Mang đi.
  - Ảnh bìa (một ảnh, tối đa 5 MB).
  - Mô tả (tối đa 500 ký tự).
  - Trạng thái: `active` hoặc `hidden`.
- **Thực đơn của quán:** trong trang sửa quán, admin thêm món từ danh sách món có sẵn, nhập giá tại quán (không bắt buộc, mặc định dùng giá tham khảo của món), đánh dấu món nổi bật, xóa món khỏi quán. Một món chỉ xuất hiện một lần trong thực đơn của một quán.
- Điểm trung bình và số review hiển thị chỉ đọc, admin không sửa tay.
- Xóa quán: xóa luôn review, ảnh review, báo cáo liên quan và file ảnh bìa. Hộp xác nhận ghi rõ số review sẽ bị xóa. Nếu chỉ muốn tạm ngừng, admin chọn `hidden`.

### FR-A06 — Duyệt review

- Trang hàng chờ hiển thị review `pending`, cũ nhất trước, 20 dòng mỗi trang.
- Mỗi dòng: người viết (tên, email, số review đã duyệt, số review bị từ chối), quán, số sao, nội dung, món đã ăn, chi phí, ngày ghé, ảnh thu nhỏ (bấm để xem lớn), thời điểm gửi, đánh dấu "đã sửa sau khi duyệt" nếu có.
- Thao tác từng review: **Duyệt**, **Từ chối** (bắt buộc chọn lý do: Spam/quảng cáo, Nội dung xúc phạm, Không liên quan tới quán, Ảnh không phù hợp, Lý do khác + ghi chú), **Từ chối và khóa người dùng**.
- Thao tác hàng loạt: chọn nhiều review để duyệt hoặc từ chối cùng lý do.
- Trang tất cả review: lọc theo trạng thái, quán, người dùng, số sao; admin có thể ẩn (`hidden`), hiện lại (`published`) hoặc xóa vĩnh viễn (xóa cả file ảnh).
- Mọi thay đổi trạng thái liên quan tới `published` đều tính lại điểm quán trong cùng transaction.

### FR-A07 — Báo cáo review

- Danh sách báo cáo `open`, gom theo review, sắp theo số báo cáo giảm dần.
- Mỗi mục: nội dung review, tác giả, danh sách người báo cáo với lý do và ghi chú.
- Thao tác: **Ẩn review** (mọi báo cáo `open` của review chuyển `resolved`), **Bỏ qua** (chuyển `dismissed`), **Ẩn review và khóa tác giả**.
- Review có từ 3 báo cáo `open` trở lên được tô nổi bật trên dashboard. Review không tự ẩn vì bị báo cáo.

### FR-A08 — Người dùng và khóa tài khoản

- Danh sách người dùng: tìm theo email hoặc tên, lọc theo trạng thái (chưa xác minh, hoạt động, bị khóa).
- Trang chi tiết: thông tin tài khoản, các review và trạng thái, các báo cáo đã gửi, lịch sử khóa.
- **Khóa:** chọn thời hạn (1 ngày, 7 ngày, 30 ngày, vĩnh viễn) và lý do (bắt buộc). Khi khóa:
  - Thu hồi mọi refresh token của người dùng.
  - Tùy chọn kèm theo: ẩn toàn bộ review `published` và từ chối mọi review `pending` của người đó.
- **Mở khóa** thủ công bất kỳ lúc nào. Khóa có thời hạn tự hết hạn, server kiểm tra `blocked_until` ở mỗi request ghi.
- Admin không xem được mật khẩu và không đặt mật khẩu hộ người dùng.

### FR-A09 — Nhật ký thao tác admin

- Ghi lại mọi thao tác tạo, sửa, xóa, duyệt, từ chối, ẩn, khóa, mở khóa: admin nào, thao tác gì, đối tượng nào, thời điểm, IP, tóm tắt thay đổi.
- Trang xem nhật ký có lọc theo admin, loại thao tác, khoảng thời gian.
- Không ghi mật khẩu, token hoặc OTP vào nhật ký.

## 8. Yêu cầu chức năng — Tài khoản người dùng (FR-U)

### FR-U01 — Đăng ký

- Trường: email (bắt buộc, chuẩn hóa chữ thường, tối đa 254 ký tự), mật khẩu (8–72 ký tự, có ít nhất một chữ cái và một chữ số), tên hiển thị (2–40 ký tự sau khi bỏ khoảng trắng đầu/cuối).
- Email đã tồn tại và đã xác minh: trả `EMAIL_TAKEN`.
- Email đã tồn tại nhưng chưa xác minh: cập nhật mật khẩu và tên mới, gửi OTP mới (tuân theo giới hạn gửi lại). Việc này cho phép đăng ký lại nếu người dùng mất OTP.
- Tài khoản chưa xác minh quá 7 ngày bị xóa bởi job dọn dẹp.

### FR-U02 — OTP qua email

- OTP 6 chữ số, sinh bằng `crypto.randomInt`, lưu dạng hash (HMAC-SHA256 với `OTP_SECRET`), hết hạn sau 10 phút.
- Mục đích: `verify_email` hoặc `reset_password`. Mỗi email chỉ có một OTP còn hiệu lực cho mỗi mục đích; gửi OTP mới thì OTP cũ mất hiệu lực.
- Nhập sai 5 lần thì OTP mất hiệu lực, phải gửi lại.
- Gửi lại: cách nhau ít nhất 60 giây, tối đa 5 lần mỗi giờ cho một email, tối đa 20 lần mỗi giờ cho một IP.
- Email gửi từ `"Hôm nay ăn gì" <contact@homnayangi.site>`, có cả bản HTML và bản text, nêu rõ mã, thời hạn và ghi chú "Nếu bạn không yêu cầu, hãy bỏ qua email này".
- Môi trường dev: nếu `MAIL_TRANSPORT=console` thì in OTP ra console thay vì gửi email.

### FR-U03 — Đăng nhập, phiên và đăng xuất

- Đăng nhập bằng email và mật khẩu. Sai thông tin trả chung một lỗi `INVALID_CREDENTIALS`, không tiết lộ email có tồn tại hay không.
- Email chưa xác minh: trả `EMAIL_NOT_VERIFIED`; app chuyển sang màn hình OTP và có nút gửi lại.
- Thành công: trả access token (JWT HS256, sống 15 phút, chứa `sub` = user id và `tv` = token version) và refresh token (chuỗi ngẫu nhiên 48 byte, sống 30 ngày, server chỉ lưu hash).
- Refresh token **xoay vòng**: mỗi lần làm mới, token cũ bị thu hồi và cấp token mới. Nếu một token đã thu hồi bị dùng lại, server thu hồi toàn bộ token của người dùng đó.
- Đăng xuất: thu hồi refresh token hiện tại.
- Đổi mật khẩu hoặc đặt lại mật khẩu: thu hồi mọi refresh token và tăng `token_version`, khiến mọi access token cũ không còn hợp lệ.
- Sai mật khẩu 10 lần trong 15 phút cho một email thì tạm chặn đăng nhập email đó 15 phút.

### FR-U04 — Quên mật khẩu

- Bước 1: nhập email. Server luôn trả thành công dù email có tồn tại hay không, chỉ gửi OTP nếu tài khoản tồn tại.
- Bước 2: nhập OTP và mật khẩu mới. Thành công thì đặt lại mật khẩu, thu hồi phiên cũ và đánh dấu email đã xác minh.

### FR-U05 — Hồ sơ

- Xem hồ sơ: email, tên hiển thị, ngày tạo, trạng thái khóa (nếu có, kèm lý do và thời hạn).
- Đổi tên hiển thị (cùng quy tắc với đăng ký). Review cũ hiển thị tên mới vì tên được lấy theo `user_id`, không lưu bản sao.
- Đổi mật khẩu: yêu cầu mật khẩu hiện tại.
- Xem danh sách review của chính mình ở mọi trạng thái, kèm lý do từ chối nếu có.
- Xóa tài khoản: yêu cầu nhập lại mật khẩu, xóa người dùng, review, ảnh review và báo cáo do người đó tạo.

## 9. Yêu cầu chức năng — Dữ liệu công khai (FR-P)

### FR-P01 — Danh mục món

- `GET /catalog` trả toàn bộ nhóm món `active` và món `active` thuộc các nhóm đó trong một lần gọi.
- Mỗi món gồm: id, tên, mã nhóm, các bữa ăn, giá tham khảo, độ hiếm, URL ảnh (bản lớn và thumbnail, hoặc `null`), mô tả, số quán đang bán.
- Trả kèm `version`: chuỗi thay đổi mỗi khi admin sửa nhóm món hoặc món. Hỗ trợ `ETag`/`If-None-Match`, trả `304` nếu không đổi để app tiết kiệm dữ liệu.

### FR-P02 — Quán theo món

- `GET /foods/{foodId}/restaurants` trả quán `active` có món này trong thực đơn.
- Tham số: `area` (lọc khu vực), `sort` (`rating` mặc định, `reviews`, `price`), `budget` (số tiền, dùng để ưu tiên), `page`, `limit` (mặc định 10, tối đa 50).
- Sắp xếp `rating`: điểm trung bình giảm dần, rồi số review giảm dần; quán chưa có review đứng sau cùng.
- Nếu có `budget`: quán có `price_min ≤ budget` được đưa lên trước trong cùng tiêu chí sắp xếp. Quán ngoài ngân sách không bị loại.
- Mỗi quán gồm: id, tên, khu vực, địa chỉ, URL ảnh bìa, khoảng giá, giá của món này tại quán, điểm trung bình, số review, tối đa 2 món nổi bật, nhãn, link Google Maps.
- Món không tồn tại hoặc bị ẩn: trả `404 FOOD_NOT_FOUND`.

### FR-P03 — Danh sách quán và chi tiết quán

- `GET /restaurants`: danh sách quán `active`, lọc theo `area`, tìm theo `q`, phân trang. Dùng cho màn hình tìm quán trong app nếu cần sau này và cho kiểm thử.
- `GET /restaurants/{id}`: chi tiết quán gồm mọi trường công khai, thực đơn (món, giá tại quán, nổi bật), phân bố số sao (số review cho mỗi mức 1–5).
- Quán `hidden` trả `404`.

### FR-P04 — Danh sách review của quán

- `GET /restaurants/{id}/reviews` chỉ trả review `published`.
- Tham số: `sort` (`newest` mặc định, `highest`, `lowest`), `withImages` (`true` để chỉ lấy review có ảnh), `page`, `limit` (mặc định 10, tối đa 30).
- Mỗi review gồm: id, tác giả (id, tên hiển thị), số sao, nội dung, món đã ăn (id, tên), chi phí, ngày ghé, ảnh (URL lớn và thumbnail), thời điểm đăng, `edited` (có sửa sau lần duyệt đầu hay không).
- Nếu request có access token hợp lệ, server trả thêm `myReview`: review của người dùng hiện tại tại quán này ở mọi trạng thái (kể cả `hidden`), kèm trạng thái và lý do từ chối. App dựa vào trường này để hiện nút **Viết review** hay **Sửa review của bạn**.

## 10. Yêu cầu chức năng — Review và báo cáo (FR-R)

### FR-R01 — Trạng thái review

| Trạng thái | Ý nghĩa | Ai thấy |
|---|---|---|
| `pending` | Mới gửi hoặc vừa sửa, chờ duyệt | Tác giả, admin |
| `published` | Đã duyệt | Mọi người |
| `rejected` | Admin từ chối, có lý do | Tác giả, admin |
| `hidden` | Admin ẩn sau khi đã đăng (vi phạm, bị báo cáo) | Tác giả (nhãn "Đã bị ẩn"), admin |

- Chuyển trạng thái hợp lệ:
  - Người dùng tạo → `pending`.
  - Người dùng sửa review `pending`, `published` hoặc `rejected` → `pending`.
  - Người dùng không sửa được review `hidden`, chỉ xóa được.
  - Admin: `pending` → `published` hoặc `rejected`; `published` → `hidden`; `hidden` → `published`.
- Xóa (bởi tác giả hoặc admin) là xóa vĩnh viễn bản ghi và file ảnh.

### FR-R02 — Viết review

- Chỉ người dùng đã xác minh email, không bị khóa.
- Mỗi người một review cho mỗi quán (ràng buộc `UNIQUE` trong DB). Gửi lần hai trả `409 REVIEW_EXISTS` kèm id review hiện có.
- Trường bắt buộc: số sao (số nguyên 1–5), nội dung (10–500 ký tự sau khi bỏ khoảng trắng đầu/cuối), ngày ghé (không ở tương lai, không cũ hơn 1 năm).
- Trường không bắt buộc: món đã ăn (phải thuộc thực đơn của quán), chi phí thực tế (số nguyên 1.000–10.000.000đ), tối đa 3 ảnh.
- Request dạng `multipart/form-data`, gửi dữ liệu và ảnh trong cùng một request. Server kiểm tra hết rồi mới ghi; lỗi ở bất kỳ bước nào thì không tạo review và xóa file tạm. Nhờ vậy không có ảnh mồ côi.
- Nội dung lưu dạng văn bản thuần. Server bỏ ký tự điều khiển; app và web admin hiển thị bằng text, không render HTML.

### FR-R03 — Sửa review

- Chỉ tác giả. Không đổi được quán hoặc tác giả.
- Gửi lại toàn bộ trường. Ảnh: danh sách id ảnh cũ muốn giữ (`keepImageIds`) cộng ảnh mới, tổng không quá 3. Ảnh cũ không được giữ bị xóa khỏi ổ đĩa sau khi ghi DB thành công.
- Sau khi sửa: trạng thái thành `pending`, `updated_at` đổi, `created_at` giữ nguyên. Nếu review từng `published` thì `edited_after_publish = true` và điểm quán được tính lại (review rời khỏi phần tính điểm cho tới khi được duyệt lại).

### FR-R04 — Xóa review

- Tác giả xóa review của mình ở mọi trạng thái. App có hộp xác nhận.
- Xóa bản ghi, ảnh và báo cáo liên quan; tính lại điểm quán nếu review đang `published`.

### FR-R05 — Ảnh review

- Định dạng nhận: JPEG, PNG, WebP. Server kiểm tra bằng nội dung file (magic bytes qua `sharp`), không tin phần mở rộng hay `Content-Type`.
- Tối đa 3 ảnh, mỗi ảnh tối đa 5 MB, tổng request tối đa 16 MB.
- App thu nhỏ ảnh về cạnh dài 1600 px trước khi gửi.
- Server dùng `sharp`: xoay theo EXIF rồi xóa toàn bộ metadata (kể cả GPS), chuyển sang WebP chất lượng 80, cạnh dài tối đa 1600 px; tạo thumbnail cạnh dài 400 px. Tên file là UUID ngẫu nhiên.
- Đường dẫn: `uploads/reviews/{reviewId}/{uuid}.webp` và `{uuid}_thumb.webp`. Ảnh món và quán dùng `uploads/foods/` và `uploads/restaurants/` với cùng cách xử lý.

### FR-R06 — Chống spam

- Giới hạn theo người dùng: tối đa 5 review mới mỗi 24 giờ, tối đa 20 lần sửa mỗi 24 giờ, tối đa 10 báo cáo mỗi 24 giờ. Vượt giới hạn trả `429 RATE_LIMITED` kèm `retryAfter` (giây).
- Giới hạn theo IP cho mọi API ghi: 60 request mỗi 15 phút.
- Người dùng có từ 3 review bị từ chối với lý do "Spam/quảng cáo" trong 30 ngày được gắn cờ "nghi spam" trên web admin để admin cân nhắc khóa. Server không tự khóa.
- Tài khoản bị khóa gọi API ghi nhận `403 ACCOUNT_BLOCKED` kèm `reason` và `blockedUntil` (`null` nếu vĩnh viễn).

### FR-R07 — Báo cáo review

- Chỉ người dùng đã xác minh, không bị khóa, với review `published` của người khác.
- Lý do: `offensive` (Nội dung xúc phạm), `spam` (Spam hoặc quảng cáo), `misleading` (Thông tin sai lệch), `inappropriate_image` (Hình ảnh không phù hợp), `other` (Lý do khác). Ghi chú tối đa 300 ký tự, bắt buộc khi chọn `other`.
- Mỗi người một báo cáo cho mỗi review (`UNIQUE`). Báo cáo lần hai trả `409 ALREADY_REPORTED`.
- Báo cáo tự mình: `400 CANNOT_REPORT_OWN_REVIEW`.

### FR-R08 — Điểm trung bình quán

- Chỉ tính từ review `published`. Lưu `rating_avg` (DECIMAL(2,1), làm tròn một chữ số thập phân) và `review_count` trên bảng `restaurants`.
- Tính lại bằng câu `SELECT AVG, COUNT` trong cùng transaction với thao tác làm thay đổi tập review `published` (duyệt, ẩn, hiện, sửa review đã đăng, xóa).
- Có lệnh `npm run ratings:recalculate` để tính lại toàn bộ khi cần.

## 11. Yêu cầu chức năng — App Flutter (FR-M)

### FR-M01 — Nguồn dữ liệu món

- Xóa `lib/data/sample_foods.dart`, các atlas `assets/images/foods-*.png` và logic `imageIndex`/`imageAsset`.
- Khi mở app:
  1. Đọc danh mục từ cache (`shared_preferences`, khóa `catalog_cache`, gồm JSON và `version`) và hiển thị ngay.
  2. Gọi `GET /catalog` kèm `If-None-Match`. Nhận `200` thì cập nhật cache và giao diện; nhận `304` thì giữ nguyên.
  3. Lỗi mạng mà đã có cache: dùng cache, hiện thông báo nhỏ "Đang dùng dữ liệu đã lưu" kèm nút thử lại.
  4. Lỗi mạng và chưa có cache: hiện màn hình "Cần kết nối mạng để tải danh sách món lần đầu" với nút **Thử lại**.
  5. Danh mục trống: hiện "Chưa có món nào. Vui lòng quay lại sau."
- Kéo xuống để làm mới (pull-to-refresh) ở tab Món ăn.
- Không cập nhật danh mục trong lúc vòng quay đang chạy hoặc hộp kết quả đang mở; áp dụng sau khi đóng.

### FR-M02 — Nhóm món, bữa ăn, độ hiếm

- Nhóm món lấy từ server, không còn là `enum` cố định. Icon map từ mã icon server gửi (danh sách ở FR-A03); mã lạ thì dùng `Icons.restaurant`.
- Bữa ăn giữ 4 giá trị cố định: `breakfast`, `lunch`, `dinner`, `late_night`. Bộ lọc bữa chỉ hiện khi nhóm đang chọn có `usesMealPeriods = true`.
- Độ hiếm giữ 5 giá trị và màu như hiện tại.
- Ngân sách giữ nguyên 4 mức và công thức trọng số hiện có.

### FR-M03 — Dữ liệu cá nhân trên máy

- Giữ: yêu thích, món ẩn, lịch sử quay, nhóm món và ngân sách đã chọn.
- ID món lưu cục bộ dạng chuỗi của id số từ server (ví dụ `"12"`).
- Yêu thích và món ẩn trỏ tới id không còn trong danh mục thì bị bỏ qua khi tính, không gây lỗi.
- Nhóm món đã lưu không còn tồn tại thì chọn nhóm đầu tiên.
- Lịch sử giữ tên và giá tại thời điểm quay nên vẫn hiển thị được khi món bị xóa.
- Lần đầu chạy bản mới: xóa khóa `custom_foods`, `favorite_food_ids`, `excluded_food_ids`, `spin_history`, `selected_category` cũ (id cũ dạng `pho-bo` không còn khớp) và đặt `data_schema_version = 2`.

### FR-M04 — Bỏ tính năng món tự tạo

- Xóa `FoodFormPage` và các nút thêm, sửa, xóa món trong tab Món ăn.
- Tab Món ăn còn: tìm kiếm, lọc nhóm, đánh dấu yêu thích, ẩn/hiện món khỏi vòng quay, xem số quán đang bán món.

### FR-M05 — Ảnh món

- Hiển thị ảnh từ URL server bằng `cached_network_image` (cache trên đĩa). Dải quay và lưới dùng thumbnail, hộp kết quả dùng ảnh lớn.
- Món không có ảnh hoặc ảnh lỗi: hiển thị icon của nhóm món trên nền màu độ hiếm.

### FR-M06 — Vòng quay

- Giữ nguyên animation 5 giây, mũi tên và món thắng khớp với thẻ dừng.
- Vòng quay không gọi mạng.

### FR-M07 — Quán trong hộp kết quả

Thứ tự nội dung hộp kết quả:

1. Độ hiếm, tên món, giá tham khảo, ảnh.
2. Nút yêu thích và **Chia sẻ** như hiện tại.
3. Tiêu đề **Quán phù hợp tại Hòa Lạc**.
4. Tối đa 3 thẻ quán, gọi `GET /foods/{id}/restaurants?limit=3&budget=...`.
5. Nút **Xem tất cả quán (N)** nếu tổng số quán lớn hơn 3.
6. Nút **TIẾP TỤC**.

- Thẻ quán: ảnh bìa, tên, khu vực, giá món tại quán (hoặc khoảng giá), điểm trung bình kèm số review (hoặc **Chưa có đánh giá**), tối đa 2 món nổi bật, nút **Xem review**, nút **Google Maps**.
- Đang tải: skeleton 3 thẻ. Lỗi: "Không tải được danh sách quán" và nút **Thử lại**. Lỗi không ảnh hưởng phần còn lại của hộp kết quả.
- Không có quán: "Chưa có quán Hòa Lạc nào được ghi nhận cho món này." và nút **Tìm trên Google Maps** với từ khóa "tên món Hòa Lạc".
- Hộp kết quả cuộn được, không overflow trên màn hình 390 × 844.

### FR-M08 — Màn hình danh sách quán

- App bar: tên món.
- Bộ lọc khu vực (Tất cả, Gần FPT, Gần ĐHQG, Khu CNC, Khác) và sắp xếp (Đánh giá cao, Nhiều review, Giá thấp).
- Cuộn vô hạn theo trang 10 quán. Có trạng thái tải, lỗi kèm thử lại, danh sách trống.

### FR-M09 — Màn hình chi tiết quán

- Ảnh bìa, tên, khu vực, địa chỉ, giờ mở cửa, số điện thoại, khoảng giá, nhãn, mô tả.
- Thực đơn: món và giá tại quán, món nổi bật đứng trước.
- Điểm trung bình, số review, biểu đồ phân bố sao.
- Nút **Mở Google Maps** và nút review:
  - Khách: **Viết review**; bấm vào chuyển tới đăng nhập, đăng nhập xong quay lại trang quán.
  - Chưa có review: **Viết review**.
  - Đã có review: thẻ "Review của bạn" ở đầu danh sách với trạng thái (Đang chờ duyệt, Đã đăng, Bị từ chối kèm lý do, Đã bị ẩn) và nút **Sửa**, **Xóa** (review `hidden` chỉ có **Xóa**).
- Danh sách review: sắp xếp (Mới nhất, Điểm cao, Điểm thấp), lọc **Có ảnh**, cuộn vô hạn 10 review mỗi trang.
- Mỗi review: chữ cái đầu tên, tên, số sao, nội dung, món đã ăn, chi phí, ngày ghé, thời điểm đăng, nhãn **Đã chỉnh sửa**, ảnh (bấm để xem lớn, vuốt qua lại), menu **Báo cáo** với review người khác.

### FR-M10 — Màn hình tài khoản

- Thêm tab thứ 4 **Tài khoản** vào thanh điều hướng.
- Chưa đăng nhập: nút **Đăng nhập** và **Đăng ký**.
- Đã đăng nhập: tên, email, trạng thái khóa (nếu có), **Review của tôi**, **Đổi tên**, **Đổi mật khẩu**, **Đăng xuất**, **Xóa tài khoản**.
- Màn hình đăng ký, đăng nhập, nhập OTP (đếm ngược 60 giây cho nút gửi lại), quên mật khẩu, đặt lại mật khẩu. Validation giống server để báo lỗi sớm; vẫn hiển thị lỗi server trả về.

### FR-M11 — Phiên đăng nhập trên app

- Access token và refresh token lưu bằng `flutter_secure_storage`, không lưu trong `shared_preferences`.
- API client tự gọi `POST /auth/refresh` khi nhận `401 TOKEN_EXPIRED`, rồi gửi lại request một lần. Nhiều request cùng hết hạn chỉ làm mới một lần.
- Làm mới thất bại: xóa token, chuyển về trạng thái khách, thông báo "Phiên đăng nhập đã hết hạn".

### FR-M12 — Form review

- Chọn sao (bắt buộc), nội dung có bộ đếm 500 ký tự, chọn món đã ăn từ thực đơn quán, chi phí, ngày ghé (mặc định hôm nay), tối đa 3 ảnh từ thư viện (`image_picker`, `maxWidth`/`maxHeight` 1600, `imageQuality` 85).
- Xem trước và xóa từng ảnh. Chặn ảnh thứ tư và ảnh lớn hơn 5 MB sau khi nén.
- Lần đầu viết review: thông báo tên hiển thị, nội dung và ảnh sẽ hiển thị công khai sau khi được duyệt.
- Nút gửi bị khóa và hiện tiến trình trong lúc gửi. Thất bại thì giữ nguyên nội dung form.
- Thành công: thông báo "Review đã gửi và đang chờ duyệt", quay lại trang quán.
- Sửa review đã đăng: cảnh báo review sẽ tạm ẩn cho tới khi được duyệt lại.

### FR-M13 — Báo cáo trên app

- Bottom sheet chọn lý do, ghi chú (bắt buộc nếu chọn Lý do khác). Thành công: "Đã tiếp nhận báo cáo". Đã báo cáo rồi: "Bạn đã báo cáo review này".

### FR-M14 — Cấu hình môi trường app

- URL API truyền qua `--dart-define=API_BASE_URL=...`. Mặc định `https://homnayangi.site/api/v1`.
- Dev trên Android emulator dùng `http://10.0.2.2:3000/api/v1`; chỉ bản debug được phép HTTP (cấu hình `network_security_config` riêng cho debug).
- Khai báo quyền `INTERNET` trong `android/app/src/main/AndroidManifest.xml` (bản release cần quyền này).

## 12. Cơ sở dữ liệu MySQL

### 12.1. Quy ước chung

- MySQL 8.0, engine InnoDB, charset `utf8mb4`, collation `utf8mb4_unicode_ci`.
- Khóa chính `id INT UNSIGNED AUTO_INCREMENT` trừ khi ghi khác.
- Thời gian lưu `DATETIME` theo UTC (`timezone: 'Z'` trong `mysql2`). API trả chuỗi ISO 8601 có `Z`. Ngày ghé quán lưu `DATE`.
- Tiền lưu `INT UNSIGNED` theo đồng.
- Migration bằng file SQL đánh số trong `server/migrations/` (ví dụ `001_init.sql`), chạy bằng `npm run migrate`. Bảng `schema_migrations` ghi các file đã chạy.
- Mọi câu SQL dùng placeholder `?` của `mysql2`, không nối chuỗi dữ liệu người dùng.

### 12.2. Tài khoản và phiên

**`admins`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `username` | VARCHAR(40) UNIQUE | |
| `email` | VARCHAR(254) UNIQUE | |
| `password_hash` | VARCHAR(100) | bcrypt cost 12 |
| `failed_login_count` | TINYINT UNSIGNED | Mặc định 0 |
| `locked_until` | DATETIME NULL | Khóa tạm do sai mật khẩu |
| `last_login_at` | DATETIME NULL | |
| `created_at`, `updated_at` | DATETIME | |

**`sessions`**: bảng của `express-mysql-session` (`session_id`, `expires`, `data`) cho session admin.

**`users`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `email` | VARCHAR(254) UNIQUE | Chữ thường |
| `password_hash` | VARCHAR(100) | bcrypt cost 12 |
| `display_name` | VARCHAR(40) | |
| `email_verified_at` | DATETIME NULL | NULL = chưa xác minh |
| `token_version` | INT UNSIGNED | Mặc định 0, tăng khi đổi mật khẩu |
| `blocked_until` | DATETIME NULL | Hết hạn khóa |
| `blocked_permanent` | BOOLEAN | Mặc định false |
| `block_reason` | VARCHAR(255) NULL | |
| `failed_login_count` | TINYINT UNSIGNED | |
| `login_locked_until` | DATETIME NULL | |
| `created_at`, `updated_at` | DATETIME | |

Người dùng bị khóa khi `blocked_permanent = true` hoặc `blocked_until > NOW()`.

**`user_blocks`**: lịch sử khóa. `user_id` FK → `users` ON DELETE CASCADE, `admin_id` FK → `admins` ON DELETE SET NULL, `action` ENUM(`block`, `unblock`), `duration_days` SMALLINT NULL (NULL = vĩnh viễn), `reason` VARCHAR(255), `created_at`.

**`email_otps`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `email` | VARCHAR(254) | |
| `purpose` | ENUM(`verify_email`, `reset_password`) | |
| `code_hash` | CHAR(64) | HMAC-SHA256 của OTP với `OTP_SECRET` |
| `attempts` | TINYINT UNSIGNED | Số lần nhập sai |
| `expires_at` | DATETIME | |
| `consumed_at` | DATETIME NULL | |
| `created_at` | DATETIME | Dùng để tính giới hạn gửi lại |

Index `(email, purpose, created_at)`.

**`refresh_tokens`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `user_id` | FK → `users` ON DELETE CASCADE | |
| `token_hash` | CHAR(64) UNIQUE | SHA-256 |
| `family_id` | CHAR(36) | UUID, cùng một chuỗi xoay vòng |
| `expires_at` | DATETIME | |
| `revoked_at` | DATETIME NULL | |
| `replaced_by_id` | INT UNSIGNED NULL | Token mới thay thế |
| `user_agent` | VARCHAR(255) NULL | |
| `created_at` | DATETIME | |

### 12.3. Danh mục món và quán

**`food_categories`**: `slug` VARCHAR(40) UNIQUE, `name` VARCHAR(40), `icon` VARCHAR(40), `uses_meal_periods` BOOLEAN, `sort_order` SMALLINT, `status` ENUM(`active`, `hidden`), `created_at`, `updated_at`.

**`foods`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `category_id` | FK → `food_categories` ON DELETE RESTRICT | |
| `name` | VARCHAR(80) | UNIQUE cùng `category_id` |
| `reference_price` | INT UNSIGNED | |
| `rarity` | ENUM(`common`, `rare`, `epic`, `legendary`, `ancient`) | |
| `image_path`, `thumb_path` | VARCHAR(255) NULL | Đường dẫn tương đối trong `uploads/` |
| `description` | VARCHAR(300) NULL | |
| `status` | ENUM(`active`, `hidden`) | Index |
| `created_at`, `updated_at` | DATETIME | |

**`food_meal_periods`**: `food_id` FK → `foods` ON DELETE CASCADE, `meal_period` ENUM(`breakfast`, `lunch`, `dinner`, `late_night`). Khóa chính `(food_id, meal_period)`.

**`restaurants`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `name` | VARCHAR(120) | |
| `area` | ENUM(`fpt`, `vnu`, `hhtp`, `other`) | Index |
| `address` | VARCHAR(255) | |
| `google_maps_url` | VARCHAR(500) NULL | |
| `phone` | VARCHAR(15) NULL | |
| `opening_hours` | VARCHAR(100) NULL | |
| `price_min`, `price_max` | INT UNSIGNED | CHECK `price_min <= price_max` |
| `tags` | SET(`student_price`, `group_friendly`, `late_night`, `seating`, `takeaway`) | |
| `cover_path`, `cover_thumb_path` | VARCHAR(255) NULL | |
| `description` | VARCHAR(500) NULL | |
| `rating_avg` | DECIMAL(2,1) NULL | NULL khi chưa có review |
| `review_count` | INT UNSIGNED | Mặc định 0 |
| `status` | ENUM(`active`, `hidden`) | Index |
| `created_at`, `updated_at` | DATETIME | |

**`restaurant_foods`**: `restaurant_id` FK → `restaurants` ON DELETE CASCADE, `food_id` FK → `foods` ON DELETE CASCADE, `price` INT UNSIGNED NULL, `is_featured` BOOLEAN, `sort_order` SMALLINT. Khóa chính `(restaurant_id, food_id)`, index `(food_id)`.

**`app_settings`**: `key` VARCHAR(40) PK, `value` VARCHAR(255). Dùng để lưu `catalog_version` (tăng mỗi khi admin sửa nhóm món, món hoặc liên kết quán–món).

### 12.4. Review, báo cáo, nhật ký

**`reviews`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `restaurant_id` | FK → `restaurants` ON DELETE CASCADE | |
| `user_id` | FK → `users` ON DELETE CASCADE | UNIQUE `(restaurant_id, user_id)` |
| `food_id` | FK → `foods` ON DELETE SET NULL, NULL | Món đã ăn |
| `rating` | TINYINT UNSIGNED | CHECK 1–5 |
| `comment` | VARCHAR(500) | |
| `amount_spent` | INT UNSIGNED NULL | |
| `visit_date` | DATE | |
| `status` | ENUM(`pending`, `published`, `rejected`, `hidden`) | |
| `reject_reason` | ENUM(`spam`, `offensive`, `irrelevant`, `inappropriate_image`, `other`) NULL | |
| `moderation_note` | VARCHAR(300) NULL | Ghi chú admin, tác giả thấy được |
| `moderated_by` | FK → `admins` ON DELETE SET NULL, NULL | |
| `moderated_at` | DATETIME NULL | |
| `published_at` | DATETIME NULL | Lần duyệt đầu tiên |
| `edited_after_publish` | BOOLEAN | |
| `created_at`, `updated_at` | DATETIME | |

Index: `(restaurant_id, status, created_at)`, `(restaurant_id, status, rating)`, `(status, created_at)`, `(user_id, created_at)`.

**`review_images`**: `review_id` FK → `reviews` ON DELETE CASCADE, `image_path` VARCHAR(255), `thumb_path` VARCHAR(255), `width` SMALLINT, `height` SMALLINT, `sort_order` TINYINT, `created_at`. File trên đĩa được xóa bằng code trước khi xóa bản ghi (CASCADE không xóa file).

**`review_reports`**: `review_id` FK → `reviews` ON DELETE CASCADE, `reporter_id` FK → `users` ON DELETE CASCADE, `reason` ENUM(`offensive`, `spam`, `misleading`, `inappropriate_image`, `other`), `details` VARCHAR(300) NULL, `status` ENUM(`open`, `resolved`, `dismissed`), `handled_by` FK → `admins` NULL, `handled_at` DATETIME NULL, `created_at`. UNIQUE `(review_id, reporter_id)`, index `(status, created_at)`.

**`admin_audit_logs`**: `admin_id` FK → `admins` ON DELETE SET NULL, `action` VARCHAR(40) (ví dụ `food.create`, `review.approve`, `user.block`), `target_type` VARCHAR(30), `target_id` INT UNSIGNED NULL, `summary` VARCHAR(500), `ip` VARCHAR(45), `created_at`. Index `(created_at)`, `(admin_id, created_at)`.

## 13. REST API v1

### 13.1. Quy ước

- Base URL: `https://homnayangi.site/api/v1`. Request và response JSON UTF-8, trừ request có ảnh dùng `multipart/form-data`.
- Tên trường JSON dạng `camelCase`. ID trả dạng số.
- Xác thực: header `Authorization: Bearer <accessToken>`.
- Thành công: trả object dữ liệu trực tiếp. Danh sách có phân trang:

```json
{ "items": [], "page": 1, "limit": 10, "total": 42, "hasMore": true }
```

- Lỗi: luôn có dạng

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Thông báo tiếng Việt", "fields": { "comment": "Bình luận phải từ 10 đến 500 ký tự" } } }
```

- Mã lỗi chung:

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Dữ liệu không hợp lệ, có `fields` |
| 401 | `UNAUTHENTICATED` | Thiếu token hoặc token sai |
| 401 | `TOKEN_EXPIRED` | Access token hết hạn, app cần refresh |
| 403 | `EMAIL_NOT_VERIFIED` | Chưa xác minh email |
| 403 | `ACCOUNT_BLOCKED` | Bị khóa, có `reason`, `blockedUntil` |
| 403 | `FORBIDDEN` | Không có quyền với tài nguyên |
| 404 | `NOT_FOUND`, `FOOD_NOT_FOUND`, `RESTAURANT_NOT_FOUND`, `REVIEW_NOT_FOUND` | |
| 409 | `EMAIL_TAKEN`, `REVIEW_EXISTS`, `ALREADY_REPORTED` | Xung đột |
| 413 | `PAYLOAD_TOO_LARGE` | File hoặc request quá lớn |
| 415 | `UNSUPPORTED_IMAGE` | File không phải ảnh JPEG/PNG/WebP |
| 429 | `RATE_LIMITED`, `OTP_COOLDOWN` | Vượt giới hạn, có `retryAfter` |
| 500 | `INTERNAL_ERROR` | Lỗi server, không lộ chi tiết |

- Header `X-App-Version` (không bắt buộc) để ghi log phiên bản app.
- `GET /health` trả `{ "status": "ok" }` để kiểm tra server.

### 13.2. Xác thực

| Method | Đường dẫn | Quyền | Body | Kết quả |
|---|---|---|---|---|
| POST | `/auth/register` | Khách | `email`, `password`, `displayName` | `201 { email, otpExpiresIn, resendAfter }` |
| POST | `/auth/verify-email` | Khách | `email`, `code` | `200 { accessToken, refreshToken, expiresIn, user }` |
| POST | `/auth/resend-otp` | Khách | `email`, `purpose` | `200 { otpExpiresIn, resendAfter }` |
| POST | `/auth/login` | Khách | `email`, `password` | `200 { accessToken, refreshToken, expiresIn, user }` |
| POST | `/auth/refresh` | Khách | `refreshToken` | `200 { accessToken, refreshToken, expiresIn }` |
| POST | `/auth/logout` | Khách | `refreshToken` | `204` |
| POST | `/auth/forgot-password` | Khách | `email` | `200` (luôn thành công) |
| POST | `/auth/reset-password` | Khách | `email`, `code`, `newPassword` | `200 { accessToken, refreshToken, expiresIn, user }` |

Lỗi OTP: `400 OTP_INVALID` (kèm `attemptsLeft`), `400 OTP_EXPIRED`, `429 OTP_COOLDOWN`.

`user` gồm: `id`, `email`, `displayName`, `createdAt`, `blocked` (`null` hoặc `{ reason, until }`).

### 13.3. Người dùng hiện tại

| Method | Đường dẫn | Body | Kết quả |
|---|---|---|---|
| GET | `/me` | | `user` |
| PATCH | `/me` | `displayName` | `user` |
| POST | `/me/change-password` | `currentPassword`, `newPassword` | `200 { accessToken, refreshToken, expiresIn }` |
| DELETE | `/me` | `password` | `204` |
| GET | `/me/reviews` | Query `page`, `limit`, `status` | Danh sách review của tôi, kèm thông tin quán |

Tất cả yêu cầu đăng nhập. Người dùng bị khóa vẫn gọi được `GET /me`, `GET /me/reviews`, `POST /me/change-password` và `DELETE /me`; riêng `PATCH /me` trả `403 ACCOUNT_BLOCKED`.

### 13.4. Dữ liệu công khai

| Method | Đường dẫn | Query | Ghi chú |
|---|---|---|---|
| GET | `/catalog` | | `{ version, categories: [...], foods: [...] }`, hỗ trợ `ETag` |
| GET | `/foods/{id}` | | Chi tiết một món |
| GET | `/foods/{id}/restaurants` | `area`, `sort`, `budget`, `page`, `limit` | FR-P02 |
| GET | `/restaurants` | `area`, `q`, `page`, `limit` | FR-P03 |
| GET | `/restaurants/{id}` | | FR-P03, kèm `menu` và `ratingDistribution` |
| GET | `/restaurants/{id}/reviews` | `sort`, `withImages`, `page`, `limit` | FR-P04, kèm `myReview` nếu có token |

Không cần đăng nhập. Token gửi kèm mà hết hạn hoặc sai thì vẫn trả dữ liệu công khai, chỉ bỏ `myReview`.

Ví dụ một món trong `/catalog`:

```json
{
  "id": 12, "name": "Bún chả", "categorySlug": "mon-chinh",
  "mealPeriods": ["lunch", "dinner"], "referencePrice": 45000, "rarity": "rare",
  "imageUrl": "https://homnayangi.site/uploads/foods/9f3c....webp",
  "thumbUrl": "https://homnayangi.site/uploads/foods/9f3c..._thumb.webp",
  "description": null, "restaurantCount": 3
}
```

### 13.5. Review và báo cáo

| Method | Đường dẫn | Body | Kết quả |
|---|---|---|---|
| POST | `/restaurants/{id}/reviews` | multipart: `rating`, `comment`, `visitDate` (YYYY-MM-DD), `foodId?`, `amountSpent?`, `images[]` (0–3) | `201 review` (trạng thái `pending`) |
| PUT | `/reviews/{id}` | multipart: như trên + `keepImageIds[]` | `200 review` (trạng thái `pending`) |
| DELETE | `/reviews/{id}` | | `204` |
| POST | `/reviews/{id}/reports` | `reason`, `details?` | `201` |

Yêu cầu đăng nhập, email đã xác minh, không bị khóa (trừ `DELETE /reviews/{id}`, người bị khóa vẫn xóa được review của mình). Sửa hoặc xóa review của người khác trả `403 FORBIDDEN`.

## 14. Web admin — Danh sách trang

Tất cả dưới `/admin`, yêu cầu session admin trừ trang đăng nhập. Mọi form `POST` có CSRF token.

| Đường dẫn | Chức năng |
|---|---|
| `GET/POST /admin/login`, `POST /admin/logout` | FR-A01 |
| `GET/POST /admin/account/password` | Đổi mật khẩu admin |
| `GET /admin` | Dashboard (FR-A02) |
| `/admin/categories` (danh sách, `new`, `:id/edit`, `:id/delete`) | FR-A03 |
| `/admin/foods` (danh sách, `new`, `:id/edit`, `:id/delete`, `:id/image/delete`) | FR-A04 |
| `/admin/restaurants` (danh sách, `new`, `:id/edit`, `:id/delete`, `:id/cover/delete`) | FR-A05 |
| `/admin/restaurants/:id/menu` (thêm, sửa giá/nổi bật, xóa món) | FR-A05 |
| `GET /admin/reviews/pending`, `POST /admin/reviews/bulk` | FR-A06 |
| `GET /admin/reviews`, `POST /admin/reviews/:id/{approve,reject,hide,unhide,delete}` | FR-A06 |
| `GET /admin/reports`, `POST /admin/reports/review/:reviewId/{hide,dismiss}` | FR-A07 |
| `GET /admin/users`, `GET /admin/users/:id`, `POST /admin/users/:id/{block,unblock}` | FR-A08 |
| `GET /admin/audit-logs` | FR-A09 |

## 15. Bảo mật

- HTTPS bắt buộc ở production (Nginx + Let's Encrypt, chuyển hướng HTTP sang HTTPS, HSTS).
- `helmet` với Content-Security-Policy chỉ cho phép tài nguyên cùng origin (Bootstrap đóng gói cục bộ).
- Mật khẩu băm bằng `bcrypt` cost 12. Không ghi mật khẩu, token, OTP vào log.
- Secret (`JWT_SECRET`, `OTP_SECRET`, `SESSION_SECRET`) dài tối thiểu 32 byte ngẫu nhiên, chỉ nằm trong `.env` trên server, không commit. Server từ chối khởi động nếu thiếu.
- Validation mọi input bằng `zod` ở cả API và form admin.
- SQL luôn dùng placeholder. Không có câu SQL nào ghép chuỗi từ input.
- EJS chỉ dùng `<%= %>` (tự escape) cho dữ liệu người dùng; cấm `<%- %>` với dữ liệu người dùng.
- CSRF cho web admin bằng synchronizer token lưu trong session.
- Rate limit bằng `express-rate-limit` (giới hạn theo IP) cộng kiểm tra DB (giới hạn theo người dùng và email, xem FR-U02, FR-U03, FR-R06). Express đặt `trust proxy` = 1 để lấy đúng IP sau Nginx.
- Upload: `multer` lưu vào thư mục tạm với giới hạn kích thước và số file; `sharp` đọc lại để xác nhận là ảnh; file cuối cùng lưu ngoài thư mục mã nguồn; Nginx phục vụ `uploads/` với `X-Content-Type-Options: nosniff` và không thực thi script.
- CORS: chỉ bật cho `/api/v1`, danh sách origin cấu hình qua `CORS_ORIGINS` (cho Flutter Web). App Android không cần CORS.
- Kiểm tra quyền sở hữu ở server trong mọi thao tác sửa/xóa review; không tin `userId` gửi từ client.
- Không trả email người dùng khác qua API công khai.
- Sao lưu: `mysqldump` hằng ngày lúc 03:00, giữ 14 bản, nén gzip; sao lưu thư mục `uploads/` hằng tuần. Có hướng dẫn khôi phục trong README server.

## 16. Kiến trúc và triển khai server

### 16.1. Công nghệ

- Node.js 22 LTS, Express 5, EJS, `mysql2/promise`, `zod`, `bcrypt`, `jsonwebtoken`, `nodemailer`, `multer`, `sharp`, `express-session` + `express-mysql-session`, `helmet`, `express-rate-limit`, `cors`, `pino` (log), `dotenv`.
- Test: `jest` + `supertest`, chạy với DB test riêng.
- Lint: `eslint` + `prettier`.
- Phiên bản package ghi chính xác trong `package.json` và commit `package-lock.json`.

### 16.2. Cấu trúc thư mục

```
server/
├── src/
│   ├── app.js              # Tạo Express app (dùng cho test)
│   ├── server.js           # Khởi động HTTP
│   ├── config.js           # Đọc và kiểm tra .env
│   ├── db.js               # Pool mysql2, helper transaction
│   ├── middleware/         # auth JWT, admin session, csrf, rate limit, upload, error
│   ├── modules/
│   │   ├── auth/           # đăng ký, OTP, đăng nhập, refresh
│   │   ├── users/
│   │   ├── catalog/        # nhóm món, món
│   │   ├── restaurants/
│   │   ├── reviews/
│   │   ├── reports/
│   │   └── audit/
│   ├── services/           # mailer, image (sharp), storage, rating
│   ├── routes/api.js       # gắn router /api/v1
│   ├── routes/admin.js     # gắn router /admin
│   └── views/              # EJS: layouts, partials, admin/*
├── public/                 # CSS, JS, Bootstrap cục bộ
├── migrations/             # 001_init.sql, ...
├── scripts/                # migrate, create-admin, seed-dev, recalc-ratings, cleanup, backup
├── tests/
├── uploads/                # (dev) — production dùng UPLOAD_DIR ngoài mã nguồn
├── .env.example
├── ecosystem.config.cjs    # PM2
└── README.md               # Hướng dẫn chạy, deploy, khôi phục
```

Mỗi module gồm `*.routes.js` (router), `*.schema.js` (zod), `*.service.js` (nghiệp vụ, SQL), `*.admin.js` (controller trang admin nếu có).

### 16.3. Biến môi trường (`.env.example`)

| Biến | Ví dụ | Ghi chú |
|---|---|---|
| `NODE_ENV` | `production` | `development`, `test`, `production` |
| `HOST` | `127.0.0.1` | Địa chỉ lắng nghe; production giữ `127.0.0.1` để chỉ Nginx truy cập |
| `PORT` | `3000` | |
| `PUBLIC_BASE_URL` | `https://homnayangi.site` | Dùng để tạo URL ảnh |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | | User DB riêng, chỉ quyền trên DB của app |
| `DB_CONNECTION_LIMIT` | `10` | Số kết nối tối đa của pool |
| `JWT_SECRET`, `OTP_SECRET`, `SESSION_SECRET` | | Mỗi secret ≥ 32 byte ngẫu nhiên |
| `ACCESS_TOKEN_TTL` | `900` | Giây |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | |
| `MAIL_TRANSPORT` | `smtp` | `smtp` hoặc `console` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `smtp.hostinger.com`, `465`, `true` | |
| `SMTP_USER`, `SMTP_PASSWORD` | `contact@homnayangi.site`, | |
| `MAIL_FROM` | `"Hôm nay ăn gì" <contact@homnayangi.site>` | |
| `UPLOAD_DIR` | `/var/www/homnayangi/uploads` | |
| `CORS_ORIGINS` | `https://homnayangi.site` | Phân tách bằng dấu phẩy |
| `LOG_LEVEL` | `info` | |

### 16.4. Triển khai VPS

- Ubuntu 22.04/24.04, người dùng deploy riêng (không chạy app bằng root), SSH bằng key, tắt đăng nhập mật khẩu.
- `ufw`: chỉ mở 22, 80, 443. MySQL chỉ lắng nghe `127.0.0.1`.
- Node.js 22 LTS, PM2 chạy `server/src/server.js` với `ecosystem.config.cjs`, `pm2 startup` để tự khởi động lại.
- Nginx:
  - `homnayangi.site` và `www.homnayangi.site` (chuyển về bản không www).
  - `location /uploads/` phục vụ thẳng từ `UPLOAD_DIR`, cache 30 ngày.
  - `location /` proxy tới `127.0.0.1:3000`, chuyển `X-Forwarded-For`, `X-Forwarded-Proto`.
  - `client_max_body_size 20m`.
- Certbot (Let's Encrypt) cấp và tự gia hạn chứng chỉ.
- DNS: bản ghi `A` cho `@` và `www` trỏ về IP VPS. Bản ghi email (MX, SPF, DKIM, DMARC) theo hướng dẫn Hostinger Email để OTP không vào thư rác.
- Quy trình deploy: `git pull` → `npm ci --omit=dev` → `npm run migrate` → `pm2 reload`.

### 16.5. Job định kỳ (cron)

- Mỗi giờ: xóa OTP hết hạn quá 24 giờ, refresh token hết hạn hoặc thu hồi quá 7 ngày, file tạm upload quá 1 giờ.
- Mỗi ngày: xóa tài khoản chưa xác minh quá 7 ngày; sao lưu DB.
- Mỗi tuần: sao lưu `uploads/`.
- Các job là script trong `server/scripts/`, chạy bằng crontab của người dùng deploy, không chạy timer trong process Node.

## 17. Yêu cầu phi chức năng

### Hiệu năng

- API đọc công khai trả trong dưới 300 ms (p95) với 1.000 món, 200 quán, 20.000 review trên VPS 2 vCPU.
- Danh sách review và quán luôn phân trang; không có API trả toàn bộ review.
- App dùng thumbnail cho danh sách, chỉ tải ảnh lớn khi xem chi tiết.
- Vòng quay không chờ mạng.

### Khả năng phục hồi

- Mất mạng: vòng quay, yêu thích, món ẩn, lịch sử vẫn hoạt động với danh mục đã cache.
- Mọi phần phụ thuộc mạng trên app có trạng thái tải, lỗi kèm **Thử lại**, và trống.
- Mọi thao tác ghi trên app chống bấm lặp.
- Lỗi gửi email OTP: API trả `503 MAIL_UNAVAILABLE`, không tạo OTP mới để người dùng thử lại sau.

### Riêng tư

- Trước lần viết review đầu tiên, app thông báo tên hiển thị, nội dung và ảnh sẽ công khai sau khi duyệt.
- Ảnh tải lên bị xóa toàn bộ metadata (kể cả GPS).
- Không thu thập vị trí người dùng.
- Người dùng tự xóa được review và tài khoản của mình.
- Log server không chứa mật khẩu, token, OTP, nội dung review hay email đầy đủ (email được che, ví dụ `ng***@gmail.com`).

### Trải nghiệm và khả năng tiếp cận

- App không overflow trên màn hình 390 × 844 và 360 × 640.
- Nút chỉ có icon (sao, ảnh, menu) có tooltip hoặc semantic label.
- Trạng thái (chờ duyệt, bị từ chối, bị khóa) thể hiện bằng chữ, không chỉ bằng màu.
- Web admin dùng được trên màn hình từ 1280 px và trên điện thoại cho thao tác duyệt review; form có `label` gắn với input; thông báo lỗi đọc được bằng trình đọc màn hình (`aria-describedby`).
- Kiểm tra đầy đủ khả năng tiếp cận cần thử thủ công bằng TalkBack và trình đọc màn hình; tài liệu này không thay cho kiểm định WCAG.

## 18. Dữ liệu khởi tạo

- Migration tạo sẵn 4 nhóm món mặc định (FR-A03).
- `npm run admin:create`: tạo admin đầu tiên (hỏi username, email, mật khẩu trên terminal; mật khẩu không hiện khi gõ).
- `npm run seed:dev` (chỉ chạy khi `NODE_ENV=development`): tạo dữ liệu giả để dev và test: món, 20 quán giả có tên ghi rõ "[Mẫu]", người dùng mẫu, review ở các trạng thái.
- `npm run seed:legacy-foods` (tùy chọn): nhập 57 món cũ của app vào MySQL, cắt ảnh từ các atlas cũ thành ảnh từng món. Trước khi xóa dữ liệu món khỏi app (FR-M01), danh sách 57 món được xuất thành `server/seed/legacy-foods/foods.json` và 10 atlas được chép vào `server/seed/legacy-foods/atlases/`; script chỉ đọc từ thư mục này. Chạy nhiều lần không tạo trùng (so theo nhóm + tên món).
- Dữ liệu quán thật do nhóm khảo sát và nhập trên web admin. Không lấy ảnh hoặc review từ Google Maps khi không có quyền dùng.

## 19. Tiêu chí nghiệm thu

### Server và web admin

1. Admin đăng nhập được; sai mật khẩu 5 lần bị tạm khóa 15 phút; không có trang đăng ký admin.
2. Admin thêm, sửa, ẩn, xóa được nhóm món, món (kèm ảnh), quán (kèm ảnh bìa); gắn món vào quán kèm giá.
3. Món hoặc quán `hidden` không xuất hiện trong API công khai.
4. Đăng ký gửi OTP tới email thật qua `contact@homnayangi.site`; OTP sai 5 lần hoặc quá 10 phút bị từ chối; gửi lại trước 60 giây bị chặn.
5. Đăng nhập, refresh, đăng xuất, quên mật khẩu hoạt động; refresh token cũ dùng lại bị từ chối và làm mất toàn bộ phiên.
6. Review mới ở `pending`, không xuất hiện công khai cho tới khi admin duyệt.
7. Duyệt, ẩn, hiện, xóa review đều cập nhật đúng `rating_avg` và `review_count`.
8. Người dùng không tạo được review thứ hai cho cùng quán, không sửa/xóa được review người khác.
9. Ảnh thứ tư, ảnh > 5 MB, file không phải ảnh (kể cả đổi đuôi) bị từ chối; không để lại file mồ côi.
10. Ảnh đã lưu không còn metadata EXIF/GPS.
11. Người dùng bị khóa không viết review, không báo cáo được, nhận lỗi kèm lý do và thời hạn; hết hạn thì tự mở.
12. Vượt giới hạn 5 review/ngày trả `429`.
13. Báo cáo trùng bị từ chối; admin ẩn hoặc bỏ qua được báo cáo.
14. Mọi thao tác admin có trong nhật ký.
15. Form admin không có CSRF token bị từ chối; dữ liệu có `<script>` hiển thị dạng text.
16. Server chạy trên VPS qua HTTPS, tự khởi động lại sau reboot, có backup DB hằng ngày.

### App Flutter

17. Lần đầu mở app có mạng: tải danh mục từ server và quay được.
18. Tắt mạng rồi mở lại app: vẫn quay được bằng cache; phần quán hiện lỗi kèm thử lại.
19. Quay ra món có quán: hộp kết quả hiện tối đa 3 quán đúng thứ tự; món không có quán hiện trạng thái trống và nút Google Maps.
20. Khách xem được quán và review; bấm viết review thì được đưa tới đăng nhập.
21. Đăng ký, nhập OTP, đăng nhập, đăng xuất, quên mật khẩu chạy trên app.
22. Viết review 0–3 ảnh thành công, thấy nhãn "Đang chờ duyệt"; sau khi admin duyệt thì review hiện công khai.
23. Sửa, xóa review của mình; báo cáo review người khác.
24. Access token hết hạn được làm mới tự động, người dùng không bị đăng xuất.
25. `flutter analyze` không lỗi, `flutter test` qua, build APK release và Flutter Web thành công.

## 20. Kiểm thử

### Server (`jest` + `supertest`, DB MySQL test riêng)

- Unit: validation zod, sinh/kiểm tra OTP, xoay vòng refresh token, tính điểm, sắp xếp quán theo ngân sách, kiểm tra URL Google Maps.
- Integration API: toàn bộ luồng auth, catalog + ETag, quán theo món (lọc, sắp xếp, phân trang), CRUD review kèm ảnh, quyền sở hữu, khóa tài khoản, rate limit, báo cáo.
- Integration admin: đăng nhập, CSRF, CRUD món/quán, duyệt review cập nhật điểm, khóa người dùng thu hồi token.
- Mailer dùng transport giả trong test, kiểm tra nội dung email chứa OTP.
- Lệnh: `npm test`, `npm run lint`.

### App Flutter

- Unit: parse JSON model, cache danh mục, migrate dữ liệu cũ, API client refresh token (mock HTTP), lọc và trọng số vòng quay với dữ liệu từ server.
- Widget: hộp kết quả (có quán, không có quán, lỗi), danh sách quán, chi tiết quán, form review (validation, giới hạn ảnh), màn hình OTP.
- Cập nhật các test hiện có trong `test/` cho mô hình dữ liệu mới.
- Thử tay trên Android emulator với server local và trên điện thoại thật với server production.

## 21. Hạng mục bàn giao

- `server/`: mã nguồn, migration, script, test, `.env.example`, `README.md` (chạy local, deploy VPS, Nginx, PM2, Certbot, cron, backup và khôi phục).
- App Flutter đã chuyển sang API.
- `README.md` gốc cập nhật cho app mới.
- `TASKS.md` được đánh dấu đầy đủ.

## 22. Quyết định đã chốt

- Backend là Node.js + Express + EJS + MySQL trên VPS; không dùng Firebase.
- Một app Node phục vụ cả `/admin` và `/api/v1` trên `homnayangi.site`.
- Đăng nhập bằng email + mật khẩu + OTP email; không có đăng nhập Google trong MVP.
- Kho món do admin quản lý trên server; xóa dữ liệu món viết cứng và atlas khỏi app; bỏ món tự tạo.
- Vòng quay ra món chung; quán là danh sách riêng, liên kết nhiều–nhiều với món, có giá riêng tại từng quán.
- Review phải được admin duyệt mới hiển thị; sửa review đã đăng thì phải duyệt lại.
- Mỗi người một review cho mỗi quán, tối đa 3 ảnh.
- Chống spam bằng duyệt bài, giới hạn tần suất và khóa tài khoản do admin quyết định.
- Dữ liệu cá nhân (yêu thích, món ẩn, lịch sử, lựa chọn) vẫn lưu trên máy; token lưu trong secure storage.
- Thứ tự triển khai: server và web admin, deploy, rồi app Flutter. Tiến độ theo dõi trong `TASKS.md`.

## 23. Phạm vi mở rộng sản phẩm — phiên bản 2.1

Phần này bổ sung cho các yêu cầu trước, không thay đổi quy trình duyệt review quán. Các quyết định được xác nhận ngày 12/11/2026 tại `requirements-mo-rong.md` mục 7 có hiệu lực khi khác với đề xuất ở mục 23 này. Mã `FR-C`, `FR-G`, `FR-PM` tương ứng cộng đồng, nhóm và thực đơn.

### 23.1. Mục tiêu và thứ tự ưu tiên

1. **P1 — Cộng đồng ẩm thực:** chia sẻ trải nghiệm, tương tác và khám phá nội dung từ người khác.
2. **P2 — Chọn món theo nhóm:** cùng bạn bè chọn một món chung trong phòng.
3. **P3 — Lập thực đơn:** lên kế hoạch ăn uống và theo dõi món đã ăn.

Mỗi phần cần có API, giao diện Flutter, lưu trữ, kiểm thử và các chức năng quản trị liên quan. Trong từng phần, triển khai server và app đủ cho một luồng hoàn chỉnh trước khi chuyển ưu tiên tiếp theo. Trạng thái triển khai được theo dõi riêng trong `TASKS.md`; tài liệu này không khẳng định các chức năng mới đã hoàn thành.

### 23.2. Quyền và nguyên tắc chung

- Khách xem nội dung cộng đồng công khai và hồ sơ công khai; cần đăng nhập và xác minh email để thực hiện thao tác ghi, tham gia phòng hoặc sử dụng thực đơn cá nhân.
- Người dùng bị khóa chỉ có quyền đọc như khách; mọi thao tác ghi mới trả `ACCOUNT_BLOCKED` theo quy tắc hiện có.
- Người dùng chỉ sửa hoặc xóa nội dung và dữ liệu thuộc quyền của mình; quyền chủ phòng được nêu tại FR-G01. Server kiểm tra quyền ở mọi request, không chỉ dựa vào giao diện.
- Mọi danh sách dài có phân trang; app hiển thị trạng thái tải, trống, lỗi và thử lại. Thao tác ghi chống gửi lặp; khi lỗi giữ lại nội dung chưa gửi.
- Xử lý văn bản như dữ liệu, không thực thi HTML; kiểm tra file ảnh thực tế, giới hạn kích thước, xóa metadata và dọn file khi thao tác thất bại. Áp dụng HTTPS, giới hạn tần suất, nhật ký an toàn và kiểm tra quyền theo các mục 15 và 17.

### 23.3. P1 — Cộng đồng ẩm thực

**Phân biệt với review:** review dùng để chấm điểm và nhận xét một quán, tiếp tục theo mục 10. Bài cộng đồng là nội dung chia sẻ linh hoạt, có thể không gắn quán; bài đăng và lượt thích không làm thay đổi điểm quán.

#### FR-C01 — Bài đăng

- Người dùng tạo bài có nội dung văn bản, tối đa 3 ảnh và tùy chọn gắn một món, một quán, hoặc cả hai. Bài phải có nội dung hoặc ít nhất một ảnh.
- Tác giả xem, sửa và xóa bài của mình; thao tác xóa có xác nhận. Sửa cho phép giữ hoặc xóa ảnh cũ và thêm ảnh mới trong giới hạn.
- Đề xuất giới hạn nội dung 2.000 ký tự, ảnh tối đa 5 MB mỗi file; server kiểm tra trước khi lưu. App hiển thị bộ đếm và lỗi theo trường.
- Bài công khai hiển thị tác giả, thời gian, nội dung, ảnh, món/quán được gắn và số lượt thích, bình luận. Mở món/quán dẫn tới thông tin tương ứng; nếu liên kết không còn công khai, bài vẫn xem được nhưng không dẫn tới dữ liệu bị ẩn hoặc xóa.
- Bài đã bị admin ẩn không xuất hiện trong bảng tin hoặc hồ sơ công khai; tác giả thấy trạng thái và không được sửa để tự hiện lại. Khi xóa bài, các tương tác liên quan và ảnh thuộc bài cũng được xóa.

#### FR-C02 — Bảng tin và hồ sơ công khai

- Bảng tin **Mới nhất** hiển thị các bài công khai theo thời gian tạo giảm dần, phân trang; có bộ lọc **Đang theo dõi** cho người đã đăng nhập. Khách chọn bộ lọc này được đưa tới đăng nhập.
- Trang chi tiết hiển thị bài, ảnh xem lớn và bình luận; trang hồ sơ công khai hiển thị tên, số người theo dõi, số người đang theo dõi và danh sách bài công khai của người đó.
- Bảng tin không sử dụng thuật toán đề xuất ở phiên bản đầu. Dữ liệu email và thông tin riêng của tài khoản không xuất hiện trên hồ sơ công khai.

#### FR-C03 — Thích, bình luận và theo dõi

- Người dùng thích hoặc bỏ thích bài công khai; mỗi tài khoản có tối đa một lượt thích trên một bài. Hiển thị số lượt thích và trạng thái của người dùng hiện tại.
- Người dùng thêm bình luận dạng văn bản, tối đa đề xuất 500 ký tự, trên bài công khai; được xóa bình luận của mình sau xác nhận. Bình luận hiển thị theo thời gian tạo, có phân trang. Không hỗ trợ ảnh hoặc trả lời lồng nhau trong phiên bản đầu.
- Người dùng theo dõi hoặc bỏ theo dõi người khác, không tự theo dõi chính mình; mỗi cặp chỉ có một quan hệ theo dõi. Hiển thị trạng thái và số lượng trên hồ sơ.
- Không cho tương tác mới với bài hoặc bình luận đã bị ẩn hay xóa. Khi tác giả xóa bài, bình luận và lượt thích của bài không còn hiển thị.

#### FR-C04 — Báo cáo và quản trị cộng đồng

- Người dùng đăng nhập báo cáo bài hoặc bình luận của người khác bằng lý do và thông tin bổ sung tùy chọn; không báo cáo nội dung của chính mình hoặc gửi báo cáo trùng đang mở cho cùng nội dung.
- Web admin liệt kê và lọc bài, bình luận, báo cáo; xem nội dung, tác giả, lý do và thời gian. Admin xử lý báo cáo bằng ẩn nội dung hoặc bỏ qua; có thể hiện lại hoặc xóa nội dung, và khóa tác giả theo cơ chế hiện có. Xóa có xác nhận.
- Ghi nhật ký thao tác admin; báo cáo có trạng thái mở, đã xử lý hoặc bỏ qua. Hành động lặp hoặc nội dung đã bị xóa phải được xử lý an toàn và trả thông báo rõ ràng.
- Đề xuất bài và bình luận hiển thị ngay sau khi đăng, sau đó xử lý theo báo cáo; không áp dụng hàng chờ duyệt review cho bài cộng đồng. Chính sách này cần xác nhận tại mục 23.7.

#### FR-C05 — Quyền riêng tư và xóa tài khoản

- Trước lần đăng bài hoặc bình luận đầu tiên, thông báo tên hiển thị, nội dung và ảnh sẽ công khai. Không hiển thị email; không ghi nội dung bài, bình luận, token hoặc email đầy đủ vào log.
- Khi xóa tài khoản, xóa bài, ảnh, bình luận, lượt thích và quan hệ theo dõi của tài khoản; cập nhật số đếm và xử lý báo cáo liên quan mà không để dữ liệu cá nhân hoặc file mồ côi. Giữ nhật ký quản trị theo chính sách hiện có và không đưa nội dung đã xóa vào nhật ký.

### 23.4. P2 — Chọn món theo nhóm

#### FR-G01 — Phòng và thành viên

- Người dùng đã đăng nhập tạo phòng, chọn nhóm món và ngân sách; hệ thống cấp mã mời khó đoán để người khác đã đăng nhập tham gia. Chủ phòng chia sẻ mã bằng chức năng chia sẻ của thiết bị hoặc sao chép mã.
- Phòng hiển thị danh sách thành viên, người chủ, bộ lọc, danh sách món và trạng thái. Thành viên có thể rời phòng; chủ phòng có thể kết thúc phòng. Khi chủ rời, phòng kết thúc; mỗi người đang ở phòng nhận trạng thái kết thúc.
- Chỉ thành viên xem và thao tác trong phòng; chỉ chủ phòng đổi bộ lọc, bắt đầu bỏ phiếu/quay và kết thúc phòng. Người dùng bị khóa không tạo, tham gia hoặc thao tác ghi trong phòng.

#### FR-G02 — Chọn món và kết quả

- Trong giai đoạn chọn món, mỗi thành viên có thể đánh dấu chọn hoặc loại từng món và thay đổi lựa chọn trước khi chủ phòng bắt đầu quyết định. Danh sách ứng viên phải được tính thống nhất trên server theo quy tắc đã chốt.
- Chủ phòng chọn **bỏ phiếu** hoặc **quay**. Khi bỏ phiếu, mỗi thành viên có một phiếu cho một món ứng viên và có thể đổi phiếu trước khi chủ phòng chốt; kết quả dựa trên số phiếu. Khi quay, server chọn một kết quả trong danh sách ứng viên và gửi cùng kết quả tới mọi thành viên.
- Không bắt đầu khi không có món ứng viên; hiển thị lý do và cho phép quay về bước chọn. Quy tắc hòa, thời hạn bỏ phiếu và cách xử lý thành viên không bỏ phiếu cần chốt tại mục 23.7.
- Ngăn gửi lặp và đồng thời chốt nhiều kết quả; hiển thị cùng trạng thái/kết quả cho các thành viên, kể cả khi một người ngắt kết nối rồi vào lại phòng còn hoạt động. Không phụ thuộc việc máy chủ phòng tiếp tục mở màn hình.

### 23.5. P3 — Lập thực đơn

#### FR-PM01 — Kế hoạch theo ngày và tuần

- Người dùng xem kế hoạch cá nhân theo ngày hoặc tuần; thêm món từ danh mục vào ngày và bữa sáng, trưa, tối hoặc bữa khác. Một bữa có thể có nhiều món.
- Người dùng chuyển món sang ngày/bữa khác hoặc xóa khỏi kế hoạch; thao tác xóa có xác nhận. Dữ liệu gắn với tài khoản và được tải lại khi đăng nhập trên thiết bị khác.
- Hiển thị tên món, giá tham khảo nếu còn, ngày, bữa và trạng thái. Món không còn trong danh mục công khai vẫn hiển thị tên đã lưu và được phép xóa, nhưng không thể thêm mới.

#### FR-PM02 — Muốn thử và đã ăn

- Người dùng lưu hoặc bỏ lưu món trong danh sách **Muốn thử**, xem danh sách và thêm món còn hoạt động vào kế hoạch. Mỗi món chỉ xuất hiện một lần trong danh sách muốn thử của một người.
- Đánh dấu một mục kế hoạch là **Đã ăn** hoặc hoàn tác; lịch sử đã ăn hiển thị theo ngày và có phân trang. Chỉ đánh dấu khi người dùng xác nhận đã ăn; kết quả quay không tự động trở thành lịch sử đã ăn.
- Kế hoạch, danh sách muốn thử và lịch sử đã ăn chỉ chủ tài khoản xem/sửa được; xóa tài khoản thì xóa các dữ liệu này.

### 23.6. Tiêu chí nghiệm thu và kiểm thử

**P1 — Cộng đồng:**

1. Khách xem được bài công khai và hồ sơ nhưng không thể ghi; người dùng bị khóa không thể đăng, tương tác hoặc báo cáo qua API.
2. Người dùng tạo, sửa, xóa bài và ảnh của mình; không sửa/xóa bài người khác. Nội dung rỗng không ảnh, ảnh thứ tư, file giả ảnh và ảnh vượt giới hạn bị từ chối; không để lại file mồ côi.
3. Bảng tin mới nhất và đang theo dõi trả đúng bài, thứ tự và phân trang; bài ẩn không xuất hiện công khai. Bài không ảnh hưởng điểm quán.
4. Like/unlike không tạo trùng; bình luận đúng quyền và giới hạn; theo dõi/bỏ theo dõi không trùng và không tự theo dõi.
5. Báo cáo trùng đang mở bị từ chối; admin ẩn, hiện, xóa nội dung và xử lý báo cáo, các thao tác được ghi nhật ký. Nội dung có thẻ script chỉ hiển thị dạng văn bản.
6. Xóa tài khoản xóa dữ liệu cộng đồng và ảnh liên quan; API và giao diện không còn hiển thị dữ liệu đã xóa.

**P2 — Nhóm:**

7. Người dùng tạo phòng, chia sẻ mã, thành viên tham gia/rời phòng; người ngoài không truy cập được. Chỉ chủ phòng chốt hoặc kết thúc.
8. Các thành viên thấy lựa chọn và cùng một kết quả; phòng không chốt hai kết quả khi gửi đồng thời; không thể bắt đầu với danh sách rỗng; kết nối lại khôi phục trạng thái phòng còn hoạt động.

**P3 — Thực đơn:**

9. Người dùng thêm, chuyển, xóa món trong ngày/tuần; dữ liệu tồn tại sau đăng xuất và đăng nhập lại, không truy cập được bởi tài khoản khác.
10. Danh sách muốn thử không trùng; đánh dấu và hoàn tác đã ăn cập nhật lịch sử đúng; quay món không tự ghi nhận đã ăn.

Viết test server cho validation, quyền, phân trang, thao tác đồng thời và xóa dữ liệu; widget test cho các luồng chính, trạng thái lỗi và giới hạn ảnh. Kiểm tra thủ công trên Android và Flutter Web, bao gồm trường hợp nhiều thiết bị cùng tham gia phòng.

### 23.7. Quy tắc cần xác nhận trước khi triển khai

- **Cộng đồng:** bài/bình luận hiển thị ngay và xử lý theo báo cáo, hay phải duyệt trước như review? Xác nhận giới hạn nội dung, ảnh và tần suất đăng; xác định thời gian lưu báo cáo và nhật ký sau khi xóa nội dung/tài khoản.
- **Nhóm:** một người loại món có loại món đó khỏi kết quả chung không? Chốt số thành viên tối đa, thời hạn phòng/mã, cách chốt khi hòa hoặc không có phiếu, và liệu chỉ tài khoản đã xác minh được tham gia.
- **Thực đơn:** xác nhận có đồng bộ theo tài khoản như đề xuất không; phạm vi hiện tại không bao gồm nhắc giờ, tính dinh dưỡng hoặc tự tạo món.
- **Thông báo:** phiên bản đầu không có push notification theo mục 4.2; nếu cần báo khi có người theo dõi, bình luận hoặc mời vào phòng, phải xác định thêm phạm vi và kênh thông báo.

