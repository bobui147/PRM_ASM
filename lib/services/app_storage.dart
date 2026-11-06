import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/food_item.dart';
import '../models/spin_record.dart';

/// Đọc/ghi dữ liệu người dùng bằng SharedPreferences trên thiết bị.
class AppStorage {
  AppStorage(this._prefs);

  static Future<AppStorage> open() async {
    final storage = AppStorage(await SharedPreferences.getInstance());
    await storage._migrate();
    return storage;
  }

  /// Phiên bản dữ liệu cục bộ. v2: món lấy từ server, id là số của server.
  static const schemaVersion = 2;
  static const schemaKey = 'data_schema_version';
  static const favoritesKey = 'favorite_food_ids';
  static const excludedKey = 'excluded_food_ids';
  static const historyKey = 'spin_history';
  static const categoryKey = 'selected_category';
  static const budgetKey = 'selected_budget';
  static const catalogKey = 'catalog_cache';
  static const reviewNoticeKey = 'review_notice_seen';

  // Khóa của bản cũ dùng id dạng "pho-bo", không khớp id mới (FR-M03).
  static const _legacyKeys = [
    'custom_foods',
    favoritesKey,
    excludedKey,
    historyKey,
    categoryKey,
  ];

  final SharedPreferences _prefs;

  Future<void> _migrate() async {
    if ((_prefs.getInt(schemaKey) ?? 1) >= schemaVersion) return;
    for (final key in _legacyKeys) {
      await _prefs.remove(key);
    }
    await _prefs.setInt(schemaKey, schemaVersion);
  }

  Set<String> readFavorites() => _readIds(favoritesKey);

  Future<void> writeFavorites(Set<String> ids) async {
    await _prefs.setStringList(favoritesKey, ids.toList());
  }

  Set<String> readExcluded() => _readIds(excludedKey);

  Future<void> writeExcluded(Set<String> ids) async {
    await _prefs.setStringList(excludedKey, ids.toList());
  }

  List<SpinRecord> readHistory() =>
      _readJsonList(historyKey, SpinRecord.tryFromJson);

  Future<void> writeHistory(List<SpinRecord> history) async {
    await _prefs.setString(
      historyKey,
      jsonEncode([for (final record in history) record.toJson()]),
    );
  }

  /// Slug nhóm món đã chọn.
  String? readCategory() => _prefs.getString(categoryKey);

  Future<void> writeCategory(String slug) async {
    await _prefs.setString(categoryKey, slug);
  }

  FoodBudget? readBudget() => FoodBudget.values.asNameMap()[_prefs.getString(budgetKey)];

  Future<void> writeBudget(FoodBudget budget) async {
    await _prefs.setString(budgetKey, budget.name);
  }

  /// JSON gốc của `/catalog` lần gần nhất (để dùng khi mất mạng).
  Map<String, dynamic>? readCatalog() {
    final raw = _prefs.getString(catalogKey);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map ? decoded.cast<String, dynamic>() : null;
    } on FormatException catch (error) {
      debugPrint('Bỏ qua cache danh mục hỏng: $error');
      return null;
    }
  }

  Future<void> writeCatalog(Map<String, dynamic> json) async {
    await _prefs.setString(catalogKey, jsonEncode(json));
  }

  bool readReviewNoticeSeen() => _prefs.getBool(reviewNoticeKey) ?? false;

  Future<void> writeReviewNoticeSeen() async {
    await _prefs.setBool(reviewNoticeKey, true);
  }

  Set<String> _readIds(String key) =>
      (_prefs.getStringList(key) ?? const <String>[]).toSet();

  List<T> _readJsonList<T>(String key, T? Function(Object?) parse) {
    final raw = _prefs.getString(key);
    if (raw == null) {
      return [];
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) {
        return [];
      }
      return decoded.map(parse).whereType<T>().toList();
    } on FormatException catch (error) {
      debugPrint('Bỏ qua dữ liệu hỏng ở "$key": $error');
      return [];
    }
  }
}
