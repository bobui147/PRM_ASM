import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import 'food_photo.dart';

/// Hộp chọn một món trong danh mục, có ô tìm kiếm. Trả null khi hủy.
Future<FoodItem?> showFoodPicker(
  BuildContext context, {
  required List<FoodItem> foods,
  String title = 'Chọn món',
}) {
  return showModalBottomSheet<FoodItem>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    builder: (_) => _FoodPicker(foods: foods, title: title),
  );
}

String _fold(String value) {
  const from = 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ';
  const to = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';
  final lower = value.toLowerCase();
  final buffer = StringBuffer();
  for (final rune in lower.runes) {
    final ch = String.fromCharCode(rune);
    final index = from.indexOf(ch);
    buffer.write(index >= 0 ? to[index] : ch);
  }
  return buffer.toString();
}

class _FoodPicker extends StatefulWidget {
  const _FoodPicker({required this.foods, required this.title});

  final List<FoodItem> foods;
  final String title;

  @override
  State<_FoodPicker> createState() => _FoodPickerState();
}

class _FoodPickerState extends State<_FoodPicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final query = _fold(_query.trim());
    final foods = query.isEmpty
        ? widget.foods
        : widget.foods.where((food) => _fold(food.name).contains(query)).toList(growable: false);
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.75,
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Text(widget.title, style: const TextStyle(color: AppColors.warmText, fontSize: 18)),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              key: const Key('food-picker-search'),
              autofocus: false,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Tìm món...',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (value) => setState(() => _query = value),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: foods.isEmpty
                ? const Center(child: Text('Không tìm thấy món', style: TextStyle(color: AppColors.mutedText)))
                : ListView.builder(
                    itemCount: foods.length,
                    itemBuilder: (context, index) {
                      final food = foods[index];
                      return ListTile(
                        key: ValueKey('pick-food-${food.id}'),
                        leading: SizedBox(
                          width: 44,
                          height: 44,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: NetPhoto(
                              url: food.thumbUrl,
                              fallback: const IconPlaceholder(icon: Icons.restaurant),
                            ),
                          ),
                        ),
                        title: Text(food.name, style: const TextStyle(color: AppColors.text)),
                        subtitle: Text('${food.category.name} · ${formatPrice(food.price)}',
                            style: const TextStyle(color: AppColors.mutedText)),
                        onTap: () => Navigator.of(context).pop(food),
                      );
                    },
                  ),
          ),
        ]),
      ),
    );
  }
}
