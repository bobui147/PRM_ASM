import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import '../models/group_room.dart';
import '../models/meal_plan.dart';
import '../services/api_client.dart';
import '../services/app_services.dart';
import '../services/share_launcher.dart';
import '../widgets/common.dart';
import '../widgets/food_photo.dart';
import 'auth_pages.dart';

const _pollInterval = Duration(seconds: 3);

const _mealLabels = {
  'breakfast': 'Ăn sáng',
  'lunch': 'Ăn trưa',
  'dinner': 'Ăn tối',
  'late_night': 'Ăn đêm',
};

/// Mở luồng chọn món theo nhóm: vào lại phòng đang hoạt động nếu có,
/// nếu không thì sang màn hình tạo/tham gia (FR-G01).
Future<void> openGroupPicking(BuildContext context, AppServices services) async {
  if (!await ensureSignedIn(context, services) || !context.mounted) return;
  GroupRoom? current;
  try {
    current = await services.groups.current();
  } on ApiException catch (error) {
    if (context.mounted) showSnack(context, error.message);
    return;
  }
  if (!context.mounted) return;
  final navigator = Navigator.of(context);
  final room = current;
  if (room != null) {
    navigator.push(MaterialPageRoute(builder: (_) => GroupRoomPage(services: services, initial: room)));
  } else {
    navigator.push(MaterialPageRoute(builder: (_) => GroupLobbyPage(services: services)));
  }
}

/// Tạo phòng (chọn nhóm món, bữa, ngân sách) hoặc nhập mã để tham gia.
class GroupLobbyPage extends StatefulWidget {
  const GroupLobbyPage({super.key, required this.services});

  final AppServices services;

  @override
  State<GroupLobbyPage> createState() => _GroupLobbyPageState();
}

class _GroupLobbyPageState extends State<GroupLobbyPage> {
  final _code = TextEditingController();
  RoomFilters _filters = const RoomFilters();
  bool _busy = false;
  String? _joinError;

  AppServices get _s => widget.services;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _enter(Future<GroupRoom> Function() action) async {
    setState(() {
      _busy = true;
      _joinError = null;
    });
    try {
      final room = await action();
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => GroupRoomPage(services: _s, initial: room)),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      if (error.code == 'ALREADY_IN_ROOM') {
        final current = await _s.groups.current();
        if (current != null && mounted) {
          showSnack(context, 'Bạn đang ở một phòng khác, đã mở lại phòng đó.');
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => GroupRoomPage(services: _s, initial: current)),
          );
          return;
        }
      }
      setState(() => _joinError = error.fields['code'] ?? error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(
        backgroundColor: AppColors.page,
        foregroundColor: AppColors.warmText,
        title: const Text('Chọn món cùng nhóm'),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Tham gia phòng', style: TextStyle(color: AppColors.warmText, fontSize: 16)),
        const SizedBox(height: 8),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: TextField(
              key: const Key('room-code'),
              controller: _code,
              textCapitalization: TextCapitalization.characters,
              maxLength: 9,
              decoration: InputDecoration(
                labelText: 'Mã phòng (8 ký tự)',
                border: const OutlineInputBorder(),
                errorText: _joinError,
                counterText: '',
              ),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            key: const Key('room-join'),
            onPressed: _busy
                ? null
                : () {
                    final code = _code.text.trim();
                    if (code.isEmpty) {
                      setState(() => _joinError = 'Nhập mã phòng');
                      return;
                    }
                    _enter(() => _s.groups.join(code));
                  },
            child: const Text('Vào'),
          ),
        ]),
        const Divider(height: 32),
        const Text('Hoặc tạo phòng mới', style: TextStyle(color: AppColors.warmText, fontSize: 16)),
        const SizedBox(height: 8),
        RoomFiltersForm(
          categories: _s.library.categories,
          value: _filters,
          onChanged: (value) => setState(() => _filters = value),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          key: const Key('room-create'),
          onPressed: _busy ? null : () => _enter(() => _s.groups.create(_filters)),
          icon: const Icon(Icons.group_add),
          label: Text(_busy ? 'Đang xử lý...' : 'Tạo phòng'),
        ),
        const SizedBox(height: 12),
        const Text(
          'Mỗi người đánh dấu món muốn ăn hoặc loại món không ăn. Một người loại là món bị loại. '
          'Chủ phòng chọn bỏ phiếu hoặc quay để chốt món chung. Phòng tối đa 10 người, hết hạn sau 24 giờ.',
          style: TextStyle(color: AppColors.mutedText, fontSize: 12),
        ),
      ]),
    );
  }
}

/// Bộ lọc phòng: nhóm món, bữa (nếu nhóm dùng bữa), ngân sách tối đa.
class RoomFiltersForm extends StatelessWidget {
  const RoomFiltersForm({super.key, required this.categories, required this.value, required this.onChanged});

  final List<FoodCategory> categories;
  final RoomFilters value;
  final ValueChanged<RoomFilters> onChanged;

  static const budgets = <int?>[null, 50000, 100000, 150000];

  @override
  Widget build(BuildContext context) {
    final category = categories.where((c) => c.slug == value.categorySlug).firstOrNull;
    RoomFilters copy({String? slug, String? meal, int? price, bool clearMeal = false}) => RoomFilters(
          categorySlug: slug ?? value.categorySlug,
          mealPeriod: clearMeal ? null : (meal ?? value.mealPeriod),
          maxPrice: price ?? value.maxPrice,
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Nhóm món', style: TextStyle(color: AppColors.text)),
      Wrap(spacing: 6, children: [
        ChoiceChip(
          label: const Text('Tất cả'),
          selected: value.categorySlug == null,
          onSelected: (_) => onChanged(RoomFilters(maxPrice: value.maxPrice)),
        ),
        for (final c in categories)
          ChoiceChip(
            key: ValueKey('room-cat-${c.slug}'),
            label: Text(c.name),
            selected: value.categorySlug == c.slug,
            onSelected: (_) => onChanged(copy(slug: c.slug, clearMeal: !c.usesMealPeriods)),
          ),
      ]),
      if (category?.usesMealPeriods == true) ...[
        const SizedBox(height: 8),
        const Text('Bữa', style: TextStyle(color: AppColors.text)),
        Wrap(spacing: 6, children: [
          ChoiceChip(
            label: const Text('Mọi bữa'),
            selected: value.mealPeriod == null,
            onSelected: (_) => onChanged(copy(clearMeal: true)),
          ),
          for (final entry in _mealLabels.entries)
            ChoiceChip(
              label: Text(entry.value),
              selected: value.mealPeriod == entry.key,
              onSelected: (_) => onChanged(copy(meal: entry.key)),
            ),
        ]),
      ],
      const SizedBox(height: 8),
      const Text('Ngân sách mỗi người', style: TextStyle(color: AppColors.text)),
      Wrap(spacing: 6, children: [
        for (final budget in budgets)
          ChoiceChip(
            label: Text(budget == null ? 'Không giới hạn' : 'Tối đa ${formatPrice(budget)}'),
            selected: value.maxPrice == budget,
            onSelected: (_) => onChanged(RoomFilters(
              categorySlug: value.categorySlug,
              mealPeriod: value.mealPeriod,
              maxPrice: budget,
            )),
          ),
      ]),
    ]);
  }
}

/// Màn hình phòng: polling trạng thái từ server, mọi người thấy cùng kết quả (FR-G02).
class GroupRoomPage extends StatefulWidget {
  const GroupRoomPage({super.key, required this.services, required this.initial, this.pollInterval = _pollInterval});

  final AppServices services;
  final GroupRoom initial;
  final Duration pollInterval;

  @override
  State<GroupRoomPage> createState() => _GroupRoomPageState();
}

class _GroupRoomPageState extends State<GroupRoomPage> with WidgetsBindingObserver {
  late GroupRoom _room = widget.initial;
  Timer? _timer;
  bool _busy = false;
  bool _polling = false;
  bool _offline = false;

  AppServices get _s => widget.services;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startPolling();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  /// Không gọi server khi app chạy nền; mở lại thì tải ngay trạng thái mới.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startPolling();
      _poll();
    } else if (state == AppLifecycleState.paused) {
      _timer?.cancel();
    }
  }

  void _startPolling() {
    _timer?.cancel();
    if (!_room.isActive) return;
    _timer = Timer.periodic(widget.pollInterval, (_) => _poll());
  }

  Future<void> _poll() async {
    if (_polling || _busy || !mounted) return;
    _polling = true;
    try {
      final next = await _s.groups.state(_room.id, knownVersion: _room.version);
      if (!mounted) return;
      setState(() {
        _offline = false;
        if (next != null) _room = next;
      });
      if (!_room.isActive) _timer?.cancel();
    } on ApiException catch (error) {
      if (!mounted) return;
      if (error.code == 'ROOM_NOT_FOUND') {
        _timer?.cancel();
        setState(() => _room = _closedCopy());
      } else if (error.isNetwork) {
        setState(() => _offline = true);
      }
    } finally {
      _polling = false;
    }
  }

  GroupRoom _closedCopy() => GroupRoom(
        id: _room.id,
        code: _room.code,
        phase: RoomPhase.closed,
        version: _room.version,
        isOwner: _room.isOwner,
        ownerName: _room.ownerName,
        members: _room.members,
        result: _room.result,
      );

  /// Chạy thao tác ghi; khóa nút để chống gửi lặp.
  Future<void> _act(Future<GroupRoom> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final room = await action();
      if (mounted) setState(() => _room = room);
      if (!room.isActive) _timer?.cancel();
    } on ApiException catch (error) {
      if (!mounted) return;
      showSnack(context, error.message);
      // Trạng thái đã đổi ở máy khác: tải lại ngay.
      if (error.code == 'ROOM_PHASE_CHANGED' || error.code == 'ROOM_CLOSED') {
        _busy = false;
        await _poll();
      } else if (error.code == 'ROOM_NOT_FOUND') {
        setState(() => _room = _closedCopy());
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _confirm(String title, String message, String action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Hủy')),
          FilledButton(
            key: const Key('room-confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: Text(action),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _leave() async {
    if (_room.isActive) {
      final ownerWarning = _room.isOwner ? ' Bạn là chủ phòng nên phòng sẽ kết thúc với mọi người.' : '';
      if (!await _confirm('Rời phòng?', 'Lựa chọn của bạn trong phòng sẽ bị xóa.$ownerWarning', 'Rời phòng')) return;
    }
    setState(() => _busy = true);
    try {
      await _s.groups.leave(_room.id);
    } on ApiException catch (error) {
      // Phòng không còn: vẫn cho thoát.
      if (error.code != 'ROOM_NOT_FOUND' && mounted) {
        showSnack(context, error.message);
        setState(() => _busy = false);
        return;
      }
    }
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _close() async {
    if (!await _confirm('Kết thúc phòng?', 'Mọi thành viên sẽ thấy phòng đã kết thúc.', 'Kết thúc')) return;
    await _act(() => _s.groups.close(_room.id));
  }

  Future<void> _copyCode() async {
    await Clipboard.setData(ClipboardData(text: _room.code));
    if (mounted) showSnack(context, 'Đã sao chép mã ${_room.code}');
  }

  Future<void> _share() async {
    final ok = await shareText('Vào phòng chọn món "Hôm nay ăn gì?" với mình nhé! Mã phòng: ${_room.code}');
    if (!ok) await _copyCode();
  }

  Future<void> _editFilters() async {
    var draft = _room.filters;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheet) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            RoomFiltersForm(
              categories: _s.library.categories,
              value: draft,
              onChanged: (value) => setSheet(() => draft = value),
            ),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Lưu bộ lọc')),
          ]),
        ),
      ),
    );
    if (ok == true) await _act(() => _s.groups.updateFilters(_room.id, draft));
  }

  Future<void> _addResultToPlan(RoomResult result) async {
    final foodId = result.foodId;
    if (foodId == null) return;
    final now = DateTime.now();
    final meal = now.hour < 10 ? PlanMeal.breakfast : (now.hour < 15 ? PlanMeal.lunch : PlanMeal.dinner);
    try {
      await _s.mealPlans.add(foodId: foodId, date: now, meal: meal);
      if (mounted) showSnack(context, 'Đã thêm "${result.name}" vào thực đơn hôm nay (${meal.label}).');
    } on ApiException catch (error) {
      if (mounted) showSnack(context, error.message);
    }
  }

  String get _filterSummary {
    final f = _room.filters;
    return [
      f.categoryName ?? 'Mọi nhóm món',
      if (f.mealPeriod != null) _mealLabels[f.mealPeriod] ?? '',
      f.maxPrice == null ? 'Không giới hạn giá' : 'Tối đa ${formatPrice(f.maxPrice!)}',
    ].join(' · ');
  }

  Widget _header() {
    return Card(
      color: AppColors.card,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Text('Mã phòng: ', style: TextStyle(color: AppColors.mutedText)),
            SelectableText(
              _room.code,
              key: const Key('room-code-label'),
              style: const TextStyle(color: AppColors.gold, fontSize: 22, letterSpacing: 3, fontWeight: FontWeight.w700),
            ),
            const Spacer(),
            IconButton(tooltip: 'Sao chép mã', onPressed: _copyCode, icon: const Icon(Icons.copy)),
            IconButton(tooltip: 'Chia sẻ mã', onPressed: _share, icon: const Icon(Icons.share)),
          ]),
          Text(_filterSummary, style: const TextStyle(color: AppColors.text)),
          const SizedBox(height: 8),
          Text('Thành viên (${_room.members.length}/${_room.maxMembers})',
              style: const TextStyle(color: AppColors.mutedText, fontSize: 12)),
          const SizedBox(height: 4),
          Wrap(spacing: 6, runSpacing: 4, children: [
            for (final m in _room.members)
              Chip(
                visualDensity: VisualDensity.compact,
                avatar: Icon(m.isOwner ? Icons.star : Icons.person, size: 16, color: AppColors.gold),
                label: Text(
                  '${m.displayName}${_room.phase == RoomPhase.voting && m.hasVoted ? ' ✓' : ''}',
                ),
              ),
          ]),
        ]),
      ),
    );
  }

  Widget _selecting() {
    final candidates = _room.foods.where((f) => f.isCandidate).length;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Expanded(
          child: Text(
            '$candidates món ứng viên · Bấm 👍 để chọn, 🚫 để loại',
            key: const Key('candidate-count'),
            style: const TextStyle(color: AppColors.warmText),
          ),
        ),
        if (_room.isOwner) TextButton(onPressed: _busy ? null : _editFilters, child: const Text('Đổi bộ lọc')),
      ]),
      if (_room.foods.isEmpty)
        const EmptyState(message: 'Không có món nào khớp bộ lọc. Chủ phòng hãy đổi bộ lọc.'),
      for (final food in _room.foods)
        Card(
          key: ValueKey('room-food-${food.id}'),
          color: food.isCandidate ? AppColors.card : AppColors.page,
          child: ListTile(
            leading: SizedBox(
              width: 44,
              height: 44,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: NetPhoto(url: food.thumbUrl, fallback: const IconPlaceholder(icon: Icons.restaurant)),
              ),
            ),
            title: Text(
              food.name,
              style: TextStyle(
                color: food.isCandidate ? AppColors.text : AppColors.mutedText,
                decoration: food.excludes > 0 ? TextDecoration.lineThrough : null,
              ),
            ),
            subtitle: Text(
              '${formatPrice(food.referencePrice)} · ${food.picks} chọn · ${food.excludes} loại',
              style: const TextStyle(color: AppColors.mutedText, fontSize: 12),
            ),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              IconButton(
                key: ValueKey('pick-${food.id}'),
                tooltip: food.myMark == FoodMark.pick ? 'Bỏ chọn' : 'Chọn món này',
                isSelected: food.myMark == FoodMark.pick,
                onPressed: _busy
                    ? null
                    : () => _act(() => _s.groups
                        .mark(_room.id, food.id, food.myMark == FoodMark.pick ? null : FoodMark.pick)),
                icon: const Icon(Icons.thumb_up_alt_outlined),
                selectedIcon: const Icon(Icons.thumb_up_alt, color: Colors.lightGreenAccent),
              ),
              IconButton(
                key: ValueKey('exclude-${food.id}'),
                tooltip: food.myMark == FoodMark.exclude ? 'Bỏ loại' : 'Loại món này',
                isSelected: food.myMark == FoodMark.exclude,
                onPressed: _busy
                    ? null
                    : () => _act(() => _s.groups
                        .mark(_room.id, food.id, food.myMark == FoodMark.exclude ? null : FoodMark.exclude)),
                icon: const Icon(Icons.block),
                selectedIcon: const Icon(Icons.block, color: Colors.redAccent),
              ),
            ]),
          ),
        ),
      const SizedBox(height: 12),
      if (_room.isOwner)
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              key: const Key('room-start-vote'),
              onPressed: _busy ? null : () => _act(() => _s.groups.start(_room.id, 'vote')),
              icon: const Icon(Icons.how_to_vote_outlined),
              label: const Text('Bỏ phiếu'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: FilledButton.icon(
              key: const Key('room-start-spin'),
              onPressed: _busy ? null : () => _act(() => _s.groups.start(_room.id, 'spin')),
              icon: const Icon(Icons.casino_outlined),
              label: const Text('Quay luôn'),
            ),
          ),
        ])
      else
        const Text('Chờ chủ phòng bắt đầu bỏ phiếu hoặc quay...',
            textAlign: TextAlign.center, style: TextStyle(color: AppColors.mutedText)),
    ]);
  }

  Widget _voting() {
    final voted = _room.members.where((m) => m.hasVoted).length;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Bỏ phiếu: $voted/${_room.members.length} người đã bỏ phiếu',
          style: const TextStyle(color: AppColors.warmText)),
      const SizedBox(height: 8),
      RadioGroup<int>(
        groupValue: _room.myVote,
        onChanged: (value) {
          if (value != null && !_busy) _act(() => _s.groups.vote(_room.id, value));
        },
        child: Column(children: [
          for (final c in _room.candidates)
            RadioListTile<int>(
              key: ValueKey('vote-${c.id}'),
              value: c.id,
              title: Text(c.name, style: const TextStyle(color: AppColors.text)),
              subtitle: Text(formatPrice(c.referencePrice), style: const TextStyle(color: AppColors.mutedText)),
              secondary: Text('${c.votes} phiếu', style: const TextStyle(color: AppColors.gold)),
            ),
        ]),
      ),
      const SizedBox(height: 12),
      if (_room.isOwner) ...[
        FilledButton.icon(
          key: const Key('room-finalize'),
          onPressed: _busy ? null : () => _act(() => _s.groups.finalize(_room.id)),
          icon: const Icon(Icons.check_circle_outline),
          label: const Text('Chốt kết quả'),
        ),
        TextButton(
          onPressed: _busy ? null : () => _act(() => _s.groups.backToSelecting(_room.id)),
          child: const Text('Quay lại bước chọn món'),
        ),
        const Text('Hòa phiếu thì server quay ngẫu nhiên trong các món hòa. Người chưa bỏ phiếu không được tính.',
            style: TextStyle(color: AppColors.mutedText, fontSize: 12)),
      ] else
        const Text('Bạn có thể đổi phiếu tới khi chủ phòng chốt.',
            textAlign: TextAlign.center, style: TextStyle(color: AppColors.mutedText)),
    ]);
  }

  Widget _result(RoomResult result) {
    return Card(
      key: const Key('room-result'),
      color: AppColors.surface,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          const Text('Cả nhóm sẽ ăn', style: TextStyle(color: AppColors.mutedText)),
          const SizedBox(height: 8),
          if (result.thumbUrl != null)
            SizedBox(
              width: 120,
              height: 120,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: NetPhoto(url: result.thumbUrl, fallback: const IconPlaceholder(icon: Icons.restaurant)),
              ),
            ),
          const SizedBox(height: 8),
          Text(result.name, style: const TextStyle(color: AppColors.gold, fontSize: 24, fontWeight: FontWeight.w700)),
          if (result.referencePrice != null)
            Text('Khoảng ${formatPrice(result.referencePrice!)}', style: const TextStyle(color: AppColors.text)),
          const SizedBox(height: 4),
          Text(result.methodLabel, style: const TextStyle(color: AppColors.mutedText, fontSize: 12)),
          if (result.foodId != null) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => _addResultToPlan(result),
              icon: const Icon(Icons.event_note),
              label: const Text('Thêm vào thực đơn hôm nay'),
            ),
          ],
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final room = _room;
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(
        backgroundColor: AppColors.page,
        foregroundColor: AppColors.warmText,
        title: Text(room.phase.label),
        actions: [
          if (room.isOwner && room.isActive)
            IconButton(
              key: const Key('room-close'),
              tooltip: 'Kết thúc phòng',
              onPressed: _busy ? null : _close,
              icon: const Icon(Icons.stop_circle_outlined),
            ),
          IconButton(
            key: const Key('room-leave'),
            tooltip: room.isActive ? 'Rời phòng' : 'Thoát',
            onPressed: _busy ? null : _leave,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _poll,
        child: ListView(padding: const EdgeInsets.all(12), children: [
          if (_offline)
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text('Mất kết nối, đang thử lại...', style: TextStyle(color: Colors.orangeAccent)),
            ),
          _header(),
          const SizedBox(height: 8),
          if (room.phase == RoomPhase.closed) ...[
            EmptyState(
              key: const Key('room-closed'),
              icon: Icons.door_back_door_outlined,
              message: room.closedMessage,
              action: FilledButton(onPressed: _leave, child: const Text('Thoát phòng')),
            ),
            if (room.result != null) _result(room.result!),
          ] else if (room.phase == RoomPhase.finished && room.result != null)
            _result(room.result!)
          else if (room.phase == RoomPhase.voting)
            _voting()
          else
            _selecting(),
        ]),
      ),
    );
  }
}
