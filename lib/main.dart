import 'package:flutter/material.dart';

import 'home_shell.dart';
import 'services/app_storage.dart';
import 'services/food_library.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  FoodLibrary library;
  try {
    library = FoodLibrary.load(await AppStorage.open());
  } catch (error) {
    // Không mở được bộ nhớ thiết bị: app vẫn chạy nhưng không lưu dữ liệu.
    debugPrint('Không mở được SharedPreferences: $error');
    library = FoodLibrary.inMemory();
  }
  runApp(MyApp(library: library));
}

class MyApp extends StatelessWidget {
  const MyApp({super.key, this.library});

  /// Null thì dùng kho trong bộ nhớ (dùng cho widget test).
  final FoodLibrary? library;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Hôm nay ăn gì?',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFDFC28B),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF15120E),
        useMaterial3: true,
      ),
      home: HomeShell(library: library),
    );
  }
}
