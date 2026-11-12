import 'api_client.dart';
import 'app_storage.dart';
import 'auth_service.dart';
import 'catalog_repository.dart';
import 'community_repository.dart';
import 'food_library.dart';
import 'group_repository.dart';
import 'meal_plan_repository.dart';
import 'restaurant_repository.dart';

/// Các service dùng chung, tạo một lần trong main() và truyền xuống màn hình.
class AppServices {
  AppServices({
    required this.library,
    required this.auth,
    required this.restaurants,
    required this.community,
    required this.groups,
    required this.mealPlans,
    this.storage,
  });

  /// Bản đầy đủ: gọi server thật, lưu dữ liệu trên máy.
  factory AppServices.create({AppStorage? storage, ApiClient? api}) {
    final client = api ?? ApiClient();
    return AppServices(
      library: FoodLibrary(
        storage: storage,
        repository: CatalogRepository(client, storage),
      ),
      auth: AuthService(client),
      restaurants: RestaurantRepository(client),
      community: CommunityRepository(client),
      groups: GroupRepository(client),
      mealPlans: MealPlanRepository(client),
      storage: storage,
    );
  }

  /// Dùng cho widget test: không lưu, không gọi mạng thật.
  factory AppServices.inMemory({FoodLibrary? library, ApiClient? api}) {
    final client = api ?? ApiClient(baseUrl: 'http://localhost.invalid/api/v1');
    return AppServices(
      library: library ?? FoodLibrary.inMemory(),
      auth: AuthService(client, store: MemoryTokenStore()),
      restaurants: RestaurantRepository(client),
      community: CommunityRepository(client),
      groups: GroupRepository(client),
      mealPlans: MealPlanRepository(client),
    );
  }

  final FoodLibrary library;
  final AuthService auth;
  final RestaurantRepository restaurants;
  final CommunityRepository community;
  final GroupRepository groups;
  final MealPlanRepository mealPlans;
  final AppStorage? storage;

  void dispose() {
    library.dispose();
    auth.dispose();
  }
}
