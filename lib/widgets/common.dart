import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../services/api_client.dart';

/// Thông báo lỗi từ ApiException hoặc lỗi bất kỳ.
String errorText(Object error) =>
    error is ApiException ? error.message : 'Đã có lỗi xảy ra, vui lòng thử lại.';

void showSnack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// Khối lỗi kèm nút Thử lại.
class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.message, required this.onRetry, this.compact = false});

  final String message;
  final VoidCallback onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.all(compact ? 12 : 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.wifi_off, color: AppColors.mutedText, size: compact ? 28 : 40),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.mutedText)),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            key: const Key('retry-button'),
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Thử lại'),
          ),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.icon = Icons.inbox_outlined, this.action});

  final String message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: AppColors.gold, size: 36),
          const SizedBox(height: 10),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.mutedText)),
          if (action != null) ...[const SizedBox(height: 12), action!],
        ],
      ),
    );
  }
}

/// Hàng sao chỉ đọc.
class StarRow extends StatelessWidget {
  const StarRow({super.key, required this.rating, this.size = 16});

  final num rating;
  final double size;

  @override
  Widget build(BuildContext context) {
    final full = rating.round();
    return Semantics(
      label: '$rating trên 5 sao',
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 1; i <= 5; i++)
              Icon(i <= full ? Icons.star : Icons.star_border, size: size, color: AppColors.gold),
          ],
        ),
      ),
    );
  }
}

/// "4.5 ★ (12)" hoặc "Chưa có đánh giá".
class RatingLabel extends StatelessWidget {
  const RatingLabel({super.key, required this.average, required this.count});

  final double? average;
  final int count;

  @override
  Widget build(BuildContext context) {
    if (average == null || count == 0) {
      return const Text('Chưa có đánh giá', style: TextStyle(color: AppColors.mutedText, fontSize: 12));
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.star, size: 15, color: AppColors.gold),
        const SizedBox(width: 3),
        Text(
          '${average!.toStringAsFixed(1)} · $count review',
          style: const TextStyle(color: AppColors.warmText, fontSize: 12, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

/// Avatar chữ cái đầu của tên.
class InitialAvatar extends StatelessWidget {
  const InitialAvatar({super.key, required this.name, this.radius = 18});

  final String name;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final trimmed = name.trim();
    return CircleAvatar(
      radius: radius,
      backgroundColor: AppColors.deepGold,
      child: Text(
        trimmed.isEmpty ? '?' : trimmed[0].toUpperCase(),
        style: const TextStyle(color: AppColors.warmText, fontWeight: FontWeight.w700),
      ),
    );
  }
}
