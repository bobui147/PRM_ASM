# Hôm nay ăn gì? — PRM_ASM

Ứng dụng Flutter giúp chọn món ăn ngẫu nhiên bằng hiệu ứng quay hòm: dải thẻ món chạy ngang, giảm tốc rồi dừng dưới mũi tên ở giữa. Món được chọn hiển thị trong hộp kết quả kèm ảnh, giá tham khảo và nút tìm quán trên Google Maps.

Dự án lấy cảm hứng từ giao diện [Két Hội Thợ Lùn — Trưa Nay Ăn Gì](https://truanayangi.com/?theme=ket-hoi-tho-lun). Đây là ứng dụng Flutter độc lập, hướng đến Android và có thể chạy trên Chrome để phát triển, kiểm tra giao diện.

## 1. Chức năng hiện có

- Giao diện tiếng Việt, Material Design 3, nền tối với điểm nhấn vàng.
- Kho **57 món**: 24 món chính, 11 đồ uống, 11 món ăn vặt và 11 món nhậu.
- Nhiều món Bắc như bún thang Hà Nội, phở gà, bánh cuốn Thanh Trì, xôi xéo, bánh đa cua và nem cua bể Hải Phòng.
- Ảnh món ăn đóng gói cùng app, đọc từ 10 atlas ảnh trong `assets/images/`.
- Chọn bữa theo giờ địa phương của thiết bị và lọc danh sách món phù hợp.
- Bấm lại chip bữa ăn đang chọn để chuyển thủ công sang bữa kế tiếp.
- Ngân sách 50.000đ, 100.000đ, 150.000đ hoặc không giới hạn.
- Chọn ngẫu nhiên có trọng số: món gần ngân sách có cơ hội cao hơn, món ngoài ngân sách vẫn có thể xuất hiện.
- Animation quay **5 giây**: chạy đều trong 4 giây đầu, giảm tốc trong giây cuối.
- Khóa nút quay và bộ lọc trong lúc quay hoặc đang xem kết quả.
- Tâm thẻ thắng nằm dưới mũi tên; tên kết quả được lấy từ chính thẻ đó.
- Quay lại nhiều lần; xử lý danh sách không có món phù hợp.
- Mở Google Maps để tìm theo tên món vừa quay.

### Chức năng mới

- **Thanh điều hướng 3 tab**: **Quay**, **Lịch sử**, **Món ăn** (`lib/home_shell.dart`). Mỗi tab giữ nguyên trạng thái khi chuyển qua lại.
- **Lịch sử quay** (tab Lịch sử): lưu tối đa **50 lượt** gần nhất gồm tên món, nhóm, giá và thời điểm quay. Có thống kê tổng lượt và món ra nhiều nhất, kèm nút xóa lịch sử có hỏi xác nhận.
- **Giảm lặp món**: món đã quay trong **3 ngày lịch** gần nhất (hôm nay, hôm qua, hôm kia) có trọng số thấp hơn **4 lần**. Món đó vẫn có thể ra, chỉ ít hơn.
- **Món yêu thích**: bấm ♥ trong tab Món ăn hoặc nút **YÊU THÍCH** trong hộp kết quả. Món yêu thích có trọng số **gấp đôi** và có dấu ♥ trên thẻ trong kho.
- **Ẩn món**: bấm biểu tượng con mắt trong tab Món ăn để loại món khỏi vòng quay. Bấm lại để hiện món trở lại.
- **Thêm, sửa, xóa món tự tạo** (tab Món ăn → **Thêm món**):
  - Nhập tên (tối đa 40 ký tự, không trùng món đã có) và giá (1–999 nghìn đồng), chọn nhóm món. Với món chính, chọn thêm bữa phù hợp (ít nhất một bữa).
  - Độ hiếm được suy ra từ giá. Món tự tạo dùng icon của nhóm món thay cho ảnh.
  - Chỉ món tự tạo mới sửa hoặc xóa được (menu ⋮). Xóa món có hỏi xác nhận, lịch sử quay của món đó vẫn được giữ.
- **Tìm kiếm và lọc** trong tab Món ăn theo tên và nhóm món, kèm số món đang yêu thích và đang ẩn.
- **Chia sẻ kết quả**: nút **CHIA SẺ** trong hộp kết quả mở bảng chia sẻ của Android (Zalo, Messenger...) với nội dung kiểu "Hôm nay mình ăn Phở bò (khoảng 50.000đ)". Chức năng này dùng `Intent.ACTION_SEND` qua `MethodChannel` trong `MainActivity.kt`, không thêm package. Trên web chưa hỗ trợ chia sẻ.
- **Lưu dữ liệu trên thiết bị** bằng `shared_preferences`: nhóm món, ngân sách, món yêu thích, món ẩn, món tự tạo và lịch sử đều được giữ lại sau khi đóng app. Dữ liệu lưu bị hỏng sẽ được bỏ qua và không làm app crash.

Chức năng chọn món và ảnh hoạt động offline sau khi cài/chạy app. Google Maps là liên kết bên ngoài và cần kết nối mạng để tìm quán. Dữ liệu chỉ lưu cục bộ trên máy. Dự án không có backend, đồng bộ hoặc đăng nhập.

## 2. Tech stack và cấu hình

- **Flutter**, giao diện viết bằng **Dart** và **Material Design 3**.
- Dart SDK constraint: **`^3.5.2`** (`>=3.5.2 <4.0.0`) trong `pubspec.yaml`. Đây là khoảng phiên bản chấp nhận, không khóa Dart tại đúng 3.5.2.
- Flutter SDK đã build thử: **3.47.5 stable**.
- Kotlin: **2.4.0** — `android/settings.gradle`.
- Android Gradle Plugin: **9.1.0** — `android/settings.gradle`.
- Gradle Wrapper: **9.3.1** — `android/gradle/wrapper/gradle-wrapper.properties`.
- Java source/target compatibility và Kotlin JVM target: **17** — `android/app/build.gradle`.
- Kiểm thử: **`flutter_test`** từ Flutter SDK.
- Lint: **`flutter_lints: ^4.0.0`**.
- Dependency: **`cupertino_icons: ^1.0.8`** và **`shared_preferences: ^2.5.6`** (lưu dữ liệu người dùng trên thiết bị).
- Mở Google Maps: Dart `Uri`, JavaScript interop trên web và `MethodChannel`/Android `Intent` trên Android; không thêm package mở URL.

**JDK chạy Gradle khác Java target của mã ứng dụng.** Flutter dùng JDK đi kèm Android Studio (`C:\Program Files\Android\Android Studio\jbr`, hiện là **Java 25.0.3**) để chạy Gradle, còn mã Java/Kotlin của app được biên dịch với target 17. Gradle 8.3 cũ không chạy được với Java 25 (lỗi `Unsupported class file major version 69`), nên dự án đã nâng lên Gradle 9.3.1. Với Java 25 cần Gradle **9.1.0 trở lên**. Tham khảo [bảng tương thích Java/Gradle](https://docs.gradle.org/current/userguide/compatibility.html#java).

`compileSdk`, `minSdk`, `targetSdk` và NDK hiện lấy theo Flutter SDK trong `android/app/build.gradle`, không phải các số cố định trong README. Kiểm tra `flutter doctor -v` và đọc lỗi build trước khi đổi cấu hình. Không cần chạy `flutter upgrade`, `flutter pub upgrade` hay tự nâng Kotlin/Gradle/AGP để thử app.

## 3. Chuẩn bị môi trường

### Chạy trên Chrome

1. Cài Flutter SDK có Dart thỏa constraint của dự án và thêm thư mục `flutter/bin` vào `PATH`.
2. Cài Google Chrome.
3. Mở terminal tại thư mục chứa `pubspec.yaml`.

Kiểm tra:

```powershell
flutter --version
dart --version
flutter doctor -v
flutter devices
```

### Chạy trên Android

Chuẩn bị thêm Android Studio, Android SDK, Platform Tools và JDK 17 dùng cho Gradle. Nếu dùng máy ảo, cài Android Emulator và tạo một AVD trong **Android Studio → Device Manager**.

Nếu `flutter doctor` báo chưa chấp nhận Android SDK licenses, đọc và xác nhận các điều khoản bằng:

```powershell
flutter doctor --android-licenses
```

File `android/local.properties` chứa đường dẫn Flutter/Android SDK trên từng máy. Không chép đường dẫn SDK của máy khác hoặc commit file này.

## 4. Cài dependencies và chạy nhanh

Trong VS Code, mở thư mục dự án rồi chọn **Terminal → New Terminal**. Ví dụ đường dẫn trên Windows:

```powershell
cd C:\Users\Admin\Documents\GitHub\PRM_ASM
flutter pub get
flutter run -d chrome
```

Thay đường dẫn bằng thư mục clone của bạn. `flutter pub get` cần mạng nếu dependency chưa có trong cache; lệnh này có thể cập nhật lockfile để khớp Flutter SDK đang sử dụng. Kiểm tra diff của `pubspec.lock` trước khi commit thay đổi môi trường.

Giữ terminal mở trong lúc chạy. Các phím điều khiển:

- `r`: hot reload, cập nhật phần lớn thay đổi giao diện.
- `R`: hot restart, tạo lại state và chạy lại `initState`.
- `q`: dừng app; có thể dùng `Ctrl+C` để dừng lệnh.

Sau khi sửa `AnimationController`, logic khởi tạo hoặc thêm ảnh, nên hot restart hoặc dừng rồi chạy lại. Sửa Kotlin/`MethodChannel` trên Android phải dừng và build/chạy lại ứng dụng; hot reload không cập nhật mã native.

### Android emulator

Liệt kê máy ảo và thiết bị:

```powershell
flutter emulators
flutter devices
```

Khởi động máy ảo từ Device Manager hoặc dùng ID trả về bởi `flutter emulators`:

```powershell
flutter emulators --launch YOUR_EMULATOR_ID
```

Đợi máy ảo khởi động xong, lấy device ID rồi chạy:

```powershell
flutter devices
flutter run -d YOUR_DEVICE_ID
```

`YOUR_EMULATOR_ID` và `YOUR_DEVICE_ID` là chỗ điền giá trị thực tế, không gõ nguyên các tên này. Emulator ID dùng để mở AVD; device ID dùng để chạy app lên thiết bị đã khởi động.

### Điện thoại Android thật

1. Bật **Developer options → USB debugging** trên điện thoại.
2. Kết nối bằng cáp USB có truyền dữ liệu.
3. Xác nhận hộp thoại cho phép USB debugging trên điện thoại.
4. Chạy `flutter devices`, sau đó `flutter run -d YOUR_DEVICE_ID`.

Nếu thiết bị không xuất hiện, kiểm tra cáp, chế độ USB và driver USB của hãng trên Windows. Có thể dùng `adb devices` nếu Platform Tools đã có trong `PATH`; trạng thái `unauthorized` cần được xác nhận trên điện thoại.

## 5. Cách sử dụng

1. App tự chọn bữa theo giờ và múi giờ thiết bị:
   - `00:00–03:59`: Ăn đêm.
   - `04:00–09:59`: Ăn sáng.
   - `10:00–15:59`: Ăn trưa.
   - `16:00–23:59`: Ăn tối.
2. Bấm lại chip bữa ăn đang chọn để chuyển theo vòng **Ăn đêm → Ăn sáng → Ăn trưa → Ăn tối**. Khi đang ở nhóm khác, bấm chip bữa ăn để trở về nhóm món chính trước.
3. Hoặc chọn Đồ uống, Ăn vặt, Món nhậu. Ba nhóm này không bị giới hạn bởi bữa ăn.
4. Chọn ngân sách. Mức tiền là ưu tiên xác suất, không phải giá trần; đổi ngân sách không ẩn món trong kho.
5. Bấm **KHAI MỞ HÒM**, chờ 5 giây để xem món được chọn.
6. Bấm **TÌM TRÊN GOOGLE MAPS** để tìm quán hoặc **TIẾP TỤC** để đóng kết quả và quay lại.

Tại mốc chuyển bữa, app cập nhật theo giờ thiết bị khi không có lượt quay/hộp kết quả. Khi đóng hộp kết quả, app cũng đồng bộ lại bữa với giờ hiện tại; lựa chọn bữa thủ công hiện có thể được đặt lại ở bước này.

Google Maps nhận truy vấn dạng `Tên món quán ăn`. Chrome mở tab mới; Android gửi URL cho ứng dụng Maps hoặc trình duyệt xử lý. App không đọc GPS và không yêu cầu quyền vị trí; vị trí tìm kiếm, dữ liệu quán và quyền vị trí nếu có do Google Maps xử lý. Chức năng dùng [Maps URLs của Google](https://developers.google.com/maps/documentation/urls/get-started), không cần API key.

## 6. Cấu trúc dự án

```text
PRM_ASM/
├── lib/
│   ├── main.dart                      # Entry point, mở SharedPreferences, theme Material 3
│   ├── home_shell.dart                # Thanh điều hướng 3 tab: Quay, Lịch sử, Món ăn
│   ├── app_colors.dart                # Bảng màu dùng chung
│   ├── food_spinner_page.dart         # Tab Quay: bộ lọc, animation, dialog kết quả
│   ├── pages/
│   │   ├── history_page.dart          # Tab Lịch sử: danh sách lượt quay, thống kê
│   │   ├── manage_foods_page.dart     # Tab Món ăn: tìm kiếm, yêu thích, ẩn, sửa/xóa
│   │   └── food_form_page.dart        # Form thêm/sửa món tự tạo, kiểm tra dữ liệu nhập
│   ├── widgets/
│   │   └── food_photo.dart            # Ảnh món từ atlas hoặc icon cho món tự tạo
│   ├── models/
│   │   ├── food_item.dart             # Model, bữa ăn, ngân sách, chọn có trọng số
│   │   └── spin_record.dart           # Một lượt quay trong lịch sử, thống kê
│   ├── data/
│   │   └── sample_foods.dart          # 57 món mẫu và bữa phù hợp
│   └── services/
│       ├── food_library.dart          # Trạng thái dùng chung: yêu thích, ẩn, món tự tạo, lịch sử
│       ├── app_storage.dart           # Đọc/ghi SharedPreferences
│       ├── share_launcher*.dart       # Chia sẻ kết quả qua MethodChannel
│       ├── maps_launcher.dart         # Tạo URL, chọn triển khai theo nền tảng
│       ├── maps_launcher_web.dart     # Mở tab Google Maps trên web
│       ├── maps_launcher_mobile.dart  # Gọi MethodChannel trên native
│       └── maps_launcher_stub.dart    # Trả về không hỗ trợ trên nền tảng khác
├── assets/images/                    # 10 atlas ảnh, mỗi atlas tối đa 6 món
├── test/
│   ├── widget_test.dart              # Test vòng quay, bộ lọc, dữ liệu mẫu
│   └── features_test.dart            # Test yêu thích, ẩn món, món tự tạo, lịch sử, lưu dữ liệu
├── android/
│   ├── app/src/main/kotlin/com/example/prmgr5/MainActivity.kt
│   │                                 # MethodChannel mở URL và chia sẻ text
│   ├── app/build.gradle              # Application ID, SDK, Java/Kotlin target
│   ├── settings.gradle               # Phiên bản AGP và Kotlin
│   └── gradle/wrapper/gradle-wrapper.properties
├── web/                              # Flutter web host
├── pubspec.yaml                      # Dependency, Dart constraint, khai báo ảnh
└── README.md
```

Các thư mục nền tảng khác được giữ từ Flutter scaffold. Luồng Google Maps native hiện chỉ có bridge Android; iOS/desktop chưa có triển khai tương ứng.

## 7. Logic quay và ngân sách

`filterFoods` lấy món thuộc đúng nhóm. Với món chính, hàm kiểm tra thêm `mealPeriods`. `pickFood` dùng `dart:math Random` và trọng số ngân sách:

- Chênh lệch giá không quá 25% ngân sách: trọng số **6**.
- Chênh lệch trên 25% và không quá 75%: trọng số **3**.
- Xa hơn: trọng số **1**.
- Không giới hạn: tất cả trọng số **1**.

Trọng số 6 không có nghĩa xác suất 60%; xác suất của một món là trọng số của nó chia tổng trọng số các món hợp lệ. Nhãn độ hiếm hiện dùng để trang trí, không quyết định xác suất quay.

Trước khi quay, app chọn món thắng rồi đặt vào một ô xác định trên dải thẻ. `AnimationController` chạy 5 giây, dịch dải thẻ theo chiều rộng cố định của thẻ và khoảng cách. Khi hoàn tất, tâm ô thắng khớp tâm mũi tên và kết quả lấy từ `_reel[_winnerIndex]`.

Controller đặt `AnimationBehavior.preserve` để hệ thống không tự rút ngắn thời gian quay khi bật giảm chuyển động. Thời điểm hiển thị thực tế có thể chênh một khung hình; khi app/tab bị tạm dừng, không bảo đảm hiển thị đủ mọi khung hình. Controller và timer bữa ăn được giải phóng khi màn hình bị hủy.

## 8. Thêm món và ảnh

Thêm `FoodItem` vào `lib/data/sample_foods.dart`, dùng `id` duy nhất. Ví dụ cấu trúc:

```dart
FoodItem(
  id: 'mon-moi',
  name: 'Tên món mới',
  category: FoodCategory.lunch,
  price: 50000,
  rarity: FoodRarity.rare,
  imageIndex: 24,
  mealPeriods: {MealPeriod.breakfast, MealPeriod.lunch},
),
```

Đây là ví dụ: `imageIndex: 24` chỉ dùng được sau khi bổ sung atlas `foods-lunch-5.png`. Nếu không ghi `mealPeriods`, món mặc định phù hợp bữa trưa và tối.

Mỗi atlas là ảnh **3 cột × 2 hàng**, tỷ lệ **3:2**, tối đa 6 món. Thứ tự ô từ trái sang phải, từ trên xuống dưới. Chỉ số ảnh tính riêng cho từng nhóm:

- Chỉ số `0–5`: `foods-lunch.png` / `foods-drinks.png` / `foods-snacks.png` / `foods-drinking.png`.
- Chỉ số `6–11`: atlas cùng tên thêm `-2`.
- Chỉ số `12–17`: thêm `-3`; `18–23`: thêm `-4`; tương tự cho các atlas tiếp theo.
- Ô trong atlas là `imageIndex % 6`. Một số atlas đầu có ô trống; kiểm tra ảnh trước khi dùng chỉ số.

Tên atlas đã được chọn tự động trong `FoodItem.imageAsset`. Toàn bộ `assets/images/` đã khai báo trong `pubspec.yaml`; đặt atlas mới vào đó rồi khởi động lại app. Khi thay đổi kho mẫu, cập nhật kiểm tra số lượng/ID trong test. Nên tối ưu kích thước ảnh trước khi mở rộng kho; 10 PNG hiện có tổng dung lượng khoảng **25,24 MiB**, chưa tính các phần khác của app.

## 9. Kiểm tra và build

Sau khi cài dependency:

```powershell
dart analyze lib test
flutter test --no-pub
git diff --check
```

Kết quả gần nhất (01/11/2026): `flutter analyze lib test` báo **No issues found**. `flutter test` chạy **22 test: 21 qua, 1 lỗi**.

- `test/widget_test.dart` (11 test, đều qua): URL Google Maps, giờ chuyển bữa, dữ liệu/atlas, bộ lọc, ngân sách, đổi bữa, layout điện thoại, quay lại, danh sách rỗng và quay đủ 5 giây khi bật/tắt giảm chuyển động.
- `test/features_test.dart` (11 test, 10 qua): trọng số yêu thích và món vừa ăn, ẩn món, thêm/sửa/xóa món tự tạo, giới hạn lịch sử, lưu và đọc lại dữ liệu, bỏ qua dữ liệu hỏng, kiểm tra tên/giá, nội dung chia sẻ, chuyển 3 tab.
- **Test đang lỗi**: "thêm món qua form rồi món hiện trong kho". Sau khi bấm lưu, test không tìm thấy ô tìm kiếm của tab Món ăn (`Bad state: No element`). Chưa xác định nguyên nhân nằm ở test hay ở form.

Widget test không xác nhận được app Maps thật có mở hoặc APK có chạy tốt trên thiết bị; các bước đó cần kiểm tra riêng.

Tạo APK debug để thử trên Android:

```powershell
flutter build apk --debug
```

Nếu build thành công, file nằm tại `build/app/outputs/flutter-apk/app-debug.apk`. Cấu hình hiện tại đã build APK debug thành công với Flutter 3.47.5, cài bằng `adb install` và mở được trên máy ảo Android `sdk gphone64 x86 64`. `release` hiện dùng debug signing trong `android/app/build.gradle`; cần cấu hình ký phát hành riêng trước khi phân phối chính thức.

## 10. Xử lý lỗi thường gặp

### Không nhận lệnh Flutter hoặc không thấy Chrome

Kiểm tra Flutter đã có trong `PATH`, mở terminal mới sau khi thay `PATH`, rồi chạy `flutter doctor -v` và `flutter devices`. Đảm bảo Chrome được cài trước khi chạy `flutter run -d chrome`.

### Vòng quay trông như chỉ chạy rất nhanh

Dừng và chạy lại app hoặc dùng **`R` viết hoa** để tạo controller mới. Controller hiện bảo toàn 5 giây kể cả khi hệ thống bật giảm chuyển động. Test đã kiểm tra dải thẻ vẫn chạy ở giây thứ 4 và chưa có kết quả ở 4,999 giây. Nếu vẫn thấy khác, ghi lại thiết bị/trình duyệt, chế độ giảm chuyển động và thời điểm hộp kết quả xuất hiện.

### Lệnh Flutter/Dart không có output hoặc bị treo

Môi trường phát triển từng gặp trường hợp này. Dừng lệnh bằng `Ctrl+C` nếu không có tiến triển, kiểm tra `Get-Command flutter,dart`, `flutter doctor -v` và log lỗi. Tránh chạy nhiều lệnh Flutter đồng thời hoặc xóa lock/cache khi còn tiến trình khác hoạt động. Nếu có `Access is denied`, cần giải quyết quyền thực thi/ghi SDK; không coi đó là lỗi mã ứng dụng. Không tự nâng toolchain chỉ để né lỗi treo.

### Build Android báo lỗi Java, Kotlin, Gradle hoặc AGP

Kiểm tra JDK thực tế trong `flutter doctor -v`, Flutter SDK đang dùng và các phiên bản đã khai báo ở mục 2. Một Flutter SDK mới có thể yêu cầu Android toolchain khác; test Dart thành công không chứng minh Gradle tương thích. Giữ log lỗi và chọn bộ phiên bản đã được nhóm thống nhất trước khi thay đổi cấu hình.

### Google Maps không mở

Trên Android, phải build/chạy lại sau thay đổi `MainActivity.kt`. Kiểm tra có Maps hoặc trình duyệt xử lý URL và thiết bị có mạng. Trên web, trình duyệt có thể chặn tab mới; triển khai web hiện không xác nhận được mọi trường hợp bị chặn popup. Không có quán phù hợp trong Maps cũng không có nghĩa là vòng quay bị lỗi.

## 11. Giới hạn và nguồn tham khảo

- Chưa có tài khoản, đồng bộ giữa các máy hoặc hệ thống Khẩu vị/EXP. Dữ liệu chỉ lưu trên một thiết bị và mất khi gỡ app hoặc xóa dữ liệu app.
- Bộ lọc chưa có vùng miền, món chay hoặc dị ứng; nhãn bữa là dữ liệu gợi ý do dự án gắn thủ công.
- Nhóm món và ngân sách được lưu lại. Bữa ăn chọn thủ công thì không được lưu và luôn theo giờ thiết bị khi mở app.
- Món tự tạo không có ảnh riêng, chỉ dùng icon của nhóm món.
- Chia sẻ kết quả chỉ chạy trên Android, chưa hỗ trợ web.
- Trên máy ảo mới kiểm tra màn hình đầu tiên và thanh 3 tab. Chưa bấm thử quay, chia sẻ hay thêm món trên máy ảo.
- Ảnh là tài nguyên AI tạo bằng ImageGen, mang tính minh họa, không phải ảnh cam kết từ quán bán. Giá món cũng là giá tham khảo.
- Kho dùng ảnh cục bộ; dự án không lấy ảnh trực tiếp từ website tham khảo khi chạy.
- Chưa xác minh trực tiếp việc mở Google Maps trên Chrome/Android thật. Build Android đã được xác minh trên máy ảo, chưa thử trên điện thoại thật.

Nguồn cảm hứng: [truanayangi.com](https://truanayangi.com/?theme=ket-hoi-tho-lun) và [repository truanayangi-com/truanayangi](https://github.com/truanayangi-com/truanayangi). Tham khảo ý tưởng không đồng nghĩa có quyền sao chép toàn bộ mã, ảnh, âm thanh hoặc thương hiệu của bên khác.
