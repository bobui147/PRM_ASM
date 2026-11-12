import 'package:flutter/material.dart';

import '../models/review.dart';
import '../services/api_client.dart';
import '../services/restaurant_repository.dart';
import 'common.dart';

/// Mở bottom sheet báo cáo review. Trả true nếu đã gửi thành công.
Future<bool> showReportSheet(
  BuildContext context, {
  required Review review,
  required RestaurantRepository repository,
}) =>
    showContentReportSheet(
      context,
      title: 'Báo cáo review',
      submit: (reason, details) => repository.reportReview(review.id, reason, details),
    );

/// Bottom sheet báo cáo dùng chung (review, bài, bình luận). [submit] gửi lên server.
Future<bool> showContentReportSheet(
  BuildContext context, {
  required String title,
  required Future<void> Function(ReportReason reason, String? details) submit,
}) async {
  final sent = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _ReportSheet(title: title, submit: submit),
  );
  return sent == true;
}

class _ReportSheet extends StatefulWidget {
  const _ReportSheet({required this.title, required this.submit});

  final String title;
  final Future<void> Function(ReportReason reason, String? details) submit;

  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  final _details = TextEditingController();
  ReportReason? _reason;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final reason = _reason;
    if (reason == null) {
      setState(() => _error = 'Chọn lý do báo cáo');
      return;
    }
    if (reason == ReportReason.other && _details.text.trim().isEmpty) {
      setState(() => _error = 'Nhập ghi chú khi chọn Lý do khác');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.submit(reason, _details.text);
      messenger.showSnackBar(const SnackBar(content: Text('Đã tiếp nhận báo cáo')));
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (error.code == 'ALREADY_REPORTED') {
        messenger.showSnackBar(const SnackBar(content: Text('Bạn đã báo cáo nội dung này')));
        if (mounted) Navigator.of(context).pop(false);
        return;
      }
      if (mounted) setState(() => _error = error.message);
    } catch (error) {
      if (mounted) setState(() => _error = errorText(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            RadioGroup<ReportReason>(
              groupValue: _reason,
              onChanged: (value) => setState(() => _reason = value),
              child: Column(
                children: [
                  for (final reason in ReportReason.values)
                    RadioListTile<ReportReason>(
                      key: ValueKey('report-${reason.name}'),
                      value: reason,
                      title: Text(reason.label),
                      dense: true,
                    ),
                ],
              ),
            ),
            TextField(
              controller: _details,
              maxLength: 300,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: _reason == ReportReason.other ? 'Ghi chú (bắt buộc)' : 'Ghi chú (không bắt buộc)',
                border: const OutlineInputBorder(),
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            FilledButton(
              key: const Key('report-submit'),
              onPressed: _sending ? null : _submit,
              child: Text(_sending ? 'Đang gửi...' : 'Gửi báo cáo'),
            ),
          ],
        ),
      ),
    );
  }
}
