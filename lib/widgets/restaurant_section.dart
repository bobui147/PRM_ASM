import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../models/food_item.dart';
import '../models/json_read.dart';
import '../models/restaurant.dart';
import '../pages/restaurant_detail_page.dart';
import '../pages/restaurant_list_page.dart';
import '../services/app_services.dart';
import '../services/maps_launcher.dart';
import 'common.dart';
import 'restaurant_card.dart';

/// "Quán phù hợp tại Hòa Lạc" dưới kết quả quay: tối đa 3 quán (FR-M07).
class RestaurantSection extends StatefulWidget {
  const RestaurantSection({super.key, required this.food, required this.services});

  final FoodItem food;
  final AppServices services;

  @override
  State<RestaurantSection> createState() => _RestaurantSectionState();
}

class _RestaurantSectionState extends State<RestaurantSection> {
  late Future<PageResult<Restaurant>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<PageResult<Restaurant>> _load() => widget.services.restaurants.restaurantsForFood(
        widget.food.id,
        limit: 3,
        budget: widget.services.library.budget.targetPrice,
      );

  void _retry() => setState(() => _future = _load());

  void _openRestaurant(Restaurant restaurant) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => RestaurantDetailPage(restaurantId: restaurant.id, services: widget.services),
    ));
  }

  void _openAll() {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => RestaurantListPage(food: widget.food, services: widget.services),
    ));
  }

  Future<void> _searchMaps() async {
    final opened = await openMapsQuery('${widget.food.name} Hòa Lạc');
    if (!opened && mounted) showSnack(context, 'Không thể mở Google Maps.');
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('restaurant-section'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'QUÁN PHÙ HỢP TẠI HÒA LẠC',
          style: TextStyle(color: AppColors.warmText, fontWeight: FontWeight.w800, letterSpacing: 0.8),
        ),
        const SizedBox(height: 10),
        FutureBuilder<PageResult<Restaurant>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Column(
                key: Key('restaurant-loading'),
                children: [RestaurantSkeleton(), RestaurantSkeleton(), RestaurantSkeleton()],
              );
            }
            if (snapshot.hasError) {
              return ErrorRetry(
                key: const Key('restaurant-error'),
                compact: true,
                message: 'Không tải được danh sách quán.',
                onRetry: _retry,
              );
            }
            final result = snapshot.data!;
            if (result.items.isEmpty) {
              return EmptyState(
                key: const Key('restaurant-empty'),
                icon: Icons.storefront_outlined,
                message: 'Chưa có quán Hòa Lạc nào được ghi nhận cho món này.',
                action: OutlinedButton.icon(
                  onPressed: _searchMaps,
                  icon: const Icon(Icons.map_outlined),
                  label: const Text('Tìm trên Google Maps'),
                ),
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final restaurant in result.items)
                  RestaurantCard(restaurant: restaurant, compact: true, onOpen: () => _openRestaurant(restaurant)),
                if (result.total > result.items.length)
                  TextButton(
                    key: const Key('all-restaurants-button'),
                    onPressed: _openAll,
                    child: Text('Xem tất cả quán (${result.total})'),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}
