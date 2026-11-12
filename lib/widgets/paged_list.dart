import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/json_read.dart';
import 'common.dart';

/// Danh sách có phân trang: cuộn gần cuối thì tải trang sau, kéo xuống để tải lại,
/// hiển thị trạng thái tải / trống / lỗi + thử lại (requirements-mo-rong.md §2).
class PagedList<T> extends StatefulWidget {
  const PagedList({
    super.key,
    required this.load,
    required this.itemBuilder,
    required this.emptyMessage,
    this.header,
    this.emptyIcon = Icons.inbox_outlined,
    this.padding = const EdgeInsets.fromLTRB(12, 8, 12, 88),
  });

  final Future<PageResult<T>> Function(int page) load;
  final Widget Function(BuildContext context, T item, void Function(T? updated) replace) itemBuilder;
  final String emptyMessage;
  final IconData emptyIcon;
  final Widget? header;
  final EdgeInsets padding;

  @override
  State<PagedList<T>> createState() => PagedListState<T>();
}

class PagedListState<T> extends State<PagedList<T>> {
  final _scroll = ScrollController();
  final List<T> _items = [];
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  Object? _error;

  // Tăng khi tải lại để bỏ kết quả của request cũ.
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _loadMore();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scroll.position.extentAfter < 400) _loadMore();
  }

  /// Tải lại từ trang 1 (sau khi đăng bài, đổi bộ lọc...).
  Future<void> reload() async {
    _generation += 1;
    setState(() {
      _items.clear();
      _page = 0;
      _hasMore = true;
      _loading = false;
      _error = null;
    });
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;
    final generation = _generation;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.load(_page + 1);
      if (!mounted || generation != _generation) return;
      setState(() {
        _items.addAll(result.items);
        _page = result.page;
        _hasMore = result.hasMore;
      });
    } catch (error) {
      if (mounted && generation == _generation) setState(() => _error = error);
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  void _replace(int index, T? updated) {
    setState(() {
      if (updated == null) {
        _items.removeAt(index);
      } else {
        _items[index] = updated;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final header = widget.header;
    final extra = header == null ? 0 : 1;
    Widget? footer;
    if (_error != null) {
      footer = ErrorRetry(message: errorText(_error!), onRetry: _loadMore, compact: _items.isNotEmpty);
    } else if (_loading) {
      footer = const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator(color: AppColors.gold)),
      );
    } else if (_items.isEmpty) {
      footer = EmptyState(key: const Key('paged-empty'), message: widget.emptyMessage, icon: widget.emptyIcon);
    }
    return RefreshIndicator(
      onRefresh: reload,
      child: ListView.builder(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: widget.padding,
        itemCount: extra + _items.length + (footer == null ? 0 : 1),
        itemBuilder: (context, index) {
          if (header != null && index == 0) return header;
          final i = index - extra;
          if (i < _items.length) {
            return widget.itemBuilder(context, _items[i], (updated) => _replace(i, updated));
          }
          return footer!;
        },
      ),
    );
  }
}
