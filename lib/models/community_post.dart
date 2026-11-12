import 'json_read.dart';
import 'review.dart';

class CommunityPost {
  CommunityPost.fromJson(Map json)
      : id = readInt(json['id']),
        authorId = readInt(readMap(json['author'])['id']),
        authorName = '${readMap(json['author'])['displayName'] ?? ''}',
        content = '${json['content'] ?? ''}',
        status = '${json['status'] ?? ''}',
        moderationNote = readString(json['moderationNote']),
        createdAt = readDate(json['createdAt']),
        likes = readInt(json['likes']),
        comments = readInt(json['comments']),
        liked = json['liked'] == true,
        food = json['food'] is Map ? json['food'] as Map : null,
        restaurant = json['restaurant'] is Map ? json['restaurant'] as Map : null,
        images = [for (final v in (json['images'] as List? ?? [])) if (v is Map) ReviewImage.fromJson(v)];
  final int id, authorId, likes, comments;
  final String authorName, content, status;
  final String? moderationNote;
  final DateTime? createdAt;
  final bool liked;
  final Map? food, restaurant;
  final List<ReviewImage> images;
}
