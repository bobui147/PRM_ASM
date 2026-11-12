import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/community.dart';
import '../services/api_client.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';
import '../widgets/post_card.dart';
import '../widgets/report_sheet.dart';
import 'auth_pages.dart';
import 'community_page.dart';
import 'post_form_page.dart';

/// Kết quả trả về khi đóng trang chi tiết để màn hình trước cập nhật thẻ bài.
class PostDetailResult {
  const PostDetailResult({this.post, this.deleted = false});

  final Post? post;
  final bool deleted;
}

/// Chi tiết bài: ảnh lớn, thích, bình luận, báo cáo, sửa/xóa (FR-C01..C04).
class PostDetailPage extends StatefulWidget {
  const PostDetailPage({super.key, required this.postId, required this.services, this.initial});

  final int postId;
  final AppServices services;
  final Post? initial;

  @override
  State<PostDetailPage> createState() => _PostDetailPageState();
}

class _PostDetailPageState extends State<PostDetailPage> {
  final _comment = TextEditingController();
  final List<PostComment> _comments = [];
  Post? _post;
  Object? _error;
  bool _loadingComments = false;
  bool _hasMoreComments = true;
  int _commentPage = 0;
  Object? _commentError;
  bool _sending = false;

  AppServices get _s => widget.services;

  @override
  void initState() {
    super.initState();
    _post = widget.initial;
    _load();
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final post = await _s.community.post(widget.postId);
      if (!mounted) return;
      setState(() => _post = post);
      _comments.clear();
      _commentPage = 0;
      _hasMoreComments = true;
      await _loadComments();
    } catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }

  Future<void> _loadComments() async {
    if (_loadingComments || !_hasMoreComments) return;
    setState(() {
      _loadingComments = true;
      _commentError = null;
    });
    try {
      final page = await _s.community.comments(widget.postId, page: _commentPage + 1);
      if (!mounted) return;
      setState(() {
        _comments.addAll(page.items);
        _commentPage = page.page;
        _hasMoreComments = page.hasMore;
      });
    } catch (error) {
      if (mounted) setState(() => _commentError = error);
    } finally {
      if (mounted) setState(() => _loadingComments = false);
    }
  }

  void _close() => Navigator.of(context).pop(PostDetailResult(post: _post));

  Future<void> _send() async {
    final text = _comment.text.trim();
    if (text.isEmpty || _sending) return;
    if (!await ensureSignedIn(context, _s) || !mounted) return;
    if (!await confirmCommunityNotice(context, _s) || !mounted) return;
    setState(() => _sending = true);
    try {
      final comment = await _s.community.addComment(widget.postId, text);
      if (!mounted) return;
      // Chỉ xóa ô nhập khi gửi thành công; lỗi thì giữ nội dung.
      _comment.clear();
      setState(() {
        if (!_hasMoreComments) _comments.add(comment);
        final post = _post;
        if (post != null) _post = post.copyWith(commentCount: post.commentCount + 1);
      });
      showSnack(context, 'Đã gửi bình luận');
    } on ApiException catch (error) {
      if (mounted) {
        showSnack(
          context,
          error.code == 'ACCOUNT_BLOCKED' ? 'Tài khoản đang bị khóa nên không bình luận được.' : error.message,
        );
      }
    } catch (error) {
      if (mounted) showSnack(context, errorText(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<bool> _confirm(String title, String message) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Hủy')),
          FilledButton(
            key: const Key('confirm-delete'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _deleteComment(PostComment comment) async {
    if (!await _confirm('Xóa bình luận?', 'Bình luận sẽ bị xóa vĩnh viễn.') || !mounted) return;
    try {
      await _s.community.deleteComment(comment.id);
      if (!mounted) return;
      setState(() {
        _comments.removeWhere((c) => c.id == comment.id);
        final post = _post;
        if (post != null) _post = post.copyWith(commentCount: (post.commentCount - 1).clamp(0, 1 << 30));
      });
    } catch (error) {
      if (mounted) showSnack(context, errorText(error));
    }
  }

  Future<void> _reportComment(PostComment comment) async {
    if (!await ensureSignedIn(context, _s) || !mounted) return;
    await showContentReportSheet(
      context,
      title: 'Báo cáo bình luận',
      submit: (reason, details) => _s.community.reportComment(comment.id, reason, details),
    );
  }

  Future<void> _onMenu(String action) async {
    final post = _post;
    if (post == null) return;
    switch (action) {
      case 'edit':
        final updated = await Navigator.of(context).push<Post>(
          MaterialPageRoute(builder: (_) => PostFormPage(services: _s, existing: post)),
        );
        if (updated != null && mounted) setState(() => _post = updated);
      case 'delete':
        if (!await _confirm('Xóa bài viết?', 'Bài, ảnh, lượt thích và bình luận sẽ bị xóa vĩnh viễn.')) return;
        try {
          await _s.community.deletePost(post.id);
          if (!mounted) return;
          showSnack(context, 'Đã xóa bài viết');
          Navigator.of(context).pop(const PostDetailResult(deleted: true));
        } catch (error) {
          if (mounted) showSnack(context, errorText(error));
        }
      case 'report':
        if (!await ensureSignedIn(context, _s) || !mounted) return;
        await showContentReportSheet(
          context,
          title: 'Báo cáo bài viết',
          submit: (reason, details) => _s.community.reportPost(post.id, reason, details),
        );
    }
  }

  Widget _commentTile(PostComment comment) {
    final mine = comment.isMine || comment.author.id == _s.auth.user?.id;
    return ListTile(
      key: ValueKey('comment-${comment.id}'),
      contentPadding: EdgeInsets.zero,
      leading: InkWell(
        onTap: () => openProfile(context, _s, comment.author.id),
        child: InitialAvatar(name: comment.author.displayName, radius: 16),
      ),
      title: Text(
        '${comment.author.displayName} · ${relativeTime(comment.createdAt)}',
        style: const TextStyle(color: AppColors.mutedText, fontSize: 12),
      ),
      subtitle: Text(comment.content, style: const TextStyle(color: AppColors.text)),
      trailing: PopupMenuButton<String>(
        tooltip: 'Tùy chọn bình luận',
        onSelected: (value) => value == 'delete' ? _deleteComment(comment) : _reportComment(comment),
        itemBuilder: (_) => [
          if (mine) const PopupMenuItem(value: 'delete', child: Text('Xóa bình luận')),
          if (!mine) const PopupMenuItem(value: 'report', child: Text('Báo cáo')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final post = _post;
    final mine = post != null && (post.isMine || post.author.id == _s.auth.user?.id);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Scaffold(
        backgroundColor: AppColors.page,
        appBar: AppBar(
          backgroundColor: AppColors.page,
          foregroundColor: AppColors.warmText,
          title: const Text('Bài viết'),
          leading: BackButton(onPressed: _close),
          actions: [
            if (post != null)
              PopupMenuButton<String>(
                key: const Key('post-menu'),
                onSelected: _onMenu,
                itemBuilder: (_) => [
                  if (mine && !post.hidden) const PopupMenuItem(value: 'edit', child: Text('Sửa bài')),
                  if (mine) const PopupMenuItem(value: 'delete', child: Text('Xóa bài')),
                  if (!mine) const PopupMenuItem(value: 'report', child: Text('Báo cáo bài viết')),
                ],
              ),
          ],
        ),
        body: post == null
            ? Center(
                child: _error == null
                    ? const CircularProgressIndicator(color: AppColors.gold)
                    : ErrorRetry(message: errorText(_error!), onRetry: _load),
              )
            : Column(children: [
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(padding: const EdgeInsets.all(12), children: [
                      PostCard(
                        post: post,
                        services: _s,
                        expanded: true,
                        onChanged: (updated) => setState(() => _post = updated),
                        onOpenAuthor: () => openProfile(context, _s, post.author.id),
                      ),
                      const SizedBox(height: 8),
                      Text('Bình luận (${post.commentCount})',
                          style: const TextStyle(color: AppColors.warmText, fontWeight: FontWeight.w700)),
                      for (final comment in _comments) _commentTile(comment),
                      if (_commentError != null)
                        ErrorRetry(message: errorText(_commentError!), onRetry: _loadComments, compact: true)
                      else if (_loadingComments)
                        const Padding(
                          padding: EdgeInsets.all(16),
                          child: Center(child: CircularProgressIndicator(color: AppColors.gold)),
                        )
                      else if (_hasMoreComments)
                        TextButton(onPressed: _loadComments, child: const Text('Xem thêm bình luận'))
                      else if (_comments.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 16),
                          child: Text('Chưa có bình luận nào.', style: TextStyle(color: AppColors.mutedText)),
                        ),
                    ]),
                  ),
                ),
                if (!post.hidden)
                  SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(12, 4, 8, 8),
                      child: Row(children: [
                        Expanded(
                          child: TextField(
                            key: const Key('comment-input'),
                            controller: _comment,
                            maxLength: 500,
                            minLines: 1,
                            maxLines: 4,
                            decoration: const InputDecoration(
                              hintText: 'Viết bình luận...',
                              border: OutlineInputBorder(),
                              isDense: true,
                              counterText: '',
                            ),
                          ),
                        ),
                        IconButton(
                          key: const Key('comment-send'),
                          tooltip: 'Gửi bình luận',
                          onPressed: _sending ? null : _send,
                          icon: _sending
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.send, color: AppColors.gold),
                        ),
                      ]),
                    ),
                  ),
              ]),
      ),
    );
  }
}
