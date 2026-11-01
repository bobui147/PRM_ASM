import 'package:flutter/services.dart';

const _channel = MethodChannel('prmgr5/external_links');

Future<bool> shareText(String text) async {
  try {
    return await _channel.invokeMethod<bool>('shareText', {'text': text}) ??
        false;
  } on MissingPluginException {
    return false;
  } on PlatformException {
    return false;
  }
}
