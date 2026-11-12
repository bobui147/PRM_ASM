import '../models/community.dart';
import '../models/json_read.dart';
import '../models/review.dart';
import 'api_client.dart';

/// Dữ liệu gửi lên khi đăng hoặc sửa bài (FR-C01).
class PostInput {
  const PostInput({
    this.content,
    this.foodId,
    this.restaurantId,
    this.keepImageIds = const [],
    this.newImages = const [],
  });

  final String? content;
  final int? foodId;
  final int? restaurantId;
  final List<int> keepImageIds;
  final List<UploadFile> newImages;
}

/// Kết quả thích/bỏ thích hoặc theo dõi.
typedef ToggleResult = ({bool active, int count});

/// Gọi API cộng đồng ẩm thực (requirements-mo-rong.md P1).
class CommunityRepository {
  CommunityRepository(this._api);

  final ApiClient _api;

  /// [filter]: `latest` hoặc `following` (cần đăng nhập).
  Future<PageResult<Post>> feed({String filter = 'latest', int page = 1, int limit = 20}) async {
    final response = await _api.get('/posts', query: {'filter': filter, 'page': page, 'limit': limit});
    return PageResult.fromJson(response.json, Post.fromJson);
  }

  Future<Post> post(int id) async => Post.fromJson((await _api.get('/posts/$id')).json);

  Future<PageResult<Post>> myPosts({int page = 1}) async {
    final response = await _api.get('/me/posts', query: {'page': page, 'limit': 20});
    return PageResult.fromJson(response.json, Post.fromJson);
  }

  Future<PageResult<Post>> userPosts(int userId, {int page = 1}) async {
    final response = await _api.get('/users/$userId/posts', query: {'page': page, 'limit': 20});
    return PageResult.fromJson(response.json, Post.fromJson);
  }

  Future<PublicProfile> profile(int userId) async =>
      PublicProfile.fromJson((await _api.get('/users/$userId')).json);

  Map<String, Object?> _fields(PostInput input) => {
        'content': input.content ?? '',
        'foodId': input.foodId ?? '',
        'restaurantId': input.restaurantId ?? '',
      };

  Future<Post> createPost(PostInput input) async {
    final response = await _api.multipart('POST', '/posts', fields: _fields(input), files: input.newImages);
    return Post.fromJson(response.json);
  }

  Future<Post> updatePost(int id, PostInput input) async {
    final response = await _api.multipart(
      'PUT',
      '/posts/$id',
      fields: _fields(input),
      listFields: {'keepImageIds': input.keepImageIds},
      files: input.newImages,
    );
    return Post.fromJson(response.json);
  }

  Future<void> deletePost(int id) => _api.delete('/posts/$id');

  Future<ToggleResult> setLike(int postId, bool like) async {
    final path = '/posts/$postId/like';
    final json = (like ? await _api.post(path) : await _api.delete(path)).json;
    return (active: json['liked'] == true, count: readInt(json['likeCount']));
  }

  Future<ToggleResult> setFollow(int userId, bool follow) async {
    final path = '/users/$userId/follow';
    final json = (follow ? await _api.post(path) : await _api.delete(path)).json;
    return (active: json['following'] == true, count: readInt(json['followerCount']));
  }

  Future<PageResult<PostComment>> comments(int postId, {int page = 1}) async {
    final response = await _api.get('/posts/$postId/comments', query: {'page': page, 'limit': 30});
    return PageResult.fromJson(response.json, PostComment.fromJson);
  }

  Future<PostComment> addComment(int postId, String content) async {
    final response = await _api.post('/posts/$postId/comments', {'content': content});
    return PostComment.fromJson(response.json);
  }

  Future<void> deleteComment(int id) => _api.delete('/comments/$id');

  Future<void> reportPost(int id, ReportReason reason, String? details) =>
      _api.post('/posts/$id/reports', _report(reason, details));

  Future<void> reportComment(int id, ReportReason reason, String? details) =>
      _api.post('/comments/$id/reports', _report(reason, details));

  Map<String, Object?> _report(ReportReason reason, String? details) => {
        'reason': reason.apiName,
        if (details != null && details.trim().isNotEmpty) 'details': details.trim(),
      };
}
