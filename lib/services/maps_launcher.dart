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
