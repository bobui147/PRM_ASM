import 'json_read.dart';

/// Review đọc từ API (requirements §13.5, FR-R01).

class ReviewImage {
  const ReviewImage({required this.id, required this.url, required this.thumbUrl});

  final int id;
  final String url;
  final String thumbUrl;

  static ReviewImage fromJson(Map json) => ReviewImage(
        id: readInt(json['id']),
        url: '${json['url'] ?? ''}',
        thumbUrl: '${json['thumbUrl'] ?? json['url'] ?? ''}',
      );
}

enum ReviewStatus {
  pending('Đang chờ duyệt'),
  published('Đã đăng'),
  rejected('Bị từ chối'),
  hidden('Đã bị ẩn');

  const ReviewStatus(this.label);

  final String label;
}

class Review {
  const Review({
    required this.id,
    required this.restaurantId,
    required this.authorId,
    required this.authorName,
    required this.rating,
    required this.comment,
    required this.visitDate,
    this.foodId,
    this.foodName,
    this.amountSpent,
    this.images = const [],
    this.createdAt,
    this.edited = false,
    this.status,
    this.rejectReasonLabel,
    this.moderationNote,
    this.restaurantName,
  });

  final int id;
  final int restaurantId;
  final int authorId;
  final String authorName;
  final int rating;
  final String comment;

  /// Dạng YYYY-MM-DD.
  final String visitDate;
  final int? foodId;
  final String? foodName;
  final int? amountSpent;
  final List<ReviewImage> images;
  final DateTime? createdAt;
  final bool edited;

  /// Chỉ có với review của chính mình.
  final ReviewStatus? status;
  final String? rejectReasonLabel;
  final String? moderationNote;
  final String? restaurantName;

  static Review fromJson(Map json) {
    final author = readMap(json['author']);
    final food = json['food'] is Map ? json['food'] as Map : null;
    final restaurant = json['restaurant'] is Map ? json['restaurant'] as Map : null;
    return Review(
      id: readInt(json['id']),
      restaurantId: readInt(json['restaurantId'] ?? restaurant?['id']),
      authorId: readInt(author['id']),
      authorName: '${author['displayName'] ?? 'Ẩn danh'}',
      rating: readInt(json['rating'], 5).clamp(1, 5),
      comment: '${json['comment'] ?? ''}',
      visitDate: '${json['visitDate'] ?? ''}',
      foodId: food == null ? null : readInt(food['id']),
      foodName: food == null ? null : readString(food['name']),
      amountSpent: readIntOrNull(json['amountSpent']),
      images: readMaps(json['images']).map(ReviewImage.fromJson).toList(),
      createdAt: readDate(json['createdAt']),
      edited: json['edited'] == true,
      status: ReviewStatus.values.asNameMap()[json['status']],
      rejectReasonLabel: readString(json['rejectReasonLabel']),
      moderationNote: readString(json['moderationNote']),
      restaurantName: restaurant == null ? null : readString(restaurant['name']),
    );
  }
}

/// Lý do báo cáo review (FR-R07).
enum ReportReason {
  offensive('Nội dung xúc phạm'),
  spam('Spam hoặc quảng cáo'),
  misleading('Thông tin sai lệch'),
  inappropriateImage('Hình ảnh không phù hợp'),
  other('Lý do khác');

  const ReportReason(this.label);

  final String label;

  String get apiName => this == inappropriateImage ? 'inappropriate_image' : name;
}

/// Danh sách review của quán kèm review của chính người dùng (nếu đăng nhập).
class ReviewPage {
  const ReviewPage({required this.page, this.myReview});

  final PageResult<Review> page;
  final Review? myReview;
}
