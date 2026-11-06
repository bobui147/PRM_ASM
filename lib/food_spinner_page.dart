import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'models/food_item.dart';
import 'services/app_services.dart';
import 'services/food_library.dart';
import 'services/share_launcher.dart';
import 'widgets/common.dart';
import 'widgets/food_photo.dart';
import 'widgets/restaurant_section.dart';

const _pageColor = Color(0xFF15120E);
const _surfaceColor = Color(0xFF201A12);
const _chromeColor = Color(0xFF202126);
const _cardColor = Color(0xFF191A1E);
const _textColor = Color(0xFFECF1F3);
const _warmTextColor = Color(0xFFF1E1C2);
const _mutedTextColor = Color(0xFFACBDC8);
const _goldColor = Color(0xFFDFC28B);
const _deepGoldColor = Color(0xFF4A3A24);
const _hairlineColor = Color(0x52DFC28B);
const _cardWidth = 136.0;
const _cardGap = 12.0;
const _itemExtent = _cardWidth + _cardGap;
const _spinDuration = Duration(seconds: 5);

MealPeriod mealPeriodFor(DateTime time) => switch (time.hour) {
      >= 4 && < 10 => MealPeriod.breakfast,
      >= 10 && < 16 => MealPeriod.lunch,
      >= 16 => MealPeriod.dinner,
      _ => MealPeriod.lateNight,
    };

class FoodSpinnerPage extends StatefulWidget {
  const FoodSpinnerPage({super.key, required this.services});

  final AppServices services;

  @override
  State<FoodSpinnerPage> createState() => _FoodSpinnerPageState();
}

class _FoodSpinnerPageState extends State<FoodSpinnerPage>
    with SingleTickerProviderStateMixin {
  FoodLibrary get _library => widget.services.library;
  final _random = math.Random();
  late final AnimationController _controller;
  late final Animation<double> _progress;
  late List<FoodItem> _reel;
  Timer? _mealPeriodTimer;

  MealPeriod _mealPeriod = mealPeriodFor(DateTime.now());
  int _winnerIndex = 0;
  bool _isSpinning = false;
  bool _dialogOpen = false;
  FoodItem? _result;

  FoodCategory? get _category => _library.category;
  FoodBudget get _budget => _library.budget;

  List<FoodItem> get _eligibleFoods => _library.eligibleFoods(_mealPeriod);

  bool get _canSpin =>
      _eligibleFoods.isNotEmpty && !_isSpinning && !_dialogOpen;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: _spinDuration,
      // Giữ đủ thời gian quay kể cả khi hệ thống yêu cầu giảm chuyển động.
      animationBehavior: AnimationBehavior.preserve,
    )..addStatusListener(_handleAnimationStatus);
    _progress = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween(begin: 0, end: 0.89),
        weight: 80,
      ),
      TweenSequenceItem(
        tween: Tween(begin: 0.89, end: 1.0).chain(
          CurveTween(curve: Curves.easeOutQuad),
        ),
        weight: 20,
      ),
    ]).animate(_controller);
    _reel = _buildPreviewReel();
    _scheduleMealPeriodUpdate();
    _library.addListener(_handleLibraryChanged);
  }

  /// Kho món, bộ lọc hoặc món ẩn thay đổi (kể cả từ tab khác).
  void _handleLibraryChanged() {
    if (!mounted) {
      return;
    }
    if (_isSpinning || _dialogOpen) {
      // Giữ nguyên dải thẻ đang quay/đang xem kết quả.
      setState(() {});
      return;
    }
    setState(() {
      _result = null;
      _reel = _buildPreviewReel();
    });
  }

  void _scheduleMealPeriodUpdate() {
    final now = DateTime.now();
    final nextChange = switch (now.hour) {
      < 4 => DateTime(now.year, now.month, now.day, 4),
      < 10 => DateTime(now.year, now.month, now.day, 10),
      < 16 => DateTime(now.year, now.month, now.day, 16),
      _ => DateTime(now.year, now.month, now.day + 1),
    };
    _mealPeriodTimer = Timer(nextChange.difference(now), () {
      if (!mounted) {
        return;
      }
      if (!_isSpinning && !_dialogOpen) {
        setState(() {
          _mealPeriod = mealPeriodFor(DateTime.now());
          _result = null;
          _reel = _buildPreviewReel();
        });
      }
      _scheduleMealPeriodUpdate();
    });
  }

  List<FoodItem> _buildPreviewReel() {
    final foods = _eligibleFoods;
    if (foods.isEmpty) {
      _winnerIndex = 0;
      return const [];
    }
    _winnerIndex = 7;
    return List.generate(18, (index) => foods[index % foods.length]);
  }

  void _selectCategory(FoodCategory category) {
    if (_isSpinning || _dialogOpen) {
      return;
    }
    if (category.usesMealPeriods && category == _category) {
      setState(() {
        _mealPeriod = _mealPeriod.next;
        _result = null;
        _reel = _buildPreviewReel();
      });
      return;
    }
    // FoodLibrary lưu lựa chọn và báo lại qua _handleLibraryChanged.
    _library.setCategory(category);
  }

  /// Bữa khác của nhóm đang chọn có món, để gợi ý khi bữa hiện tại trống.
  List<MealPeriod> _mealsWithFoods() {
    final category = _category;
    if (category == null || !category.usesMealPeriods) return const [];
    return [
      for (final meal in MealPeriod.values)
        if (meal != _mealPeriod && _library.eligibleFoods(meal).isNotEmpty) meal,
    ];
  }

  void _selectMeal(MealPeriod meal) {
    if (_isSpinning || _dialogOpen) return;
    setState(() {
      _mealPeriod = meal;
      _result = null;
      _reel = _buildPreviewReel();
    });
  }

  void _selectBudget(FoodBudget? budget) {
    if (_isSpinning || _dialogOpen || budget == null) {
      return;
    }
    _library.setBudget(budget);
  }

  void _spin() {
    final foods = _eligibleFoods;
    if (!_canSpin || foods.isEmpty) {
      return;
    }

    final winner = pickFood(
      foods,
      _budget,
      _random,
      favoriteIds: _library.favoriteIds,
      recentIds: _library.recentFoodIds(DateTime.now()),
    );
    final winnerIndex = 30 + _random.nextInt(5);
    final reel = List.generate(
      winnerIndex + 9,
      (_) => foods[_random.nextInt(foods.length)],
    );
    reel[winnerIndex] = winner;

    _controller.duration = _spinDuration;
    _controller.reset();
    // Không đổi danh mục giữa chừng khi đang quay (FR-M01).
    _library.locked = true;
    setState(() {
      _winnerIndex = winnerIndex;
      _reel = reel;
      _result = null;
      _isSpinning = true;
    });
    _controller.forward();
  }

  void _handleAnimationStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed || !_isSpinning || !mounted) {
      return;
    }

    final result = _reel[_winnerIndex];
    setState(() {
      _result = result;
      _isSpinning = false;
      _dialogOpen = true;
    });
    _library.recordSpin(result, DateTime.now());
    WidgetsBinding.instance.addPostFrameCallback((_) => _showResult(result));
  }

  Future<void> _showResult(FoodItem food) async {
    if (!mounted) {
      return;
    }
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black.withAlpha(200),
      builder: (context) => _ResultDialog(food: food, services: widget.services),
    );
    if (mounted) {
      setState(() {
        _dialogOpen = false;
        final currentMealPeriod = mealPeriodFor(DateTime.now());
        if (currentMealPeriod != _mealPeriod) {
          _mealPeriod = currentMealPeriod;
          _result = null;
          _reel = _buildPreviewReel();
        }
      });
      // Áp dụng danh mục mới tải về trong lúc đang quay/xem kết quả (FR-M01).
      _library.locked = false;
    }
  }

  @override
  void dispose() {
    _library.removeListener(_handleLibraryChanged);
    _mealPeriodTimer?.cancel();
    _controller
      ..removeStatusListener(_handleAnimationStatus)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final status = _library.status;
    if (status != CatalogStatus.ready) {
      return Scaffold(
        backgroundColor: _pageColor,
        body: SafeArea(
          child: Center(
            child: status == CatalogStatus.loading
                ? const CircularProgressIndicator(key: Key('catalog-loading'))
                : ErrorRetry(
                    key: const Key('catalog-error'),
                    message: 'Cần kết nối mạng để tải danh sách món lần đầu.',
                    onRetry: _library.refresh,
                  ),
          ),
        ),
      );
    }
    final foods = _eligibleFoods;
    return Scaffold(
      backgroundColor: _pageColor,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildHeader(),
              if (_library.usingCachedData)
                Row(children: [
                  const Expanded(
                    child: Text('Đang dùng dữ liệu đã lưu',
                        style: TextStyle(color: _mutedTextColor, fontSize: 12)),
                  ),
                  TextButton(onPressed: _library.refresh, child: const Text('Thử lại')),
                ]),
              const SizedBox(height: 22),
              if (_library.allFoods.isEmpty)
                const EmptyState(
                  key: Key('catalog-empty'),
                  message: 'Chưa có món nào. Vui lòng quay lại sau.',
                )
              else ...[
                _buildCategoryFilters(),
                const SizedBox(height: 12),
                _buildBudgetSelector(),
                const SizedBox(height: 18),
                foods.isEmpty ? _buildEmptyReel() : _buildSpinner(),
                const SizedBox(height: 16),
                _buildSpinButton(),
                const SizedBox(height: 26),
                _buildInventory(foods),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      children: [
        const Icon(Icons.inventory_2_outlined, size: 34, color: _goldColor),
        const SizedBox(height: 8),
        const Text(
          'HÔM NAY ĂN GÌ?',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: _warmTextColor,
            fontFamily: 'serif',
            fontSize: 25,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          'Mở hòm thực thần, định đoạt bữa ăn',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: _mutedTextColor,
              ),
        ),
      ],
    );
  }

  Widget _buildCategoryFilters() {
    final categories = _library.categories;
    return SizedBox(
      height: 46,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final category = categories[index];
          final selected = category == _category;
          return ChoiceChip(
            key: ValueKey('category-${category.slug}'),
            selected: selected,
            showCheckmark: false,
            avatar: Icon(
              category.icon,
              size: 18,
              color: selected ? _warmTextColor : _mutedTextColor,
            ),
            // Nhóm dùng bữa ăn hiện tên bữa; bấm lại để đổi bữa.
            label: Text(
              category.usesMealPeriods && selected
                  ? _mealPeriod.label
                  : category.label,
            ),
            labelStyle: TextStyle(
              color: selected ? _warmTextColor : _mutedTextColor,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
            selectedColor: _deepGoldColor,
            backgroundColor: Colors.transparent,
            disabledColor: _chromeColor,
            side: BorderSide(
                color: selected ? _hairlineColor : Colors.transparent),
            shape: const StadiumBorder(),
            onSelected: _isSpinning || _dialogOpen
                ? null
                : (_) => _selectCategory(category),
          );
        },
      ),
    );
  }

  Widget _buildBudgetSelector() {
    final budgetHint = _budget.targetPrice == null
        ? 'Mọi mức giá đều có cơ hội như nhau.'
        : 'Tầm ${_budget.label} · Món quay ra có thể rẻ hoặc đắt hơn.';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 50,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: _chromeColor,
            border: Border.all(color: _hairlineColor),
            borderRadius: BorderRadius.circular(4),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<FoodBudget>(
              key: const Key('budget-selector'),
              value: _budget,
              isExpanded: true,
              dropdownColor: _chromeColor,
              borderRadius: BorderRadius.circular(4),
              iconEnabledColor: _goldColor,
              style: const TextStyle(color: _textColor, fontSize: 14),
              items: FoodBudget.values
                  .map(
                    (budget) => DropdownMenuItem(
                      value: budget,
                      child: Text(budget.label),
                    ),
                  )
                  .toList(growable: false),
              onChanged: _isSpinning || _dialogOpen ? null : _selectBudget,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          budgetHint,
          style: const TextStyle(color: _mutedTextColor, fontSize: 12),
        ),
      ],
    );
  }

  Widget _buildSpinner() {
    return Container(
      height: 180,
      decoration: BoxDecoration(
        color: _chromeColor,
        border: Border.all(color: _hairlineColor),
        borderRadius: BorderRadius.circular(4),
        boxShadow: const [
          BoxShadow(color: Color(0x1FDFC28B), blurRadius: 16),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final centerX = constraints.maxWidth / 2;
          return Stack(
            children: [
              Positioned(
                left: 0,
                right: 0,
                top: 26,
                height: 144,
                child: ClipRect(
                  child: AnimatedBuilder(
                    animation: _progress,
                    child: OverflowBox(
                      alignment: Alignment.centerLeft,
                      maxWidth: double.infinity,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: List.generate(
                          _reel.length,
                          (index) => Padding(
                            padding: const EdgeInsets.only(right: _cardGap),
                            child: _ReelCard(
                              key: index == _winnerIndex
                                  ? const Key('winner-card')
                                  : ValueKey('reel-card-$index'),
                              food: _reel[index],
                              winnerSlot: index == _winnerIndex,
                              highlighted: !_isSpinning &&
                                  _result != null &&
                                  index == _winnerIndex,
                            ),
                          ),
                        ),
                      ),
                    ),
                    builder: (context, child) {
                      final slot = _isSpinning
                          ? _winnerIndex * _progress.value
                          : _winnerIndex.toDouble();
                      final offset =
                          centerX - _cardWidth / 2 - slot * _itemExtent;
                      return Transform.translate(
                        offset: Offset(offset, 0),
                        child: child,
                      );
                    },
                  ),
                ),
              ),
              Positioned(
                key: const Key('center-pointer'),
                top: 0,
                bottom: 0,
                left: centerX - 20,
                width: 40,
                child: const Column(
                  children: [
                    Icon(Icons.arrow_drop_down, size: 38, color: _goldColor),
                    Expanded(
                        child: VerticalDivider(color: _goldColor, width: 1)),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildEmptyReel() {
    final otherMeals = _mealsWithFoods();
    return Container(
      key: const Key('empty-reel'),
      // Chiều cao tối thiểu thay vì cố định để chữ lớn hoặc nhiều nút không bị tràn.
      constraints: const BoxConstraints(minHeight: 180),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
      decoration: BoxDecoration(
        color: _chromeColor,
        border: Border.all(color: _hairlineColor),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.inventory_2_outlined, size: 40, color: _goldColor),
          const SizedBox(height: 12),
          Text(
            otherMeals.isEmpty ? 'Không có món phù hợp' : '${_mealPeriod.label} chưa có món',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: _warmTextColor,
              fontFamily: 'serif',
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            otherMeals.isEmpty
                ? 'Hãy chọn nhóm món khác hoặc hiện lại món đã ẩn ở tab Món ăn.'
                : 'Chọn bữa đang có món:',
            textAlign: TextAlign.center,
            style: const TextStyle(color: _mutedTextColor),
          ),
          if (otherMeals.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final meal in otherMeals)
                  OutlinedButton(
                    key: ValueKey('meal-${meal.name}'),
                    onPressed: () => _selectMeal(meal),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: _warmTextColor,
                      side: const BorderSide(color: _hairlineColor),
                    ),
                    child: Text(meal.label),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSpinButton() {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFB59154), Color(0xFF77562C)],
        ),
        border: Border.all(color: const Color(0xFFD4AE6A)),
        borderRadius: BorderRadius.circular(4),
      ),
      child: SizedBox(
        height: 56,
        child: FilledButton.icon(
          key: const Key('spin-button'),
          onPressed: _canSpin ? _spin : null,
          style: FilledButton.styleFrom(
            backgroundColor: Colors.transparent,
            disabledBackgroundColor: _chromeColor.withAlpha(210),
            foregroundColor: Colors.white,
            disabledForegroundColor: _mutedTextColor,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
          ),
          icon: Icon(
              _isSpinning ? Icons.hourglass_top : Icons.inventory_2_outlined),
          label: Text(
            _isSpinning ? 'ĐANG MỞ HÒM...' : 'KHAI MỞ HÒM',
            style: const TextStyle(
                fontWeight: FontWeight.w800, letterSpacing: 0.8),
          ),
        ),
      ),
    );
  }

  Widget _buildInventory(List<FoodItem> foods) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'TRONG KHO CÓ GÌ?',
                style: TextStyle(
                  color: _warmTextColor,
                  fontFamily: 'serif',
                  fontSize: 21,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Text('${foods.length} món',
                style: const TextStyle(color: _mutedTextColor)),
          ],
        ),
        const SizedBox(height: 14),
        if (foods.isEmpty)
          Container(
            key: const Key('empty-inventory'),
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: _surfaceColor,
              border: Border.all(color: _hairlineColor),
            ),
            child: const Text(
              'Kho hiện không có món phù hợp với lựa chọn của bạn.',
              textAlign: TextAlign.center,
              style: TextStyle(color: _mutedTextColor),
            ),
          )
        else
          GridView.builder(
            key: const Key('inventory-grid'),
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: foods.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 0.76,
            ),
            itemBuilder: (context, index) => _InventoryCard(
              food: foods[index],
              favorite: _library.isFavorite(foods[index].id),
            ),
          ),
      ],
    );
  }
}

class _ReelCard extends StatelessWidget {
  const _ReelCard({
    super.key,
    required this.food,
    required this.winnerSlot,
    required this.highlighted,
  });

  final FoodItem food;
  final bool winnerSlot;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final side = BorderSide(
      color: highlighted ? _goldColor : _hairlineColor,
      width: highlighted ? 2 : 1,
    );
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      width: _cardWidth,
      height: 144,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF302A20), Color(0xFF14120E)],
        ),
        border: Border(
          top: BorderSide(color: food.rarity.color, width: 2),
          left: side,
          right: side,
          bottom: side,
        ),
        boxShadow: highlighted
            ? const [BoxShadow(color: Color(0x33DFC28B), blurRadius: 18)]
            : null,
      ),
      child: Column(
        children: [
          SizedBox(
            height: 78,
            width: double.infinity,
            child: Stack(
              fit: StackFit.expand,
              children: [
                FoodPhoto(food: food),
                Positioned(
                  top: 5,
                  left: 6,
                  child: Container(
                    color: Colors.black.withAlpha(175),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 5,
                      vertical: 2,
                    ),
                    child: Text(
                      food.rarity.label.toUpperCase(),
                      style: TextStyle(
                        color: food.rarity.color,
                        fontSize: 8,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 7, 8, 7),
              child: Column(
                children: [
                  Text(
                    food.name,
                    key: winnerSlot ? const Key('winner-card-name') : null,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: _textColor,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    formatPrice(food.price),
                    style: const TextStyle(
                      color: _mutedTextColor,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InventoryCard extends StatelessWidget {
  const _InventoryCard({required this.food, required this.favorite});

  final FoodItem food;
  final bool favorite;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: ValueKey('inventory-${food.id}'),
      decoration: BoxDecoration(
        color: _cardColor,
        border: Border(
          top: BorderSide(color: food.rarity.color, width: 2),
          left: const BorderSide(color: _hairlineColor),
          right: const BorderSide(color: _hairlineColor),
          bottom: const BorderSide(color: _hairlineColor),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: SizedBox(
              width: double.infinity,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  FoodPhoto(food: food),
                  if (favorite)
                    Positioned(
                      top: 6,
                      right: 6,
                      child: Icon(
                        Icons.favorite,
                        key: ValueKey('inventory-favorite-${food.id}'),
                        size: 18,
                        color: _goldColor,
                      ),
                    ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  food.category.label.toUpperCase(),
                  style: const TextStyle(
                    color: _mutedTextColor,
                    fontSize: 9,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  food.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _textColor,
                    fontFamily: 'serif',
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        formatPrice(food.price),
                        style: const TextStyle(
                          color: _warmTextColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Text(
                      food.rarity.label.toUpperCase(),
                      style: TextStyle(
                        color: food.rarity.color,
                        fontSize: 8,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ResultDialog extends StatelessWidget {
  const _ResultDialog({required this.food, required this.services});

  final FoodItem food;
  final AppServices services;

  FoodLibrary get library => services.library;

  Future<void> _share(BuildContext context) async {
    final shared = await shareText(shareMessage(food));
    if (!shared && context.mounted) {
      showSnack(context, 'Không thể mở bảng chia sẻ.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      key: const Key('result-dialog'),
      insetPadding: const EdgeInsets.all(16),
      backgroundColor: Colors.transparent,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 340,
          maxHeight: MediaQuery.sizeOf(context).height - 32,
        ),
        child: Container(
          decoration: BoxDecoration(
            color: _surfaceColor,
            border: Border.all(color: FoodRarity.ancient.color),
            borderRadius: BorderRadius.circular(4),
            boxShadow: const [
              BoxShadow(color: Color(0x33D6B552), blurRadius: 30),
            ],
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  food.rarity.label.toUpperCase(),
                  style: TextStyle(
                    color: food.rarity.color,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.7,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'HÔM NAY BẠN ĂN',
                  style: TextStyle(color: _mutedTextColor, fontSize: 11),
                ),
                const SizedBox(height: 6),
                Text(
                  food.name,
                  key: const Key('result-name'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: _warmTextColor,
                    fontFamily: 'serif',
                    fontSize: 25,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 24),
                Container(
                  width: 240,
                  height: 160,
                  decoration: BoxDecoration(
                    color: _cardColor,
                    border: Border.all(color: _hairlineColor),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: FoodPhoto(food: food, large: true),
                ),
                const SizedBox(height: 20),
                Text(
                  'Giá tham khảo · ${formatPrice(food.price)}',
                  style: const TextStyle(color: _textColor, fontSize: 16),
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: SizedBox(
                        height: 50,
                        child: ListenableBuilder(
                          listenable: library,
                          builder: (context, _) {
                            final favorite = library.isFavorite(food.id);
                            return OutlinedButton.icon(
                              key: const Key('favorite-button'),
                              onPressed: () => library.toggleFavorite(food.id),
                              style: OutlinedButton.styleFrom(
                                foregroundColor:
                                    favorite ? _goldColor : _warmTextColor,
                                side: BorderSide(
                                  color: favorite ? _goldColor : _hairlineColor,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(4),
                                ),
                              ),
                              icon: Icon(
                                favorite
                                    ? Icons.favorite
                                    : Icons.favorite_border,
                              ),
                              label: Text(
                                favorite ? 'ĐÃ THÍCH' : 'YÊU THÍCH',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: SizedBox(
                        height: 50,
                        child: OutlinedButton.icon(
                          key: const Key('share-button'),
                          onPressed: () => _share(context),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: _warmTextColor,
                            side: const BorderSide(color: _hairlineColor),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                          icon: const Icon(Icons.share_outlined),
                          label: const Text(
                            'CHIA SẺ',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                RestaurantSection(food: food, services: services),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: OutlinedButton(
                    key: const Key('continue-button'),
                    onPressed: () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: _warmTextColor,
                      side: const BorderSide(color: _hairlineColor),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    child: const Text(
                      'TIẾP TỤC',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
