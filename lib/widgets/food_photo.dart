import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';

/// Ảnh tải từ server, có cache trên đĩa. Không có URL hoặc tải lỗi thì hiện [fallback].
class NetPhoto extends StatelessWidget {
  const NetPhoto({
    super.key,
    required this.url,
    required this.fallback,
    this.semanticLabel,
    this.fit = BoxFit.cover,
  });

  final String? url;
  final Widget fallback;
  final String? semanticLabel;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final src = url;
    if (src == null || src.isEmpty) return fallback;
    return Semantics(
      label: semanticLabel,
      image: semanticLabel != null,
      child: CachedNetworkImage(
        imageUrl: src,
        fit: fit,
        width: double.infinity,
        height: double.infinity,
        fadeInDuration: const Duration(milliseconds: 150),
        placeholder: (_, __) => const ColoredBox(color: AppColors.card),
        errorWidget: (_, __, ___) => fallback,
      ),
    );
  }
}

/// Khối icon trên nền gradient, dùng khi chưa có ảnh.
class IconPlaceholder extends StatelessWidget {
  const IconPlaceholder({super.key, required this.icon, this.color, this.label});

  final IconData icon;
  final Color? color;
  final String? label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [(color ?? AppColors.deepGold).withAlpha(120), AppColors.card],
        ),
      ),
      child: Center(
        child: Icon(icon, size: 34, color: AppColors.gold, semanticLabel: label),
      ),
    );
  }
}

/// Ảnh món: thumbnail ở dải quay/lưới, ảnh lớn ở hộp kết quả (FR-M05).
class FoodPhoto extends StatelessWidget {
  const FoodPhoto({super.key, required this.food, this.large = false});

  final FoodItem food;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return NetPhoto(
      url: large ? (food.imageUrl ?? food.thumbUrl) : (food.thumbUrl ?? food.imageUrl),
      semanticLabel: food.name,
      fallback: IconPlaceholder(
        icon: food.category.icon,
        color: food.rarity.color,
        label: food.name,
      ),
    );
  }
}
