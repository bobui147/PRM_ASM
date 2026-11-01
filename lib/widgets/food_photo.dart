import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';

/// Ảnh món ăn: cắt một ô từ atlas 3 × 2, hoặc icon nhóm món với món tự tạo.
class FoodPhoto extends StatelessWidget {
  const FoodPhoto({super.key, required this.food});

  final FoodItem food;

  @override
  Widget build(BuildContext context) {
    if (food.isCustom) {
      return DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.deepGold, AppColors.card],
          ),
        ),
        child: Center(
          child: Icon(
            food.category.icon,
            size: 34,
            color: AppColors.gold,
            semanticLabel: food.name,
          ),
        ),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final height = constraints.maxHeight;
        final cellSide = math.max(width, height);
        final column = food.imageCell % 3;
        final row = food.imageCell ~/ 3;
        return Stack(
          clipBehavior: Clip.hardEdge,
          children: [
            Positioned(
              left: width / 2 - (column + 0.5) * cellSide,
              top: height / 2 - (row + 0.5) * cellSide,
              width: cellSide * 3,
              height: cellSide * 2,
              child: Image.asset(
                food.imageAsset,
                fit: BoxFit.fill,
                filterQuality: FilterQuality.medium,
                semanticLabel: food.name,
              ),
            ),
          ],
        );
      },
    );
  }
}
