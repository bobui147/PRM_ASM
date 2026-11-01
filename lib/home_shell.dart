import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'food_spinner_page.dart';
import 'pages/history_page.dart';
import 'pages/manage_foods_page.dart';
import 'services/food_library.dart';

/// Khung chính với thanh điều hướng dưới: Quay · Lịch sử · Món ăn.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, this.library});

  /// Null thì dùng kho trong bộ nhớ (không lưu xuống thiết bị).
  final FoodLibrary? library;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  late final FoodLibrary _library;
  late final bool _ownsLibrary;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _ownsLibrary = widget.library == null;
    _library = widget.library ?? FoodLibrary.inMemory();
  }

  @override
  void dispose() {
    if (_ownsLibrary) {
      _library.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.page,
      // IndexedStack giữ trạng thái từng tab khi chuyển qua lại.
      body: IndexedStack(
        index: _index,
        children: [
          FoodSpinnerPage(library: _library),
          HistoryPage(library: _library),
          ManageFoodsPage(library: _library),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        key: const Key('main-navigation'),
        backgroundColor: AppColors.chrome,
        selectedIndex: _index,
        onDestinationSelected: (index) => setState(() => _index = index),
        destinations: const [
          NavigationDestination(
            key: Key('nav-spin'),
            icon: Icon(Icons.inventory_2_outlined),
            label: 'Quay',
          ),
          NavigationDestination(
            key: Key('nav-history'),
            icon: Icon(Icons.history),
            label: 'Lịch sử',
          ),
          NavigationDestination(
            key: Key('nav-foods'),
            icon: Icon(Icons.restaurant_menu),
            label: 'Món ăn',
          ),
        ],
      ),
    );
  }
}
