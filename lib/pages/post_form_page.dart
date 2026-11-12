import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../app_colors.dart';
import '../models/community.dart';
import '../models/review.dart';
import '../services/api_client.dart';
import '../services/app_services.dart';
import '../services/community_repository.dart';
import '../widgets/common.dart';
import '../widgets/food_photo.dart';
import '../widgets/food_picker.dart';

const _maxImages = 3;
const _maxImageBytes = 5 * 1024 * 1024;
const _maxContent = 2000;

class _PickedImage {
  _PickedImage(this.name, this.bytes);

  final String name;
  final Uint8List bytes;
}

/// Đăng hoặc sửa bài cộng đồng (FR-C01). Pop(Post) khi thành công.
class PostFormPage extends StatefulWidget {
  const PostFormPage({super.key, required this.services, this.existing, this.picker});

  final AppServices services;
  final Post? existing;

  /// Cho widget test thay thư viện ảnh.
  final ImagePicker? picker;

  @override
  State<PostFormPage> createState() => _PostFormPageState();
}

class _PostFormPageState extends State<PostFormPage> {
  final _content = TextEditingController();
  late final ImagePicker _picker = widget.picker ?? ImagePicker();
  final List<ReviewImage> _kept = [];
  final List<_PickedImage> _picked = [];
  PostLink? _food;
  PostLink? _restaurant;
  bool _sending = false;
  String? _error;
  Map<String, String> _fields = {};

  bool get _editing => widget.existing != null;
  int get _imageCount => _kept.length + _picked.length;

  @override
  void initState() {
    super.initState();
    final post = widget.existing;
    if (post != null) {
      _content.text = post.content ?? '';
      _kept.addAll(post.images);
      // Món/quán không còn công khai thì không giữ được khi sửa.
      _food = post.food?.id == null ? null : post.food;
      _restaurant = post.restaurant?.id == null ? null : post.restaurant;
    }
    _content.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _content.dispose();
    super.dispose();
  }

  Future<void> _pickImages() async {
    final remaining = _maxImages - _imageCount;
    if (remaining <= 0) return showSnack(context, 'Tối đa $_maxImages ảnh.');
    try {
      final files = await _picker.pickMultiImage(maxWidth: 1600, maxHeight: 1600, imageQuality: 85, limit: remaining);
      for (final file in files.take(remaining)) {
        final bytes = await file.readAsBytes();
        if (bytes.length > _maxImageBytes) {
          if (mounted) showSnack(context, '${file.name} lớn hơn 5 MB, hãy chọn ảnh khác.');
          continue;
        }
        _picked.add(_PickedImage(file.name, bytes));
      }
      if (files.length > remaining && mounted) {
        showSnack(context, 'Chỉ giữ $remaining ảnh đầu, tối đa $_maxImages ảnh.');
      }
      if (mounted) setState(() {});
    } catch (_) {
      if (mounted) showSnack(context, 'Không mở được thư viện ảnh.');
    }
  }

  /// Dùng cho test và cho nút chọn ảnh: thêm ảnh đã có byte, kiểm tra giới hạn.
  @visibleForTesting
  bool addImageBytes(String name, Uint8List bytes) {
    if (_imageCount >= _maxImages) {
      showSnack(context, 'Tối đa $_maxImages ảnh.');
      return false;
    }
    if (bytes.length > _maxImageBytes) {
      showSnack(context, '$name lớn hơn 5 MB, hãy chọn ảnh khác.');
      return false;
    }
    setState(() => _picked.add(_PickedImage(name, bytes)));
    return true;
  }

  Future<void> _chooseFood() async {
    final food = await showFoodPicker(context, foods: widget.services.library.allFoods, title: 'Gắn món');
    if (food != null && mounted) setState(() => _food = PostLink(id: int.tryParse(food.id), name: food.name));
  }

  Future<void> _chooseRestaurant() async {
    final picked = await showModalBottomSheet<PostLink>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (_) => _RestaurantPicker(services: widget.services),
    );
    if (picked != null && mounted) setState(() => _restaurant = picked);
  }

  Future<void> _submit() async {
    final content = _content.text.trim();
    if (content.isEmpty && _imageCount == 0) {
      setState(() => _error = 'Bài viết cần có nội dung hoặc ít nhất một ảnh.');
      return;
    }
    if (content.length > _maxContent) {
      setState(() => _error = 'Nội dung tối đa $_maxContent ký tự.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
      _fields = {};
    });
    final input = PostInput(
      content: content.isEmpty ? null : content,
      foodId: _food?.id,
      restaurantId: _restaurant?.id,
      keepImageIds: [for (final image in _kept) image.id],
      newImages: [for (final p in _picked) UploadFile('images', p.bytes, p.name)],
    );
    try {
      final repo = widget.services.community;
      final post = _editing ? await repo.updatePost(widget.existing!.id, input) : await repo.createPost(input);
      if (!mounted) return;
      showSnack(context, _editing ? 'Đã lưu bài viết.' : 'Đã đăng bài.');
      Navigator.of(context).pop(post);
    } on ApiException catch (error) {
      // Giữ nguyên nội dung và ảnh đã chọn để người dùng thử lại.
      if (!mounted) return;
      setState(() {
        _fields = error.fields;
        _error = switch (error.code) {
          'ACCOUNT_BLOCKED' => 'Tài khoản đang bị khóa: ${error.details['reason'] ?? ''}',
          'POST_HIDDEN' => error.message,
          _ => error.fields.isEmpty ? error.message : error.fields.values.first,
        };
      });
    } catch (error) {
      if (mounted) setState(() => _error = errorText(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
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

  Widget _linkRow(String label, IconData icon, PostLink? value, VoidCallback onPick, VoidCallback onClear, Key key) {
    return ListTile(
      key: key,
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: AppColors.gold),
      title: Text(value?.name ?? label, style: TextStyle(color: value == null ? AppColors.mutedText : AppColors.text)),
      trailing: value == null
          ? const Icon(Icons.chevron_right, color: AppColors.mutedText)
          : IconButton(tooltip: 'Bỏ gắn', onPressed: onClear, icon: const Icon(Icons.close)),
      onTap: onPick,
    );
  }

  @override
  Widget build(BuildContext context) {
    const errorStyle = TextStyle(color: Colors.redAccent);
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(
        backgroundColor: AppColors.page,
        foregroundColor: AppColors.warmText,
        title: Text(_editing ? 'Sửa bài viết' : 'Đăng bài'),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(
          key: const Key('post-content'),
          controller: _content,
          maxLength: _maxContent,
          minLines: 4,
          maxLines: 10,
          decoration: InputDecoration(
            labelText: 'Bạn muốn chia sẻ gì?',
            hintText: 'Món ngon, quán quen, trải nghiệm ăn uống...',
            border: const OutlineInputBorder(),
            errorText: _fields['content'],
          ),
        ),
        const SizedBox(height: 8),
        Text('Ảnh ($_imageCount/$_maxImages)', style: const TextStyle(color: AppColors.text)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final (i, image) in _kept.indexed)
            _imageTile(
              NetPhoto(url: image.thumbUrl, fallback: const IconPlaceholder(icon: Icons.image)),
              () => setState(() => _kept.remove(image)),
              'ảnh ${i + 1}',
            ),
          for (final (i, p) in _picked.indexed)
            _imageTile(Image.memory(p.bytes, fit: BoxFit.cover), () => setState(() => _picked.remove(p)), 'ảnh mới ${i + 1}'),
          if (_imageCount < _maxImages)
            SizedBox(
              width: 84,
              height: 84,
              child: OutlinedButton(
                key: const Key('post-add-image'),
                onPressed: _pickImages,
                child: const Icon(Icons.add_a_photo_outlined, semanticLabel: 'Thêm ảnh'),
              ),
            ),
        ]),
        if (_fields['images'] != null)
          Padding(padding: const EdgeInsets.only(top: 6), child: Text(_fields['images']!, style: errorStyle)),
        const Divider(height: 24),
        _linkRow('Gắn món (không bắt buộc)', Icons.restaurant_menu, _food, _chooseFood,
            () => setState(() => _food = null), const Key('post-food')),
        if (_fields['foodId'] != null) Text(_fields['foodId']!, style: errorStyle),
        _linkRow('Gắn quán (không bắt buộc)', Icons.storefront, _restaurant, _chooseRestaurant,
            () => setState(() => _restaurant = null), const Key('post-restaurant')),
        if (_fields['restaurantId'] != null) Text(_fields['restaurantId']!, style: errorStyle),
        const SizedBox(height: 16),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_error!, key: const Key('post-error'), style: errorStyle),
          ),
        FilledButton(
          key: const Key('post-submit'),
          onPressed: _sending ? null : _submit,
          child: Text(_sending ? 'Đang gửi...' : (_editing ? 'Lưu' : 'Đăng')),
        ),
      ]),
    );
  }
}

/// Tìm quán theo tên để gắn vào bài.
class _RestaurantPicker extends StatefulWidget {
  const _RestaurantPicker({required this.services});

  final AppServices services;

  @override
  State<_RestaurantPicker> createState() => _RestaurantPickerState();
}

class _RestaurantPickerState extends State<_RestaurantPicker> {
  final _query = TextEditingController();
  List<PostLink> _items = const [];
  bool _loading = false;
  Object? _error;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _search();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await widget.services.restaurants.search(q: _query.text);
      if (!mounted || generation != _generation) return;
      setState(() => _items = [for (final r in page.items) PostLink(id: r.id, name: r.name)]);
    } catch (error) {
      if (mounted && generation == _generation) setState(() => _error = error);
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.7,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(children: [
          TextField(
            controller: _query,
            decoration: InputDecoration(
              hintText: 'Tìm quán...',
              prefixIcon: const Icon(Icons.search),
              border: const OutlineInputBorder(),
              isDense: true,
              suffixIcon: IconButton(onPressed: _search, icon: const Icon(Icons.arrow_forward)),
            ),
            onSubmitted: (_) => _search(),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _error != null
                ? ErrorRetry(message: errorText(_error!), onRetry: _search)
                : _loading
                    ? const Center(child: CircularProgressIndicator(color: AppColors.gold))
                    : _items.isEmpty
                        ? const EmptyState(message: 'Không tìm thấy quán')
                        : ListView(children: [
                            for (final item in _items)
                              ListTile(
                                leading: const Icon(Icons.storefront, color: AppColors.gold),
                                title: Text(item.name, style: const TextStyle(color: AppColors.text)),
                                onTap: () => Navigator.of(context).pop(item),
                              ),
                          ]),
          ),
        ]),
      ),
    );
  }
}
