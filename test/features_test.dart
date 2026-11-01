import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:prmgr5/data/sample_foods.dart';
import 'package:prmgr5/main.dart';
import 'package:prmgr5/models/food_item.dart';
import 'package:prmgr5/models/spin_record.dart';
import 'package:prmgr5/pages/food_form_page.dart';
import 'package:prmgr5/services/app_storage.dart';
import 'package:prmgr5/services/food_library.dart';
import 'package:prmgr5/services/share_launcher.dart';

FoodItem _custom(String id, String name, {int price = 45000}) =>
    createCustomFood(
      id: id,
      name: name,
      category: FoodCategory.lunch,
      price: price,
      mealPeriods: const {MealPeriod.lunch},
    );

FoodItem _sample(String id) => sampleFoods.firstWhere((food) => food.id == id);

void main() {
  test('món yêu thích gấp đôi, món vừa ăn giảm 4 lần trọng số', () {
    final phoBo = _sample('pho-bo');
    final base = budgetWeight(phoBo, FoodBudget.fifty);
    expect(spinWeight(phoBo, FoodBudget.fifty), base * freshWeightMultiplier);
    expect(
      spinWeight(phoBo, FoodBudget.fifty, favoriteIds: {'pho-bo'}),
      base * freshWeightMultiplier * favoriteWeightMultiplier,
    );
    expect(spinWeight(phoBo, FoodBudget.fifty, recentIds: {'pho-bo'}), base);
  });

  test('món vừa ăn ra ít hơn nhưng vẫn có thể ra', () {
    final phoBo = _sample('pho-bo');
    final comTam = _sample('com-tam');
    final random = math.Random(3);
    final picks = List.generate(
      400,
      (_) => pickFood(
        [phoBo, comTam],
        FoodBudget.fifty,
        random,
        recentIds: {'pho-bo'},
      ),
    );
    final phoCount = picks.where((food) => food == phoBo).length;
    expect(phoCount, greaterThan(0));
    expect(phoCount, lessThan(picks.length - phoCount));
  });

  test('ẩn món thì món không còn trong vòng quay', () {
    final library = FoodLibrary.inMemory();
    addTearDown(library.dispose);
    bool canSpinPho() => library
        .eligibleFoods(MealPeriod.lunch)
        .any((food) => food.id == 'pho-bo');

    expect(canSpinPho(), isTrue);
    library.toggleExcluded('pho-bo');
    expect(canSpinPho(), isFalse);
    library.toggleExcluded('pho-bo');
    expect(canSpinPho(), isTrue);
  });

  test('thêm, sửa, xóa món tự tạo', () {
    final library = FoodLibrary.inMemory();
    addTearDown(library.dispose);

    library.addCustomFood(_custom('custom-1', 'Món thử'));
    expect(library.allFoods, hasLength(sampleFoods.length + 1));
    expect(library.nameExists('món thử'), isTrue);

    library.toggleFavorite('custom-1');
    library.updateCustomFood(_custom('custom-1', 'Món thử 2', price: 55000));
    expect(library.customFoods.single.name, 'Món thử 2');
    expect(library.customFoods.single.price, 55000);

    library.deleteCustomFood('custom-1');
    expect(library.customFoods, isEmpty);
    expect(library.isFavorite('custom-1'), isFalse);
  });

  test('lịch sử giữ tối đa 50 lượt, món vừa ăn tính trong 3 ngày', () {
    final library = FoodLibrary.inMemory();
    addTearDown(library.dispose);
    final now = DateTime(2026, 1, 10, 12);

    library.recordSpin(_sample('sushi'), DateTime(2026, 1, 7, 12));
    library.recordSpin(_sample('pho-bo'), DateTime(2026, 1, 8, 9));
    expect(library.recentFoodIds(now), {'pho-bo'});

    for (var i = 0; i < 60; i++) {
      library.recordSpin(_sample('pho-bo'), now);
    }
    expect(library.history, hasLength(maxHistoryLength));
    expect(library.history.first.foodId, 'pho-bo');

    library.clearHistory();
    expect(library.history, isEmpty);
  });

  test('dữ liệu còn nguyên sau khi mở lại app', () async {
    SharedPreferences.setMockInitialValues({});
    final first = FoodLibrary.load(await AppStorage.open());
    first.setCategory(FoodCategory.drink);
    first.setBudget(FoodBudget.hundred);
    first.toggleFavorite('pho-bo');
    first.toggleExcluded('sushi');
    first.addCustomFood(_custom('custom-1', 'Món thử'));
    first.recordSpin(_sample('pho-bo'), DateTime(2026, 1, 10, 12));
    await pumpEventQueue();
    first.dispose();

    final second = FoodLibrary.load(await AppStorage.open());
    addTearDown(second.dispose);
    expect(second.category, FoodCategory.drink);
    expect(second.budget, FoodBudget.hundred);
    expect(second.isFavorite('pho-bo'), isTrue);
    expect(second.isExcluded('sushi'), isTrue);
    expect(second.customFoods.single.name, 'Món thử');
    expect(second.customFoods.single.isCustom, isTrue);
    expect(second.history.single.foodName, 'Phở bò');
  });

  test('bỏ qua dữ liệu lưu bị hỏng thay vì crash', () async {
    SharedPreferences.setMockInitialValues({
      AppStorage.customFoodsKey: 'không phải json',
      AppStorage.historyKey: '[{"foodId": 1}]',
      AppStorage.categoryKey: 'khong-ton-tai',
    });
    final library = FoodLibrary.load(await AppStorage.open());
    addTearDown(library.dispose);
    expect(library.customFoods, isEmpty);
    expect(library.history, isEmpty);
    expect(library.category, FoodCategory.lunch);
  });

  test('kiểm tra tên và giá khi nhập món', () {
    final library = FoodLibrary.inMemory();
    addTearDown(library.dispose);

    expect(validateFoodName('', library), isNotNull);
    expect(validateFoodName('   ', library), isNotNull);
    expect(validateFoodName('a' * (maxFoodNameLength + 1), library), isNotNull);
    expect(validateFoodName('phở bò', library), isNotNull);
    expect(validateFoodName('Phở bò', library, exceptId: 'pho-bo'), isNull);
    expect(validateFoodName('Món mới', library), isNull);

    expect(validatePriceThousands(''), isNotNull);
    expect(validatePriceThousands('0'), isNotNull);
    expect(validatePriceThousands('1000'), isNotNull);
    expect(validatePriceThousands('45'), isNull);
  });

  test('nội dung chia sẻ và thống kê lịch sử', () {
    expect(shareMessage(_sample('pho-bo')), contains('Phở bò'));
    expect(shareMessage(_sample('pho-bo')), contains('50.000đ'));

    final now = DateTime(2026, 1, 10, 12);
    expect(formatSpinTime(DateTime(2026, 1, 10, 8, 5), now), 'Hôm nay 08:05');
    expect(formatSpinTime(DateTime(2026, 1, 9, 19, 30), now), 'Hôm qua 19:30');
    expect(formatSpinTime(DateTime(2026, 1, 3, 7, 0), now), '03/01 07:00');

    expect(mostFrequentFood(const []), isNull);
    final history = [
      SpinRecord.fromFood(_sample('pho-bo'), now),
      SpinRecord.fromFood(_sample('sushi'), now),
      SpinRecord.fromFood(_sample('pho-bo'), now),
    ];
    final top = mostFrequentFood(history)!;
    expect(top.name, 'Phở bò');
    expect(top.count, 2);
  });

  testWidgets('chuyển giữa 3 tab Quay, Lịch sử, Món ăn', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const MyApp());
    expect(find.byKey(const Key('spin-button')), findsOneWidget);

    await tester.tap(find.byKey(const Key('nav-history')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('empty-history')), findsOneWidget);

    await tester.tap(find.byKey(const Key('nav-foods')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('manage-food-list')), findsOneWidget);
    expect(find.byKey(const Key('add-food-button')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('thêm món qua form rồi món hiện trong kho', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const MyApp());
    await tester.tap(find.byKey(const Key('nav-foods')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('add-food-button')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('save-food-button')));
    await tester.pumpAndSettle();
    expect(find.text('Nhập tên món'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('food-name-field')),
      'Bún đậu mắm tôm',
    );
    await tester.enterText(find.byKey(const Key('food-price-field')), '55');
    await tester.tap(find.byKey(const Key('save-food-button')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('food-search-field')),
      'bún đậu',
    );
    await tester.pumpAndSettle();
    expect(find.text('Bún đậu mắm tôm'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
