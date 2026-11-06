# Yêu cầu sản phẩm: Quán ăn Hòa Lạc sau vòng quay

## 1. Thông tin tài liệu

- **Tên sản phẩm:** Hôm nay ăn gì? — Quán ăn Hòa Lạc
- **Phiên bản yêu cầu:** 1.0
- **Ngày:** 05/11/2026
- **Trạng thái:** Sẵn sàng triển khai MVP
- **Nền tảng ưu tiên:** Flutter Android; Flutter Web phải tiếp tục chạy được
- **Ngôn ngữ giao diện:** Tiếng Việt

## 2. Bối cảnh

Ứng dụng hiện cho phép người dùng chọn nhóm món, bữa ăn và ngân sách rồi quay ngẫu nhiên một món. Sau khi có kết quả, ứng dụng chỉ hiển thị thông tin món và mở tìm kiếm Google Maps.

Phiên bản mới phải hiển thị các quán tại khu vực Hòa Lạc có bán món vừa quay được. Dưới mỗi quán, người dùng có thể xem review và ảnh do cộng đồng đăng. Người đã ăn tại quán có thể đăng, sửa hoặc xóa review của mình.

Review cộng đồng là dữ liệu dùng chung giữa nhiều thiết bị nên không được chỉ lưu bằng `shared_preferences`. Dữ liệu quán, người dùng, review và ảnh phải được lưu trên backend.

## 3. Mục tiêu

1. Nối liền hành trình **chọn món → tìm quán → xem review → đến quán → đăng review**.
2. Chỉ giới thiệu các quán thuộc khu vực Hòa Lạc và có bán món vừa quay.
3. Cho phép mọi người xem review mà không cần đăng nhập.
4. Chỉ người đã đăng nhập mới được đăng review, tải ảnh, sửa, xóa hoặc báo cáo review.
5. Giữ nguyên các chức năng hiện có như vòng quay, kho món, ngân sách, yêu thích, món ẩn và lịch sử quay.

## 4. Phạm vi MVP

### Trong phạm vi

- Đăng nhập bằng Google.
- Danh sách quán Hòa Lạc do quản trị viên nhập trước.
- Liên kết một quán với một hoặc nhiều món hiện có trong ứng dụng.
- Hiển thị tối đa 3 quán phù hợp ngay dưới kết quả quay.
- Xem tất cả quán phù hợp trên một màn hình riêng.
- Xem trang chi tiết quán và danh sách review.
- Đăng review gồm điểm sao, bình luận và tối đa 3 ảnh.
- Sửa hoặc xóa review của chính người đăng.
- Báo cáo review không phù hợp.
- Mở địa điểm bằng Google Maps.
- Trạng thái tải, lỗi mạng và danh sách trống.
- Phân quyền đọc, viết và xóa bằng Firebase Security Rules.

### Ngoài phạm vi MVP

- Trả lời review hoặc bình luận lồng nhau.
- Like/dislike review.
- Theo dõi người dùng.
- Chat với chủ quán.
- Đặt bàn, đặt món hoặc thanh toán.
- GPS và tính khoảng cách thực tế.
- Tự động lấy hoặc sao chép review/ảnh từ Google Maps.
- Cho người dùng tự công khai quán mới mà không qua kiểm duyệt.
- AI kiểm duyệt ảnh hoặc nội dung.
- Trang quản trị trong ứng dụng; quản trị viên có thể xử lý dữ liệu bằng Firebase Console trong MVP.

## 5. Vai trò người dùng

### Khách chưa đăng nhập

- Quay món và sử dụng các chức năng hiện có.
- Xem danh sách quán, chi tiết quán, điểm trung bình, review và ảnh.
- Mở Google Maps.
- Không được đăng, sửa, xóa hoặc báo cáo review.

### Người dùng đã đăng nhập

- Có toàn bộ quyền của khách.
- Đăng tối đa một review hiện hành cho mỗi quán.
- Sửa hoặc xóa review của chính mình.
- Báo cáo review của người khác.

### Quản trị viên

- Thêm, sửa, ẩn hoặc xóa quán.
- Gắn quán với món ăn.
- Ẩn review bị báo cáo hoặc vi phạm.
- Quản lý dữ liệu bằng Firebase Console trong MVP.

## 6. Luồng chính

1. Người dùng chọn nhóm món, bữa ăn và ngân sách như hiện tại.
2. Người dùng bấm quay.
3. Ứng dụng trả về một món thắng, ví dụ **Bún chả**.
4. Ứng dụng truy vấn các quán đang hoạt động tại Hòa Lạc có `foodIds` chứa ID của món Bún chả.
5. Ngay dưới kết quả món, ứng dụng hiển thị tối đa 3 quán phù hợp.
6. Người dùng mở một quán để xem thông tin và review.
7. Người dùng có thể mở Google Maps để đến quán.
8. Sau khi ăn, người dùng đăng nhập và viết review kèm ảnh.
9. Review công khai xuất hiện dưới quán và điểm trung bình được cập nhật.

## 7. Yêu cầu chức năng

### FR-01 — Giữ nguyên vòng quay hiện tại

- Không thay đổi thời gian và hành vi animation hiện có.
- Món thắng vẫn phải khớp với thẻ dừng dưới mũi tên.
- Lịch sử quay và dữ liệu cá nhân hiện có vẫn được lưu cục bộ.
- Việc tải quán bị lỗi không được làm vòng quay hoặc hộp kết quả bị lỗi theo.

### FR-02 — Liên kết món với quán

- Mỗi quán có trường `foodIds` chứa ID của các món quán có bán.
- ID phải dùng đúng `FoodItem.id` hiện có; không dùng tên món làm khóa liên kết.
- Một quán có thể bán nhiều món và một món có thể thuộc nhiều quán.
- Chỉ quán có `active = true` mới được hiển thị cho người dùng.

### FR-03 — Hiển thị quán sau khi quay

- Phần quán phải xuất hiện ngay dưới thông tin món vừa quay.
- Chỉ hiển thị quán thuộc Hòa Lạc và có món phù hợp.
- Hiển thị tối đa 3 quán trên màn hình kết quả; có nút **Xem tất cả quán** khi kết quả nhiều hơn 3.
- Mỗi thẻ quán hiển thị:
  - Ảnh đại diện.
  - Tên quán.
  - Khu vực.
  - Khoảng giá mỗi người.
  - Điểm trung bình theo thang 5.
  - Tổng số review công khai.
  - Tối đa 2 món hoặc nhãn nổi bật.
  - Nút **Xem review**.
  - Nút **Google Maps**.
- Quán được sắp xếp theo điểm trung bình giảm dần, sau đó theo số review giảm dần.
- Quán chưa có review đứng sau quán đã có review và hiển thị **Chưa có đánh giá**.
- Ngân sách hiện tại chỉ dùng để ưu tiên quán có khoảng giá phù hợp, không loại hoàn toàn quán ngoài ngân sách.

### FR-04 — Trường hợp không tìm thấy quán

- Hiển thị thông báo: **Chưa có quán Hòa Lạc nào được ghi nhận cho món này.**
- Cung cấp nút **Tìm trên Google Maps** bằng tên món và từ khóa `Hòa Lạc`.
- Người dùng vẫn phải đóng kết quả hoặc quay lại được bình thường.

### FR-05 — Danh sách tất cả quán phù hợp

- Màn hình hiển thị toàn bộ quán có bán món vừa quay.
- Hỗ trợ lọc theo khu vực:
  - Gần Đại học FPT.
  - Gần Đại học Quốc gia Hà Nội.
  - Khu Công nghệ cao Hòa Lạc.
  - Khu vực Hòa Lạc khác.
- Hỗ trợ sắp xếp:
  - Đánh giá cao nhất.
  - Nhiều review nhất.
  - Giá thấp nhất.
- Hiển thị trạng thái tải và nút thử lại khi có lỗi mạng.

### FR-06 — Trang chi tiết quán

- Hiển thị:
  - Ảnh đại diện quán.
  - Tên, khu vực và địa chỉ.
  - Khoảng giá.
  - Danh sách món có bán.
  - Điểm trung bình và tổng số review.
  - Mô tả ngắn nếu có.
  - Nút **Mở Google Maps**.
  - Nút **Viết review** hoặc **Sửa review của bạn**.
- Danh sách review mặc định sắp xếp mới nhất trước.
- Cho phép đổi thứ tự thành điểm cao nhất hoặc điểm thấp nhất.
- Cho phép lọc chỉ các review có ảnh.
- Tải từng trang 10 review; không tải toàn bộ review một lần.

### FR-07 — Nội dung một review

Một review công khai phải hiển thị:

- Tên và ảnh đại diện người đăng.
- Điểm từ 1 đến 5 sao.
- Nội dung bình luận.
- Danh sách ảnh, tối đa 3 ảnh.
- Món đã ăn nếu người dùng chọn.
- Chi phí thực tế nếu người dùng nhập.
- Ngày ghé quán.
- Thời điểm đăng.
- Nhãn **Đã chỉnh sửa** nếu review từng được cập nhật.
- Nút báo cáo đối với review của người khác.
- Nút sửa và xóa đối với review của chính người dùng.

### FR-08 — Đăng nhập

- Khách có thể xem toàn bộ nội dung công khai mà không cần đăng nhập.
- Khi khách bấm **Viết review** hoặc **Báo cáo**, ứng dụng yêu cầu đăng nhập Google.
- Sau đăng nhập, ứng dụng lưu hồ sơ tối thiểu gồm UID, tên hiển thị, ảnh đại diện và ngày tạo.
- Khi đăng xuất, người dùng vẫn xem được dữ liệu công khai nhưng không được thực hiện thao tác ghi.

### FR-09 — Đăng review

- Mỗi tài khoản chỉ có một review hiện hành cho mỗi quán trong MVP.
- Nếu đã có review, nút đăng mới phải chuyển thành sửa review.
- Trường bắt buộc:
  - Điểm từ 1 đến 5 sao.
  - Bình luận từ 10 đến 500 ký tự sau khi bỏ khoảng trắng đầu/cuối.
  - Ngày ghé quán, không được ở tương lai.
- Trường không bắt buộc:
  - Một món đã ăn trong danh sách món của quán.
  - Chi phí thực tế là số nguyên từ 1.000đ đến 10.000.000đ.
  - Tối đa 3 ảnh.
- Nút đăng bị khóa trong lúc tải ảnh hoặc ghi dữ liệu.
- Hiển thị tiến trình tải ảnh và thông báo thành công hoặc thất bại.
- Không tạo review nếu tải ảnh hoặc ghi dữ liệu thất bại.
- Nếu ảnh đã tải nhưng ghi review thất bại, ứng dụng phải xóa ảnh vừa tải để tránh file mồ côi.

### FR-10 — Ảnh review

- MVP chỉ cần chọn ảnh có sẵn từ thiết bị; chụp trực tiếp bằng camera nằm ngoài phạm vi.
- Chấp nhận JPEG, PNG hoặc WebP.
- Tối đa 3 ảnh cho mỗi review.
- Mỗi file không quá 5 MB trước khi tải lên.
- Ứng dụng phải thu nhỏ ảnh về cạnh dài tối đa 1600 px và hướng tới dung lượng không quá 1,5 MB.
- Người dùng xem trước và xóa ảnh khỏi form trước khi đăng.
- Chạm vào ảnh review để xem ảnh lớn.
- Khi review bị xóa, toàn bộ ảnh thuộc review cũng phải bị xóa khỏi Cloud Storage.

### FR-11 — Sửa và xóa review

- Người dùng chỉ được sửa hoặc xóa review có `authorId` bằng UID của mình.
- Sửa review cập nhật `updatedAt` nhưng giữ nguyên `createdAt`.
- Xóa review phải có hộp xác nhận.
- Sau khi sửa hoặc xóa, danh sách và điểm trung bình phải được cập nhật.
- Không được cho phép thay đổi `authorId` hoặc `restaurantId` của review đã tồn tại.

### FR-12 — Báo cáo review

- Người dùng đã đăng nhập có thể báo cáo review của người khác.
- Các lý do tối thiểu:
  - Nội dung xúc phạm.
  - Spam hoặc quảng cáo.
  - Thông tin sai lệch.
  - Hình ảnh không phù hợp.
  - Lý do khác.
- Mỗi người chỉ được tạo một báo cáo đang mở cho một review.
- Sau khi gửi, hiển thị xác nhận đã tiếp nhận.
- Review không tự động biến mất chỉ vì có một báo cáo; quản trị viên quyết định trạng thái.

### FR-13 — Trạng thái review

- Review có một trong ba trạng thái: `published`, `hidden`, `deleted`.
- Người dùng thông thường chỉ đọc được `published`.
- Review mới hợp lệ được đặt là `published` trong MVP.
- Quản trị viên có thể chuyển review vi phạm sang `hidden` bằng Firebase Console.
- Review `deleted` không xuất hiện trong ứng dụng.

### FR-14 — Điểm trung bình

- Điểm trung bình chỉ tính từ review `published`.
- Làm tròn tới một chữ số thập phân.
- Khi review được tạo, sửa, ẩn hoặc xóa, `ratingAverage` và `reviewCount` của quán phải được tính lại ở backend.
- Client không được tự ghi trực tiếp hai trường tổng hợp này.

### FR-15 — Google Maps

- Mỗi quán có `googleMapsUrl` hoặc truy vấn tìm kiếm gồm tên quán và `Hòa Lạc`.
- Nút Google Maps mở ứng dụng Maps hoặc trình duyệt như cơ chế hiện có.
- Review và ảnh trong ứng dụng là nội dung do cộng đồng của ứng dụng đăng, không sao chép từ Google Maps.

## 8. Yêu cầu màn hình

### 8.1. Màn hình kết quả quay

Thứ tự nội dung:

1. Món vừa quay.
2. Ảnh, tên và giá món.
3. Các thao tác hiện có như yêu thích và chia sẻ.
4. Tiêu đề **Quán phù hợp tại Hòa Lạc**.
5. Tối đa 3 thẻ quán.
6. Nút **Xem tất cả quán** nếu cần.
7. Nút tiếp tục/quay lại.

Nếu hộp thoại hiện tại không đủ chiều cao, phần nội dung phải cuộn được và không gây overflow trên màn hình 390 × 844.

### 8.2. Màn hình danh sách quán

- App bar hiển thị tên món.
- Bộ lọc khu vực và sắp xếp.
- Danh sách thẻ quán.
- Trạng thái tải, lỗi và danh sách trống.

### 8.3. Màn hình chi tiết quán

- Phần thông tin quán ở đầu trang.
- Điểm và số lượng review.
- Nút Google Maps và viết/sửa review.
- Bộ lọc review.
- Danh sách review phân trang.

### 8.4. Màn hình viết review

- Chọn sao.
- Nhập bình luận và hiển thị bộ đếm 500 ký tự.
- Chọn món đã ăn.
- Nhập chi phí.
- Chọn ngày ghé quán.
- Chọn và xem trước tối đa 3 ảnh.
- Nút đăng hoặc lưu thay đổi.

### 8.5. Màn hình đăng nhập

- Giải thích ngắn rằng đăng nhập dùng để xác định tác giả và quản lý review.
- Nút **Tiếp tục với Google**.
- Nút quay lại để tiếp tục xem nội dung mà không đăng nhập.

## 9. Mô hình dữ liệu Firebase

### `users/{uid}`

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---:|---|
| `displayName` | string | Có | Tên từ tài khoản Google |
| `photoUrl` | string/null | Không | Ảnh đại diện |
| `role` | string | Có | `user` hoặc `admin` |
| `createdAt` | timestamp | Có | Thời điểm tạo |
| `updatedAt` | timestamp | Có | Thời điểm cập nhật |

### `restaurants/{restaurantId}`

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---:|---|
| `name` | string | Có | Tên quán |
| `area` | string | Có | `fpt`, `vnu`, `hhtp`, `other` |
| `address` | string | Có | Địa chỉ hiển thị |
| `googleMapsUrl` | string | Có | Link Maps hợp lệ |
| `coverImageUrl` | string/null | Không | Ảnh đại diện do quản trị viên cung cấp |
| `foodIds` | array<string> | Có | ID món trong ứng dụng |
| `tags` | array<string> | Không | Ví dụ: `sinh-vien`, `nhom-dong`, `an-dem` |
| `priceMin` | number | Có | Giá tối thiểu/người |
| `priceMax` | number | Có | Giá tối đa/người |
| `description` | string | Không | Tối đa 500 ký tự |
| `ratingAverage` | number | Có | Backend quản lý |
| `reviewCount` | number | Có | Backend quản lý |
| `active` | boolean | Có | Chỉ quán active được hiển thị |
| `createdAt` | timestamp | Có | Thời điểm tạo |
| `updatedAt` | timestamp | Có | Thời điểm cập nhật |

### `reviews/{reviewId}`

Để bảo đảm mỗi người chỉ có một review cho mỗi quán, `reviewId` nên được tạo ổn định từ `restaurantId` và `authorId`.

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---:|---|
| `restaurantId` | string | Có | Quán được review |
| `authorId` | string | Có | Firebase UID |
| `authorName` | string | Có | Bản chụp tên hiển thị |
| `authorPhotoUrl` | string/null | Không | Bản chụp ảnh đại diện |
| `rating` | number | Có | Số nguyên 1–5 |
| `comment` | string | Có | 10–500 ký tự |
| `foodId` | string/null | Không | Món đã ăn |
| `amountSpent` | number/null | Không | Chi phí thực tế |
| `imageUrls` | array<string> | Có | 0–3 URL |
| `visitDate` | timestamp | Có | Không ở tương lai |
| `status` | string | Có | `published`, `hidden`, `deleted` |
| `createdAt` | timestamp | Có | Server timestamp |
| `updatedAt` | timestamp | Có | Server timestamp |

### `reports/{reportId}`

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---:|---|
| `reviewId` | string | Có | Review bị báo cáo |
| `reporterId` | string | Có | Người báo cáo |
| `reason` | string | Có | Một trong các lý do hỗ trợ |
| `details` | string/null | Không | Tối đa 300 ký tự |
| `status` | string | Có | `open`, `resolved`, `dismissed` |
| `createdAt` | timestamp | Có | Server timestamp |

### Cloud Storage

- Đường dẫn ảnh review: `review-images/{authorId}/{reviewId}/{fileName}`.
- Chỉ chủ sở hữu đường dẫn được tải ảnh lên hoặc xóa ảnh.
- Ảnh của review công khai được phép đọc để khách chưa đăng nhập vẫn xem được.

## 10. Backend và phân quyền

### Công nghệ đề xuất

- Firebase Authentication cho đăng nhập Google.
- Cloud Firestore cho quán, review, người dùng và báo cáo.
- Cloud Storage for Firebase cho ảnh.
- Cloud Functions for Firebase để cập nhật `ratingAverage`, `reviewCount` và dọn ảnh khi review bị xóa.

### Quy tắc bảo mật bắt buộc

- Mặc định từ chối mọi thao tác không được khai báo rõ.
- Cho phép đọc quán `active` và review `published` công khai.
- Chỉ tài khoản đã xác thực được tạo review hoặc báo cáo.
- `authorId` khi tạo review phải bằng `request.auth.uid`.
- Chỉ chủ review hoặc admin được sửa/xóa review.
- Người dùng không được đổi `authorId`, `restaurantId`, `createdAt` hoặc tự cấp vai trò admin.
- Người dùng không được ghi trực tiếp `ratingAverage` và `reviewCount`.
- Storage Rules phải kiểm tra UID trong đường dẫn, loại file và kích thước tối đa.
- Quyền admin phải dựa trên Firebase custom claims hoặc cơ chế backend tin cậy, không dựa trên trường client có thể tự sửa.

## 11. Chỉ mục Firestore dự kiến

Tạo các composite index theo truy vấn thực tế, tối thiểu cho:

- `restaurants`: `active`, `foodIds` dạng array-contains, `ratingAverage` giảm dần.
- `restaurants`: `active`, `foodIds`, `area`, `ratingAverage` giảm dần.
- `reviews`: `restaurantId`, `status`, `createdAt` giảm dần.
- `reviews`: `restaurantId`, `status`, `rating` giảm dần.
- `reports`: `status`, `createdAt` giảm dần.

Không tạo index hoặc truy vấn rộng hơn nhu cầu MVP.

## 12. Dữ liệu khởi tạo

- Chuẩn bị tối thiểu 20 quán tại Hòa Lạc để kiểm thử luồng.
- Mỗi món chính phổ biến nên có ít nhất 2 quán liên kết nếu dữ liệu thực tế cho phép.
- Dữ liệu quán phải có nguồn khảo sát hợp lệ và ngày cập nhật nội bộ.
- Không lấy lại ảnh hoặc review từ Google Maps nếu không có quyền sử dụng.
- Nếu chưa có ảnh đại diện hợp lệ, dùng placeholder của ứng dụng.

## 13. Yêu cầu phi chức năng

### Hiệu năng

- Danh sách review tải theo trang 10 bản ghi.
- Ảnh dùng thumbnail phù hợp và lazy loading.
- Không chặn vòng quay trong khi truy vấn quán.
- Không tải ảnh kích thước gốc vào danh sách nếu có thể dùng bản đã nén.

### Khả năng phục hồi

- Khi mất mạng, các chức năng cục bộ hiện có vẫn hoạt động.
- Phần quán hiển thị lỗi mạng và nút thử lại.
- Không làm mất nội dung form review khi một lần tải lên thất bại.
- Các thao tác ghi phải chống bấm lặp.

### Bảo mật và riêng tư

- Trước lần đăng review đầu tiên, thông báo rõ tên, ảnh đại diện, comment và ảnh review sẽ hiển thị công khai.
- Không lưu vị trí GPS của người dùng trong MVP.
- Không lưu token đăng nhập trong Firestore.
- Không ghi dữ liệu cá nhân hoặc URL ảnh vào log sản phẩm.
- Người dùng phải xóa được review và ảnh của chính mình.

### Trải nghiệm và khả năng tiếp cận

- Không overflow ở kích thước màn hình 390 × 844.
- Các nút ảnh, sao và thao tác phải có tooltip hoặc semantic label.
- Trạng thái tải không chỉ được biểu diễn bằng màu sắc.
- Hình ảnh cần xử lý lỗi tải và hiển thị placeholder.

## 14. Tiêu chí nghiệm thu

1. Quay ra một món có quán liên kết sẽ hiển thị đúng tối đa 3 quán Hòa Lạc.
2. Quán không có món thắng hoặc `active = false` không xuất hiện.
3. Món không có quán hiển thị trạng thái trống và nút Google Maps.
4. Khách chưa đăng nhập xem được quán, review và ảnh nhưng không đăng được review.
5. Sau đăng nhập, người dùng đăng được review hợp lệ với 0–3 ảnh.
6. Review có bình luận dưới 10 hoặc trên 500 ký tự bị từ chối.
7. Ảnh thứ tư hoặc ảnh quá 5 MB bị từ chối trước khi tải.
8. Review mới xuất hiện trong trang quán và điểm trung bình được cập nhật.
9. Một người không tạo được review thứ hai cho cùng quán; họ được chuyển sang sửa review cũ.
10. Người dùng sửa và xóa được review của mình nhưng không sửa/xóa được review người khác.
11. Xóa review cũng xóa ảnh liên quan khỏi Storage.
12. Báo cáo trùng của cùng người với cùng review bị từ chối hoặc hợp nhất.
13. Mất mạng không làm hỏng vòng quay và có thông báo thử lại cho phần quán.
14. Firestore và Storage Security Rules chặn được thao tác giả mạo UID, đổi chủ review và tự cấp quyền admin.
15. Android và Web build thành công; các chức năng hiện có không bị hồi quy.

## 15. Kiểm thử tối thiểu

- Unit test logic lọc và sắp xếp quán theo món, trạng thái, khu vực và ngân sách.
- Widget test màn hình kết quả có quán, không có quán và lỗi mạng.
- Widget test validation form review và giới hạn số ảnh.
- Test quyền sửa/xóa theo người dùng.
- Firebase Emulator test cho Firestore Rules và Storage Rules.
- Integration test luồng đăng nhập → đăng review → sửa → xóa.
- Chạy lại toàn bộ test hiện có của vòng quay và kho món.
- Chạy `flutter analyze`, `flutter test` và build Android debug trước khi bàn giao.

## 16. Hạng mục bàn giao

- Mã nguồn Flutter đã tích hợp các màn hình và luồng trên.
- Cấu hình Firebase cho Android và Web.
- Firestore Rules, Storage Rules và các index cần thiết.
- Cloud Function cập nhật điểm và dọn ảnh.
- Dữ liệu mẫu tối thiểu 20 quán Hòa Lạc.
- Test theo mục 15.
- README cập nhật hướng dẫn cấu hình Firebase, chạy emulator và nhập dữ liệu quán.
- Ghi rõ các bước thủ công cần thực hiện trong Firebase Console.

## 17. Quyết định sản phẩm đã chốt

- Nội dung review và ảnh do người dùng của ứng dụng đăng, không nhập từ Google Maps.
- Người chưa đăng nhập được đọc nhưng không được viết.
- Đăng nhập Google là phương thức đăng nhập duy nhất trong MVP.
- Mỗi người có một review hiện hành cho mỗi quán.
- Tối đa 3 ảnh cho mỗi review.
- Quán do quản trị viên quản lý; người dùng chưa được tự công khai quán mới.
- Không dùng GPS trong MVP; khu vực quán do dữ liệu quản trị xác định.
- `shared_preferences` tiếp tục lưu lựa chọn cá nhân; Firebase lưu dữ liệu cộng đồng.
