import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../models/community_post.dart';
import '../models/json_read.dart';
import '../services/api_client.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';
import '../widgets/food_photo.dart';
import 'community_page.dart';

class CommunityPostForm extends StatefulWidget {
  const CommunityPostForm({super.key, required this.services, this.existing});
  final AppServices services;
  final CommunityPost? existing;
  @override
  State<CommunityPostForm> createState() => _CommunityPostFormState();
}
class _CommunityPostFormState extends State<CommunityPostForm> {
  late final _text = TextEditingController(text: widget.existing?.content ?? '');
  late final _kept = [...?widget.existing?.images];
  final _files = <UploadFile>[];
  Map? _food, _restaurant;
  bool _busy = false;
  String? _error;
  @override
  void initState() { super.initState(); _food = widget.existing?.food; _restaurant = widget.existing?.restaurant; }
  @override
  void dispose() { _text.dispose(); super.dispose(); }
  Future<void> _pick() async {
    final remaining = 3 - _kept.length - _files.length;
    if (remaining <= 0) return;
    try {
      final files = await ImagePicker().pickMultiImage(maxWidth: 1600, maxHeight: 1600, imageQuality: 85, limit: remaining);
      for (final file in files.take(remaining)) {
        final bytes = await file.readAsBytes();
        if (bytes.length > 5 * 1024 * 1024) { if (mounted) showSnack(context, 'Mỗi ảnh tối đa 5 MB'); continue; }
        _files.add(UploadFile('images', bytes, file.name));
      }
      if (mounted) setState(() {});
    } catch (_) { if (mounted) showSnack(context, 'Không mở được thư viện ảnh'); }
  }
  Future<void> _save() async {
    if (_busy) return;
    if (_text.text.trim().isEmpty && _kept.isEmpty && _files.isEmpty) { setState(() => _error = 'Nhập nội dung hoặc thêm ảnh'); return; }
    setState(() { _busy = true; _error = null; });
    try {
      await communityNotice(context);
      final existing = widget.existing;
      await widget.services.communityApi.multipart(existing == null ? 'POST' : 'PUT', '/community/posts${existing == null ? '' : '/${existing.id}'}',
        fields: {'content': _text.text.trim(), 'foodId': _food?['id'], 'restaurantId': _restaurant?['id']},
        listFields: {'keepImageIds': [for (final i in _kept) i.id]}, files: _files);
      if (mounted) { showSnack(context, 'Bài viết đang chờ duyệt'); Navigator.pop(context, true); }
    } catch (e) { if (mounted) setState(() => _error = e is ApiException && e.fields.isNotEmpty ? e.fields.values.join('\n') : errorText(e)); }
    if (mounted) setState(() => _busy = false);
  }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(widget.existing == null ? 'Viết bài' : 'Sửa bài')), body: ListView(padding: const EdgeInsets.all(16), children: [
    TextField(controller: _text, enabled: !_busy, maxLength: 2000, minLines: 4, maxLines: 10, decoration: const InputDecoration(labelText: 'Chia sẻ trải nghiệm ẩm thực')),
    if (_food != null) ListTile(title: Text('Món: ${_food!['name']}'), trailing: IconButton(tooltip: 'Bỏ món', onPressed: _busy ? null : () => setState(() => _food = null), icon: const Icon(Icons.close))),
    OutlinedButton(onPressed: _busy ? null : () async {
      final result = await showModalBottomSheet<Map>(context: context, builder: (c) => SafeArea(child: ListView(children: [for (final f in widget.services.library.allFoods) ListTile(title: Text(f.name), onTap: () => Navigator.pop(c, {'id': f.id,'name': f.name}))])));
      if (result != null && mounted) setState(() => _food = result);
    }, child: const Text('Gắn món ăn')),
    if (_restaurant != null) ListTile(title: Text('Quán: ${_restaurant!['name']}'), trailing: IconButton(tooltip: 'Bỏ quán', onPressed: _busy ? null : () => setState(() => _restaurant = null), icon: const Icon(Icons.close))),
    OutlinedButton(onPressed: _busy ? null : () async {
      final selected = await showDialog<Map>(context: context, builder: (_) => _RestaurantSearch(services: widget.services));
      if (selected != null && mounted) setState(() => _restaurant = selected);
    }, child: const Text('Gắn quán ăn')),
    for (final i in _kept) ListTile(leading: SizedBox(width: 64,child: NetPhoto(url: i.thumbUrl)), title: const Text('Ảnh đã lưu'), trailing: IconButton(tooltip: 'Bỏ ảnh', onPressed: _busy ? null : () => setState(() => _kept.remove(i)), icon: const Icon(Icons.close))),
    for (final f in _files) ListTile(leading: Image.memory(Uint8List.fromList(f.bytes), width: 64), title: Text(f.filename), trailing: IconButton(tooltip: 'Bỏ ảnh', onPressed: _busy ? null : () => setState(() => _files.remove(f)), icon: const Icon(Icons.close))),
    OutlinedButton(onPressed: _busy || _kept.length + _files.length >= 3 ? null : _pick, child: Text('Thêm ảnh (${_kept.length + _files.length}/3)')),
    if (_error != null) Text(_error!, style: const TextStyle(color: Colors.redAccent)),
    FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Đang gửi...' : 'Gửi để duyệt')),
  ]));
}

class _RestaurantSearch extends StatefulWidget {
  const _RestaurantSearch({required this.services});
  final AppServices services;
  @override
  State<_RestaurantSearch> createState() => _RestaurantSearchState();
}
class _RestaurantSearchState extends State<_RestaurantSearch> {
  final _query = TextEditingController();
  List<Map> _items = [];
  String? _error;
  int _page = 1;
  bool _busy = false, _more = true;
  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { _query.dispose(); super.dispose(); }
  Future<void> _load({bool reset = false}) async {
    if (_busy) return;
    if (reset) { _page = 1; _items = []; _more = true; }
    setState(() { _busy = true; _error = null; });
    try {
      final json = (await widget.services.communityApi.get('/restaurants', query: {'q': _query.text.trim(),'page': _page})).json;
      if (!mounted) return;
      _items.addAll(readMaps(json['items'])); _more = json['hasMore'] == true; _page++;
    } catch (e) { if (mounted) _error = errorText(e); }
    if (mounted) setState(() => _busy = false);
  }
  @override
  Widget build(BuildContext context) => AlertDialog(title: const Text('Tìm quán'), content: SizedBox(width: 400,height: 400,child: Column(children: [
    TextField(controller: _query, decoration: InputDecoration(labelText: 'Tên quán', suffixIcon: IconButton(tooltip: 'Tìm', onPressed: _busy ? null : () => _load(reset: true), icon: const Icon(Icons.search)))),
    Expanded(child: ListView(children: [for (final r in _items) ListTile(title: Text('${r['name']}'),onTap: () => Navigator.pop(context,r)),
      if (_busy) const Center(child: CircularProgressIndicator()),
      if (_error != null) ErrorRetry(message: _error!, onRetry: _load),
      if (_more && !_busy) TextButton(onPressed: _load, child: const Text('Xem thêm')),
    ])),
  ])), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Đóng'))]);
}
