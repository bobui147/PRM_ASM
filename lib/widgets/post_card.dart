import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/community.dart';
import '../models/food_item.dart';
import '../pages/auth_pages.dart';
import '../pages/restaurant_detail_page.dart';
import '../services/api_client.dart';
import '../services/app_services.dart';
import 'common.dart';
import 'food_photo.dart';
import 'image_viewer.dart';

/// Thẻ bài cộng đồng: tác giả, nội dung, ảnh, món/quán, thích, bình luận (FR-C01, FR-C02).
/// Nội dung luôn hiển thị bằng Text (không render HTML).
class PostCard extends StatefulWidget {
  const PostCard({
    super.key,
    required this.post,
    required this.services,
    required this.onChanged,
    this.onOpen,
    this.onOpenAuthor,
    this.expanded = false,
  });

  final Post post;
  final AppServices services;
  final ValueChanged<Post> onChanged;
  final VoidCallback? onOpen;
  final VoidCallback? onOpenAuthor;

  /// Trang chi tiết: không cắt nội dung, ảnh lớn hơn.
  final bool expanded;

  @override
  State<PostCard> createState() => _PostCardState();
}

class _PostCardState extends State<PostCard> {
  bool _liking = false;

  Future<void> _toggleLike() async {
    if (_liking) return;
    if (!await ensureSignedIn(context, widget.services) || !mounted) return;
    final post = widget.post;
    final like = !post.likedByMe;
    // Cập nhật lạc quan, hoàn tác nếu lỗi.
    widget.onChanged(post.copyWith(likedByMe: like, likeCount: post.likeCount + (like ? 1 : -1)));
    setState(() => _liking = true);
    try {
      final result = await widget.services.community.setLike(post.id, like);
      widget.onChanged(post.copyWith(likedByMe: result.active, likeCount: result.count));
    } on ApiException catch (error) {
      widget.onChanged(post);
      if (mounted) showSnack(context, error.message);
    } finally {
      if (mounted) setState(() => _liking = false);
    }
  }

  void _openFood(PostLink food) {
    final item = food.id == null ? null : widget.services.library.foodById('${food.id}');
    if (item == null) {
      showSnack(context, 'Món "${food.name}" không còn trong danh mục.');
      return;
    }
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(
            height: 160,
            width: double.infinity,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: NetPhoto(url: item.imageUrl, fallback: const IconPlaceholder(icon: Icons.restaurant)),
            ),
          ),
          const SizedBox(height: 12),
          Text(item.name, style: const TextStyle(color: AppColors.warmText, fontSize: 18)),
          Text('${item.category.name} · ${formatPrice(item.price)}', style: const TextStyle(color: AppColors.mutedText)),
          if (item.description != null) ...[
            const SizedBox(height: 8),
            Text(item.description!, style: const TextStyle(color: AppColors.text)),
          ],
        ]),
      ),
    );
  }

  void _openRestaurant(PostLink restaurant) {
    final id = restaurant.id;
    if (id == null) {
      showSnack(context, 'Quán "${restaurant.name}" không còn hoạt động.');
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => RestaurantDetailPage(restaurantId: id, services: widget.services),
    ));
  }

  Widget _link(IconData icon, PostLink link, VoidCallback onTap) => ActionChip(
        avatar: Icon(icon, size: 16, color: link.id == null ? AppColors.mutedText : AppColors.gold),
        label: Text(link.name, overflow: TextOverflow.ellipsis),
        onPressed: onTap,
        visualDensity: VisualDensity.compact,
      );

  Widget _images(Post post) {
    final size = widget.expanded ? 140.0 : 96.0;
    return SizedBox(
      height: size,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: post.images.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (context, index) => GestureDetector(
          onTap: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => ImageViewerPage(images: post.images, initial: index),
          )),
          child: SizedBox(
            width: size,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: NetPhoto(
                url: post.images[index].thumbUrl,
                semanticLabel: 'Ảnh ${index + 1} của bài viết',
                fallback: const IconPlaceholder(icon: Icons.image),
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final post = widget.post;
    return Card(
      color: AppColors.card,
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: InkWell(
        onTap: widget.onOpen,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            InkWell(
              onTap: widget.onOpenAuthor,
              child: Row(children: [
                InitialAvatar(name: post.author.displayName),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(post.author.displayName,
                        style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w700)),
                    Text(
                      '${relativeTime(post.createdAt)}${post.edited ? ' · đã sửa' : ''}',
                      style: const TextStyle(color: AppColors.mutedText, fontSize: 12),
                    ),
                  ]),
                ),
              ]),
            ),
            if (post.hidden)
              Container(
                key: const Key('post-hidden-badge'),
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.orangeAccent),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  'Bài đã bị quản trị viên ẩn, người khác không thấy bài này.'
                  '${post.moderationNote == null ? '' : ' Ghi chú: ${post.moderationNote}'}',
                  style: const TextStyle(color: Colors.orangeAccent, fontSize: 12),
                ),
              ),
            if (post.content != null) ...[
              const SizedBox(height: 8),
              Text(
                post.content!,
                maxLines: widget.expanded ? null : 6,
                overflow: widget.expanded ? null : TextOverflow.ellipsis,
                style: const TextStyle(color: AppColors.text, height: 1.35),
              ),
            ],
            if (post.images.isNotEmpty) ...[const SizedBox(height: 8), _images(post)],
            if (post.food != null || post.restaurant != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Wrap(spacing: 6, runSpacing: 4, children: [
                  if (post.food != null) _link(Icons.restaurant_menu, post.food!, () => _openFood(post.food!)),
                  if (post.restaurant != null)
                    _link(Icons.storefront, post.restaurant!, () => _openRestaurant(post.restaurant!)),
                ]),
              ),
            Row(children: [
              TextButton.icon(
                key: ValueKey('like-${post.id}'),
                onPressed: post.hidden ? null : _toggleLike,
                icon: Icon(post.likedByMe ? Icons.favorite : Icons.favorite_border,
                    color: post.likedByMe ? Colors.redAccent : AppColors.mutedText, size: 20),
                label: Text('${post.likeCount}', style: const TextStyle(color: AppColors.text)),
              ),
              TextButton.icon(
                onPressed: widget.onOpen,
                icon: const Icon(Icons.mode_comment_outlined, color: AppColors.mutedText, size: 20),
                label: Text('${post.commentCount}', style: const TextStyle(color: AppColors.text)),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}
