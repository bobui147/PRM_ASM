import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/food_item.dart';
import '../models/spin_record.dart';

/// Đọc/ghi dữ liệu người dùng bằng SharedPreferences trên thiết bị.
class AppStorage {
  AppStorage(this._prefs);

  static Future<AppStorage> open() async =>
      AppStorage(await SharedPreferences.getInstance());

  static const favoritesKey = 'favorite_food_ids';
  static const excludedKey = 'excluded_food_ids';
  static const customFoodsKey = 'custom_foods';
  static const historyKey = 'spin_history';
  static const categoryKey = 'selected_category';
  static const budgetKey = 'selected_budget';

  final SharedPreferences _prefs;

  Set<String> readFavorites() => _readIds(favoritesKey);

  Future<void> writeFavorites(Set<String> ids) async {
    await _prefs.setStringList(favoritesKey, ids.toList());
  }

  Set<String> readExcluded() => _readIds(excludedKey);

  Future<void> writeExcluded(Set<String> ids) async {
    await _prefs.setStringList(excludedKey, ids.toList());
  }

  List<FoodItem> readCustomFoods() =>
      _readJsonList(customFoodsKey, FoodItem.tryFromJson);

  Future<void> writeCustomFoods(List<FoodItem> foods) async {
    await _prefs.setString(
      customFoodsKey,
      jsonEncode([for (final food in foods) food.toJson()]),
    );
  }

  List<SpinRecord> readHistory() =>
      _readJsonList(historyKey, SpinRecord.tryFromJson);

  Future<void> writeHistory(List<SpinRecord> history) async {
    await _prefs.setString(
      historyKey,
      jsonEncode([for (final record in history) record.toJson()]),
    );
  }

  FoodCategory? readCategory() => _readEnum(FoodCategory.values, categoryKey);

  Future<void> writeCategory(FoodCategory category) async {
    await _prefs.setString(categoryKey, category.name);
  }

  FoodBudget? readBudget() => _readEnum(FoodBudget.values, budgetKey);

  Future<void> writeBudget(FoodBudget budget) async {
    await _prefs.setString(budgetKey, budget.name);
  }

  Set<String> _readIds(String key) =>
      (_prefs.getStringList(key) ?? const <String>[]).toSet();

  T? _readEnum<T extends Enum>(List<T> values, String key) {
    final name = _prefs.getString(key);
    for (final value in values) {
      if (value.name == name) {
        return value;
      }
    }
    return null;
  }

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
