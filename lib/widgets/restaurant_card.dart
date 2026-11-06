import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import '../models/restaurant.dart';
import '../services/maps_launcher.dart';
import 'common.dart';
import 'food_photo.dart';

/// Thẻ quán: ảnh bìa, tên, khu vực, giá, điểm, món nổi bật,
/// nút Xem review và Google Maps (FR-M07).
class RestaurantCard extends StatelessWidget {
  const RestaurantCard({super.key, required this.restaurant, required this.onOpen, this.compact = false});

  final Restaurant restaurant;
  final VoidCallback onOpen;
  final bool compact;

  Future<void> _openMaps(BuildContext context) async {
    final opened = await openRestaurantMaps(name: restaurant.name, mapsUrl: restaurant.googleMapsUrl);
    if (!opened && context.mounted) showSnack(context, 'Không thể mở Google Maps.');
  }

  @override
  Widget build(BuildContext context) {
    final r = restaurant;
    final price = r.foodPrice != null
        ? 'Món này ${formatPrice(r.foodPrice!)}'
        : '${formatPrice(r.priceMin)} – ${formatPrice(r.priceMax)}';
    return Card(
      key: ValueKey('restaurant-${r.id}'),
      color: AppColors.card,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.hairline),
        borderRadius: BorderRadius.circular(4),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: compact ? 56 : 72,
                    height: compact ? 56 : 72,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: NetPhoto(
                        url: r.coverThumbUrl ?? r.coverUrl,
                        semanticLabel: 'Ảnh quán ${r.name}',
                        fallback: const IconPlaceholder(icon: Icons.storefront),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          r.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${r.areaLabel} · $price',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: AppColors.mutedText, fontSize: 12),
                        ),
                        const SizedBox(height: 4),
                        RatingLabel(average: r.ratingAvg, count: r.reviewCount),
                        if (r.featuredFoods.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            'Nổi bật: ${r.featuredFoods.map((f) => f.name).join(', ')}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: AppColors.warmText, fontSize: 12),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      key: ValueKey('restaurant-open-${r.id}'),
                      onPressed: onOpen,
                      icon: const Icon(Icons.rate_review_outlined, size: 18),
                      label: const Text('Xem review'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _openMaps(context),
                      icon: const Icon(Icons.map_outlined, size: 18),
                      label: const Text('Google Maps'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Khung xám khi đang tải danh sách quán.
class RestaurantSkeleton extends StatelessWidget {
  const RestaurantSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 120,
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.hairline),
        borderRadius: BorderRadius.circular(4),
      ),
    );
  }
}
