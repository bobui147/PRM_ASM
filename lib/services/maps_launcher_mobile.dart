import 'package:flutter/services.dart';

const _channel = MethodChannel('prmgr5/external_links');

Future<bool> openExternalUrl(String url) async {
  try {
    return await _channel.invokeMethod<bool>('openUrl', {'url': url}) ?? false;
  } on MissingPluginException {
    return false;
  } on PlatformException {
    return false;
  }
}
