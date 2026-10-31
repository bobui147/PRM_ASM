import 'dart:math' as math;

import 'package:flutter/material.dart';

enum MealPeriod {
  lateNight('Ăn đêm'),
  breakfast('Ăn sáng'),
  lunch('Ăn trưa'),
  dinner('Ăn tối');

  const MealPeriod(this.label);

  final String label;

  MealPeriod get next =>
      MealPeriod.values[(index + 1) % MealPeriod.values.length];
}

enum FoodCategory {
  lunch('Món chính', Icons.restaurant),
  drink('Đồ uống', Icons.local_cafe),
  snack('Ăn vặt', Icons.fastfood),
  drinking('Món nhậu', Icons.sports_bar);

  const FoodCategory(this.label, this.icon);

  final String label;
  final IconData icon;
}

enum FoodRarity {
  common('Thường', Color(0xFFA9A39A)),
  rare('Hiếm', Color(0xFF71A69A)),
  epic('Sử thi', Color(0xFFA98CB8)),
  legendary('Huyền thoại', Color(0xFFD55D68)),
  ancient('Cổ vật', Color(0xFFD6B552));

  const FoodRarity(this.label, this.color);

  final String label;
  final Color color;
}

enum FoodBudget {
  fifty('50.000đ', 50000),
  hundred('100.000đ', 100000),
  hundredFifty('150.000đ', 150000),
  unlimited('Không giới hạn', null);

  const FoodBudget(this.label, this.targetPrice);

  final String label;
  final int? targetPrice;
}

class FoodItem {
  const FoodItem({
    required this.id,
    required this.name,
    required this.category,
    required this.price,
    required this.rarity,
    required this.imageIndex,
    this.mealPeriods = const {MealPeriod.lunch, MealPeriod.dinner},
  });

  final String id;
  final String name;
  final FoodCategory category;
  final int price;
  final FoodRarity rarity;
  final int imageIndex;
  final Set<MealPeriod> mealPeriods;

  int get imageCell => imageIndex % 6;

  String get imageAsset {
    final sheet = imageIndex ~/ 6 + 1;
    final suffix = sheet == 1 ? '' : '-$sheet';
    return switch (category) {
      FoodCategory.lunch => 'assets/images/foods-lunch$suffix.png',
      FoodCategory.drink => 'assets/images/foods-drinks$suffix.png',
      FoodCategory.snack => 'assets/images/foods-snacks$suffix.png',
      FoodCategory.drinking => 'assets/images/foods-drinking$suffix.png',
    };
  }
}

List<FoodItem> filterFoods(
  Iterable<FoodItem> foods,
  FoodCategory category,
  MealPeriod mealPeriod,
) {
  return foods
      .where(
        (food) =>
            food.category == category &&
            (category != FoodCategory.lunch ||
                food.mealPeriods.contains(mealPeriod)),
      )
      .toList(growable: false);
}

int budgetWeight(FoodItem food, FoodBudget budget) {
  final target = budget.targetPrice;
  if (target == null) {
    return 1;
  }

  final difference = (food.price - target).abs();
  if (difference <= target * 0.25) {
    return 6;
  }
  if (difference <= target * 0.75) {
    return 3;
  }
  return 1;
}

FoodItem pickFood(
  List<FoodItem> foods,
  FoodBudget budget,
  math.Random random,
) {
  if (foods.isEmpty) {
    throw ArgumentError.value(foods, 'foods', 'must not be empty');
  }

  final totalWeight = foods.fold<int>(
    0,
    (total, food) => total + budgetWeight(food, budget),
  );
  var roll = random.nextInt(totalWeight);
  for (final food in foods) {
    roll -= budgetWeight(food, budget);
    if (roll < 0) {
      return food;
    }
  }
  return foods.last;
}

String formatPrice(int price) => '${price ~/ 1000}.000đ';
