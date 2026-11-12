import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import '../models/meal_plan.dart';
import '../services/api_client.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';
import '../widgets/food_photo.dart';
import '../widgets/food_picker.dart';
import '../widgets/paged_list.dart';
import 'auth_pages.dart';

/// Tab Thực đơn: Kế hoạch · Muốn thử · Đã ăn (requirements-mo-rong.md P3).
class MealPlanPage extends StatelessWidget {
  const MealPlanPage({super.key, required this.services});

  final AppServices services;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: services.auth,
      builder: (context, _) {
        final signedIn = services.auth.isSignedIn;
        return DefaultTabController(
          length: 3,
          child: Scaffold(
            backgroundColor: AppColors.page,
            appBar: AppBar(
              backgroundColor: AppColors.page,
              foregroundColor: AppColors.warmText,
              title: const Text('Thực đơn của tôi'),
              bottom: signedIn
                  ? const TabBar(tabs: [
                      Tab(key: Key('tab-plan'), text: 'Kế hoạch'),
                      Tab(key: Key('tab-want'), text: 'Muốn thử'),
                      Tab(key: Key('tab-eaten'), text: 'Đã ăn'),
                    ])
                  : null,
            ),
            body: signedIn
                ? TabBarView(
                    // Đổi tài khoản thì tạo lại các tab.
                    key: ValueKey(services.auth.user?.id),
                    children: [
                      PlanTab(services: services),
                      WantToTryTab(services: services),
                      EatenTab(services: services),
                    ],
                  )
                : EmptyState(
                    key: const Key('plan-guest'),
                    icon: Icons.event_note,
                    message: 'Đăng nhập để lên thực đơn, lưu món muốn thử và xem lịch sử đã ăn. '
                        'Dữ liệu được đồng bộ theo tài khoản.',
                    action: FilledButton(
                      onPressed: () => ensureSignedIn(context, services),
                      child: const Text('Đăng nhập'),
                    ),
                  ),
          ),
        );
      },
    );
  }
}

/// Chọn ngày + bữa (khi thêm hoặc chuyển món). Trả null khi hủy.
Future<(DateTime, PlanMeal)?> pickDateAndMeal(
  BuildContext context, {
  required DateTime initialDate,
  PlanMeal initialMeal = PlanMeal.lunch,
  String title = 'Chọn ngày và bữa',
}) {
  var date = dateOnly(initialDate);
  var meal = initialMeal;
  return showModalBottomSheet<(DateTime, PlanMeal)>(
    context: context,
    backgroundColor: AppColors.surface,
    builder: (context) => StatefulBuilder(
      builder: (context, setSheet) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title, style: const TextStyle(color: AppColors.warmText, fontSize: 18)),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.calendar_today, color: AppColors.gold),
            title: Text(dayLabel(date), style: const TextStyle(color: AppColors.text)),
            trailing: const Text('Đổi ngày'),
            onTap: () async {
              final now = DateTime.now();
              final picked = await showDatePicker(
                context: context,
                initialDate: date,
                firstDate: now.subtract(const Duration(days: 365)),
                lastDate: now.add(const Duration(days: 365)),
              );
              if (picked != null) setSheet(() => date = picked);
            },
          ),
          Wrap(spacing: 6, children: [
            for (final m in PlanMeal.values)
              ChoiceChip(
                key: ValueKey('meal-${m.name}'),
                label: Text(m.label),
                selected: meal == m,
                onSelected: (_) => setSheet(() => meal = m),
              ),
          ]),
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('date-meal-ok'),
            onPressed: () => Navigator.pop(context, (date, meal)),
            child: const Text('Xác nhận'),
          ),
        ]),
      ),
    ),
  );
}

/// Thêm một món vào kế hoạch: chọn ngày/bữa rồi gọi API.
Future<bool> addFoodToPlan(BuildContext context, AppServices services, int foodId, String name) async {
  final picked = await pickDateAndMeal(context, initialDate: DateTime.now(), title: 'Thêm "$name" vào thực đơn');
  if (picked == null || !context.mounted) return false;
  try {
    await services.mealPlans.add(foodId: foodId, date: picked.$1, meal: picked.$2);
    if (context.mounted) showSnack(context, 'Đã thêm "$name" vào ${picked.$2.label.toLowerCase()} ${dayLabel(picked.$1)}');
    return true;
  } on ApiException catch (error) {
    if (context.mounted) showSnack(context, error.fields.values.firstOrNull ?? error.message);
    return false;
  }
}

Widget _thumb(String? url) => SizedBox(
      width: 40,
      height: 40,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: NetPhoto(url: url, fallback: const IconPlaceholder(icon: Icons.restaurant)),
      ),
    );

/// FR-PM01: kế hoạch theo ngày hoặc tuần.
class PlanTab extends StatefulWidget {
  const PlanTab({super.key, required this.services});

  final AppServices services;

  @override
  State<PlanTab> createState() => _PlanTabState();
}

class _PlanTabState extends State<PlanTab> with AutomaticKeepAliveClientMixin {
  late DateTime _weekStart = startOfWeek(DateTime.now());
  late DateTime _day = dateOnly(DateTime.now());
  bool _weekView = false;
  List<PlanItem> _items = const [];
  bool _loading = false;
  Object? _error;
  final Set<int> _busyIds = {};
  int _generation = 0;

  AppServices get _s => widget.services;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _s.mealPlans.range(_weekStart, _weekStart.add(const Duration(days: 6)));
      if (mounted && generation == _generation) setState(() => _items = items);
    } catch (error) {
      if (mounted && generation == _generation) setState(() => _error = error);
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  void _shiftWeek(int weeks) {
    setState(() {
      _weekStart = _weekStart.add(Duration(days: 7 * weeks));
      _day = _weekStart;
    });
    _load();
  }

  void _today() {
    final now = DateTime.now();
    setState(() {
      _weekStart = startOfWeek(now);
      _day = dateOnly(now);
    });
    _load();
  }

  Future<void> _add(DateTime day, [PlanMeal meal = PlanMeal.lunch]) async {
    final food = await showFoodPicker(context, foods: _s.library.allFoods, title: 'Thêm món ngày ${dayLabel(day)}');
    if (food == null || !mounted) return;
    final picked = await pickDateAndMeal(context, initialDate: day, initialMeal: meal, title: food.name);
    if (picked == null || !mounted) return;
    final foodId = int.tryParse(food.id);
    if (foodId == null) return;
    try {
      await _s.mealPlans.add(foodId: foodId, date: picked.$1, meal: picked.$2);
      await _load();
    } on ApiException catch (error) {
      if (mounted) showSnack(context, error.fields.values.firstOrNull ?? error.message);
    }
  }

  Future<void> _run(PlanItem item, Future<void> Function() action) async {
    if (_busyIds.contains(item.id)) return;
    setState(() => _busyIds.add(item.id));
    try {
      await action();
      await _load();
    } on ApiException catch (error) {
      if (mounted) showSnack(context, error.message);
    } finally {
      if (mounted) setState(() => _busyIds.remove(item.id));
    }
  }

  Future<void> _onAction(PlanItem item, String action) async {
    switch (action) {
      case 'eaten':
        final ok = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Đánh dấu đã ăn?'),
            content: Text('Xác nhận bạn đã ăn "${item.foodName}" (${item.meal.label.toLowerCase()} ${item.date}).'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Hủy')),
              FilledButton(
                key: const Key('confirm-eaten'),
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Đã ăn'),
              ),
            ],
          ),
        );
        if (ok == true) await _run(item, () => _s.mealPlans.setEaten(item.id, true));
      case 'uneaten':
        await _run(item, () => _s.mealPlans.setEaten(item.id, false));
      case 'move':
        final picked = await pickDateAndMeal(
          context,
          initialDate: DateTime.tryParse(item.date) ?? _day,
          initialMeal: item.meal,
          title: 'Chuyển "${item.foodName}"',
        );
        if (picked != null) await _run(item, () => _s.mealPlans.move(item.id, date: picked.$1, meal: picked.$2));
      case 'delete':
        final ok = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Xóa khỏi thực đơn?'),
            content: Text('"${item.foodName}" sẽ bị xóa khỏi kế hoạch.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Hủy')),
              FilledButton(
                key: const Key('confirm-delete-plan'),
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Xóa'),
              ),
            ],
          ),
        );
        if (ok == true) await _run(item, () => _s.mealPlans.remove(item.id));
    }
  }

  Widget _itemTile(PlanItem item) {
    final isFuture = (DateTime.tryParse(item.date) ?? DateTime.now()).isAfter(dateOnly(DateTime.now()));
    return ListTile(
      key: ValueKey('plan-item-${item.id}'),
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
      leading: _thumb(item.thumbUrl),
      title: Text(
        item.foodName,
        style: TextStyle(
          color: item.available ? AppColors.text : AppColors.mutedText,
          decoration: item.eaten ? TextDecoration.lineThrough : null,
        ),
      ),
      subtitle: Text(
        [
          item.meal.label,
          if (item.referencePrice != null) formatPrice(item.referencePrice!),
          if (!item.available) 'Món không còn trong danh mục',
          if (item.eaten) 'Đã ăn',
          if (item.note != null) item.note!,
        ].join(' · '),
        style: const TextStyle(color: AppColors.mutedText, fontSize: 12),
      ),
      trailing: _busyIds.contains(item.id)
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : PopupMenuButton<String>(
              key: ValueKey('plan-menu-${item.id}'),
              tooltip: 'Tùy chọn',
              onSelected: (value) => _onAction(item, value),
              itemBuilder: (_) => [
                if (!item.eaten && !isFuture) const PopupMenuItem(value: 'eaten', child: Text('Đánh dấu đã ăn')),
                if (item.eaten) const PopupMenuItem(value: 'uneaten', child: Text('Hoàn tác đã ăn')),
                const PopupMenuItem(value: 'move', child: Text('Chuyển ngày/bữa')),
                const PopupMenuItem(value: 'delete', child: Text('Xóa')),
              ],
            ),
    );
  }

  Widget _daySection(DateTime day, {bool showMeals = true}) {
    final iso = isoDate(day);
    final items = _items.where((item) => item.date == iso).toList();
    final isToday = iso == isoDate(DateTime.now());
    return Card(
      color: AppColors.card,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(
              '${dayLabel(day)}${isToday ? ' · Hôm nay' : ''}',
              style: TextStyle(color: isToday ? AppColors.gold : AppColors.warmText, fontWeight: FontWeight.w700),
            ),
            const Spacer(),
            IconButton(
              key: ValueKey('plan-add-$iso'),
              tooltip: 'Thêm món',
              onPressed: () => _add(day),
              icon: const Icon(Icons.add_circle_outline, color: AppColors.gold),
            ),
          ]),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.only(bottom: 4),
              child: Text('Chưa có món nào', style: TextStyle(color: AppColors.mutedText, fontSize: 12)),
            )
          else if (showMeals)
            for (final meal in PlanMeal.values) ...[
              if (items.any((item) => item.meal == meal)) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(meal.label, style: const TextStyle(color: AppColors.gold, fontSize: 12)),
                ),
                for (final item in items.where((item) => item.meal == meal)) _itemTile(item),
              ],
            ]
          else
            for (final item in items) _itemTile(item),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final days = [for (var i = 0; i < 7; i++) _weekStart.add(Duration(days: i))];
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 24), children: [
        Row(children: [
          IconButton(tooltip: 'Tuần trước', onPressed: () => _shiftWeek(-1), icon: const Icon(Icons.chevron_left)),
          Expanded(
            child: Text(
              '${dayLabel(days.first)} – ${dayLabel(days.last)}',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.warmText),
            ),
          ),
          IconButton(tooltip: 'Tuần sau', onPressed: () => _shiftWeek(1), icon: const Icon(Icons.chevron_right)),
        ]),
        Row(children: [
          TextButton(onPressed: _today, child: const Text('Hôm nay')),
          const Spacer(),
          SegmentedButton<bool>(
            key: const Key('plan-view'),
            segments: const [
              ButtonSegment(value: false, label: Text('Ngày')),
              ButtonSegment(value: true, label: Text('Tuần')),
            ],
            selected: {_weekView},
            onSelectionChanged: (value) => setState(() => _weekView = value.first),
          ),
        ]),
        if (!_weekView)
          SizedBox(
            height: 44,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              for (final day in days)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text(dayLabel(day)),
                    selected: isoDate(day) == isoDate(_day),
                    onSelected: (_) => setState(() => _day = day),
                  ),
                ),
            ]),
          ),
        const SizedBox(height: 8),
        if (_error != null)
          ErrorRetry(message: errorText(_error!), onRetry: _load)
        else if (_loading && _items.isEmpty)
          const Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: CircularProgressIndicator(color: AppColors.gold)),
          )
        else if (_weekView)
          for (final day in days) _daySection(day, showMeals: false)
        else
          _daySection(_day),
      ]),
    );
  }
}

/// FR-PM02: danh sách muốn thử.
class WantToTryTab extends StatefulWidget {
  const WantToTryTab({super.key, required this.services});

  final AppServices services;

  @override
  State<WantToTryTab> createState() => _WantToTryTabState();
}

class _WantToTryTabState extends State<WantToTryTab> with AutomaticKeepAliveClientMixin {
  final _listKey = GlobalKey<PagedListState<WantToTryItem>>();

  AppServices get _s => widget.services;

  @override
  bool get wantKeepAlive => true;

  Future<void> _addFood() async {
    final FoodItem? food = await showFoodPicker(context, foods: _s.library.allFoods, title: 'Món muốn thử');
    final id = food == null ? null : int.tryParse(food.id);
    if (id == null || !mounted) return;
    try {
      await _s.mealPlans.setWantToTry(id, true);
      _listKey.currentState?.reload();
    } on ApiException catch (error) {
      if (mounted) showSnack(context, error.message);
    }
  }

  Future<void> _remove(WantToTryItem item, void Function(WantToTryItem?) replace) async {
    try {
      await _s.mealPlans.setWantToTry(item.foodId, false);
      replace(null);
    } on ApiException catch (error) {
      if (mounted) showSnack(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      backgroundColor: AppColors.page,
      floatingActionButton: FloatingActionButton.small(
        key: const Key('want-add'),
        tooltip: 'Thêm món muốn thử',
        onPressed: _addFood,
        child: const Icon(Icons.bookmark_add_outlined),
      ),
      body: PagedList<WantToTryItem>(
        key: _listKey,
        load: (page) => _s.mealPlans.wantToTry(page: page),
        emptyMessage: 'Chưa có món muốn thử. Bấm nút + để thêm.',
        emptyIcon: Icons.bookmark_border,
        itemBuilder: (context, item, replace) => ListTile(
          key: ValueKey('want-${item.foodId}'),
          leading: _thumb(item.thumbUrl),
          title: Text(item.name, style: TextStyle(color: item.available ? AppColors.text : AppColors.mutedText)),
          subtitle: Text(
            item.available ? formatPrice(item.referencePrice) : 'Món không còn trong danh mục',
            style: const TextStyle(color: AppColors.mutedText),
          ),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            if (item.available)
              IconButton(
                tooltip: 'Thêm vào kế hoạch',
                onPressed: () => addFoodToPlan(context, _s, item.foodId, item.name),
                icon: const Icon(Icons.event_available, color: AppColors.gold),
              ),
            IconButton(
              tooltip: 'Bỏ khỏi danh sách',
              onPressed: () => _remove(item, replace),
              icon: const Icon(Icons.bookmark_remove_outlined),
            ),
          ]),
        ),
      ),
    );
  }
}

/// FR-PM02: lịch sử đã ăn theo ngày, có phân trang.
class EatenTab extends StatefulWidget {
  const EatenTab({super.key, required this.services});

  final AppServices services;

  @override
  State<EatenTab> createState() => _EatenTabState();
}

class _EatenTabState extends State<EatenTab> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return PagedList<PlanItem>(
      load: (page) => widget.services.mealPlans.eatenHistory(page: page),
      emptyMessage: 'Chưa có món nào được đánh dấu đã ăn.\nKết quả quay không tự ghi vào đây.',
      emptyIcon: Icons.history,
      itemBuilder: (context, item, _) => ListTile(
        key: ValueKey('eaten-${item.id}'),
        leading: _thumb(item.thumbUrl),
        title: Text(item.foodName, style: const TextStyle(color: AppColors.text)),
        subtitle: Text(
          '${dayLabel(DateTime.tryParse(item.date) ?? DateTime.now())} · ${item.meal.label}',
          style: const TextStyle(color: AppColors.mutedText),
        ),
      ),
    );
  }
}
