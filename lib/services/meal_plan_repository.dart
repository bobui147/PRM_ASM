import '../models/json_read.dart';
import '../models/meal_plan.dart';
import 'api_client.dart';

/// Gọi API thực đơn cá nhân (requirements-mo-rong.md P3). Dữ liệu gắn với tài khoản.
class MealPlanRepository {
  MealPlanRepository(this._api);

  final ApiClient _api;

  /// Mục kế hoạch từ [from] tới [to] (tối đa 31 ngày).
  Future<List<PlanItem>> range(DateTime from, DateTime to) async {
    final json = (await _api.get('/me/meal-plan', query: {'from': isoDate(from), 'to': isoDate(to)})).json;
    return readMaps(json['items']).map(PlanItem.fromJson).toList(growable: false);
  }

  Future<PlanItem> add({required int foodId, required DateTime date, required PlanMeal meal}) async {
    final response = await _api.post('/me/meal-plan', {'foodId': foodId, 'date': isoDate(date), 'meal': meal.name});
    return PlanItem.fromJson(response.json);
  }

  Future<PlanItem> move(int id, {required DateTime date, required PlanMeal meal}) async {
    final response = await _api.patch('/me/meal-plan/$id', {'date': isoDate(date), 'meal': meal.name});
    return PlanItem.fromJson(response.json);
  }

  Future<void> remove(int id) => _api.delete('/me/meal-plan/$id');

  Future<PlanItem> setEaten(int id, bool eaten) async {
    final path = '/me/meal-plan/$id/eaten';
    return PlanItem.fromJson((eaten ? await _api.put(path) : await _api.delete(path)).json);
  }

  Future<PageResult<PlanItem>> eatenHistory({int page = 1}) async {
    final response = await _api.get('/me/eaten', query: {'page': page, 'limit': 20});
    return PageResult.fromJson(response.json, PlanItem.fromJson);
  }

  Future<PageResult<WantToTryItem>> wantToTry({int page = 1}) async {
    final response = await _api.get('/me/want-to-try', query: {'page': page, 'limit': 50});
    return PageResult.fromJson(response.json, WantToTryItem.fromJson);
  }

  Future<void> setWantToTry(int foodId, bool saved) async {
    final path = '/me/want-to-try/$foodId';
    if (saved) {
      await _api.put(path);
    } else {
      await _api.delete(path);
    }
  }
}
