import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import '../models/review.dart';
import 'common.dart';
import 'food_photo.dart';
import 'image_viewer.dart';

/// Một review: tác giả, sao, nội dung, ảnh, menu Sửa/Xóa/Báo cáo (FR-M09).
class ReviewTile extends StatelessWidget {
  const ReviewTile({
    super.key,
    required this.review,
    this.onReport,
    this.onEdit,
    this.onDelete,
    this.mine = false,
  });

  final Review review;
  final VoidCallback? onReport;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final r = review;
    final meta = [
      if (r.foodName != null) 'Món: ${r.foodName}',
      if (r.amountSpent != null) 'Chi phí ${formatPrice(r.amountSpent!)}',
      if (r.visitDate.isNotEmpty) 'Ghé ngày ${vnDate(r.visitDate)}',
    ].join(' · ');
    final hasMenu = onReport != null || onEdit != null || onDelete != null;
    return Container(
      key: ValueKey('review-${r.id}'),
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: mine ? AppColors.surface : AppColors.card,
        border: Border.all(color: mine ? AppColors.gold : AppColors.hairline),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              InitialAvatar(name: r.authorName),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(mine ? 'Review của bạn' : r.authorName,
                        style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w700)),
                    Row(children: [
                      StarRow(rating: r.rating, size: 14),
                      if (r.edited) ...[
                        const SizedBox(width: 6),
                        const Text('Đã chỉnh sửa', style: TextStyle(color: AppColors.mutedText, fontSize: 11)),
                      ],
                    ]),
                  ],
                ),
              ),
              if (hasMenu)
                PopupMenuButton<String>(
                  key: ValueKey('review-menu-${r.id}'),
                  tooltip: 'Tùy chọn',
                  iconColor: AppColors.mutedText,
                  onSelected: (value) {
                    if (value == 'report') onReport?.call();
                    if (value == 'edit') onEdit?.call();
                    if (value == 'delete') onDelete?.call();
                  },
                  itemBuilder: (_) => [
                    if (onEdit != null) const PopupMenuItem(value: 'edit', child: Text('Sửa')),
                    if (onDelete != null) const PopupMenuItem(value: 'delete', child: Text('Xóa')),
                    if (onReport != null) const PopupMenuItem(value: 'report', child: Text('Báo cáo')),
                  ],
                ),
            ],
          ),
          if (r.status != null && r.status != ReviewStatus.published) ...[
            const SizedBox(height: 8),
            ReviewStatusBanner(review: r),
          ],
          const SizedBox(height: 8),
          Text(r.comment, style: const TextStyle(color: AppColors.text, height: 1.35)),
          if (meta.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(meta, style: const TextStyle(color: AppColors.mutedText, fontSize: 12)),
          ],
          if (r.images.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: [
              for (final (index, image) in r.images.indexed)
                InkWell(
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    fullscreenDialog: true,
                    builder: (_) => ImageViewerPage(images: r.images, initial: index),
                  )),
                  child: SizedBox(
                    width: 72,
                    height: 72,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: NetPhoto(
                        url: image.thumbUrl,
                        semanticLabel: 'Ảnh review ${index + 1}, chạm để xem lớn',
                        fallback: const IconPlaceholder(icon: Icons.image_outlined),
                      ),
                    ),
                  ),
                ),
            ]),
          ],
        ],
      ),
    );
  }
}

/// "2026-11-05" → "05/11/2026".
String vnDate(String iso) {
  final parts = iso.split('-');
  return parts.length == 3 ? '${parts[2]}/${parts[1]}/${parts[0]}' : iso;
}

/// Trạng thái review của chính mình, thể hiện bằng chữ (không chỉ bằng màu).
class ReviewStatusBanner extends StatelessWidget {
  const ReviewStatusBanner({super.key, required this.review});

  final Review review;

  @override
  Widget build(BuildContext context) {
    final status = review.status!;
    final color = switch (status) {
      ReviewStatus.pending => const Color(0xFFE0B04F),
      ReviewStatus.rejected => const Color(0xFFD55D68),
      _ => AppColors.mutedText,
    };
    final reason = [review.rejectReasonLabel, review.moderationNote].whereType<String>().join(' · ');
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(border: Border.all(color: color), borderRadius: BorderRadius.circular(4)),
      child: Text(
        reason.isEmpty ? status.label : '${status.label}: $reason',
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }
}
