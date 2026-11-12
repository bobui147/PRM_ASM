# API mở rộng

Base URL: `/api/v1`. Request ghi dùng `Authorization: Bearer <accessToken>` của tài khoản đã xác minh, không bị khóa. Lỗi theo định dạng chung `{error:{code,message,fields?}}`. Danh sách trả `{items,page,limit,total,hasMore}`. Các API đọc có dữ liệu cá nhân dùng token; API cộng đồng công khai cho phép khách. Tham số ID là số nguyên dương.

## Cộng đồng

- `GET /community/posts?page=1&limit=10`: bài đã duyệt, mới nhất trước. Thêm `authorId`, `following=true` hoặc `mine=true`; hai bộ lọc sau cần đăng nhập. `mine` trả cả bài chờ duyệt, từ chối và bị ẩn.
- `GET /community/posts/{id}`: bài công khai hoặc bài của chính người gọi; không trả nội dung riêng của người khác.
- `POST /community/posts`, `PUT /community/posts/{id}`: multipart gồm `content` (tối đa 2.000 ký tự), `foodId`, `restaurantId` tùy chọn, tối đa ba file `images` (5 MB/file). Khi sửa gửi `keepImageIds[0]`, `keepImageIds[1]` cho ảnh muốn giữ. Phải có text hoặc ảnh. Bài mới và bài sửa ở `pending`. Bài `hidden` không sửa được.
- `DELETE /community/posts/{id}`: tác giả xóa bài và ảnh.
- `PUT`, `DELETE /community/posts/{id}/like`: thích/bỏ thích, gọi lặp không tạo trùng.
- `GET /community/posts/{id}/comments?page=1`: bình luận đã duyệt và bình luận riêng của người gọi.
- `POST /community/posts/{id}/comments`: JSON `{content}` từ 1–500 ký tự; chờ admin duyệt.
- `DELETE /community/comments/{id}`: tác giả xóa bình luận.
- `POST /community/posts/{id}/reports`, `/community/comments/{id}/reports`: JSON `{reason,details?}`; reason là `offensive`, `spam`, `misleading`, `inappropriate_image`, `other`. Chặn báo cáo chính mình và báo cáo trùng đang mở.
- `GET /users/{id}/profile`: tên và số đếm theo dõi, trạng thái `isFollowing`; không trả email.
- `PUT`, `DELETE /users/{id}/follow`: theo dõi/bỏ theo dõi, không tự theo dõi.

Giới hạn mỗi tài khoản trong 24 giờ: 10 bài mới, 50 bình luận, 10 báo cáo; xóa nội dung không làm mất bộ đếm. Giới hạn IP chung vẫn áp dụng. Bài viết không làm thay đổi điểm quán. Admin quản lý tại `/admin/community`, có lọc bài/bình luận/báo cáo, trạng thái và ID người dùng. Thao tác quản trị dùng session và CSRF, ghi nhật ký; từ chối bắt buộc lý do. Sửa bài công khai tạm ẩn bài cho tới khi được duyệt lại; bình luận không có chức năng sửa. Xóa tài khoản xóa dữ liệu cộng đồng và thư mục ảnh của tác giả.

## Phòng nhóm

- `GET /groups?page=1`: phòng mà người gọi còn là thành viên, mới nhất trước.
- `POST /groups`: `{categoryId,budget}`. `budget` là `50000`, `100000`, `150000` hoặc `null` (không giới hạn).
- `POST /groups/join`: `{code}`; mã 16 ký tự hex, không phân biệt hoa thường; phòng tối đa 10 thành viên và hết hạn sau 24 giờ. Chỉ thêm thành viên khi `choosing`; người đang là thành viên được nối lại phòng.
- `GET /groups/{id}`: snapshot phòng dành cho thành viên. Bao gồm `members`, `candidates`, `choices`, `votes`, `result`, `status` và thời hạn. App lấy lại snapshot mỗi 3 giây khi đang mở màn hình; dừng khi app tạm ngưng. Không cần WebSocket hoặc dịch vụ bổ sung.
- `POST /groups/{id}/action`: JSON `action` và các trường tương ứng:
  - `settings`: chủ phòng đổi `categoryId,budget` khi đang chọn; xóa lựa chọn cũ vì danh sách ứng viên được tạo lại.
  - `choice`: thành viên gửi `candidateId,choice` với `select`, `exclude`, `neutral` (bỏ lựa chọn). Một người loại là loại chung. Đánh dấu chọn được hiển thị để cả nhóm tham khảo; khi quay, các món chưa bị loại đều có thể thắng, ngân sách ưu tiên xác suất.
  - `startVote`: chủ phòng khóa lựa chọn, chuyển sang `voting`.
  - `vote`: mỗi thành viên gửi một `candidateId`, đổi phiếu trước khi chốt được.
  - `spin`: chủ phòng quay từ trạng thái `choosing`; server tính một kết quả duy nhất.
  - `finishVote`: chủ phòng chốt từ `voting`; hòa chọn ngẫu nhiên trong các món đồng hạng cao nhất; không phiếu trả `NO_VOTES`.
  - `reset`: chủ phòng quay về chọn, xóa phiếu; không áp dụng khi đã chốt.
  - `leave`: thành viên rời; chủ phòng rời sẽ kết thúc phòng, trả `204`.
  - `end`: chủ phòng kết thúc phòng.

Trạng thái: `choosing → voting → decided` hoặc `choosing → decided`; mọi phòng hết hạn hoặc mất chủ phòng hiển thị `ended`. Kết quả chốt không quay lại; tạo phòng mới để chọn lần khác. Hàng phòng được khóa trong transaction khi ghi, tránh chốt hai kết quả hoặc vượt số thành viên do request đồng thời. Ứng viên là bản chụp danh mục tại lúc tạo/đổi bộ lọc; giữ tên/giá và kết quả nếu danh mục thay đổi sau đó.

## Thực đơn

- `GET /plans/entries?from=2026-11-12&to=2026-11-18&page=1`: tối đa 31 ngày mỗi request, có thể lọc `eaten=true/false`, phân trang mặc định 100, tối đa 200.
- `POST /plans/entries`: `{foodId,date:"YYYY-MM-DD",meal}`; meal là `breakfast`, `lunch`, `dinner`, `other`. Một bữa được thêm nhiều mục.
- `PATCH /plans/entries/{id}`: gửi một hoặc nhiều trường `date`, `meal`, `eaten` (boolean).
- `DELETE /plans/entries/{id}`: xóa mục thuộc chính mình.
- `GET /plans/history?page=1`: mục được xác nhận đã ăn, theo ngày giảm dần. Quay món không tự ghi vào lịch sử này.
- `GET /plans/wishlist?page=1`: món muốn thử, có `id` (ID mục muốn thử), `foodId`, `foodName`, `active`.
- `PUT /plans/wishlist/{foodId}`: lưu một món đang hoạt động, gọi lặp không tạo trùng.
- `DELETE /plans/wishlist/{wishlistEntryId}`: bỏ lưu bằng ID mục muốn thử.

Mọi dữ liệu thuộc tài khoản, được tải lại khi đăng nhập trên thiết bị khác; kiểm tra quyền ở server. Ngày là ngày lịch do người dùng chọn, không chuyển thành timestamp UTC. Lưu bản chụp tên/giá khi thêm mục; món bị xóa không làm mất kế hoạch cũ, nhưng không thể thêm món không còn hoạt động. Xóa tài khoản tự xóa kế hoạch và wishlist.

## Chạy và kiểm tra

1. Cấu hình `.env` theo README server; backup dữ liệu trước khi chạy migration trên môi trường có dữ liệu.
2. `npm ci`, sau đó `npm run migrate`. Các migration mới là `004`–`007`; không sửa migration đã chạy.
3. Chạy `npm run dev`. Trên app, dùng `flutter pub get` và `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1` cho Android emulator, hoặc URL server tương ứng.
4. Tab **Cộng đồng** nằm ở thanh điều hướng. Phòng nhóm và thực đơn mở từ tab **Tài khoản** sau đăng nhập.
5. Mỗi ngày chạy `node scripts/cleanup-community.js` để dọn báo cáo và nhật ký quá 90 ngày, bộ đếm quá 24 giờ. Ví dụ cron (thay đường dẫn): `0 2 * * * cd /srv/homnayangi/server && /usr/bin/node scripts/cleanup-community.js`. Việc cài cron trên VPS chưa được thực hiện bởi thay đổi này.
6. Cấu hình `.env.test` dùng database riêng kết thúc `_test`, thư mục upload riêng và `NODE_ENV=test`. `npm test` sẽ xóa toàn bộ bảng trong DB test. Chạy thêm `npm run lint` và `flutter analyze`, `flutter test`, build APK/Web.

Không có push notification, chat hoặc dịch vụ AI. Chia sẻ mã phòng trên web dùng sao chép khi hệ thống chia sẻ hiện tại không được hỗ trợ.
