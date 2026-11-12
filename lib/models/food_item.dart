import 'dart:math' as math;

import 'package:flutter/material.dart';

enum MealPeriod {
  lateNight('Ăn đêm', 'late_night'),
  breakfast('Ăn sáng', 'breakfast'),
  lunch('Ăn trưa', 'lunch'),
  dinner('Ăn tối', 'dinner');

  const MealPeriod(this.label, this.apiName);

  final String label;

  /// Giá trị server dùng (requirements §12.3).
  final String apiName;

  MealPeriod get next =>
      MealPeriod.values[(index + 1) % MealPeriod.values.length];

  static MealPeriod? fromApi(Object? value) {
    for (final meal in values) {
      if (meal.apiName == value) return meal;
    }
    return null;
  }
}

/// Icon app hỗ trợ cho nhóm món (khớp danh sách ở web admin, FR-A03).
const _categoryIcons = <String, IconData>{
  'restaurant': Icons.restaurant,
  'local_cafe': Icons.local_cafe,
  'fastfood': Icons.fastfood,
  'sports_bar': Icons.sports_bar,
  'icecream': Icons.icecream,
  'ramen_dining': Icons.ramen_dining,
  'bakery_dining': Icons.bakery_dining,
  'local_bar': Icons.local_bar,
};

IconData iconForCategory(String? key) => _categoryIcons[key] ?? Icons.restaurant;

/// Nhóm món do admin quản lý trên server.
class FoodCategory {
  const FoodCategory({
    this.id = 0,
    required this.slug,
    required this.name,
    required this.iconKey,
    required this.usesMealPeriods,
  });

  final String slug;
  final int id;
  final String name;
  final String iconKey;
  final bool usesMealPeriods;

  String get label => name;
  IconData get icon => iconForCategory(iconKey);

  static FoodCategory? tryFromJson(Object? json) {
    if (json is! Map) return null;
    final slug = json['slug'];
    final name = json['name'];
    if (slug is! String || name is! String) return null;
    return FoodCategory(
      id: json['id'] is num ? (json['id'] as num).toInt() : 0,
      slug: slug,
      name: name,
      iconKey: json['icon'] as String? ?? 'restaurant',
      usesMealPeriods: json['usesMealPeriods'] == true,
    );
  }

  @override
  bool operator ==(Object other) => other is FoodCategory && other.slug == slug;

  @override
  int get hashCode => slug.hashCode;
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

/// Món ăn lấy từ `GET /catalog`. `id` là id số của server dạng chuỗi.
class FoodItem {
  const FoodItem({
    required this.id,
    required this.name,
    required this.category,
    required this.price,
    required this.rarity,
    this.mealPeriods = const {},
    this.imageUrl,
    this.thumbUrl,
    this.description,
    this.restaurantCount = 0,
  });

  final String id;
  final String name;
  final FoodCategory category;
  final int price;
  final FoodRarity rarity;
  final Set<MealPeriod> mealPeriods;
  final String? imageUrl;
  final String? thumbUrl;
  final String? description;
  final int restaurantCount;

  /// Đọc một món trong `/catalog`; trả null nếu dữ liệu hỏng hoặc nhóm không tồn tại.
  static FoodItem? tryFromJson(
    Object? json,
    Map<String, FoodCategory> categories,
  ) {
    if (json is! Map) return null;
    final id = json['id'];
    final name = json['name'];
    final price = json['referencePrice'];
    final category = categories[json['categorySlug']];
    if (id == null || name is! String || price is! num || category == null) {
      return null;
    }
    final meals = <MealPeriod>{};
    final rawMeals = json['mealPeriods'];
    if (rawMeals is List) {
      for (final value in rawMeals) {
        final meal = MealPeriod.fromApi(value);
        if (meal != null) meals.add(meal);
      }
    }
    return FoodItem(
      id: '$id',
      name: name,
      category: category,
      price: price.toInt(),
      rarity: FoodRarity.values.asNameMap()[json['rarity']] ??
          rarityForPrice(price.toInt()),
      mealPeriods: meals,
      imageUrl: json['imageUrl'] as String?,
      thumbUrl: json['thumbUrl'] as String?,
      description: json['description'] as String?,
      restaurantCount: (json['restaurantCount'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Món đủ điều kiện theo nhóm và bữa (bữa chỉ áp dụng cho nhóm dùng bữa ăn).
List<FoodItem> filterFoods(
  Iterable<FoodItem> foods,
  FoodCategory? category,
  MealPeriod mealPeriod,
) {
  if (category == null) return const [];
  return foods
      .where(
        (food) =>
            food.category == category &&
            (!category.usesMealPeriods ||
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

/// Ví dụ 45000 → "45.000đ", 1250000 → "1.250.000đ".
String formatPrice(int price) {
  final digits = price.abs().toString();
  final buffer = StringBuffer(price < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write('.');
    buffer.write(digits[i]);
  }
  return '$bufferđ';
}

/// Độ hiếm mặc định suy ra từ giá (giống server).
FoodRarity rarityForPrice(int price) => switch (price) {
      < 50000 => FoodRarity.common,
      < 80000 => FoodRarity.rare,
      < 130000 => FoodRarity.epic,
      < 170000 => FoodRarity.legendary,
      _ => FoodRarity.ancient,
    };
