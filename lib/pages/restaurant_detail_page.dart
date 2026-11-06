import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/restaurant.dart';
import '../models/review.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';
import '../widgets/report_sheet.dart';
import '../widgets/restaurant_header.dart';
import '../widgets/review_tile.dart';
import 'auth_pages.dart';
import 'review_form_page.dart';

/// Chi tiết quán và review (FR-M09).
class RestaurantDetailPage extends StatefulWidget {
  const RestaurantDetailPage({super.key, required this.restaurantId, required this.services});

  final int restaurantId;
  final AppServices services;

  @override
  State<RestaurantDetailPage> createState() => _RestaurantDetailPageState();
}

class _RestaurantDetailPageState extends State<RestaurantDetailPage> {
  static const _sorts = {'newest': 'Mới nhất', 'highest': 'Điểm cao', 'lowest': 'Điểm thấp'};

  Restaurant? _restaurant;
  String? _error;
  final List<Review> _reviews = [];
  Review? _mine;
  String _sort = 'newest';
  bool _withImages = false;
  int _page = 0;
  bool _hasMore = true;
  bool _loadingReviews = false;
  String? _reviewError;
  int _generation = 0;

  AppServices get _s => widget.services;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final restaurant = await _s.restaurants.restaurant(widget.restaurantId);
      if (!mounted) return;
      setState(() => _restaurant = restaurant);
      _reloadReviews();
    } catch (error) {
      if (mounted) setState(() => _error = errorText(error));
    }
  }

  void _reloadReviews() {
    _generation++;
    setState(() {
      _reviews.clear();
      _page = 0;
      _hasMore = true;
      _loadingReviews = false;
      _reviewError = null;
    });
    _loadMoreReviews();
  }

  Future<void> _loadMoreReviews() async {
    if (_loadingReviews || !_hasMore) return;
    final generation = _generation;
    setState(() {
      _loadingReviews = true;
      _reviewError = null;
    });
    try {
      final result = await _s.restaurants.reviews(
        widget.restaurantId,
        page: _page + 1,
        sort: _sort,
        withImages: _withImages,
      );
      if (!mounted || generation != _generation) return;
      setState(() {
        if (_page == 0) _mine = result.myReview;
        _reviews.addAll(result.page.items.where((r) => r.authorId != _s.auth.user?.id));
        _page = result.page.page;
        _hasMore = result.page.hasMore;
      });
    } catch (error) {
      if (mounted && generation == _generation) setState(() => _reviewError = errorText(error));
    } finally {
      if (mounted && generation == _generation) setState(() => _loadingReviews = false);
    }
  }

  Future<void> _write({Review? existing}) async {
    final restaurant = _restaurant;
    if (restaurant == null) return;
    if (!await ensureSignedIn(context, _s)) return;
    if (!mounted) return;
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => ReviewFormPage(restaurant: restaurant, services: _s, existing: existing ?? _mine),
    ));
    if (saved == true && mounted) _load();
  }

  Future<void> _delete(Review review) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xóa review?'),
        content: const Text('Review và ảnh sẽ bị xóa vĩnh viễn.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Hủy')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Xóa')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await _s.restaurants.deleteReview(review.id);
      if (!mounted) return;
      showSnack(context, 'Đã xóa review.');
      setState(() => _mine = null);
      _load();
    } catch (error) {
      if (mounted) showSnack(context, errorText(error));
    }
  }

  Future<void> _report(Review review) async {
    if (!await ensureSignedIn(context, _s) || !mounted) return;
    await showReportSheet(context, review: review, repository: _s.restaurants);
  }

  Widget _reviewButton() {
    final mine = _mine;
    if (mine == null) {
      return FilledButton.icon(
        key: const Key('write-review'),
        onPressed: () => _write(),
        icon: const Icon(Icons.rate_review_outlined),
        label: const Text('Viết review'),
      );
    }
    return ReviewTile(
      review: mine,
      mine: true,
      onEdit: mine.status == ReviewStatus.hidden ? null : () => _write(existing: mine),
      onDelete: () => _delete(mine),
    );
  }

  Widget _reviewControls() {
    return Row(children: [
      const Expanded(
        child: Text('REVIEW', style: TextStyle(color: AppColors.warmText, fontWeight: FontWeight.w800)),
      ),
      FilterChip(
        label: const Text('Có ảnh'),
        selected: _withImages,
        onSelected: (value) {
          _withImages = value;
          _reloadReviews();
        },
      ),
      PopupMenuButton<String>(
        tooltip: 'Sắp xếp review',
        icon: const Icon(Icons.sort, color: AppColors.mutedText),
        initialValue: _sort,
        onSelected: (value) {
          _sort = value;
          _reloadReviews();
        },
        itemBuilder: (_) => [for (final e in _sorts.entries) PopupMenuItem(value: e.key, child: Text(e.value))],
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final restaurant = _restaurant;
    Widget body;
    if (restaurant == null) {
      body = _error != null
          ? Center(child: ErrorRetry(message: _error!, onRetry: _load))
          : const Center(child: CircularProgressIndicator());
    } else {
      final children = <Widget>[
        RestaurantHeader(restaurant: restaurant),
        const SizedBox(height: 20),
        _reviewButton(),
        const SizedBox(height: 16),
        _reviewControls(),
        const SizedBox(height: 8),
        for (final review in _reviews)
          ReviewTile(review: review, onReport: () => _report(review)),
        if (_reviewError != null)
          ErrorRetry(compact: true, message: _reviewError!, onRetry: _loadMoreReviews)
        else if (_loadingReviews)
          const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
        else if (_reviews.isEmpty)
          const EmptyState(icon: Icons.rate_review_outlined, message: 'Chưa có review nào được đăng.')
        else if (_hasMore)
          TextButton(onPressed: _loadMoreReviews, child: const Text('Xem thêm review')),
      ];
      body = RefreshIndicator(
        onRefresh: _load,
        child: NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n.metrics.pixels > n.metrics.maxScrollExtent - 300) _loadMoreReviews();
            return false;
          },
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: children),
        ),
      );
    }
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(
        backgroundColor: AppColors.page,
        foregroundColor: AppColors.warmText,
        title: Text(restaurant?.name ?? 'Quán ăn'),
      ),
      body: body,
    );
  }
}