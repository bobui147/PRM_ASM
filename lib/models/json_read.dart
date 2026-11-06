// Hàm đọc JSON an toàn: giá trị sai kiểu không làm app crash.

int readInt(Object? value, [int fallback = 0]) =>
    value is num ? value.toInt() : int.tryParse('$value') ?? fallback;

int? readIntOrNull(Object? value) => value == null
    ? null
    : (value is num ? value.toInt() : int.tryParse('$value'));

String? readString(Object? value) =>
    value is String && value.isNotEmpty ? value : null;

DateTime? readDate(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toLocal() : null;

Map readMap(Object? value) => value is Map ? value : const {};

List<Map> readMaps(Object? value) =>
    value is List ? value.whereType<Map>().toList(growable: false) : const [];

/// Một trang kết quả `{ items, page, limit, total, hasMore }`.
class PageResult<T> {
  const PageResult({
    required this.items,
    required this.page,
    required this.total,
    required this.hasMore,
  });

  final List<T> items;
  final int page;
  final int total;
  final bool hasMore;

  static PageResult<T> fromJson<T>(Map json, T Function(Map) parse) =>
      PageResult(
        items: readMaps(json['items']).map(parse).toList(growable: false),
        page: readInt(json['page'], 1),
        total: readInt(json['total']),
        hasMore: json['hasMore'] == true,
      );
}
