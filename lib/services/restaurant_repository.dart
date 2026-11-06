import '../models/json_read.dart';
import '../models/restaurant.dart';
import '../models/review.dart';
import 'api_client.dart';

/// Dữ liệu review gửi lên khi viết hoặc sửa (FR-R02, FR-R03).
class ReviewInput {
  const ReviewInput({
    required this.rating,
    required this.comment,
    required this.visitDate,
    this.foodId,
    this.amountSpent,
    this.keepImageIds = const [],
    this.newImages = const [],
  });

  final int rating;
  final String comment;

  /// YYYY-MM-DD.
  final String visitDate;
  final int? foodId;
  final int? amountSpent;
  final List<int> keepImageIds;
  final List<UploadFile> newImages;
}

/// Gọi API quán, review và báo cáo.
class RestaurantRepository {
  RestaurantRepository(this._api);

  final ApiClient _api;

  /// FR-P02: quán bán món. [sort] là `rating`, `reviews` hoặc `price`.
  Future<PageResult<Restaurant>> restaurantsForFood(
    String foodId, {
    int page = 1,
    int limit = 10,
    String? area,
    String sort = 'rating',
    int? budget,
  }) async {
    final response = await _api.get('/foods/$foodId/restaurants', query: {
      'page': page,
      'limit': limit,
      'area': area,
      'sort': sort,
      'budget': budget,
    });
    return PageResult.fromJson(response.json, Restaurant.fromJson);
  }

  /// FR-P03: chi tiết quán kèm thực đơn và phân bố sao.
  Future<Restaurant> restaurant(int id) async {
    final response = await _api.get('/restaurants/$id');
    return Restaurant.fromJson(response.json);
  }

  /// FR-P04: review đã đăng; có `myReview` nếu đang đăng nhập.
  Future<ReviewPage> reviews(
    int restaurantId, {
    int page = 1,
    String sort = 'newest',
    bool withImages = false,
  }) async {
    final response = await _api.get('/restaurants/$restaurantId/reviews', query: {
      'page': page,
      'limit': 10,
      'sort': sort,
      if (withImages) 'withImages': 'true',
    });
    final json = response.json;
    final mine = json['myReview'];
    return ReviewPage(
      page: PageResult.fromJson(json, Review.fromJson),
      myReview: mine is Map ? Review.fromJson(mine) : null,
    );
  }

  Future<PageResult<Review>> myReviews({int page = 1}) async {
    final response = await _api.get('/me/reviews', query: {'page': page, 'limit': 20});
    return PageResult.fromJson(response.json, Review.fromJson);
  }

  Map<String, Object?> _fields(ReviewInput input) => {
        'rating': input.rating,
        'comment': input.comment,
        'visitDate': input.visitDate,
        'foodId': input.foodId,
        'amountSpent': input.amountSpent,
      };

  Future<Review> createReview(int restaurantId, ReviewInput input) async {
    final response = await _api.multipart(
      'POST',
      '/restaurants/$restaurantId/reviews',
      fields: _fields(input),
      files: input.newImages,
    );
    return Review.fromJson(response.json);
  }

  Future<Review> updateReview(int reviewId, ReviewInput input) async {
    final response = await _api.multipart(
      'PUT',
      '/reviews/$reviewId',
      fields: _fields(input),
      listFields: {'keepImageIds': input.keepImageIds},
      files: input.newImages,
    );
    return Review.fromJson(response.json);
  }

  Future<void> deleteReview(int reviewId) async {
    await _api.delete('/reviews/$reviewId');
  }

  Future<void> reportReview(int reviewId, ReportReason reason, String? details) async {
    await _api.post('/reviews/$reviewId/reports', {
      'reason': reason.apiName,
      if (details != null && details.trim().isNotEmpty) 'details': details.trim(),
    });
  }
}
