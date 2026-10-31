import 'dart:js_interop';

@JS('window.open')
external JSAny? _openWindow(String url, String target, String features);

Future<bool> openExternalUrl(String url) async {
  _openWindow(url, '_blank', 'noopener');
  return true;
}
