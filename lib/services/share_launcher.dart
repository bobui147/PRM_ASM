import '../models/food_item.dart';
import 'share_launcher_stub.dart'
    if (dart.library.io) 'share_launcher_mobile.dart' as implementation;

String shareMessage(FoodItem food) =>
    'Hôm nay mình ăn ${food.name} (khoảng ${formatPrice(food.price)}). '
    'Chọn bằng app "Hôm nay ăn gì?"';

/// Mở bảng chia sẻ của hệ điều hành. Trả về false nếu nền tảng không hỗ trợ.
Future<bool> shareText(String text) => implementation.shareText(text);
