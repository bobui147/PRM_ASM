import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import '../services/food_library.dart';
import '../widgets/food_photo.dart';
import 'food_form_page.dart';

/// Màn hình quản lý kho món: tìm kiếm, lọc nhóm, yêu thích, ẩn món,
/// thêm/sửa/xóa món tự tạo.
class ManageFoodsPage extends StatefulWidget {
  const ManageFoodsPage({super.key, required this.library});

  final FoodLibrary library;

  @override
  State<ManageFoodsPage> createState() => _ManageFoodsPageState();
}

class _ManageFoodsPageState extends State<ManageFoodsPage> {
  final _searchController = TextEditingController();
  FoodCategory? _categoryFilter;
  String _query = '';

  FoodLibrary get _library => widget.library;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<FoodItem> _visibleFoods() {
    final query = _query.trim().toLowerCase();
    return _library.allFoods
        .where(
          (food) =>
              (_categoryFilter == null || food.category == _categoryFilter) &&
              (query.isEmpty || food.name.toLowerCase().contains(query)),
        )
        .toList(growable: false);
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _addFood() async {
    final food = await Navigator.of(context).push<FoodItem>(
      MaterialPageRoute(builder: (_) => FoodFormPage(library: _library)),
    );
    if (food == null || !mounted) {
      return;
    }
    _library.addCustomFood(food);
    _showMessage('Đã thêm "${food.name}" vào kho.');
  }

  Future<void> _editFood(FoodItem initial) async {
    final food = await Navigator.of(context).push<FoodItem>(
      MaterialPageRoute(
        builder: (_) => FoodFormPage(library: _library, initial: initial),
      ),
    );
    if (food == null || !mounted) {
      return;
    }
    _library.updateCustomFood(food);
    _showMessage('Đã lưu "${food.name}".');
  }

  Future<void> _deleteFood(FoodItem food) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xóa món?'),
        content: Text('"${food.name}" sẽ bị xóa khỏi kho. Lịch sử quay vẫn giữ.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            key: const Key('confirm-delete-food'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) {
      return;
    }
    _library.deleteCustomFood(food.id);
    _showMessage('Đã xóa "${food.name}".');
  }

  Widget _filterChip(FoodCategory? category, String label) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          key: ValueKey('manage-filter-${category?.name ?? 'all'}'),
          label: Text(label),
          selected: _categoryFilter == category,
          onSelected: (_) => setState(() => _categoryFilter = category),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _library,
      builder: (context, _) {
        final foods = _visibleFoods();
        return Scaffold(
          backgroundColor: AppColors.page,
          appBar: AppBar(
            backgroundColor: AppColors.page,
            foregroundColor: AppColors.warmText,
            title: const Text('Kho món ăn'),
          ),
          floatingActionButton: FloatingActionButton.extended(
            key: const Key('add-food-button'),
            onPressed: _addFood,
            backgroundColor: AppColors.gold,
            foregroundColor: AppColors.page,
            icon: const Icon(Icons.add),
            label: const Text('Thêm món'),
          ),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: TextField(
                  key: const Key('food-search-field'),
                  controller: _searchController,
                  onChanged: (value) => setState(() => _query = value),
                  style: const TextStyle(color: AppColors.text),
                  decoration: const InputDecoration(
                    hintText: 'Tìm món...',
                    hintStyle: TextStyle(color: AppColors.mutedText),
                    prefixIcon: Icon(Icons.search, color: AppColors.mutedText),
                    filled: true,
                    fillColor: AppColors.chrome,
                    isDense: true,
                    border: OutlineInputBorder(borderSide: BorderSide.none),
                  ),
                ),
              ),
              SizedBox(
                height: 44,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    _filterChip(null, 'Tất cả'),
                    for (final category in FoodCategory.values)
                      _filterChip(category, category.label),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '${foods.length} món · '
                    '${_library.favoriteIds.length} yêu thích · '
                    '${_library.excludedIds.length} đang ẩn',
                    key: const Key('manage-summary'),
                    style: const TextStyle(
                      color: AppColors.mutedText,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
              Expanded(
                child: foods.isEmpty
                    ? const Center(
                        key: Key('manage-empty'),
                        child: Text(
                          'Không tìm thấy món phù hợp.',
                          style: TextStyle(color: AppColors.mutedText),
                        ),
                      )
                    : ListView.builder(
                        key: const Key('manage-food-list'),
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                        itemCount: foods.length,
                        itemBuilder: (context, index) {
                          final food = foods[index];
                          return _FoodTile(
                            food: food,
                            favorite: _library.isFavorite(food.id),
                            excluded: _library.isExcluded(food.id),
                            onToggleFavorite: () =>
                                _library.toggleFavorite(food.id),
                            onToggleExcluded: () =>
                                _library.toggleExcluded(food.id),
                            onEdit:
                                food.isCustom ? () => _editFood(food) : null,
                            onDelete:
                                food.isCustom ? () => _deleteFood(food) : null,
                          );
                        },
                      ),
              ),
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
    required this.onToggleFavorite,
    required this.onToggleExcluded,
    this.onEdit,
    this.onDelete,
  });

  final FoodItem food;
  final bool favorite;
  final bool excluded;
  final VoidCallback onToggleFavorite;
  final VoidCallback onToggleExcluded;

  /// Chỉ món tự tạo mới sửa/xóa được.
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
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
                      food.category.label,
                      formatPrice(food.price),
                      if (food.isCustom) 'Tự tạo',
                      if (excluded) 'Đang ẩn',
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.mutedText,
                      fontSize: 12,
                    ),
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
            if (onEdit != null || onDelete != null)
              PopupMenuButton<String>(
                key: ValueKey('menu-${food.id}'),
                iconColor: AppColors.mutedText,
                onSelected: (value) =>
                    value == 'edit' ? onEdit?.call() : onDelete?.call(),
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'edit', child: Text('Sửa')),
                  PopupMenuItem(value: 'delete', child: Text('Xóa')),
                ],
              )
            else
              const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }
}
