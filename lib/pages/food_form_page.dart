import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import '../services/food_library.dart';

const maxFoodNameLength = 40;

/// Giá nhập theo nghìn đồng (1–999) để khớp với `formatPrice` hiện có.
const minPriceThousands = 1;
const maxPriceThousands = 999;

/// Kiểm tra tên món. Trả về thông báo lỗi hoặc null nếu hợp lệ.
String? validateFoodName(
  String? value,
  FoodLibrary library, {
  String? exceptId,
}) {
  final name = value?.trim() ?? '';
  if (name.isEmpty) {
    return 'Nhập tên món';
  }
  if (name.length > maxFoodNameLength) {
    return 'Tên tối đa $maxFoodNameLength ký tự';
  }
  if (library.nameExists(name, exceptId: exceptId)) {
    return 'Đã có món tên này trong kho';
  }
  return null;
}

/// Kiểm tra giá (nghìn đồng). Trả về thông báo lỗi hoặc null nếu hợp lệ.
String? validatePriceThousands(String? value) {
  final price = int.tryParse(value?.trim() ?? '');
  if (price == null) {
    return 'Nhập giá bằng số';
  }
  if (price < minPriceThousands || price > maxPriceThousands) {
    return 'Giá từ $minPriceThousands đến $maxPriceThousands nghìn đồng';
  }
  return null;
}

/// Form thêm hoặc sửa món tự tạo. Trả về [FoodItem] qua `Navigator.pop`.
class FoodFormPage extends StatefulWidget {
  const FoodFormPage({super.key, required this.library, this.initial});

  final FoodLibrary library;

  /// Món cần sửa; null là thêm món mới.
  final FoodItem? initial;

  @override
  State<FoodFormPage> createState() => _FoodFormPageState();
}

class _FoodFormPageState extends State<FoodFormPage> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _priceController;
  late FoodCategory _category;
  late Set<MealPeriod> _mealPeriods;
  bool _mealError = false;

  bool get _isEditing => widget.initial != null;

  @override
  void initState() {
    super.initState();
    final initial = widget.initial;
    _nameController = TextEditingController(text: initial?.name ?? '');
    _priceController = TextEditingController(
      text: initial == null ? '' : '${initial.price ~/ 1000}',
    );
    _category = initial?.category ?? FoodCategory.lunch;
    _mealPeriods = Set.of(
      initial?.mealPeriods ?? const {MealPeriod.lunch, MealPeriod.dinner},
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  void _save() {
    final formValid = _formKey.currentState!.validate();
    final mealValid =
        _category != FoodCategory.lunch || _mealPeriods.isNotEmpty;
    setState(() => _mealError = !mealValid);
    if (!formValid || !mealValid) {
      return;
    }

    final food = createCustomFood(
      id: widget.initial?.id ??
          'custom-${DateTime.now().microsecondsSinceEpoch}',
      name: _nameController.text.trim(),
      category: _category,
      price: int.parse(_priceController.text.trim()) * 1000,
      mealPeriods: _mealPeriods,
    );
    Navigator.of(context).pop(food);
  }

  InputDecoration _decoration(String label, {String? suffix}) =>
      InputDecoration(
        labelText: label,
        suffixText: suffix,
        labelStyle: const TextStyle(color: AppColors.mutedText),
        filled: true,
        fillColor: AppColors.chrome,
        enabledBorder: const OutlineInputBorder(
          borderSide: BorderSide(color: AppColors.hairline),
        ),
        focusedBorder: const OutlineInputBorder(
          borderSide: BorderSide(color: AppColors.gold),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(
        backgroundColor: AppColors.page,
        foregroundColor: AppColors.warmText,
        title: Text(_isEditing ? 'Sửa món' : 'Thêm món'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              key: const Key('food-name-field'),
              controller: _nameController,
              maxLength: maxFoodNameLength,
              textCapitalization: TextCapitalization.sentences,
              style: const TextStyle(color: AppColors.text),
              decoration: _decoration('Tên món'),
              validator: (value) => validateFoodName(
                value,
                widget.library,
                exceptId: widget.initial?.id,
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('food-price-field'),
              controller: _priceController,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(3),
              ],
              style: const TextStyle(color: AppColors.text),
              decoration: _decoration('Giá tham khảo', suffix: '.000đ'),
              validator: validatePriceThousands,
            ),
            const SizedBox(height: 20),
            const Text(
              'Nhóm món',
              style: TextStyle(color: AppColors.warmText),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final category in FoodCategory.values)
                  ChoiceChip(
                    key: ValueKey('form-category-${category.name}'),
                    label: Text(category.label),
                    avatar: Icon(category.icon, size: 18),
                    selected: _category == category,
                    onSelected: (_) => setState(() {
                      _category = category;
                      _mealError = false;
                    }),
                  ),
              ],
            ),
            if (_category == FoodCategory.lunch) ...[
              const SizedBox(height: 20),
              const Text(
                'Bữa phù hợp',
                style: TextStyle(color: AppColors.warmText),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final meal in MealPeriod.values)
                    FilterChip(
                      key: ValueKey('form-meal-${meal.name}'),
                      label: Text(meal.label),
                      selected: _mealPeriods.contains(meal),
                      onSelected: (selected) => setState(() {
                        if (selected) {
                          _mealPeriods.add(meal);
                        } else {
                          _mealPeriods.remove(meal);
                        }
                        _mealError = false;
                      }),
                    ),
                ],
              ),
              if (_mealError)
                const Padding(
                  key: Key('meal-error'),
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    'Chọn ít nhất một bữa',
                    style: TextStyle(color: Color(0xFFD55D68)),
                  ),
                ),
            ],
            const SizedBox(height: 28),
            SizedBox(
              height: 50,
              child: FilledButton.icon(
                key: const Key('save-food-button'),
                onPressed: _save,
                icon: const Icon(Icons.check),
                label: Text(
                  _isEditing ? 'LƯU THAY ĐỔI' : 'THÊM VÀO KHO',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
