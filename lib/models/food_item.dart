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
    this.isCustom = false,
  });

  final String id;
  final String name;
  final FoodCategory category;
  final int price;
  final FoodRarity rarity;
  final int imageIndex;
  final Set<MealPeriod> mealPeriods;

  /// Món do người dùng tự thêm; không có ảnh trong atlas.
  final bool isCustom;

  int get imageCell => imageIndex % 6;

  Map<String, Object?> toJson() => {
        'id': id,
        'name': name,
        'category': category.name,
        'price': price,
        'rarity': rarity.name,
        'mealPeriods': [for (final meal in mealPeriods) meal.name],
      };

  /// Đọc món tự tạo đã lưu. Trả về null nếu dữ liệu hỏng hoặc sai định dạng.
  static FoodItem? tryFromJson(Object? json) {
    if (json is! Map) {
      return null;
    }
    try {
      final name = json['name'] as String;
      final price = json['price'] as int;
      if (name.trim().isEmpty || price <= 0) {
        return null;
      }
      final meals = json['mealPeriods'] as List? ?? const [];
      return FoodItem(
        id: json['id'] as String,
        name: name,
        category: FoodCategory.values.byName(json['category'] as String),
        price: price,
        rarity: FoodRarity.values.byName(json['rarity'] as String),
        imageIndex: 0,
        mealPeriods: {
          for (final meal in meals) MealPeriod.values.byName(meal as String),
        },
        isCustom: true,
      );
    } catch (_) {
      return null;
    }
  }

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

/// Món yêu thích có trọng số gấp đôi.
const favoriteWeightMultiplier = 2;

/// Món chưa quay gần đây có trọng số gấp 4 món vừa quay,
/// nên món vừa quay vẫn có thể ra nhưng ít hơn 4 lần.
const freshWeightMultiplier = 4;

int spinWeight(
  FoodItem food,
  FoodBudget budget, {
  Set<String> favoriteIds = const {},
  Set<String> recentIds = const {},
}) {
  var weight = budgetWeight(food, budget);
  if (favoriteIds.contains(food.id)) {
    weight *= favoriteWeightMultiplier;
  }
  if (!recentIds.contains(food.id)) {
    weight *= freshWeightMultiplier;
  }
  return weight;
}

FoodItem pickFood(
  List<FoodItem> foods,
  FoodBudget budget,
  math.Random random, {
  Set<String> favoriteIds = const {},
  Set<String> recentIds = const {},
}) {
  if (foods.isEmpty) {
    throw ArgumentError.value(foods, 'foods', 'must not be empty');
  }

  int weightOf(FoodItem food) => spinWeight(
        food,
        budget,
        favoriteIds: favoriteIds,
        recentIds: recentIds,
      );

  final totalWeight = foods.fold<int>(
    0,
    (total, food) => total + weightOf(food),
  );
  var roll = random.nextInt(totalWeight);
  for (final food in foods) {
    roll -= weightOf(food);
    if (roll < 0) {
      return food;
    }
  }
  return foods.last;
}

String formatPrice(int price) => '${price ~/ 1000}.000đ';

/// Độ hiếm của món tự tạo được suy ra từ giá.
FoodRarity rarityForPrice(int price) => switch (price) {
      < 50000 => FoodRarity.common,
      < 80000 => FoodRarity.rare,
      < 130000 => FoodRarity.epic,
      < 170000 => FoodRarity.legendary,
      _ => FoodRarity.ancient,
    };

FoodItem createCustomFood({
  required String id,
  required String name,
  required FoodCategory category,
  required int price,
  required Set<MealPeriod> mealPeriods,
}) {
  return FoodItem(
    id: id,
    name: name,
    category: category,
    price: price,
    rarity: rarityForPrice(price),
    imageIndex: 0,
    mealPeriods: mealPeriods,
    isCustom: true,
  );
}
