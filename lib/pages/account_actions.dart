import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';
import 'auth_pages.dart';

/// Hộp thoại nhập một giá trị. Trả null nếu hủy.
Future<String?> askText(
  BuildContext context, {
  required String title,
  required String label,
  bool obscure = false,
  String initial = '',
}) async {
  final controller = TextEditingController(text: initial);
  try {
    return await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          obscureText: obscure,
          decoration: InputDecoration(labelText: label),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Hủy')),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text), child: const Text('Lưu')),
        ],
      ),
    );
  } finally {
    controller.dispose();
  }
}

/// Chạy thao tác tài khoản, hiện SnackBar thành công hoặc lỗi.
Future<void> runAccountAction(BuildContext context, Future<void> Function() action, String success) async {
  try {
    await action();
    if (context.mounted) showSnack(context, success);
  } on ApiException catch (error) {
    if (context.mounted) showSnack(context, error.fields.isNotEmpty ? error.fields.values.first : error.message);
  } catch (error) {
    if (context.mounted) showSnack(context, errorText(error));
  }
}

Future<void> renameAccount(BuildContext context, AppServices services) async {
  final name = await askText(
    context,
    title: 'Đổi tên hiển thị',
    label: 'Tên hiển thị',
    initial: services.auth.user?.displayName ?? '',
  );
  if (name == null || !context.mounted) return;
  final invalid = validateDisplayName(name);
  if (invalid != null) return showSnack(context, invalid);
  await runAccountAction(context, () => services.auth.updateDisplayName(name), 'Đã đổi tên hiển thị.');
}

Future<void> changeAccountPassword(BuildContext context, AppServices services) async {
  final current = await askText(context, title: 'Đổi mật khẩu', label: 'Mật khẩu hiện tại', obscure: true);
  if (current == null || current.isEmpty || !context.mounted) return;
  final next = await askText(
    context,
    title: 'Đổi mật khẩu',
    label: 'Mật khẩu mới (8–72 ký tự, có chữ và số)',
    obscure: true,
  );
  if (next == null || !context.mounted) return;
  final invalid = validateNewPassword(next);
  if (invalid != null) return showSnack(context, invalid);
  await runAccountAction(context, () => services.auth.changePassword(current, next), 'Đã đổi mật khẩu.');
}

Future<void> deleteAccount(BuildContext context, AppServices services) async {
  final password = await askText(context, title: 'Xóa tài khoản', label: 'Nhập mật khẩu để xác nhận', obscure: true);
  if (password == null || password.isEmpty || !context.mounted) return;
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Xóa vĩnh viễn?'),
      content: const Text('Tài khoản, mọi review, ảnh và báo cáo của bạn sẽ bị xóa và không khôi phục được.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Hủy')),
        FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Xóa tài khoản')),
      ],
    ),
  );
  if (ok != true || !context.mounted) return;
  await runAccountAction(context, () => services.auth.deleteAccount(password), 'Đã xóa tài khoản.');
}
