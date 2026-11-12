import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:prmgr5/models/food_item.dart';
import 'package:prmgr5/services/api_client.dart';
import 'package:prmgr5/services/app_services.dart';
import 'package:prmgr5/services/catalog_repository.dart';
import 'package:prmgr5/services/food_library.dart';

const mainCategory=FoodCategory(id:1,slug:'mon-chinh',name:'Món chính',iconKey:'restaurant',usesMealPeriods:true);
const drinkCategory=FoodCategory(id:2,slug:'do-uong',name:'Đồ uống',iconKey:'local_cafe',usesMealPeriods:false);
const sampleFoods=[
  FoodItem(id:'1',name:'Phở bò',category:mainCategory,price:50000,rarity:FoodRarity.rare,mealPeriods:{MealPeriod.breakfast,MealPeriod.lunch,MealPeriod.dinner,MealPeriod.lateNight}),
  FoodItem(id:'2',name:'Sushi',category:mainCategory,price:200000,rarity:FoodRarity.ancient,mealPeriods:{MealPeriod.lunch,MealPeriod.dinner}),
  FoodItem(id:'3',name:'Xôi xéo',category:mainCategory,price:25000,rarity:FoodRarity.common,mealPeriods:{MealPeriod.breakfast}),
  FoodItem(id:'4',name:'Cà phê sữa',category:drinkCategory,price:25000,rarity:FoodRarity.common),
  FoodItem(id:'5',name:'Matcha latte',category:drinkCategory,price:65000,rarity:FoodRarity.rare),
];
FoodLibrary testLibrary({List<FoodItem> foods=sampleFoods})=>FoodLibrary.inMemory(catalog:Catalog(version:'test',categories:const [mainCategory,drinkCategory],foods:foods));
AppServices testServices({FoodLibrary? library})=>AppServices.inMemory(library:library??testLibrary(),api:ApiClient(httpClient:MockClient((_)async=>http.Response(jsonEncode({'items':[],'hasMore':false,'total':0}),200))));
