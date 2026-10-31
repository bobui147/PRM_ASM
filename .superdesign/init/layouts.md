# Shared layouts

## `MyApp`

- Source: `lib/main.dart`
- Role: root Material 3 app shell and dark theme provider.

```dart
class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Hôm nay ăn gì?',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFFFA726),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF0D0F14),
        useMaterial3: true,
      ),
      home: const FoodSpinnerPage(),
    );
  }
}
```

There is no navigation shell, app bar, sidebar, bottom navigation, or footer. The app has one full-screen route wrapped in `Scaffold`, `SafeArea`, and `SingleChildScrollView`.
