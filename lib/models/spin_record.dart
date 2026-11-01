import 'food_item.dart';

/// Một lượt quay đã có kết quả. Lưu cả tên và giá để vẫn hiển thị được
/// khi món tự tạo đã bị xóa.
class SpinRecord {
  const SpinRecord({
    required this.foodId,
    required this.foodName,
    required this.category,
    required this.price,
    required this.time,
  });

  factory SpinRecord.fromFood(FoodItem food, DateTime time) => SpinRecord(
        foodId: food.id,
        foodName: food.name,
        category: food.category,
        price: food.price,
        time: time,
      );

  final String foodId;
  final String foodName;
  final FoodCategory category;
  final int price;
  final DateTime time;

  Map<String, Object?> toJson() => {
        'foodId': foodId,
        'foodName': foodName,
        'category': category.name,
        'price': price,
        'time': time.millisecondsSinceEpoch,
      };

  static SpinRecord? tryFromJson(Object? json) {
    if (json is! Map) {
      return null;
    }
    try {
      return SpinRecord(
        foodId: json['foodId'] as String,
        foodName: json['foodName'] as String,
        category: FoodCategory.values.byName(json['category'] as String),
        price: json['price'] as int,
        time: DateTime.fromMillisecondsSinceEpoch(json['time'] as int),
      );
    } catch (_) {
      return null;
    }
  }
}

/// Món xuất hiện nhiều nhất trong lịch sử; null khi lịch sử trống.
({String name, int count})? mostFrequentFood(List<SpinRecord> history) {
  final counts = <String, int>{};
  final names = <String, String>{};
  for (final record in history) {
    counts.update(record.foodId, (count) => count + 1, ifAbsent: () => 1);
    names.putIfAbsent(record.foodId, () => record.foodName);
  }
  if (counts.isEmpty) {
    return null;
  }
  final top = counts.entries.reduce((a, b) => b.value > a.value ? b : a);
  return (name: names[top.key]!, count: top.value);
}

String _twoDigits(int value) => value.toString().padLeft(2, '0');

/// Ví dụ: "Hôm nay 12:05", "Hôm qua 19:30", "03/01 08:15".
String formatSpinTime(DateTime time, DateTime now) {
  final clock = '${_twoDigits(time.hour)}:${_twoDigits(time.minute)}';
  final day = DateTime(time.year, time.month, time.day);
  final today = DateTime(now.year, now.month, now.day);
  final days = today.difference(day).inDays;
  if (days == 0) {
    return 'Hôm nay $clock';
  }
  if (days == 1) {
    return 'Hôm qua $clock';
  }
  return '${_twoDigits(time.day)}/${_twoDigits(time.month)} $clock';
}
