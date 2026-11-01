import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:prmgr5/data/sample_foods.dart';
import 'package:prmgr5/food_spinner_page.dart';
import 'package:prmgr5/main.dart';
import 'package:prmgr5/models/food_item.dart';
import 'package:prmgr5/services/food_library.dart';
import 'package:prmgr5/services/maps_launcher.dart';

void main() {
  for (final reduceMotion in [false, true]) {
    testWidgets('quay đủ 5 giây khi giảm chuyển động = $reduceMotion', (
      tester,
    ) async {
      tester.platformDispatcher.accessibilityFeaturesTestValue =
          FakeAccessibilityFeatures(disableAnimations: reduceMotion);
      addTearDown(
        tester.platformDispatcher.clearAccessibilityFeaturesTestValue,
      );
      await tester.pumpWidget(const MyApp());

      final button = find.byKey(const Key('spin-button'));
      final winner = find.byKey(const Key('winner-card'));
      await tester.tap(button);
      await tester.pump();

      await tester.pump(const Duration(seconds: 1));
      expect(find.byKey(const Key('result-dialog')), findsNothing);
      expect(tester.widget<FilledButton>(button).onPressed, isNull);
      final positionAtOneSecond = tester.getCenter(winner).dx;

      await tester.pump(const Duration(seconds: 3));
      expect(tester.getCenter(winner).dx, lessThan(positionAtOneSecond));
      expect(find.byKey(const Key('result-dialog')), findsNothing);
      final positionAtFourSeconds = tester.getCenter(winner).dx;

      await tester.pump(const Duration(milliseconds: 999));
      expect(tester.getCenter(winner).dx, lessThan(positionAtFourSeconds));
      expect(find.byKey(const Key('result-dialog')), findsNothing);
      expect(tester.widget<FilledButton>(button).onPressed, isNull);

      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump(const Duration(milliseconds: 16));
      await tester.pump();
      expect(find.byKey(const Key('result-dialog')), findsOneWidget);
      expect(
        tester.getCenter(winner).dx,
        moreOrLessEquals(
          tester.getCenter(find.byKey(const Key('center-pointer'))).dx,
          epsilon: 0.5,
        ),
      );
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  test('tạo đúng Google Maps URL từ tên món', () {
    final uri = Uri.parse(googleMapsSearchUrl('Phở bò'));

    expect(uri.host, 'www.google.com');
    expect(uri.path, '/maps/search/');
    expect(uri.queryParameters['api'], '1');
    expect(uri.queryParameters['query'], 'Phở bò quán ăn');
  });

  test('chọn đúng bữa theo các mốc giờ của website', () {
    expect(mealPeriodFor(DateTime(2026, 1, 1, 3)), MealPeriod.lateNight);
    expect(mealPeriodFor(DateTime(2026, 1, 1, 4)), MealPeriod.breakfast);
    expect(mealPeriodFor(DateTime(2026, 1, 1, 7)), MealPeriod.breakfast);
    expect(mealPeriodFor(DateTime(2026, 1, 1, 10)), MealPeriod.lunch);
    expect(mealPeriodFor(DateTime(2026, 1, 1, 11)), MealPeriod.lunch);
    expect(mealPeriodFor(DateTime(2026, 1, 1, 16)), MealPeriod.dinner);
    expect(mealPeriodFor(DateTime(2026, 1, 1, 18)), MealPeriod.dinner);
  });

  test('kho mẫu có 57 món, id duy nhất và đọc được nhiều atlas', () {
    expect(sampleFoods, hasLength(57));
    expect(sampleFoods.map((food) => food.id).toSet(), hasLength(57));

    final miQuang = sampleFoods.firstWhere((food) => food.id == 'mi-quang');
    expect(miQuang.imageAsset, 'assets/images/foods-lunch-2.png');
    expect(miQuang.imageCell, 0);

    final bunThang = sampleFoods.firstWhere((food) => food.id == 'bun-thang');
    expect(bunThang.imageAsset, 'assets/images/foods-lunch-3.png');

    final nemCuaBe = sampleFoods.firstWhere((food) => food.id == 'nem-cua-be');
    expect(nemCuaBe.imageAsset, 'assets/images/foods-lunch-4.png');
    expect(nemCuaBe.imageCell, 5);
  });

  test('lọc theo bữa và ưu tiên ngân sách mà không loại món', () {
    final breakfastFoods = filterFoods(
      sampleFoods,
      FoodCategory.lunch,
      MealPeriod.breakfast,
    );
    expect(breakfastFoods.any((food) => food.id == 'xoi-xeo'), isTrue);
    expect(breakfastFoods.any((food) => food.id == 'sushi'), isFalse);

    final drinkingFoods = filterFoods(
      sampleFoods,
      FoodCategory.drinking,
      MealPeriod.lunch,
    );
    expect(drinkingFoods, hasLength(11));

    final phoBo = sampleFoods.firstWhere((food) => food.id == 'pho-bo');
    final sushi = sampleFoods.firstWhere((food) => food.id == 'sushi');
    final random = math.Random(7);
    final picks = List.generate(
      200,
      (_) => pickFood([phoBo, sushi], FoodBudget.fifty, random),
    );
    expect(
      picks.where((food) => food == phoBo).length,
      greaterThan(picks.where((food) => food == sushi).length),
    );
  });

  testWidgets('hiển thị không overflow trên màn hình điện thoại', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const MyApp());
    await tester.pump();

    expect(find.text('HÔM NAY ĂN GÌ?'), findsOneWidget);
    expect(find.byType(Image), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('lọc đúng loại món và ngân sách không ẩn món', (tester) async {
    await tester.pumpWidget(const MyApp());

    await tester.tap(find.byKey(const Key('category-drink')));
    await tester.pumpAndSettle();
    var inventory = find.byKey(const Key('inventory-grid'));

    expect(
      find.descendant(of: inventory, matching: find.text('Cà phê sữa')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: inventory, matching: find.text('Phở bò')),
      findsNothing,
    );
    expect(
      find.descendant(of: inventory, matching: find.text('Matcha latte')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('budget-selector')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('100.000đ').last);
    await tester.pumpAndSettle();

    inventory = find.byKey(const Key('inventory-grid'));
    expect(
      find.descendant(of: inventory, matching: find.text('Matcha latte')),
      findsOneWidget,
    );
  });

  testWidgets('cho phép đổi bữa bằng cách bấm lại chip bữa ăn', (tester) async {
    await tester.pumpWidget(const MyApp());

    final mealChip = find.byKey(const Key('category-lunch'));
    final before = tester
        .widget<Text>(
            find.descendant(of: mealChip, matching: find.byType(Text)))
        .data;

    await tester.tap(mealChip);
    await tester.pump();

    final after = tester
        .widget<Text>(
            find.descendant(of: mealChip, matching: find.byType(Text)))
        .data;
    expect(after, isNot(before));
  });

  testWidgets('khóa khi quay, kết quả trùng thẻ thắng và quay lại được', (
    tester,
  ) async {
    await tester.pumpWidget(const MyApp());

    final spinButton = find.byKey(const Key('spin-button'));
    await tester.tap(spinButton);
    await tester.pump();

    expect(tester.widget<FilledButton>(spinButton).onPressed, isNull);
    expect(find.byKey(const Key('result-dialog')), findsNothing);

    await tester.pump(const Duration(seconds: 1));
    final firstSecondWinnerX =
        tester.getCenter(find.byKey(const Key('winner-card'))).dx;

    await tester.pump(const Duration(seconds: 3));
    final fourthSecondWinnerX =
        tester.getCenter(find.byKey(const Key('winner-card'))).dx;
    expect(fourthSecondWinnerX, lessThan(firstSecondWinnerX));
    expect(find.byKey(const Key('result-dialog')), findsNothing);

    await tester.pump(const Duration(milliseconds: 999));
    expect(find.byKey(const Key('result-dialog')), findsNothing);

    await tester.pump(const Duration(milliseconds: 1));
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();

    final winnerName =
        tester.widget<Text>(find.byKey(const Key('winner-card-name'))).data!;
    final resultName =
        tester.widget<Text>(find.byKey(const Key('result-name'))).data!;
    expect(resultName, winnerName);
    expect(find.byKey(const Key('google-maps-button')), findsOneWidget);
    expect(
      tester.getCenter(find.byKey(const Key('winner-card'))).dx,
      moreOrLessEquals(
        tester.getCenter(find.byKey(const Key('center-pointer'))).dx,
        epsilon: 0.5,
      ),
    );

    await tester.tap(find.byKey(const Key('continue-button')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('result-dialog')), findsNothing);
    expect(tester.widget<FilledButton>(spinButton).onPressed, isNotNull);

    await tester.tap(spinButton);
    await tester.pump();
    expect(tester.widget<FilledButton>(spinButton).onPressed, isNull);
  });

  testWidgets('không quay khi bộ lọc không có món phù hợp', (tester) async {
    const otherCategoryFood = FoodItem(
      id: 'other-category',
      name: 'Món thử nghiệm',
      category: FoodCategory.drink,
      price: 200000,
      rarity: FoodRarity.ancient,
      imageIndex: 0,
    );

    final library = FoodLibrary.inMemory(baseFoods: const [otherCategoryFood]);
    addTearDown(library.dispose);
    await tester.pumpWidget(
      MaterialApp(home: FoodSpinnerPage(library: library)),
    );

    expect(find.byKey(const Key('empty-reel')), findsOneWidget);
    expect(find.byKey(const Key('empty-inventory')), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('spin-button')))
          .onPressed,
      isNull,
    );
  });
}
