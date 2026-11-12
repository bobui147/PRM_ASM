import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';
import 'account_actions.dart';
import 'auth_pages.dart';
import 'my_reviews_page.dart';
import 'group_rooms_page.dart';
import 'meal_plans_page.dart';

/// Tab Tài khoản (FR-M10).
class AccountPage extends StatelessWidget {
  const AccountPage({super.key, required this.services});

  final AppServices services;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: services.auth,
      builder: (context, _) => Scaffold(
        backgroundColor: AppColors.page,
        appBar: AppBar(
          backgroundColor: AppColors.page,
          foregroundColor: AppColors.warmText,
          title: const Text('Tài khoản'),
        ),
        body: services.auth.isSignedIn ? _signedIn(context) : _guest(context),
      ),
    );
  }

  Widget _guest(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(24), children: [
      const Icon(Icons.account_circle_outlined, size: 72, color: AppColors.gold),
      const SizedBox(height: 12),
      const Text(
        'Đăng nhập để viết review, đăng ảnh và báo cáo nội dung không phù hợp.',
        textAlign: TextAlign.center,
        style: TextStyle(color: AppColors.text),
      ),
      const SizedBox(height: 20),
      FilledButton(
        key: const Key('account-login'),
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => LoginPage(services: services))),
        child: const Text('Đăng nhập'),
      ),
      const SizedBox(height: 8),
      OutlinedButton(
        key: const Key('account-register'),
        onPressed: () =>
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => RegisterPage(services: services))),
        child: const Text('Đăng ký'),
      ),
    ]);
  }

  Widget _signedIn(BuildContext context) {
    final user = services.auth.user!;
    final until = user.blockedUntil;
    Widget item(IconData icon, String label, VoidCallback onTap, {Key? key, Color color = AppColors.text}) => ListTile(
          key: key,
          leading: Icon(icon, color: color == AppColors.text ? AppColors.gold : color),
          title: Text(label, style: TextStyle(color: color)),
          onTap: onTap,
        );
    return ListView(padding: const EdgeInsets.all(16), children: [
      ListTile(
        leading: InitialAvatar(name: user.displayName, radius: 24),
        title: Text(user.displayName, style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w700)),
        subtitle: Text(user.email, style: const TextStyle(color: AppColors.mutedText)),
      ),
      if (user.blocked)
        Container(
          margin: const EdgeInsets.symmetric(vertical: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(border: Border.all(color: Colors.redAccent), borderRadius: BorderRadius.circular(4)),
          child: Text(
            'Tài khoản đang bị khóa ${until == null ? 'vĩnh viễn' : 'tới ${until.day}/${until.month}/${until.year}'}'
            '${user.blockedReason == null ? '' : '. Lý do: ${user.blockedReason}'}. '
            'Bạn vẫn xem được nội dung nhưng không viết review hay báo cáo được.',
            style: const TextStyle(color: Colors.redAccent),
          ),
        ),
      const Divider(),
      item(Icons.groups_outlined, 'Chọn món cùng nhóm', () {
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => GroupRoomsPage(services: services)));
      }),
      item(Icons.calendar_month_outlined, 'Thực đơn của tôi', () {
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => MealPlansPage(services: services)));
      }),
      item(Icons.rate_review_outlined, 'Review của tôi', key: const Key('my-reviews'), () {
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => MyReviewsPage(services: services)));
      }),
      item(Icons.badge_outlined, 'Đổi tên hiển thị', () => renameAccount(context, services)),
      item(Icons.lock_outline, 'Đổi mật khẩu', () => changeAccountPassword(context, services)),
      item(Icons.logout, 'Đăng xuất', key: const Key('logout'),
          () => runAccountAction(context, services.auth.logout, 'Đã đăng xuất.')),
      const Divider(),
      item(Icons.delete_forever_outlined, 'Xóa tài khoản', color: Colors.redAccent,
          () => deleteAccount(context, services)),
    ]);
  }
}
