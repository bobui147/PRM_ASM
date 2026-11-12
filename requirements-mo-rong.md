# Yêu cầu phát triển mở rộng — Hôm nay ăn gì?

**Trạng thái:** Đề xuất để trao đổi với developer; các quy tắc tại mục 7 cần được xác nhận trước khi triển khai.

## Bối cảnh

Hệ thống hiện có ứng dụng Flutter, REST API và web quản trị Node.js/Express với MySQL. Người dùng có thể quay chọn món, xem quán và review, quản lý tài khoản; admin quản lý danh mục, quán và kiểm duyệt review. Ứng dụng lưu danh mục trong cache, còn dữ liệu quán và tài khoản sử dụng server.

Tài liệu này mô tả ba phần mở rộng theo thứ tự ưu tiên. Các chức năng hiện có cần tiếp tục hoạt động; review quán vẫn có quy trình duyệt riêng. Bảo mật, xác thực, kiểm tra dữ liệu và quản trị cần tiếp tục theo cơ chế sẵn có của dự án.

## Yêu cầu phát triển
Mã `FR-C`, `FR-G`, `FR-PM` lần lượt tương ứng cộng đồng, nhóm và thực đơn.

### 1. Mục tiêu và thứ tự ưu tiên

1. **P1 — Cộng đồng ẩm thực:** chia sẻ trải nghiệm, tương tác và khám phá nội dung từ người khác.
2. **P2 — Chọn món theo nhóm:** cùng bạn bè chọn một món chung trong phòng.
3. **P3 — Lập thực đơn:** lên kế hoạch ăn uống và theo dõi món đã ăn.

Mỗi phần cần có API, giao diện Flutter, lưu trữ, kiểm thử và các chức năng quản trị liên quan. Trong từng phần, triển khai server và app đủ cho một luồng hoàn chỉnh trước khi chuyển ưu tiên tiếp theo. Trạng thái triển khai được theo dõi riêng trong `TASKS.md`; tài liệu này không khẳng định các chức năng mới đã hoàn thành.

### 2. Quyền và nguyên tắc chung

- Khách xem nội dung cộng đồng công khai và hồ sơ công khai; cần đăng nhập và xác minh email để thực hiện thao tác ghi, tham gia phòng hoặc sử dụng thực đơn cá nhân.
- Người dùng bị khóa chỉ có quyền đọc như khách; mọi thao tác ghi mới trả `ACCOUNT_BLOCKED` theo quy tắc hiện có.
- Người dùng chỉ sửa hoặc xóa nội dung và dữ liệu thuộc quyền của mình; quyền chủ phòng được nêu tại FR-G01. Server kiểm tra quyền ở mọi request, không chỉ dựa vào giao diện.
- Mọi danh sách dài có phân trang; app hiển thị trạng thái tải, trống, lỗi và thử lại. Thao tác ghi chống gửi lặp; khi lỗi giữ lại nội dung chưa gửi.
- Xử lý văn bản như dữ liệu, không thực thi HTML; kiểm tra file ảnh thực tế, giới hạn kích thước, xóa metadata và dọn file khi thao tác thất bại. Áp dụng HTTPS, giới hạn tần suất, nhật ký an toàn và kiểm tra quyền theo các chính sách bảo mật và phi chức năng hiện tại.

### 3. P1 — Cộng đồng ẩm thực

**Phân biệt với review:** review dùng để chấm điểm và nhận xét một quán, tiếp tục theo quy trình review hiện tại. Bài cộng đồng là nội dung chia sẻ linh hoạt, có thể không gắn quán; bài đăng và lượt thích không làm thay đổi điểm quán.

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
- Đề xuất bài và bình luận hiển thị ngay sau khi đăng, sau đó xử lý theo báo cáo; không áp dụng hàng chờ duyệt review cho bài cộng đồng. Chính sách này cần xác nhận tại mục 7.

#### FR-C05 — Quyền riêng tư và xóa tài khoản

- Trước lần đăng bài hoặc bình luận đầu tiên, thông báo tên hiển thị, nội dung và ảnh sẽ công khai. Không hiển thị email; không ghi nội dung bài, bình luận, token hoặc email đầy đủ vào log.
- Khi xóa tài khoản, xóa bài, ảnh, bình luận, lượt thích và quan hệ theo dõi của tài khoản; cập nhật số đếm và xử lý báo cáo liên quan mà không để dữ liệu cá nhân hoặc file mồ côi. Giữ nhật ký quản trị theo chính sách hiện có và không đưa nội dung đã xóa vào nhật ký.

### 4. P2 — Chọn món theo nhóm

#### FR-G01 — Phòng và thành viên

- Người dùng đã đăng nhập tạo phòng, chọn nhóm món và ngân sách; hệ thống cấp mã mời khó đoán để người khác đã đăng nhập tham gia. Chủ phòng chia sẻ mã bằng chức năng chia sẻ của thiết bị hoặc sao chép mã.
- Phòng hiển thị danh sách thành viên, người chủ, bộ lọc, danh sách món và trạng thái. Thành viên có thể rời phòng; chủ phòng có thể kết thúc phòng. Khi chủ rời, phòng kết thúc; mỗi người đang ở phòng nhận trạng thái kết thúc.
- Chỉ thành viên xem và thao tác trong phòng; chỉ chủ phòng đổi bộ lọc, bắt đầu bỏ phiếu/quay và kết thúc phòng. Người dùng bị khóa không tạo, tham gia hoặc thao tác ghi trong phòng.

#### FR-G02 — Chọn món và kết quả

- Trong giai đoạn chọn món, mỗi thành viên có thể đánh dấu chọn hoặc loại từng món và thay đổi lựa chọn trước khi chủ phòng bắt đầu quyết định. Danh sách ứng viên phải được tính thống nhất trên server theo quy tắc đã chốt.
- Chủ phòng chọn **bỏ phiếu** hoặc **quay**. Khi bỏ phiếu, mỗi thành viên có một phiếu cho một món ứng viên và có thể đổi phiếu trước khi chủ phòng chốt; kết quả dựa trên số phiếu. Khi quay, server chọn một kết quả trong danh sách ứng viên và gửi cùng kết quả tới mọi thành viên.
- Không bắt đầu khi không có món ứng viên; hiển thị lý do và cho phép quay về bước chọn. Quy tắc hòa, thời hạn bỏ phiếu và cách xử lý thành viên không bỏ phiếu cần chốt tại mục 7.
- Ngăn gửi lặp và đồng thời chốt nhiều kết quả; hiển thị cùng trạng thái/kết quả cho các thành viên, kể cả khi một người ngắt kết nối rồi vào lại phòng còn hoạt động. Không phụ thuộc việc máy chủ phòng tiếp tục mở màn hình.

### 5. P3 — Lập thực đơn

#### FR-PM01 — Kế hoạch theo ngày và tuần

- Người dùng xem kế hoạch cá nhân theo ngày hoặc tuần; thêm món từ danh mục vào ngày và bữa sáng, trưa, tối hoặc bữa khác. Một bữa có thể có nhiều món.
- Người dùng chuyển món sang ngày/bữa khác hoặc xóa khỏi kế hoạch; thao tác xóa có xác nhận. Dữ liệu gắn với tài khoản và được tải lại khi đăng nhập trên thiết bị khác.
- Hiển thị tên món, giá tham khảo nếu còn, ngày, bữa và trạng thái. Món không còn trong danh mục công khai vẫn hiển thị tên đã lưu và được phép xóa, nhưng không thể thêm mới.

#### FR-PM02 — Muốn thử và đã ăn

- Người dùng lưu hoặc bỏ lưu món trong danh sách **Muốn thử**, xem danh sách và thêm món còn hoạt động vào kế hoạch. Mỗi món chỉ xuất hiện một lần trong danh sách muốn thử của một người.
- Đánh dấu một mục kế hoạch là **Đã ăn** hoặc hoàn tác; lịch sử đã ăn hiển thị theo ngày và có phân trang. Chỉ đánh dấu khi người dùng xác nhận đã ăn; kết quả quay không tự động trở thành lịch sử đã ăn.
- Kế hoạch, danh sách muốn thử và lịch sử đã ăn chỉ chủ tài khoản xem/sửa được; xóa tài khoản thì xóa các dữ liệu này.

### 6. Tiêu chí nghiệm thu và kiểm thử

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

### 7. Quy tắc cần xác nhận trước khi triển khai

- **Cộng đồng:** bài/bình luận hiển thị ngay và xử lý theo báo cáo, hay phải duyệt trước như review? Xác nhận giới hạn nội dung, ảnh và tần suất đăng; xác định thời gian lưu báo cáo và nhật ký sau khi xóa nội dung/tài khoản.
- **Nhóm:** một người loại món có loại món đó khỏi kết quả chung không? Chốt số thành viên tối đa, thời hạn phòng/mã, cách chốt khi hòa hoặc không có phiếu, và liệu chỉ tài khoản đã xác minh được tham gia.
- **Thực đơn:** xác nhận có đồng bộ theo tài khoản như đề xuất không; phạm vi hiện tại không bao gồm nhắc giờ, tính dinh dưỡng hoặc tự tạo món.
- **Thông báo:** phiên bản đầu không có push notification trong phạm vi hiện tại; nếu cần báo khi có người theo dõi, bình luận hoặc mời vào phòng, phải xác định thêm phạm vi và kênh thông báo.

