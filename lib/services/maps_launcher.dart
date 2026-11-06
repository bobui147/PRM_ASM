import 'maps_launcher_stub.dart'
    if (dart.library.html) 'maps_launcher_web.dart'
    if (dart.library.io) 'maps_launcher_mobile.dart' as implementation;

String googleMapsSearchUrl(String foodName) => Uri.https(
      'www.google.com',
      '/maps/search/',
      {'api': '1', 'query': '$foodName quán ăn'},
    ).toString();

Future<bool> openGoogleMaps(String foodName) =>
    implementation.openExternalUrl(googleMapsSearchUrl(foodName));

/// Tìm theo từ khóa tự do, ví dụ "Bún chả Hòa Lạc".
Future<bool> openMapsQuery(String query) => implementation.openExternalUrl(
      Uri.https('www.google.com', '/maps/search/', {'api': '1', 'query': query}).toString(),
    );

/// Mở quán: dùng link admin nhập (đã kiểm tra host ở server), nếu không có
/// thì tìm "tên quán Hòa Lạc" (FR-A05).
Future<bool> openRestaurantMaps({required String name, String? mapsUrl}) {
  final url = mapsUrl;
  if (url != null && url.startsWith('https://')) {
    return implementation.openExternalUrl(url);
  }
  return openMapsQuery('$name Hòa Lạc');
}

/// Gọi điện cho quán.
Future<bool> callPhone(String phone) =>
    implementation.openExternalUrl('tel:${phone.replaceAll(RegExp(r'[^0-9+]'), '')}');
