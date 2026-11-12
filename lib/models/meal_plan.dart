import 'json_read.dart';

/// Thực đơn cá nhân (requirements-mo-rong.md P3).

enum PlanMeal {
  breakfast('Bữa sáng'),
  lunch('Bữa trưa'),
  dinner('Bữa tối'),
  other('Bữa khác');

  const PlanMeal(this.label);

  final String label;
}

class PlanItem {
  const PlanItem({
    required this.id,
    required this.foodName,
    required this.date,
    required this.meal,
    this.foodId,
    this.referencePrice,
    this.thumbUrl,
    this.available = true,
    this.note,
    this.eaten = false,
  });

  final int id;

  /// null khi món không còn trong danh mục công khai (vẫn hiện tên đã lưu).
  final int? foodId;
  final String foodName;
  final int? referencePrice;
  final String? thumbUrl;
  final bool available;

  /// YYYY-MM-DD.
  final String date;
  final PlanMeal meal;
  final String? note;
  final bool eaten;

  static PlanItem fromJson(Map json) {
    final food = readMap(json['food']);
    return PlanItem(
      id: readInt(json['id']),
      foodId: readIntOrNull(food['id']),
      foodName: '${food['name'] ?? ''}',
      referencePrice: readIntOrNull(food['referencePrice']),
      thumbUrl: readString(food['thumbUrl']),
      available: json['available'] != false,
      date: '${json['date'] ?? ''}',
      meal: PlanMeal.values.asNameMap()[json['meal']] ?? PlanMeal.other,
      note: readString(json['note']),
      eaten: json['eaten'] == true,
    );
  }
}

class WantToTryItem {
  const WantToTryItem({
    required this.foodId,
    required this.name,
    required this.referencePrice,
    this.thumbUrl,
    this.available = true,
  });

  final int foodId;
  final String name;
  final int referencePrice;
  final String? thumbUrl;
  final bool available;

  static WantToTryItem fromJson(Map json) => WantToTryItem(
        foodId: readInt(json['foodId']),
        name: '${json['name'] ?? ''}',
        referencePrice: readInt(json['referencePrice']),
        thumbUrl: readString(json['thumbUrl']),
        available: json['available'] != false,
      );
}

/// Ngày dạng YYYY-MM-DD theo giờ máy.
String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

/// Thứ Hai của tuần chứa [d].
DateTime startOfWeek(DateTime d) => dateOnly(d).subtract(Duration(days: d.weekday - 1));

const _weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/// "T4 · 13/11".
String dayLabel(DateTime d) =>
    '${_weekdays[d.weekday - 1]} · ${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';
