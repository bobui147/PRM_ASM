import '../models/food_item.dart';
import 'api_client.dart';
import 'app_storage.dart';

/// Danh mục món: nhóm món và món đang hoạt động.
class Catalog {
  const Catalog({
    required this.version,
    required this.categories,
    required this.foods,
  });

  static const empty = Catalog(version: '', categories: [], foods: []);

  final String version;
  final List<FoodCategory> categories;
  final List<FoodItem> foods;

  bool get isEmpty => foods.isEmpty;

  /// Đọc JSON của `GET /catalog`. Bỏ qua phần tử hỏng thay vì báo lỗi.
  static Catalog fromJson(Map<String, dynamic> json) {
    final categories = (json['categories'] as List? ?? const [])
        .map(FoodCategory.tryFromJson)
        .whereType<FoodCategory>()
        .toList(growable: false);
    final bySlug = {for (final c in categories) c.slug: c};
    return Catalog(
      version: '${json['version'] ?? ''}',
      categories: categories,
      foods: (json['foods'] as List? ?? const [])
          .map((item) => FoodItem.tryFromJson(item, bySlug))
          .whereType<FoodItem>()
          .toList(growable: false),
    );
  }
}

/// Kết quả làm mới: dữ liệu mới, không đổi (304) hoặc lỗi.
enum CatalogRefresh { updated, unchanged }

class CatalogRepository {
  CatalogRepository(this._api, this._storage);

  final ApiClient _api;
  final AppStorage? _storage;

  /// Danh mục đã cache trên máy, hoặc null nếu chưa tải lần nào.
  Catalog? readCached() {
    final json = _storage?.readCatalog();
    return json == null ? null : Catalog.fromJson(json);
  }

  /// Gọi server. Trả `(CatalogRefresh.unchanged, null)` khi server trả 304.
  /// Ném [ApiException] khi lỗi mạng hoặc lỗi server.
  Future<(CatalogRefresh, Catalog?)> fetch({String? knownVersion}) async {
    final response = await _api.get(
      '/catalog',
      headers: {
        if (knownVersion != null && knownVersion.isNotEmpty)
          'If-None-Match': 'W/"catalog-$knownVersion"',
      },
    );
    if (response.status == 304) {
      return (CatalogRefresh.unchanged, null);
    }
    final json = response.json;
    await _storage?.writeCatalog(json);
    return (CatalogRefresh.updated, Catalog.fromJson(json));
  }
}
