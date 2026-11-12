import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/community.dart';
import '../services/app_services.dart';
import '../widgets/paged_list.dart';
import '../widgets/post_card.dart';
import 'auth_pages.dart';
import 'post_detail_page.dart';
import 'post_form_page.dart';
import 'profile_page.dart';

/// FR-C05: trước lần đăng bài/bình luận đầu tiên, báo nội dung sẽ công khai.
/// Trả false nếu người dùng chọn Hủy.
Future<bool> confirmCommunityNotice(BuildContext context, AppServices services) async {
  final storage = services.storage;
  if (storage == null || storage.readCommunityNoticeSeen()) return true;
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Nội dung công khai'),
      content: const Text(
        'Tên hiển thị, nội dung và ảnh bạn đăng trong Cộng đồng sẽ hiển thị công khai với mọi người '
        '(kể cả khách chưa đăng nhập). Email của bạn không bao giờ được hiển thị.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Hủy')),
        FilledButton(
          key: const Key('community-notice-ok'),
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Đã hiểu'),
        ),
      ],
    ),
  );
  if (ok == true) await storage.writeCommunityNoticeSeen();
  return ok == true;
}

/// Mở trang chi tiết và đồng bộ lại thẻ (thích/bình luận) hoặc bỏ thẻ nếu bài đã bị xóa.
Future<void> openPostDetail(
  BuildContext context,
  AppServices services,
  Post post,
  void Function(Post? updated) replace,
) async {
  final result = await Navigator.of(context).push<PostDetailResult>(MaterialPageRoute(
    builder: (_) => PostDetailPage(postId: post.id, services: services, initial: post),
  ));
  if (result == null) return;
  replace(result.deleted ? null : result.post ?? post);
}

void openProfile(BuildContext context, AppServices services, int userId) {
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProfilePage(userId: userId, services: services)));
}

/// Tab Cộng đồng: bảng tin Mới nhất / Đang theo dõi (FR-C02).
class CommunityPage extends StatefulWidget {
  const CommunityPage({super.key, required this.services});

  final AppServices services;

  @override
  State<CommunityPage> createState() => _CommunityPageState();
}

class _CommunityPageState extends State<CommunityPage> {
  final _listKey = GlobalKey<PagedListState<Post>>();
  String _filter = 'latest';

  AppServices get _s => widget.services;
  int? _userId;

  @override
  void initState() {
    super.initState();
    _userId = _s.auth.user?.id;
    _s.auth.addListener(_onAuthChanged);
  }

  @override
  void dispose() {
    _s.auth.removeListener(_onAuthChanged);
    super.dispose();
  }

  /// Đăng nhập/đăng xuất: trạng thái "đã thích" thay đổi nên tải lại bảng tin.
  void _onAuthChanged() {
    final id = _s.auth.user?.id;
    if (id == _userId) return;
    _userId = id;
    if (id == null && _filter == 'following') {
      setState(() => _filter = 'latest');
    }
    _reloadAfterBuild();
  }

  void _reloadAfterBuild() {
    WidgetsBinding.instance.addPostFrameCallback((_) => _listKey.currentState?.reload());
  }

  Future<void> _selectFilter(String filter) async {
    if (filter == _filter) return;
    // Khách chọn "Đang theo dõi" được đưa tới đăng nhập.
    if (filter == 'following' && !await ensureSignedIn(context, _s)) return;
    if (!mounted) return;
    setState(() => _filter = filter);
    _reloadAfterBuild();
  }

  Future<void> _compose() async {
    if (!await ensureSignedIn(context, _s) || !mounted) return;
    if (!await confirmCommunityNotice(context, _s) || !mounted) return;
    final created = await Navigator.of(context).push<Post>(
      MaterialPageRoute(builder: (_) => PostFormPage(services: _s)),
    );
    if (created != null) _listKey.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(
        backgroundColor: AppColors.page,
        foregroundColor: AppColors.warmText,
        title: const Text('Cộng đồng ẩm thực'),
        actions: [
          IconButton(
            key: const Key('my-posts'),
            tooltip: 'Bài của tôi',
            icon: const Icon(Icons.person_outline),
            onPressed: () async {
              if (!await ensureSignedIn(context, _s) || !context.mounted) return;
              Navigator.of(context).push(MaterialPageRoute(builder: (_) => MyPostsPage(services: _s)));
            },
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: SegmentedButton<String>(
              key: const Key('feed-filter'),
              segments: const [
                ButtonSegment(value: 'latest', label: Text('Mới nhất'), icon: Icon(Icons.schedule)),
                ButtonSegment(value: 'following', label: Text('Đang theo dõi'), icon: Icon(Icons.group_outlined)),
              ],
              selected: {_filter},
              onSelectionChanged: (value) => _selectFilter(value.first),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('compose-post'),
        onPressed: _compose,
        icon: const Icon(Icons.edit_outlined),
        label: const Text('Đăng bài'),
      ),
      body: PagedList<Post>(
        key: _listKey,
        load: (page) => _s.community.feed(filter: _filter, page: page),
        emptyMessage: _filter == 'following'
            ? 'Chưa có bài nào từ người bạn theo dõi.'
            : 'Chưa có bài nào. Hãy là người đầu tiên chia sẻ!',
        emptyIcon: Icons.forum_outlined,
        itemBuilder: (context, post, replace) => PostCard(
          key: ValueKey('post-${post.id}'),
          post: post,
          services: _s,
          onChanged: replace,
          onOpen: () => openPostDetail(context, _s, post, replace),
          onOpenAuthor: () => openProfile(context, _s, post.author.id),
        ),
      ),
    );
  }
}
