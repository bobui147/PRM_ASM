import 'json_read.dart';

/// Quán ăn đọc từ API (requirements §13.4).

const areaLabels = {
  'fpt': 'Gần Đại học FPT',
  'vnu': 'Gần ĐHQG Hà Nội',
  'hhtp': 'Khu CNC Hòa Lạc',
  'other': 'Hòa Lạc khác',
};

const tagLabels = {
  'student_price': 'Giá sinh viên',
  'group_friendly': 'Hợp nhóm đông',
  'late_night': 'Mở khuya',
  'seating': 'Có chỗ ngồi',
  'takeaway': 'Mang đi',
};

class FeaturedFood {
  const FeaturedFood({required this.id, required this.name, required this.price});

  final int id;
  final String name;
  final int price;

  static FeaturedFood fromJson(Map json) => FeaturedFood(
        id: readInt(json['id']),
        name: '${json['name'] ?? ''}',
        price: readInt(json['price']),
      );
}

class MenuItem {
  const MenuItem({
    required this.foodId,
    required this.name,
    required this.price,
    required this.featured,
    this.thumbUrl,
  });

  final int foodId;
  final String name;
  final int price;
  final bool featured;
  final String? thumbUrl;

  static MenuItem fromJson(Map json) => MenuItem(
        foodId: readInt(json['foodId']),
        name: '${json['name'] ?? ''}',
        price: readInt(json['price']),
        featured: json['featured'] == true,
        thumbUrl: readString(json['thumbUrl']),
      );
}

class Restaurant {
  const Restaurant({
    required this.id,
    required this.name,
    required this.area,
    required this.address,
    required this.priceMin,
    required this.priceMax,
    required this.reviewCount,
    this.ratingAvg,
    this.googleMapsUrl,
    this.phone,
    this.openingHours,
    this.tags = const [],
    this.coverUrl,
    this.coverThumbUrl,
    this.description,
    this.foodPrice,
    this.featuredFoods = const [],
    this.menu = const [],
    this.ratingDistribution = const {},
  });

  final int id;
  final String name;
  final String area;
  final String address;
  final int priceMin;
  final int priceMax;
  final double? ratingAvg;
  final int reviewCount;
  final String? googleMapsUrl;
  final String? phone;
  final String? openingHours;
  final List<String> tags;
  final String? coverUrl;
  final String? coverThumbUrl;
  final String? description;

  /// Giá món đang xem tại quán (chỉ có ở danh sách quán theo món).
  final int? foodPrice;
  final List<FeaturedFood> featuredFoods;

  /// Chỉ có ở chi tiết quán.
  final List<MenuItem> menu;
  final Map<int, int> ratingDistribution;

  String get areaLabel => areaLabels[area] ?? area;

  static Restaurant fromJson(Map json) {
    final dist = readMap(json['ratingDistribution']);
    return Restaurant(
      id: readInt(json['id']),
      name: '${json['name'] ?? ''}',
      area: '${json['area'] ?? 'other'}',
      address: '${json['address'] ?? ''}',
      priceMin: readInt(json['priceMin']),
      priceMax: readInt(json['priceMax']),
      ratingAvg: (json['ratingAvg'] as num?)?.toDouble(),
      reviewCount: readInt(json['reviewCount']),
      googleMapsUrl: readString(json['googleMapsUrl']),
      phone: readString(json['phone']),
      openingHours: readString(json['openingHours']),
      tags: [
        if (json['tags'] is List)
          for (final t in json['tags'] as List) '$t',
      ],
      coverUrl: readString(json['coverUrl']),
      coverThumbUrl: readString(json['coverThumbUrl']),
      description: readString(json['description']),
      foodPrice: readIntOrNull(json['foodPrice']),
      featuredFoods: readMaps(json['featuredFoods']).map(FeaturedFood.fromJson).toList(),
      menu: readMaps(json['menu']).map(MenuItem.fromJson).toList(),
      ratingDistribution: {
        for (final e in dist.entries) readInt(e.key): readInt(e.value),
      },
    );
  }
}
