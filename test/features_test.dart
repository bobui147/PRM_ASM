import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:prmgr5/main.dart';
import 'package:prmgr5/models/food_item.dart';
import 'package:prmgr5/models/spin_record.dart';
import 'package:prmgr5/services/app_storage.dart';
import 'package:prmgr5/services/food_library.dart';
import 'package:prmgr5/services/share_launcher.dart';
import 'support/test_services.dart';

void main() {
  test('yêu thích tăng trọng số và lịch sử gần đây giảm lặp', () {
    final food=sampleFoods.first;
    final base=spinWeight(food,FoodBudget.fifty);
    expect(spinWeight(food,FoodBudget.fifty,favoriteIds:{food.id}),base*favoriteWeightMultiplier);
    expect(spinWeight(food,FoodBudget.fifty,recentIds:{food.id}),base/freshWeightMultiplier);
    final random=math.Random(3);
    final picks=List.generate(400,(_)=>pickFood(sampleFoods.take(2).toList(),FoodBudget.unlimited,random,recentIds:{food.id}));
    final count=picks.where((p)=>p.id==food.id).length;
    expect(count,greaterThan(0));expect(count,lessThan(200));
  });
  test('ẩn món loại khỏi vòng quay nhưng không xóa danh mục', () {
    final library=testLibrary();addTearDown(library.dispose);
    library.toggleExcluded('1');
    expect(library.eligibleFoods(MealPeriod.lunch).any((f)=>f.id=='1'),isFalse);
    expect(library.allFoods.any((f)=>f.id=='1'),isTrue);
    library.toggleExcluded('1');expect(library.eligibleFoods(MealPeriod.lunch).any((f)=>f.id=='1'),isTrue);
  });
  test('lịch sử giới hạn 50 lượt và cửa sổ ba ngày lịch', () {
    final library=testLibrary();addTearDown(library.dispose);final now=DateTime(2026,1,10,12);
    library.recordSpin(sampleFoods[1],DateTime(2026,1,7,12));library.recordSpin(sampleFoods[0],DateTime(2026,1,8,9));
    expect(library.recentFoodIds(now),{'1'});
    for(var i=0;i<60;i++){library.recordSpin(sampleFoods[0],now);}
    expect(library.history,hasLength(maxHistoryLength));library.clearHistory();expect(library.history,isEmpty);
  });
  test('lưu lựa chọn, yêu thích, món ẩn và lịch sử qua lần mở lại', () async {
    SharedPreferences.setMockInitialValues({AppStorage.schemaKey:AppStorage.schemaVersion});
    final storage=await AppStorage.open();
    final first=FoodLibrary(storage:storage);first.setCategory(drinkCategory);first.setBudget(FoodBudget.hundred);
    first.toggleFavorite('1');first.toggleExcluded('2');first.recordSpin(sampleFoods.first,DateTime(2026,1,10));
    await pumpEventQueue();first.dispose();
    final second=FoodLibrary(storage:await AppStorage.open());addTearDown(second.dispose);
    expect(storage.readCategory(),drinkCategory.slug);expect(second.budget,FoodBudget.hundred);
    expect(second.isFavorite('1'),isTrue);expect(second.isExcluded('2'),isTrue);expect(second.history.single.foodName,'Phở bò');
  });
  test('cache và lịch sử hỏng không làm crash', () async {
    SharedPreferences.setMockInitialValues({AppStorage.schemaKey:AppStorage.schemaVersion,AppStorage.catalogKey:'không phải json',AppStorage.historyKey:'[{"foodId":1}]'});
    final storage=await AppStorage.open();expect(storage.readCatalog(),isNull);expect(storage.readHistory(),isEmpty);
  });
  test('chia sẻ và thống kê lịch sử vẫn dùng món từ danh mục', () {
    expect(shareMessage(sampleFoods.first),contains('Phở bò'));expect(shareMessage(sampleFoods.first),contains('50.000đ'));
    final now=DateTime(2026,1,10,12);expect(formatSpinTime(DateTime(2026,1,10,8,5),now),'Hôm nay 08:05');
    expect(mostFrequentFood([]),isNull);
    final top=mostFrequentFood([SpinRecord.fromFood(sampleFoods[0],now),SpinRecord.fromFood(sampleFoods[1],now),SpinRecord.fromFood(sampleFoods[0],now)])!;
    expect(top.name,'Phở bò');expect(top.count,2);
  });
  testWidgets('điều hướng đủ năm tab trên điện thoại', (tester) async {
    tester.view.physicalSize=const Size(390,844);tester.view.devicePixelRatio=1;
    addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
    final services=testServices();addTearDown(services.dispose);
    await tester.pumpWidget(MyApp(services:services));
    for(final key in ['nav-history','nav-foods','nav-account','nav-community','nav-spin']){
      await tester.tap(find.byKey(Key(key)));await tester.pumpAndSettle();expect(tester.takeException(),isNull);
    }
  });
}
