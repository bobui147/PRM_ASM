import 'package:flutter/widgets.dart';

import 'food_item.dart';

/// Một lượt quay đã có kết quả. Lưu tên món, tên/icon nhóm và giá tại thời
/// điểm quay để vẫn hiển thị được khi admin sửa hoặc xóa món.
class SpinRecord {
  const SpinRecord({
    required this.foodId,
    required this.foodName,
    required this.categoryName,
    required this.categoryIcon,
    required this.price,
    required this.time,
  });

  factory SpinRecord.fromFood(FoodItem food, DateTime time) => SpinRecord(
        foodId: food.id,
        foodName: food.name,
        categoryName: food.category.name,
        categoryIcon: food.category.iconKey,
        price: food.price,
        time: time,
      );

  final String foodId;
  final String foodName;
  final String categoryName;
  final String categoryIcon;
  final int price;
  final DateTime time;

  /// Icon nhóm món; mã lạ hoặc rỗng dùng icon mặc định.
  IconData get icon => iconForCategory(categoryIcon);

  Map<String, Object?> toJson() => {
        'foodId': foodId,
        'foodName': foodName,
        'categoryName': categoryName,
        'categoryIcon': categoryIcon,
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
        categoryName: json['categoryName'] as String? ?? '',
        categoryIcon: json['categoryIcon'] as String? ?? 'restaurant',
        price: (json['price'] as num).toInt(),
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
