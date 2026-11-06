import 'dart:async';

import 'package:flutter/material.dart';

import 'home_shell.dart';
import 'services/app_services.dart';
import 'services/app_storage.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  AppStorage? storage;
  try {
    storage = await AppStorage.open();
  } catch (error) {
    // Không mở được bộ nhớ thiết bị: app vẫn chạy nhưng không lưu dữ liệu.
    debugPrint('Không mở được SharedPreferences: $error');
  }
  final services = AppServices.create(storage: storage);
  // Hiển thị ngay dữ liệu cache; tải danh mục và phiên đăng nhập ở nền.
  unawaited(services.library.refresh());
  unawaited(services.auth.restore());
  runApp(MyApp(services: services));
}

class MyApp extends StatelessWidget {
  const MyApp({super.key, this.services});

  /// Null thì dùng service trong bộ nhớ (dùng cho widget test).
  final AppServices? services;

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
      home: HomeShell(services: services),
    );
  }
}
