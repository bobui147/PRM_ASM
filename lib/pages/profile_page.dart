import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/community.dart';
import '../services/api_client.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';
import '../widgets/paged_list.dart';
import '../widgets/post_card.dart';
import 'auth_pages.dart';
import 'community_page.dart';

/// Hồ sơ công khai: tên, số theo dõi, bài công khai, nút theo dõi (FR-C02, FR-C03).
class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, required this.userId, required this.services});

  final int userId;
  final AppServices services;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  PublicProfile? _profile;
  Object? _error;
  bool _busy = false;

  AppServices get _s => widget.services;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final profile = await _s.community.profile(widget.userId);
      if (mounted) setState(() => _profile = profile);
    } catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }

  Future<void> _toggleFollow() async {
    final profile = _profile;
    if (profile == null || _busy) return;
    if (!await ensureSignedIn(context, _s) || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await _s.community.setFollow(profile.id, !profile.isFollowing);
      if (mounted) setState(() => _profile = profile.copyWith(isFollowing: result.active, followerCount: result.count));
    } on ApiException catch (error) {
      if (mounted) showSnack(context, error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _stat(String label, int value) => Column(children: [
        Text('$value', style: const TextStyle(color: AppColors.warmText, fontSize: 18, fontWeight: FontWeight.w700)),
        Text(label, style: const TextStyle(color: AppColors.mutedText, fontSize: 12)),
      ]);

  Widget _header(PublicProfile profile) {
    final isMe = profile.isMe || profile.id == _s.auth.user?.id;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(children: [
        InitialAvatar(name: profile.displayName, radius: 32),
        const SizedBox(height: 8),
        Text(profile.displayName, style: const TextStyle(color: AppColors.text, fontSize: 20)),
        const SizedBox(height: 12),
        Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
          _stat('Bài viết', profile.postCount),
          _stat('Người theo dõi', profile.followerCount),
          _stat('Đang theo dõi', profile.followingCount),
        ]),
        const SizedBox(height: 12),
        if (!isMe)
          profile.isFollowing
              ? OutlinedButton.icon(
                  key: const Key('unfollow'),
                  onPressed: _busy ? null : _toggleFollow,
                  icon: const Icon(Icons.check),
                  label: const Text('Đang theo dõi'),
                )
              : FilledButton.icon(
                  key: const Key('follow'),
                  onPressed: _busy ? null : _toggleFollow,
                  icon: const Icon(Icons.person_add_alt),
                  label: const Text('Theo dõi'),
                ),
        const Divider(height: 24),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile;
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(
        backgroundColor: AppColors.page,
        foregroundColor: AppColors.warmText,
        title: Text(profile?.displayName ?? 'Hồ sơ'),
      ),
      body: profile == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator(color: AppColors.gold)
                  : ErrorRetry(message: errorText(_error!), onRetry: _load),
            )
          : PagedList<Post>(
              header: _header(profile),
              load: (page) => _s.community.userPosts(widget.userId, page: page),
              emptyMessage: 'Chưa có bài viết công khai.',
              itemBuilder: (context, post, replace) => PostCard(
                key: ValueKey('post-${post.id}'),
                post: post,
                services: _s,
                onChanged: replace,
                onOpen: () => openPostDetail(context, _s, post, replace),
              ),
            ),
    );
  }
}

/// Bài của tôi, mọi trạng thái (thấy bài bị ẩn và ghi chú của quản trị viên).
class MyPostsPage extends StatelessWidget {
  const MyPostsPage({super.key, required this.services});

  final AppServices services;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(
        backgroundColor: AppColors.page,
        foregroundColor: AppColors.warmText,
        title: const Text('Bài của tôi'),
        actions: [
          TextButton(
            onPressed: () {
              final id = services.auth.user?.id;
              if (id != null) openProfile(context, services, id);
            },
            child: const Text('Hồ sơ công khai'),
          ),
        ],
      ),
      body: PagedList<Post>(
        load: (page) => services.community.myPosts(page: page),
        emptyMessage: 'Bạn chưa đăng bài nào.',
        emptyIcon: Icons.edit_note,
        itemBuilder: (context, post, replace) => PostCard(
          key: ValueKey('post-${post.id}'),
          post: post,
          services: services,
          onChanged: replace,
          onOpen: () => openPostDetail(context, services, post, replace),
        ),
      ),
    );
  }
}
