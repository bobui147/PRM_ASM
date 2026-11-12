import 'package:flutter/material.dart';
import '../models/community_post.dart';
import '../models/json_read.dart';
import '../models/review.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';
import '../widgets/food_photo.dart';
import '../widgets/image_viewer.dart';
import 'auth_pages.dart';
import 'community_post_form.dart';
import 'restaurant_detail_page.dart';

String communityStatus(String status) => switch (status) {
  'pending' => 'Đang chờ duyệt', 'published' => 'Đã đăng',
  'rejected' => 'Bị từ chối', 'hidden' => 'Đã bị ẩn', _ => status,
};

Future<bool> confirmCommunityDelete(BuildContext context) async => await showDialog<bool>(context: context,
  builder: (c) => AlertDialog(title: const Text('Xóa vĩnh viễn?'), content: const Text('Nội dung và ảnh liên quan sẽ bị xóa.'),
    actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Hủy')),
      FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Xóa'))])) ?? false;

Future<void> communityNotice(BuildContext context) => showDialog<void>(context: context,
  builder: (c) => AlertDialog(title: const Text('Nội dung công khai'),
    content: const Text('Tên hiển thị, nội dung và ảnh sẽ công khai sau khi admin duyệt. Nội dung sửa cần được duyệt lại.'),
    actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Đã hiểu'))]));

class CommunityPage extends StatefulWidget {
  const CommunityPage({super.key, required this.services, this.authorId});
  final AppServices services;
  final int? authorId;
  @override
  State<CommunityPage> createState() => _CommunityPageState();
}

class _CommunityPageState extends State<CommunityPage> {
  final _posts = <CommunityPost>[];
  String _filter = 'newest';
  bool _busy = false, _more = true, _acting = false;
  int _page = 1, _generation = 0;
  String? _error;
  Map? _profile;
  AppServices get s => widget.services;
  @override
  void initState() { super.initState(); s.auth.addListener(_authChanged); _reset(); }
  void _authChanged() { _reset(); }
  @override
  void dispose() { s.auth.removeListener(_authChanged); super.dispose(); }
  Future<void> _reset() async {
    _generation++; _posts.clear(); _page = 1; _more = true; _busy = false;
    await _load();
  }
  Future<void> _load() async {
    if (_busy || !_more) return;
    final generation = _generation;
    setState(() { _busy = true; _error = null; });
    try {
      if (widget.authorId != null) _profile = (await s.communityApi.get('/users/${widget.authorId}/profile')).json;
      final response = await s.communityApi.get('/community/posts', query: {
        'page': _page, 'authorId': widget.authorId,
        if (_filter == 'following') 'following': true, if (_filter == 'mine') 'mine': true,
      });
      if (!mounted || generation != _generation) return;
      _posts.addAll(readMaps(response.json['items']).map(CommunityPost.fromJson));
      _more = response.json['hasMore'] == true; _page++;
    } catch (e) { if (mounted && generation == _generation) _error = errorText(e); }
    if (mounted && generation == _generation) setState(() => _busy = false);
  }
  Future<void> _follow() async {
    if (_acting || !await ensureSignedIn(context, s)) return;
    setState(() => _acting = true);
    try {
      final path = '/users/${widget.authorId}/follow';
      if (_profile?['isFollowing'] == true) { await s.communityApi.delete(path); } else { await s.communityApi.put(path); }
      await _reset();
    } catch (e) { if (mounted) showSnack(context, errorText(e)); }
    if (mounted) setState(() => _acting = false);
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(_profile?['displayName']?.toString() ?? 'Cộng đồng'), actions: [
      if (widget.authorId == null) IconButton(tooltip: 'Viết bài', icon: const Icon(Icons.edit_square), onPressed: () async {
        if (!await ensureSignedIn(context, s) || !context.mounted) return;
        await Navigator.push(context, MaterialPageRoute(builder: (_) => CommunityPostForm(services: s)));
        if (mounted) await _reset();
      }),
    ]),
    body: RefreshIndicator(onRefresh: _reset, child: ListView(padding: const EdgeInsets.all(16), children: [
      if (_profile != null) ...[
        Text('${_profile!['followers']} người theo dõi · ${_profile!['following']} đang theo dõi'),
        if (widget.authorId != s.auth.user?.id) OutlinedButton(onPressed: _acting ? null : _follow,
          child: Text(_profile!['isFollowing'] == true ? 'Bỏ theo dõi' : 'Theo dõi')),
      ],
      if (widget.authorId == null) Wrap(spacing: 8, children: [for (final e in {'newest':'Mới nhất','following':'Đang theo dõi','mine':'Bài của tôi'}.entries)
        ChoiceChip(label: Text(e.value), selected: _filter == e.key, onSelected: (_) async {
          if (e.key != 'newest' && !await ensureSignedIn(context, s)) return;
          _filter = e.key; await _reset();
        })]),
      for (final post in _posts) Card(child: ListTile(
        leading: InitialAvatar(name: post.authorName), title: Text(post.authorName),
        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(post.content, maxLines: 4, overflow: TextOverflow.ellipsis),
          if (post.images.isNotEmpty) SizedBox(height: 160, width: double.infinity, child: NetPhoto(url: post.images.first.thumbUrl)),
          Text('${communityStatus(post.status)} · ${post.likes} thích · ${post.comments} bình luận'),
          if (post.createdAt != null) Text(post.createdAt!.toLocal().toString().substring(0,16)),
        ]), onTap: () async {
          await Navigator.push(context, MaterialPageRoute(builder: (_) => CommunityDetailPage(services: s, postId: post.id)));
          if (mounted) await _reset();
        })),
      if (_error != null) ErrorRetry(message: _error!, onRetry: _load)
      else if (_busy) const Center(child: CircularProgressIndicator())
      else if (_posts.isEmpty) const EmptyState(message: 'Chưa có bài viết.')
      else if (_more) TextButton(onPressed: _load, child: const Text('Xem thêm')),
    ])),
  );
}

class CommunityDetailPage extends StatefulWidget {
  const CommunityDetailPage({super.key, required this.services, required this.postId});
  final AppServices services;
  final int postId;
  @override
  State<CommunityDetailPage> createState() => _CommunityDetailState();
}
class _CommunityDetailState extends State<CommunityDetailPage> {
  CommunityPost? _post;
  final _comments = <Map>[];
  final _text = TextEditingController();
  int _page = 1;
  bool _more = true, _loading = false, _acting = false;
  String? _error;
  AppServices get s => widget.services;
  String get path => '/community/posts/${widget.postId}';
  @override
  void initState() { super.initState(); _reload(); }
  @override
  void dispose() { _text.dispose(); super.dispose(); }
  Future<void> _reload() async {
    _comments.clear(); _page = 1; _more = true;
    await _load();
  }
  Future<void> _load() async {
    if (_loading) return;
    setState(() { _loading = true; _error = null; });
    try {
      final p = CommunityPost.fromJson((await s.communityApi.get(path)).json);
      final c = (await s.communityApi.get('$path/comments', query: {'page': _page})).json;
      if (!mounted) return;
      _post = p; _comments.addAll(readMaps(c['items']));
      _more = c['hasMore'] == true; _page++;
    } catch (e) { if (mounted) _error = errorText(e); }
    if (mounted) setState(() => _loading = false);
  }
  Future<void> _action(Future<void> Function() work) async {
    if (_acting || !await ensureSignedIn(context, s)) return;
    setState(() => _acting = true);
    try { await work(); if (mounted) await _reload(); }
    catch (e) { if (mounted) showSnack(context, errorText(e)); }
    if (mounted) setState(() => _acting = false);
  }
  Future<void> _report(String target) async {
    final reason = await showModalBottomSheet<String>(context: context, builder: (c) => SafeArea(child: ListView(shrinkWrap: true, children: [
      for (final r in ReportReason.values) ListTile(title: Text(r.label), onTap: () => Navigator.pop(c, r.apiName)),
    ])));
    if (reason != null) { await s.communityApi.post('$target/reports', {'reason': reason}); if (mounted) showSnack(context, 'Đã gửi báo cáo.'); }
  }
  @override
  Widget build(BuildContext context) {
    final p = _post;
    final mine = p?.authorId == s.auth.user?.id;
    return Scaffold(appBar: AppBar(title: const Text('Bài viết')), body: ListView(padding: const EdgeInsets.all(16), children: [
      if (p != null) ...[
        ListTile(leading: InitialAvatar(name: p.authorName), title: Text(p.authorName), subtitle: Text(communityStatus(p.status)), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CommunityPage(services: s, authorId: p.authorId)))),
        if (p.createdAt != null) Text(p.createdAt!.toLocal().toString().substring(0,16)),
        SelectableText(p.content),
        if (p.moderationNote != null) Text('Lý do: ${p.moderationNote}'),
        for (var i = 0; i < p.images.length; i++) InkWell(onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ImageViewerPage(images: p.images, initial: i))), child: SizedBox(height: 240, child: NetPhoto(url: p.images[i].url))),
        if (p.food != null) TextButton(onPressed: () => showDialog<void>(context: context, builder: (c) => AlertDialog(title: Text('${p.food!['name']}'), content: Text(s.library.foodById('${p.food!['id']}')?.name ?? 'Món ăn trong danh mục'), actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Đóng'))])), child: Text('Món: ${p.food!['name']}')),
        if (p.restaurant != null) TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => RestaurantDetailPage(services: s, restaurantId: readInt(p.restaurant!['id'])))), child: Text('Quán: ${p.restaurant!['name']}')),
        Wrap(spacing: 8, children: [
          if (p.status == 'published') OutlinedButton.icon(onPressed: _acting ? null : () => _action(() async { if (p.liked) { await s.communityApi.delete('$path/like'); } else { await s.communityApi.put('$path/like'); } }), icon: Icon(p.liked ? Icons.favorite : Icons.favorite_border), label: Text('${p.likes}')),
          if (mine && p.status != 'hidden') TextButton(onPressed: _acting ? null : () async { await Navigator.push(context, MaterialPageRoute(builder: (_) => CommunityPostForm(services: s, existing: p))); if (mounted) await _reload(); }, child: const Text('Sửa')),
          if (mine) TextButton(onPressed: _acting ? null : () => _action(() async { if (!await confirmCommunityDelete(context)) return; await s.communityApi.delete(path); if (mounted) Navigator.pop(context); }), child: const Text('Xóa')),
          if (!mine && p.status == 'published') TextButton(onPressed: _acting ? null : () => _action(() => _report(path)), child: const Text('Báo cáo')),
        ]),
        const Divider(),
        for (final c in _comments) ListTile(title: Text('${c['authorName']}'), subtitle: Text('${c['content']}\n${communityStatus('${c['status']}')}${c['moderationNote'] == null ? '' : '\n${c['moderationNote']}'}'), trailing: _acting ? null : IconButton(tooltip: c['authorId'] == s.auth.user?.id ? 'Xóa bình luận' : 'Báo cáo bình luận', icon: Icon(c['authorId'] == s.auth.user?.id ? Icons.delete_outline : Icons.flag_outlined), onPressed: () => _action(() async {
          final target = '/community/comments/${c['id']}';
          if (c['authorId'] == s.auth.user?.id) { if (await confirmCommunityDelete(context)) await s.communityApi.delete(target); } else { await _report(target); }
        }))),
        if (_more && !_loading) TextButton(onPressed: _load, child: const Text('Xem thêm bình luận')),
        if (p.status == 'published') ...[
          TextField(controller: _text, maxLength: 500, maxLines: 3, decoration: const InputDecoration(labelText: 'Bình luận')),
          FilledButton(onPressed: _acting ? null : () => _action(() async {
            if (_text.text.trim().isEmpty) return;
            await communityNotice(context);
            await s.communityApi.post('$path/comments', {'content': _text.text.trim()}); _text.clear();
          }), child: const Text('Gửi để duyệt')),
        ],
      ],
      if (_error != null) ErrorRetry(message: _error!, onRetry: _load),
      if (_loading) const Center(child: CircularProgressIndicator()),
    ]));
  }
}
