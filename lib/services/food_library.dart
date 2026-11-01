import 'dart:async';

import 'package:flutter/foundation.dart';

import '../data/sample_foods.dart';
import '../models/food_item.dart';
import '../models/spin_record.dart';
import 'app_storage.dart';

/// Số lượt quay tối đa được giữ trong lịch sử.
const maxHistoryLength = 50;

/// Món đã quay trong số ngày lịch này (hôm nay, hôm qua, hôm kia)
/// được tính là "vừa ăn" và bị giảm tỉ lệ ra.
const recentDayWindow = 3;

/// Trạng thái dùng chung giữa các màn hình: kho món, yêu thích, món ẩn,
/// lịch sử quay và lựa chọn bộ lọc. Mọi thay đổi được ghi xuống thiết bị
/// nếu có [AppStorage]; không có storage thì chỉ giữ trong bộ nhớ (dùng cho test).
class FoodLibrary extends ChangeNotifier {
  FoodLibrary.inMemory({this.baseFoods = sampleFoods}) : _storage = null;

  FoodLibrary.load(AppStorage storage, {this.baseFoods = sampleFoods})
      : _storage = storage {
    final baseIds = {for (final food in baseFoods) food.id};
    _customFoods
        .addAll(storage.readCustomFoods().where((f) => !baseIds.contains(f.id)));
    _favoriteIds.addAll(storage.readFavorites());
    _excludedIds.addAll(storage.readExcluded());
    _history.addAll(storage.readHistory().take(maxHistoryLength));
    _category = storage.readCategory() ?? _category;
    _budget = storage.readBudget() ?? _budget;
  }

  final AppStorage? _storage;
  final List<FoodItem> baseFoods;
  final List<FoodItem> _customFoods = [];
  final Set<String> _favoriteIds = {};
  final Set<String> _excludedIds = {};
  final List<SpinRecord> _history = [];
  FoodCategory _category = FoodCategory.lunch;
  FoodBudget _budget = FoodBudget.fifty;

  List<FoodItem> get allFoods =>
      List.unmodifiable([...baseFoods, ..._customFoods]);
  List<FoodItem> get customFoods => List.unmodifiable(_customFoods);
  Set<String> get favoriteIds => Set.unmodifiable(_favoriteIds);
  Set<String> get excludedIds => Set.unmodifiable(_excludedIds);

  /// Lịch sử, lượt mới nhất đứng đầu.
  List<SpinRecord> get history => List.unmodifiable(_history);
  FoodCategory get category => _category;
  FoodBudget get budget => _budget;

  bool isFavorite(String id) => _favoriteIds.contains(id);
  bool isExcluded(String id) => _excludedIds.contains(id);

  /// Món quay trong [recentDayWindow] ngày lịch gần nhất tính tới [now].
  Set<String> recentFoodIds(DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    return {
      for (final record in _history)
        if (today
                .difference(DateTime(
                    record.time.year, record.time.month, record.time.day))
                .inDays <
            recentDayWindow)
          record.foodId,
    };
  }

  /// Món đủ điều kiện quay: đúng nhóm/bữa và không bị ẩn.
  List<FoodItem> eligibleFoods(MealPeriod mealPeriod) =>
      filterFoods(allFoods, _category, mealPeriod)
          .where((food) => !_excludedIds.contains(food.id))
          .toList(growable: false);

  bool nameExists(String name, {String? exceptId}) {
    final normalized = name.trim().toLowerCase();
    return allFoods.any(
      (food) => food.id != exceptId && food.name.toLowerCase() == normalized,
    );
  }

  void setCategory(FoodCategory category) {
    if (category == _category) {
      return;
    }
    _category = category;
    notifyListeners();
    _persist((storage) => storage.writeCategory(category));
  }

  void setBudget(FoodBudget budget) {
    if (budget == _budget) {
      return;
    }
    _budget = budget;
    notifyListeners();
    _persist((storage) => storage.writeBudget(budget));
  }

  void toggleFavorite(String id) {
    if (!_favoriteIds.remove(id)) {
      _favoriteIds.add(id);
    }
    notifyListeners();
    final snapshot = Set.of(_favoriteIds);
    _persist((storage) => storage.writeFavorites(snapshot));
  }

  void toggleExcluded(String id) {
    if (!_excludedIds.remove(id)) {
      _excludedIds.add(id);
    }
    notifyListeners();
    final snapshot = Set.of(_excludedIds);
    _persist((storage) => storage.writeExcluded(snapshot));
  }

  void addCustomFood(FoodItem food) {
    _customFoods.add(food);
    notifyListeners();
    _saveCustomFoods();
  }

  void updateCustomFood(FoodItem food) {
    final index = _customFoods.indexWhere((item) => item.id == food.id);
    if (index < 0) {
      return;
    }
    _customFoods[index] = food;
    notifyListeners();
    _saveCustomFoods();
  }

  void deleteCustomFood(String id) {
    final before = _customFoods.length;
    _customFoods.removeWhere((food) => food.id == id);
    if (_customFoods.length == before) {
      return;
    }
    final favoriteChanged = _favoriteIds.remove(id);
    final excludedChanged = _excludedIds.remove(id);
    notifyListeners();
    _saveCustomFoods();
    if (favoriteChanged) {
      final snapshot = Set.of(_favoriteIds);
      _persist((storage) => storage.writeFavorites(snapshot));
    }
    if (excludedChanged) {
      final snapshot = Set.of(_excludedIds);
      _persist((storage) => storage.writeExcluded(snapshot));
    }
  }

  void recordSpin(FoodItem food, DateTime time) {
    _history.insert(0, SpinRecord.fromFood(food, time));
    if (_history.length > maxHistoryLength) {
      _history.removeRange(maxHistoryLength, _history.length);
    }
    notifyListeners();
    _saveHistory();
  }

  void clearHistory() {
    if (_history.isEmpty) {
      return;
    }
    _history.clear();
    notifyListeners();
    _saveHistory();
  }

  void _saveCustomFoods() {
    final snapshot = List.of(_customFoods);
    _persist((storage) => storage.writeCustomFoods(snapshot));
  }

  void _saveHistory() {
    final snapshot = List.of(_history);
    _persist((storage) => storage.writeHistory(snapshot));
  }

  void _persist(Future<void> Function(AppStorage storage) write) {
    final storage = _storage;
    if (storage == null) {
      return;
    }
    unawaited(
      write(storage).catchError((Object error) {
        debugPrint('Không lưu được dữ liệu: $error');
      }),
    );
  }
}
