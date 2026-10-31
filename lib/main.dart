import 'package:flutter/material.dart';

import 'food_spinner_page.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

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
      home: const FoodSpinnerPage(),
    );
  }
}
