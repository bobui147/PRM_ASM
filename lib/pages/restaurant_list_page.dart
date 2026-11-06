import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import '../models/restaurant.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';
import '../widgets/restaurant_card.dart';
import 'restaurant_detail_page.dart';

/// Tất cả quán bán một món: lọc khu vực, sắp xếp, cuộn vô hạn (FR-M08).
class RestaurantListPage extends StatefulWidget {
  const RestaurantListPage({super.key, required this.food, required this.services});

  final FoodItem food;
  final AppServices services;

  @override
  State<RestaurantListPage> createState() => _RestaurantListPageState();
}

class _RestaurantListPageState extends State<RestaurantListPage> {
  static const _sorts = {'rating': 'Đánh giá cao', 'reviews': 'Nhiều review', 'price': 'Giá thấp'};

  final _scroll = ScrollController();
  final List<Restaurant> _items = [];
  String? _area;
  String _sort = 'rating';
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  String? _error;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
    });
    _reload();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _reload() {
    _generation++;
    setState(() {
      _items.clear();
      _page = 0;
      _hasMore = true;
      _error = null;
      _loading = false;
    });
    _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;
    final generation = _generation;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.services.restaurants.restaurantsForFood(
        widget.food.id,
        page: _page + 1,
        area: _area,
        sort: _sort,
        budget: widget.services.library.budget.targetPrice,
      );
      if (!mounted || generation != _generation) return;
      setState(() {
        _items.addAll(result.items);
        _page = result.page;
        _hasMore = result.hasMore;
      });
    } catch (error) {
      if (!mounted || generation != _generation) return;
      setState(() => _error = errorText(error));
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  Widget _filters() {
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          for (final entry in [const MapEntry<String?, String>(null, 'Tất cả'), ...areaLabels.entries])
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(entry.value),
                selected: _area == entry.key,
                onSelected: (_) {
                  _area = entry.key;
                  _reload();
                },
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final showInitialError = _error != null && _items.isEmpty;
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(
        backgroundColor: AppColors.page,
        foregroundColor: AppColors.warmText,
        title: Text(widget.food.name),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Sắp xếp',
            icon: const Icon(Icons.sort),
            initialValue: _sort,
            onSelected: (value) {
              _sort = value;
              _reload();
            },
            itemBuilder: (_) => [
              for (final e in _sorts.entries) PopupMenuItem(value: e.key, child: Text(e.value)),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          _filters(),
          Expanded(
            child: showInitialError
                ? Center(child: ErrorRetry(message: _error!, onRetry: _reload))
                : !_loading && _items.isEmpty
                    ? const Center(
                        child: EmptyState(
                          icon: Icons.storefront_outlined,
                          message: 'Chưa có quán nào trong khu vực này.',
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () async => _reload(),
                        child: ListView.builder(
                          controller: _scroll,
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                          itemCount: _items.length + 1,
                          itemBuilder: (context, index) {
                            if (index < _items.length) {
                              final r = _items[index];
                              return RestaurantCard(
                                restaurant: r,
                                onOpen: () => Navigator.of(context).push(MaterialPageRoute(
                                  builder: (_) => RestaurantDetailPage(restaurantId: r.id, services: widget.services),
                                )),
                              );
                            }
                            if (_error != null) {
                              return ErrorRetry(compact: true, message: _error!, onRetry: _loadMore);
                            }
                            if (_loading) {
                              return const Padding(
                                padding: EdgeInsets.all(16),
                                child: Center(child: CircularProgressIndicator()),
                              );
                            }
                            return const SizedBox(height: 8);
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
