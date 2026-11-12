import 'json_read.dart';
import 'review.dart';

/// Dữ liệu cộng đồng ẩm thực (requirements-mo-rong.md P1).

/// Món hoặc quán gắn vào bài. [id] null khi món/quán không còn công khai:
/// vẫn hiện tên nhưng không mở được.
class PostLink {
  const PostLink({required this.name, this.id});

  final int? id;
  final String name;

  static PostLink? fromJson(Object? json) {
    if (json is! Map) return null;
    final name = readString(json['name']);
    return name == null ? null : PostLink(id: readIntOrNull(json['id']), name: name);
  }
}

class PostAuthor {
  const PostAuthor({required this.id, required this.displayName});

  final int id;
  final String displayName;

  static PostAuthor fromJson(Object? json) {
    final map = readMap(json);
    return PostAuthor(id: readInt(map['id']), displayName: readString(map['displayName']) ?? 'Ẩn danh');
  }
}

class Post {
  const Post({
    required this.id,
    required this.author,
    this.content,
    this.food,
    this.restaurant,
    this.images = const [],
    this.likeCount = 0,
    this.commentCount = 0,
    this.likedByMe = false,
    this.createdAt,
    this.edited = false,
    this.isMine = false,
    this.hidden = false,
    this.moderationNote,
  });

  final int id;
  final PostAuthor author;
  final String? content;
  final PostLink? food;
  final PostLink? restaurant;

  /// Cùng định dạng ảnh với review nên dùng lại [ReviewImage] và trình xem ảnh.
  final List<ReviewImage> images;
  final int likeCount;
  final int commentCount;
  final bool likedByMe;
  final DateTime? createdAt;
  final bool edited;
  final bool isMine;

  /// Chỉ tác giả thấy: bài đã bị quản trị viên ẩn.
  final bool hidden;
  final String? moderationNote;

  Post copyWith({bool? likedByMe, int? likeCount, int? commentCount}) => Post(
        id: id,
        author: author,
        content: content,
        food: food,
        restaurant: restaurant,
        images: images,
        likeCount: likeCount ?? this.likeCount,
        commentCount: commentCount ?? this.commentCount,
        likedByMe: likedByMe ?? this.likedByMe,
        createdAt: createdAt,
        edited: edited,
        isMine: isMine,
        hidden: hidden,
        moderationNote: moderationNote,
      );

  static Post fromJson(Map json) => Post(
        id: readInt(json['id']),
        author: PostAuthor.fromJson(json['author']),
        content: readString(json['content']),
        food: PostLink.fromJson(json['food']),
        restaurant: PostLink.fromJson(json['restaurant']),
        images: readMaps(json['images']).map(ReviewImage.fromJson).toList(growable: false),
        likeCount: readInt(json['likeCount']),
        commentCount: readInt(json['commentCount']),
        likedByMe: json['likedByMe'] == true,
        createdAt: readDate(json['createdAt']),
        edited: json['edited'] == true,
        isMine: json['isMine'] == true,
        hidden: json['status'] == 'hidden',
        moderationNote: readString(json['moderationNote']),
      );
}

class PostComment {
  const PostComment({
    required this.id,
    required this.postId,
    required this.author,
    required this.content,
    this.createdAt,
    this.isMine = false,
  });

  final int id;
  final int postId;
  final PostAuthor author;
  final String content;
  final DateTime? createdAt;
  final bool isMine;

  static PostComment fromJson(Map json) => PostComment(
        id: readInt(json['id']),
        postId: readInt(json['postId']),
        author: PostAuthor.fromJson(json['author']),
        content: '${json['content'] ?? ''}',
        createdAt: readDate(json['createdAt']),
        isMine: json['isMine'] == true,
      );
}

/// Hồ sơ công khai: không có email (FR-C02).
class PublicProfile {
  const PublicProfile({
    required this.id,
    required this.displayName,
    this.followerCount = 0,
    this.followingCount = 0,
    this.postCount = 0,
    this.isFollowing = false,
    this.isMe = false,
  });

  final int id;
  final String displayName;
  final int followerCount;
  final int followingCount;
  final int postCount;
  final bool isFollowing;
  final bool isMe;

  PublicProfile copyWith({bool? isFollowing, int? followerCount}) => PublicProfile(
        id: id,
        displayName: displayName,
        followerCount: followerCount ?? this.followerCount,
        followingCount: followingCount,
        postCount: postCount,
        isFollowing: isFollowing ?? this.isFollowing,
        isMe: isMe,
      );

  static PublicProfile fromJson(Map json) => PublicProfile(
        id: readInt(json['id']),
        displayName: readString(json['displayName']) ?? 'Ẩn danh',
        followerCount: readInt(json['followerCount']),
        followingCount: readInt(json['followingCount']),
        postCount: readInt(json['postCount']),
        isFollowing: json['isFollowing'] == true,
        isMe: json['isMe'] == true,
      );
}

/// "vừa xong", "5 phút trước", "3 giờ trước", "12/11/2026".
String relativeTime(DateTime? time, {DateTime? now}) {
  if (time == null) return '';
  final diff = (now ?? DateTime.now()).difference(time);
  if (diff.inMinutes < 1) return 'vừa xong';
  if (diff.inHours < 1) return '${diff.inMinutes} phút trước';
  if (diff.inDays < 1) return '${diff.inHours} giờ trước';
  if (diff.inDays < 7) return '${diff.inDays} ngày trước';
  return '${time.day.toString().padLeft(2, '0')}/${time.month.toString().padLeft(2, '0')}/${time.year}';
}
