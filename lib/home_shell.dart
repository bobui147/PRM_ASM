import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'food_spinner_page.dart';
import 'pages/account_page.dart';
import 'pages/community_page.dart';
import 'pages/history_page.dart';
import 'pages/manage_foods_page.dart';
import 'pages/meal_plan_page.dart';
import 'services/app_services.dart';

/// Khung chính với thanh điều hướng dưới: Quay · Cộng đồng · Thực đơn · Lịch sử · Món ăn · Tài khoản.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, this.services});

  /// Null thì dùng service trong bộ nhớ (không lưu, không gọi mạng thật).
  final AppServices? services;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  late final AppServices _services;
  late final bool _ownsServices;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _ownsServices = widget.services == null;
    _services = widget.services ?? AppServices.inMemory();
    _services.auth.sessionMessage.addListener(_showSessionMessage);
  }

  /// Phiên hết hạn và làm mới thất bại: báo cho người dùng (FR-M11).
  void _showSessionMessage() {
    final message = _services.auth.sessionMessage.value;
    if (message == null || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    _services.auth.sessionMessage.value = null;
  }

  @override
  void dispose() {
    _services.auth.sessionMessage.removeListener(_showSessionMessage);
    if (_ownsServices) {
      _services.dispose();
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
          FoodSpinnerPage(services: _services),
          CommunityPage(services: _services),
          MealPlanPage(services: _services),
          HistoryPage(library: _services.library),
          ManageFoodsPage(services: _services),
          AccountPage(services: _services),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        key: const Key('main-navigation'),
        backgroundColor: AppColors.chrome,
        selectedIndex: _index,
        // 6 tab: chỉ hiện nhãn tab đang chọn để vừa màn hình 360 dp.
        labelBehavior: NavigationDestinationLabelBehavior.onlyShowSelected,
        onDestinationSelected: (index) => setState(() => _index = index),
        destinations: const [
          NavigationDestination(
            key: Key('nav-spin'),
            icon: Icon(Icons.inventory_2_outlined),
            label: 'Quay',
          ),
          NavigationDestination(
            key: Key('nav-community'),
            icon: Icon(Icons.forum_outlined),
            label: 'Cộng đồng',
          ),
          NavigationDestination(
            key: Key('nav-plan'),
            icon: Icon(Icons.event_note_outlined),
            label: 'Thực đơn',
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
          NavigationDestination(
            key: Key('nav-account'),
            icon: Icon(Icons.account_circle_outlined),
            label: 'Tài khoản',
          ),
        ],
      ),
    );
  }
}

