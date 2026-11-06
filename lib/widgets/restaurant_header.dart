import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import '../models/restaurant.dart';
import '../services/maps_launcher.dart';
import 'common.dart';
import 'food_photo.dart';

/// Phần đầu trang chi tiết quán: ảnh bìa, thông tin, thực đơn, phân bố sao.
class RestaurantHeader extends StatelessWidget {
  const RestaurantHeader({super.key, required this.restaurant});

  final Restaurant restaurant;

  Future<void> _maps(BuildContext context) async {
    final ok = await openRestaurantMaps(name: restaurant.name, mapsUrl: restaurant.googleMapsUrl);
    if (!ok && context.mounted) showSnack(context, 'Không thể mở Google Maps.');
  }

  Future<void> _call(BuildContext context, String phone) async {
    final ok = await callPhone(phone);
    if (!ok && context.mounted) showSnack(context, 'Không thể gọi điện trên thiết bị này.');
  }

  @override
  Widget build(BuildContext context) {
    final r = restaurant;
    const muted = TextStyle(color: AppColors.mutedText, fontSize: 13);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AspectRatio(
          aspectRatio: 16 / 9,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: NetPhoto(
              url: r.coverUrl ?? r.coverThumbUrl,
              semanticLabel: 'Ảnh quán ${r.name}',
              fallback: const IconPlaceholder(icon: Icons.storefront),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(r.name,
            style: const TextStyle(
                color: AppColors.warmText, fontSize: 22, fontWeight: FontWeight.w700, fontFamily: 'serif')),
        const SizedBox(height: 4),
        RatingLabel(average: r.ratingAvg, count: r.reviewCount),
        const SizedBox(height: 8),
        Text('${r.areaLabel} · ${r.address}', style: muted),
        Text('Giá ${formatPrice(r.priceMin)} – ${formatPrice(r.priceMax)} / người', style: muted),
        if (r.openingHours != null) Text('Mở cửa ${r.openingHours}', style: muted),
        if (r.tags.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final tag in r.tags) Chip(label: Text(tagLabels[tag] ?? tag), visualDensity: VisualDensity.compact),
          ]),
        ],
        if (r.description != null) ...[
          const SizedBox(height: 8),
          Text(r.description!, style: const TextStyle(color: AppColors.text)),
        ],
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              key: const Key('detail-maps'),
              onPressed: () => _maps(context),
              icon: const Icon(Icons.map_outlined),
              label: const Text('Mở Google Maps'),
            ),
          ),
          if (r.phone != null) ...[
            const SizedBox(width: 8),
            IconButton.outlined(
              tooltip: 'Gọi ${r.phone}',
              onPressed: () => _call(context, r.phone!),
              icon: const Icon(Icons.call_outlined),
            ),
          ],
        ]),
        if (r.menu.isNotEmpty) ...[
          const SizedBox(height: 20),
          const Text('THỰC ĐƠN', style: TextStyle(color: AppColors.warmText, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          for (final item in r.menu)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(children: [
                if (item.featured) const Icon(Icons.local_fire_department, size: 16, color: AppColors.gold),
                if (item.featured) const SizedBox(width: 4),
                Expanded(child: Text(item.name, style: const TextStyle(color: AppColors.text))),
                Text(formatPrice(item.price), style: const TextStyle(color: AppColors.warmText)),
              ]),
            ),
        ],
        if (r.reviewCount > 0) ...[
          const SizedBox(height: 20),
          _Distribution(distribution: r.ratingDistribution, total: r.reviewCount),
        ],
      ],
    );
  }
}

class _Distribution extends StatelessWidget {
  const _Distribution({required this.distribution, required this.total});

  final Map<int, int> distribution;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      for (var star = 5; star >= 1; star--)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(children: [
            SizedBox(width: 28, child: Text('$star★', style: const TextStyle(color: AppColors.mutedText))),
            Expanded(
              child: LinearProgressIndicator(
                value: total == 0 ? 0 : (distribution[star] ?? 0) / total,
                minHeight: 6,
                color: AppColors.gold,
                backgroundColor: AppColors.chrome,
                semanticsLabel: '$star sao',
                semanticsValue: '${distribution[star] ?? 0} review',
              ),
            ),
            SizedBox(
              width: 32,
              child: Text('${distribution[star] ?? 0}',
                  textAlign: TextAlign.end, style: const TextStyle(color: AppColors.mutedText)),
            ),
          ]),
        ),
    ]);
  }
}
