import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import '../services/app_services.dart';
import '../services/food_library.dart';
import '../widgets/common.dart';
import '../widgets/food_photo.dart';
import 'restaurant_list_page.dart';

/// Tab Món ăn: tìm kiếm, lọc nhóm, yêu thích, ẩn khỏi vòng quay,
/// bấm vào món để xem các quán bán món đó (FR-M04, FR-M08).
class ManageFoodsPage extends StatefulWidget {
  const ManageFoodsPage({super.key, required this.services});

  final AppServices services;

  @override
  State<ManageFoodsPage> createState() => _ManageFoodsPageState();
}

class _ManageFoodsPageState extends State<ManageFoodsPage> {
  final _searchController = TextEditingController();
  String? _categorySlug;
  String _query = '';

  FoodLibrary get _library => widget.services.library;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<FoodItem> _visibleFoods() {
    final query = _query.trim().toLowerCase();
    return _library.allFoods
        .where((food) =>
            (_categorySlug == null || food.category.slug == _categorySlug) &&
            (query.isEmpty || food.name.toLowerCase().contains(query)))
        .toList(growable: false);
  }

  void _openRestaurants(FoodItem food) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => RestaurantListPage(food: food, services: widget.services),
    ));
  }

  Widget _filterChip(String? slug, String label) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          key: ValueKey('manage-filter-${slug ?? 'all'}'),
          label: Text(label),
          selected: _categorySlug == slug,
          onSelected: (_) => setState(() => _categorySlug = slug),
        ),
      );

  Widget _body(List<FoodItem> foods) {
    if (_library.status == CatalogStatus.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_library.status == CatalogStatus.error) {
      return Center(
        child: ErrorRetry(
          message: 'Cần kết nối mạng để tải danh sách món lần đầu.',
          onRetry: _library.refresh,
        ),
      );
    }
    final emptyMessage = _library.allFoods.isEmpty
        ? 'Chưa có món nào. Vui lòng quay lại sau.'
        : 'Không có món phù hợp.';
    return RefreshIndicator(
      onRefresh: _library.refresh,
      child: foods.isEmpty
          ? ListView(children: [EmptyState(message: emptyMessage)])
          : ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              itemCount: foods.length,
              itemBuilder: (context, index) {
                final food = foods[index];
                return _FoodTile(
                  food: food,
                  favorite: _library.isFavorite(food.id),
                  excluded: _library.isExcluded(food.id),
                  onOpen: () => _openRestaurants(food),
                  onToggleFavorite: () => _library.toggleFavorite(food.id),
                  onToggleExcluded: () => _library.toggleExcluded(food.id),
                );
              },
            ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _library,
      builder: (context, _) {
        final foods = _visibleFoods();
        return SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Text(
                  'KHO MÓN',
                  style: TextStyle(
                      color: AppColors.warmText, fontFamily: 'serif', fontSize: 22, fontWeight: FontWeight.w700),
                ),
              ),
              if (_library.usingCachedData)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(children: [
                    const Expanded(
                      child: Text('Đang dùng dữ liệu đã lưu',
                          style: TextStyle(color: AppColors.mutedText, fontSize: 12)),
                    ),
                    TextButton(onPressed: _library.refresh, child: const Text('Thử lại')),
                  ]),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextField(
                  key: const Key('manage-search'),
                  controller: _searchController,
                  onChanged: (value) => setState(() => _query = value),
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    hintText: 'Tìm món',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ),
              SizedBox(
                height: 52,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                  children: [
                    _filterChip(null, 'Tất cả'),
                    for (final category in _library.categories) _filterChip(category.slug, category.name),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Text(
                  '${foods.length} món · ${_library.favoriteIds.length} yêu thích · '
                  '${_library.excludedIds.length} đang ẩn',
                  style: const TextStyle(color: AppColors.mutedText, fontSize: 12),
                ),
              ),
              Expanded(child: _body(foods)),
            ],
          ),
        );
      },
    );
  }
}

class _FoodTile extends StatelessWidget {
  const _FoodTile({
    required this.food,
    required this.favorite,
    required this.excluded,
    required this.onOpen,
    required this.onToggleFavorite,
    required this.onToggleExcluded,
  });

  final FoodItem food;
  final bool favorite;
  final bool excluded;
  final VoidCallback onOpen;
  final VoidCallback onToggleFavorite;
  final VoidCallback onToggleExcluded;

  @override
  Widget build(BuildContext context) {
    final shops = food.restaurantCount == 0 ? 'Chưa có quán' : '${food.restaurantCount} quán';
    return Opacity(
      opacity: excluded ? 0.5 : 1,
      child: Card(
        key: ValueKey('manage-food-${food.id}'),
        color: AppColors.card,
        margin: const EdgeInsets.only(bottom: 8),
        shape: RoundedRectangleBorder(
          side: const BorderSide(color: AppColors.hairline),
          borderRadius: BorderRadius.circular(4),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onOpen,
          child: Row(
            children: [
              SizedBox(width: 64, height: 64, child: FoodPhoto(food: food)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      food.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppColors.text,
                        fontWeight: FontWeight.w700,
                        decoration: excluded ? TextDecoration.lineThrough : null,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        food.category.name,
                        formatPrice(food.price),
                        shops,
                        if (excluded) 'Đang ẩn',
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.mutedText, fontSize: 12),
                    ),
                  ],
                ),
              ),
              IconButton(
                key: ValueKey('favorite-${food.id}'),
                tooltip: favorite ? 'Bỏ yêu thích' : 'Yêu thích',
                onPressed: onToggleFavorite,
                icon: Icon(
                  favorite ? Icons.favorite : Icons.favorite_border,
                  color: favorite ? AppColors.gold : AppColors.mutedText,
                ),
              ),
              IconButton(
                key: ValueKey('exclude-${food.id}'),
                tooltip: excluded ? 'Hiện lại món' : 'Ẩn khỏi vòng quay',
                onPressed: onToggleExcluded,
                icon: Icon(
                  excluded ? Icons.visibility_off : Icons.visibility_outlined,
                  color: AppColors.mutedText,
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.mutedText),
              const SizedBox(width: 4),
            ],
          ),
        ),
      ),
    );
  }
}