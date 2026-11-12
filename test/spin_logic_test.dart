import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:prmgr5/models/food_item.dart';

FoodItem food(String id, int price) => FoodItem(
      id: id,
      name: id,
      category: const FoodCategory(slug: 'a', name: 'A', iconKey: 'restaurant', usesMealPeriods: false),
      price: price,
      rarity: FoodRarity.common,
    );

void main() {
  test('khoảng giá là các dải liền kề', () {
    expect(FoodBudget.fifty.accepts(50000), isTrue);
    expect(FoodBudget.fifty.accepts(50001), isFalse);
    expect(FoodBudget.hundred.accepts(50000), isFalse);
    expect(FoodBudget.hundred.accepts(100000), isTrue);
    expect(FoodBudget.hundred.accepts(150000), isFalse);
    expect(FoodBudget.hundredFifty.accepts(120000), isTrue);
    expect(FoodBudget.unlimited.accepts(999999), isTrue);
  });

  test('món vừa quay không ra lại khi còn món khác', () {
    final foods = [food('a', 40000), food('b', 40000), food('c', 40000)];
    final random = math.Random(1);
    for (var i = 0; i < 500; i++) {
      final picked = pickFood(foods, FoodBudget.fifty, random, recentIds: {'a', 'b'});
      expect(picked.id, 'c');
    }
    // Mọi món đều vừa quay: vẫn quay được.
    expect(pickFood(foods, FoodBudget.fifty, random, recentIds: {'a', 'b', 'c'}), isNotNull);
  });
}
