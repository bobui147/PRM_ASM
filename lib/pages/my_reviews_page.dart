import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/review.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';
import '../widgets/review_tile.dart';
import 'restaurant_detail_page.dart';

/// Review của tôi ở mọi trạng thái, kèm lý do từ chối (FR-U05).
class MyReviewsPage extends StatefulWidget {
  const MyReviewsPage({super.key, required this.services});

  final AppServices services;

  @override
  State<MyReviewsPage> createState() => _MyReviewsPageState();
}

class _MyReviewsPageState extends State<MyReviewsPage> {
  final List<Review> _items = [];
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadMore();
  }

  Future<void> _reload() async {
    setState(() {
      _items.clear();
      _page = 0;
      _hasMore = true;
    });
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.services.restaurants.myReviews(page: _page + 1);
      if (!mounted) return;
      setState(() {
        _items.addAll(result.items);
        _page = result.page;
        _hasMore = result.hasMore;
      });
    } catch (error) {
      if (mounted) setState(() => _error = errorText(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_items.isEmpty && _error != null) {
      body = Center(child: ErrorRetry(message: _error!, onRetry: _reload));
    } else if (_items.isEmpty && !_loading) {
      body = const Center(child: EmptyState(icon: Icons.rate_review_outlined, message: 'Bạn chưa viết review nào.'));
    } else {
      body = RefreshIndicator(
        onRefresh: _reload,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          for (final review in _items) ...[
            if (review.restaurantName != null)
              TextButton.icon(
                style: TextButton.styleFrom(alignment: Alignment.centerLeft, padding: EdgeInsets.zero),
                onPressed: () async {
                  await Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) =>
                        RestaurantDetailPage(restaurantId: review.restaurantId, services: widget.services),
                  ));
                  if (mounted) _reload();
                },
                icon: const Icon(Icons.storefront, size: 18),
                label: Text(review.restaurantName!),
              ),
            ReviewTile(review: review, mine: true),
          ],
          if (_loading) const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
          if (_error != null) ErrorRetry(compact: true, message: _error!, onRetry: _loadMore),
          if (_hasMore && !_loading && _error == null)
            TextButton(onPressed: _loadMore, child: const Text('Xem thêm')),
        ]),
      );
    }
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(
        backgroundColor: AppColors.page,
        foregroundColor: AppColors.warmText,
        title: const Text('Review của tôi'),
      ),
      body: body,
    );
  }
}
