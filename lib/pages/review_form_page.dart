import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../app_colors.dart';
import '../models/restaurant.dart';
import '../models/review.dart';
import '../services/api_client.dart';
import '../services/app_services.dart';
import '../services/restaurant_repository.dart';
import '../widgets/common.dart';
import '../widgets/food_photo.dart';

const _maxImages = 3;
const _maxImageBytes = 5 * 1024 * 1024;

/// Ảnh mới chọn từ thư viện (đã thu nhỏ bởi image_picker).
class _PickedImage {
  _PickedImage(this.name, this.bytes);

  final String name;
  final Uint8List bytes;
}

/// Viết hoặc sửa review (FR-M12). Pop(true) khi gửi thành công.
class ReviewFormPage extends StatefulWidget {
  const ReviewFormPage({super.key, required this.restaurant, required this.services, this.existing});

  final Restaurant restaurant;
  final AppServices services;
  final Review? existing;

  @override
  State<ReviewFormPage> createState() => _ReviewFormPageState();
}

class _ReviewFormPageState extends State<ReviewFormPage> {
  final _form = GlobalKey<FormState>();
  final _comment = TextEditingController();
  final _amount = TextEditingController();
  final _picker = ImagePicker();
  int _rating = 0;
  int? _foodId;
  late DateTime _visit;
  final List<ReviewImage> _kept = [];
  final List<_PickedImage> _picked = [];
  bool _sending = false;
  String? _error;
  Map<String, String> _fields = {};

  bool get _editing => widget.existing != null;
  int get _imageCount => _kept.length + _picked.length;

  @override
  void initState() {
    super.initState();
    final r = widget.existing;
    _visit = DateTime.now();
    if (r != null) {
      _rating = r.rating;
      _comment.text = r.comment;
      _amount.text = r.amountSpent?.toString() ?? '';
      _foodId = widget.restaurant.menu.any((m) => m.foodId == r.foodId) ? r.foodId : null;
      _visit = DateTime.tryParse(r.visitDate) ?? _visit;
      _kept.addAll(r.images);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _showNotices());
  }

  @override
  void dispose() {
    _comment.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _showNotices() async {
    final storage = widget.services.storage;
    final firstTime = storage != null && !storage.readReviewNoticeSeen();
    final editPublished = widget.existing?.status == ReviewStatus.published;
    if (!firstTime && !editPublished) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Lưu ý'),
        content: Text([
          if (firstTime)
            'Tên hiển thị, nội dung và ảnh của bạn sẽ hiển thị công khai sau khi được quản trị viên duyệt.',
          if (editPublished) 'Sửa review đã đăng sẽ tạm ẩn review cho tới khi được duyệt lại.',
        ].join('\n\n')),
        actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Đã hiểu'))],
      ),
    );
    if (firstTime) await storage.writeReviewNoticeSeen();
  }

  Future<void> _pickImages() async {
    final remaining = _maxImages - _imageCount;
    if (remaining <= 0) return showSnack(context, 'Tối đa $_maxImages ảnh.');
    try {
      final files = await _picker.pickMultiImage(maxWidth: 1600, maxHeight: 1600, imageQuality: 85, limit: remaining);
      for (final file in files.take(remaining)) {
        final bytes = await file.readAsBytes();
        if (bytes.length > _maxImageBytes) {
          if (mounted) showSnack(context, '${file.name} lớn hơn 5 MB sau khi nén, hãy chọn ảnh khác.');
          continue;
        }
        _picked.add(_PickedImage(file.name, bytes));
      }
      if (files.length > remaining && mounted) showSnack(context, 'Chỉ giữ $remaining ảnh đầu, tối đa $_maxImages ảnh.');
      if (mounted) setState(() {});
    } catch (error) {
      if (mounted) showSnack(context, 'Không mở được thư viện ảnh.');
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _visit.isAfter(now) ? now : _visit,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now,
      helpText: 'Ngày ghé quán',
    );
    if (date != null) setState(() => _visit = date);
  }

  String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    if (_rating == 0) {
      setState(() => _error = 'Chọn số sao');
      return;
    }
    if (!_form.currentState!.validate()) return;
    setState(() {
      _sending = true;
      _error = null;
      _fields = {};
    });
    final amount = _amount.text.trim().replaceAll('.', '');
    final input = ReviewInput(
      rating: _rating,
      comment: _comment.text.trim(),
      visitDate: _iso(_visit),
      foodId: _foodId,
      amountSpent: amount.isEmpty ? null : int.tryParse(amount),
      keepImageIds: [for (final image in _kept) image.id],
      newImages: [for (final p in _picked) UploadFile('images', p.bytes, p.name)],
    );
    try {
      final repo = widget.services.restaurants;
      if (_editing) {
        await repo.updateReview(widget.existing!.id, input);
      } else {
        await repo.createReview(widget.restaurant.id, input);
      }
      if (!mounted) return;
      showSnack(context, 'Review đã gửi và đang chờ duyệt.');
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _fields = error.fields;
        _error = switch (error.code) {
          'ACCOUNT_BLOCKED' => 'Tài khoản đang bị khóa: ${error.details['reason'] ?? ''}',
          'REVIEW_EXISTS' => 'Bạn đã viết review cho quán này. Hãy sửa review hiện có.',
          _ => error.fields.isEmpty ? error.message : 'Vui lòng kiểm tra lại các trường bên dưới.',
        };
      });
    } catch (error) {
      if (mounted) setState(() => _error = errorText(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Widget _stars() {
    return Row(children: [
      for (var i = 1; i <= 5; i++)
        IconButton(
          key: ValueKey('star-$i'),
          tooltip: '$i sao',
          onPressed: () => setState(() => _rating = i),
          icon: Icon(i <= _rating ? Icons.star : Icons.star_border, color: AppColors.gold, size: 32),
        ),
    ]);
  }

  Widget _imageTile(Widget image, VoidCallback onRemove, String label) => Stack(children: [
        SizedBox(width: 84, height: 84, child: ClipRRect(borderRadius: BorderRadius.circular(4), child: image)),
        Positioned(
          right: 0,
          top: 0,
          child: IconButton.filledTonal(
            tooltip: 'Xóa $label',
            visualDensity: VisualDensity.compact,
            onPressed: onRemove,
            icon: const Icon(Icons.close, size: 16),
          ),
        ),
      ]);

  Widget _images() {
    return Wrap(spacing: 8, runSpacing: 8, children: [
      for (final (i, image) in _kept.indexed)
        _imageTile(
          NetPhoto(url: image.thumbUrl, fallback: const IconPlaceholder(icon: Icons.image)),
          () => setState(() => _kept.remove(image)),
          'ảnh ${i + 1}',
        ),
      for (final (i, p) in _picked.indexed)
        _imageTile(
          Image.memory(p.bytes, fit: BoxFit.cover),
          () => setState(() => _picked.remove(p)),
          'ảnh mới ${i + 1}',
        ),
      if (_imageCount < _maxImages)
        SizedBox(
          width: 84,
          height: 84,
          child: OutlinedButton(
            key: const Key('add-image'),
            onPressed: _pickImages,
            child: const Icon(Icons.add_a_photo_outlined, semanticLabel: 'Thêm ảnh'),
          ),
        ),
    ]);
  }

  String get _visitLabel =>
      '${_visit.day.toString().padLeft(2, '0')}/${_visit.month.toString().padLeft(2, '0')}/${_visit.year}';

  String? _validateAmount(String? v) {
    final raw = (v ?? '').trim().replaceAll('.', '');
    if (raw.isEmpty) return null;
    final value = int.tryParse(raw);
    return value == null || value < 1000 || value > 10000000 ? 'Chi phí từ 1.000đ đến 10.000.000đ' : null;
  }

  @override
  Widget build(BuildContext context) {
    final menu = widget.restaurant.menu;
    const errorStyle = TextStyle(color: Colors.redAccent);
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(
        backgroundColor: AppColors.page,
        foregroundColor: AppColors.warmText,
        title: Text(_editing ? 'Sửa review' : 'Viết review'),
      ),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Text(widget.restaurant.name, style: const TextStyle(color: AppColors.warmText, fontSize: 18)),
          const SizedBox(height: 12),
          const Text('Đánh giá *', style: TextStyle(color: AppColors.text)),
          _stars(),
          TextFormField(
            key: const Key('review-comment'),
            controller: _comment,
            maxLength: 500,
            maxLines: 5,
            decoration: InputDecoration(
              labelText: 'Nội dung *',
              hintText: 'Món ăn, phục vụ, giá cả...',
              border: const OutlineInputBorder(),
              errorText: _fields['comment'],
            ),
            validator: (v) {
              final length = (v ?? '').trim().length;
              return length < 10 || length > 500 ? 'Nội dung phải từ 10 đến 500 ký tự' : null;
            },
          ),
          const SizedBox(height: 12),
          if (menu.isNotEmpty) ...[
            DropdownButtonFormField<int?>(
              initialValue: _foodId,
              decoration: InputDecoration(labelText: 'Món đã ăn', errorText: _fields['foodId']),
              items: [
                const DropdownMenuItem<int?>(value: null, child: Text('Không chọn')),
                for (final item in menu) DropdownMenuItem<int?>(value: item.foodId, child: Text(item.name)),
              ],
              onChanged: (value) => setState(() => _foodId = value),
            ),
            const SizedBox(height: 12),
          ],
          TextFormField(
            key: const Key('review-amount'),
            controller: _amount,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(labelText: 'Chi phí thực tế (đồng)', errorText: _fields['amountSpent']),
            validator: _validateAmount,
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Ngày ghé quán', style: TextStyle(color: AppColors.text)),
            subtitle: Text(_fields['visitDate'] ?? _visitLabel,
                style: _fields['visitDate'] != null ? errorStyle : const TextStyle(color: AppColors.mutedText)),
            trailing: const Icon(Icons.calendar_today, color: AppColors.gold),
            onTap: _pickDate,
          ),
          Text('Ảnh ($_imageCount/$_maxImages)', style: const TextStyle(color: AppColors.text)),
          const SizedBox(height: 8),
          _images(),
          if (_fields['images'] != null)
            Padding(padding: const EdgeInsets.only(top: 6), child: Text(_fields['images']!, style: errorStyle)),
          const SizedBox(height: 16),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_error!, key: const Key('review-error'), style: errorStyle),
            ),
          FilledButton(
            key: const Key('review-submit'),
            onPressed: _sending ? null : _submit,
            child: Text(_sending ? 'Đang gửi...' : (_editing ? 'Lưu và gửi duyệt lại' : 'Gửi review')),
          ),
        ]),
      ),
    );
  }
}