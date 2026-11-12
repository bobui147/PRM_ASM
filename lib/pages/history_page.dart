import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import '../models/spin_record.dart';
import '../services/food_library.dart';

/// Màn hình lịch sử quay, kèm thống kê đơn giản và nút xóa lịch sử.
class HistoryPage extends StatelessWidget {
  const HistoryPage({super.key, required this.library});

  final FoodLibrary library;

  Future<void> _confirmClear(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xóa lịch sử?'),
        content: const Text(
          'Toàn bộ lịch sử quay sẽ bị xóa. Món vừa ăn sẽ không còn bị giảm tỉ lệ ra.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            key: const Key('confirm-clear-history'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      library.clearHistory();
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: library,
      builder: (context, _) {
        final history = library.history;
        final now = DateTime.now();
        return Scaffold(
          backgroundColor: AppColors.page,
          appBar: AppBar(
            backgroundColor: AppColors.page,
            foregroundColor: AppColors.warmText,
            title: const Text('Lịch sử quay'),
            actions: [
              if (history.isNotEmpty)
                IconButton(
                  key: const Key('clear-history-button'),
                  tooltip: 'Xóa lịch sử',
                  icon: const Icon(Icons.delete_sweep_outlined),
                  onPressed: () => _confirmClear(context),
                ),
            ],
          ),
          body: history.isEmpty
              ? const Center(
                  key: Key('empty-history'),
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: Text(
                      'Chưa có lượt quay nào.\nQuay một món ở tab "Quay" để bắt đầu.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.mutedText),
                    ),
                  ),
                )
              : ListView(
                  key: const Key('history-list'),
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  children: [
                    _StatsCard(history: history),
                    const SizedBox(height: 12),
                    for (final record in history)
                      _HistoryTile(record: record, now: now),
                  ],
                ),
        );
      },
    );
  }
}

class _StatsCard extends StatelessWidget {
  const _StatsCard({required this.history});

  final List<SpinRecord> history;

  @override
  Widget build(BuildContext context) {
    final top = mostFrequentFood(history);
    return Container(
      key: const Key('history-stats'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.hairline),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Tổng lượt quay: ${history.length}',
            style: const TextStyle(
              color: AppColors.warmText,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (top != null) ...[
            const SizedBox(height: 6),
            Text(
              'Ra nhiều nhất: ${top.name} (${top.count} lần)',
              style: const TextStyle(color: AppColors.text),
            ),
          ],
          const SizedBox(height: 6),
          const Text(
            'Món đã quay trong $recentDayWindow ngày gần nhất sẽ không bị quay lại (trừ khi không còn món khác).',
            style: TextStyle(color: AppColors.mutedText, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.record, required this.now});

  final SpinRecord record;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppColors.card,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.hairline),
        borderRadius: BorderRadius.circular(4),
      ),
      child: ListTile(
        leading: Icon(record.icon, color: AppColors.gold),
        title: Text(
          record.foodName,
          style: const TextStyle(color: AppColors.text),
        ),
        subtitle: Text(
          [
            if (record.categoryName.isNotEmpty) record.categoryName,
            formatSpinTime(record.time, now),
          ].join(' · '),
          style: const TextStyle(color: AppColors.mutedText),
        ),
        trailing: Text(
          formatPrice(record.price),
          style: const TextStyle(color: AppColors.warmText),
        ),
      ),
    );
  }
}
