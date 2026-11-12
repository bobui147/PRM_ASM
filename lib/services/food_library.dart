import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/food_item.dart';
import '../models/spin_record.dart';
import 'api_client.dart';
import 'app_storage.dart';
import 'catalog_repository.dart';

/// Số lượt quay tối đa được giữ trong lịch sử.
const maxHistoryLength = 50;

/// Món đã quay trong số ngày lịch này được tính là "vừa ăn".
const recentDayWindow = 3;

enum CatalogStatus { loading, ready, error }

/// Trạng thái dùng chung: danh mục món từ server (kèm cache), yêu thích,
/// món ẩn, lịch sử quay và lựa chọn bộ lọc (lưu trên máy).
class FoodLibrary extends ChangeNotifier {
  FoodLibrary({AppStorage? storage, CatalogRepository? repository})
      : _storage = storage,
        _repository = repository {
    final storage = _storage;
    if (storage != null) {
      _favoriteIds.addAll(storage.readFavorites());
      _excludedIds.addAll(storage.readExcluded());
      _history.addAll(storage.readHistory().take(maxHistoryLength));
      _categorySlug = storage.readCategory();
      _budget = storage.readBudget() ?? _budget;
    }
    final cached = _repository?.readCached();
    if (cached != null) {
      _catalog = cached;
      _status = CatalogStatus.ready;
    }
  }

  /// Dùng cho test: danh mục cố định, không lưu, không gọi mạng.
  FoodLibrary.inMemory({Catalog catalog = Catalog.empty})
      : _storage = null,
        _repository = null,
        _catalog = catalog,
        _status = CatalogStatus.ready;

  final AppStorage? _storage;
  final CatalogRepository? _repository;
  Catalog _catalog = Catalog.empty;
  Catalog? _pending;
  CatalogStatus _status = CatalogStatus.loading;
  String? _errorMessage;
  bool _locked = false;
  final Set<String> _favoriteIds = {};
  final Set<String> _excludedIds = {};
  final List<SpinRecord> _history = [];
  String? _categorySlug;
  FoodBudget _budget = FoodBudget.fifty;

  CatalogStatus get status => _status;
  String? get errorMessage => _errorMessage;

  /// Đang hiển thị dữ liệu đã lưu vì lần tải gần nhất bị lỗi.
  bool get usingCachedData => _errorMessage != null && _status == CatalogStatus.ready;

  List<FoodCategory> get categories => _catalog.categories;
  List<FoodItem> get allFoods => _catalog.foods;
  Set<String> get favoriteIds => Set.unmodifiable(_favoriteIds);
  Set<String> get excludedIds => Set.unmodifiable(_excludedIds);
  List<SpinRecord> get history => List.unmodifiable(_history);
  FoodBudget get budget => _budget;

  /// Nhóm đang chọn; nhóm đã lưu không còn tồn tại thì lấy nhóm đầu tiên.
  FoodCategory? get category {
    final list = _catalog.categories;
    if (list.isEmpty) return null;
    return list.firstWhere((c) => c.slug == _categorySlug, orElse: () => list.first);
  }

  FoodItem? foodById(String id) {
    for (final food in _catalog.foods) {
      if (food.id == id) return food;
    }
    return null;
  }

  bool isFavorite(String id) => _favoriteIds.contains(id);
  bool isExcluded(String id) => _excludedIds.contains(id);

  /// Khi đang quay hoặc đang mở kết quả, danh mục mới được giữ lại và
  /// chỉ áp dụng khi mở khóa (FR-M01).
  set locked(bool value) {
    _locked = value;
    final pending = _pending;
    if (!value && pending != null) {
      _pending = null;
      _catalog = pending;
      notifyListeners();
    }
  }

  /// Tải danh mục từ server. Lỗi mạng mà đã có cache thì vẫn dùng cache.
  Future<void> refresh() async {
    final repository = _repository;
    if (repository == null) return;
    if (_status == CatalogStatus.error) {
      _status = CatalogStatus.loading;
      notifyListeners();
    }
    try {
      final hasData = _status == CatalogStatus.ready;
      final (result, catalog) = await repository.fetch(
        knownVersion: hasData ? _catalog.version : null,
      );
      _errorMessage = null;
      if (result == CatalogRefresh.updated && catalog != null) {
        if (_locked) {
          _pending = catalog;
        } else {
          _catalog = catalog;
        }
      }
      _status = CatalogStatus.ready;
    } on ApiException catch (error) {
      _errorMessage = error.message;
      if (_status != CatalogStatus.ready) _status = CatalogStatus.error;
    }
    notifyListeners();
  }

  /// Món quay trong [recentDayWindow] ngày lịch gần nhất tính tới [now].
  Set<String> recentFoodIds(DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    return {
      for (final record in _history)
        if (today
                .difference(DateTime(record.time.year, record.time.month, record.time.day))
                .inDays <
            recentDayWindow)
          record.foodId,
    };
  }

  /// Món đủ điều kiện quay: đúng nhóm/bữa, đúng khoảng giá và không bị ẩn.
  List<FoodItem> eligibleFoods(MealPeriod mealPeriod) =>
      filterFoods(allFoods, category, mealPeriod)
          .where((food) => !_excludedIds.contains(food.id))
          .where((food) => _budget.accepts(food.price))
          .toList(growable: false);

  void setCategory(FoodCategory category) {
    if (category.slug == _categorySlug) {
      return;
    }
    _categorySlug = category.slug;
    notifyListeners();
    _persist((storage) => storage.writeCategory(category.slug));
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