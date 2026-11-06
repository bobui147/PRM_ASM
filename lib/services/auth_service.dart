import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/json_read.dart';
import 'api_client.dart';

/// Người dùng đang đăng nhập (`user` trong API, requirements §13.2).
class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    required this.displayName,
    this.blockedReason,
    this.blockedUntil,
    this.blocked = false,
  });

  final int id;
  final String email;
  final String displayName;
  final bool blocked;
  final String? blockedReason;

  /// null khi khóa vĩnh viễn.
  final DateTime? blockedUntil;

  String get initial => displayName.trim().isEmpty ? '?' : displayName.trim()[0].toUpperCase();

  static AppUser fromJson(Map json) {
    final block = json['blocked'];
    return AppUser(
      id: readInt(json['id']),
      email: '${json['email'] ?? ''}',
      displayName: '${json['displayName'] ?? ''}',
      blocked: block is Map,
      blockedReason: block is Map ? readString(block['reason']) : null,
      blockedUntil: block is Map ? readDate(block['until']) : null,
    );
  }
}

/// Lưu token. Mặc định dùng secure storage; test truyền bản trong bộ nhớ.
abstract interface class TokenStore {
  Future<(String?, String?)> read();
  Future<void> write(String access, String refresh);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _accessKey = 'access_token';
  static const _refreshKey = 'refresh_token';

  @override
  Future<(String?, String?)> read() async =>
      (await _storage.read(key: _accessKey), await _storage.read(key: _refreshKey));

  @override
  Future<void> write(String access, String refresh) async {
    await _storage.write(key: _accessKey, value: access);
    await _storage.write(key: _refreshKey, value: refresh);
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}

class MemoryTokenStore implements TokenStore {
  String? _access;
  String? _refresh;

  @override
  Future<(String?, String?)> read() async => (_access, _refresh);

  @override
  Future<void> write(String access, String refresh) async {
    _access = access;
    _refresh = refresh;
  }

  @override
  Future<void> clear() async {
    _access = null;
    _refresh = null;
  }
}

/// Kết quả đăng ký/gửi lại OTP.
class OtpInfo {
  const OtpInfo({required this.expiresIn, required this.resendAfter});

  final int expiresIn;
  final int resendAfter;

  static OtpInfo fromJson(Map json) => OtpInfo(
        expiresIn: readInt(json['otpExpiresIn'], 600),
        resendAfter: readInt(json['resendAfter'], 60),
      );
}

/// Trạng thái đăng nhập và các thao tác tài khoản (FR-U01..FR-U05, FR-M10, FR-M11).
class AuthService extends ChangeNotifier implements TokenProvider {
  AuthService(this._api, {TokenStore? store}) : _store = store ?? SecureTokenStore() {
    _api.tokens = this;
  }

  final ApiClient _api;
  final TokenStore _store;
  String? _accessToken;
  String? _refreshToken;
  AppUser? _user;
  Future<bool>? _refreshing;

  /// Báo một lần khi phiên hết hạn và bị đăng xuất (UI hiện SnackBar).
  final ValueNotifier<String?> sessionMessage = ValueNotifier(null);

  AppUser? get user => _user;
  bool get isSignedIn => _user != null;

  @override
  String? get accessToken => _accessToken;

  /// Đọc token đã lưu và tải hồ sơ. Lỗi mạng thì giữ token để thử lại sau.
  Future<void> restore() async {
    try {
      final (access, refresh) = await _store.read();
      _accessToken = access;
      _refreshToken = refresh;
    } catch (error) {
      debugPrint('Không đọc được token: $error');
      return;
    }
    if (_refreshToken == null) return;
    try {
      await reloadProfile();
    } on ApiException catch (error) {
      if (!error.isNetwork) await _clear();
    }
  }

  Future<void> reloadProfile() async {
    final response = await _api.get('/me');
    _user = AppUser.fromJson(response.json);
    notifyListeners();
  }

  Future<void> _saveSession(Map<String, dynamic> json) async {
    _accessToken = json['accessToken'] as String?;
    _refreshToken = json['refreshToken'] as String?;
    if (_accessToken != null && _refreshToken != null) {
      await _store.write(_accessToken!, _refreshToken!);
    }
    final user = json['user'];
    if (user is Map) {
      _user = AppUser.fromJson(user);
    } else {
      await reloadProfile();
    }
    notifyListeners();
  }

  Future<void> _clear() async {
    _accessToken = null;
    _refreshToken = null;
    _user = null;
    await _store.clear();
    notifyListeners();
  }

  /// Gom nhiều request cùng hết hạn về một lần làm mới.
  @override
  Future<bool> refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final token = _refreshToken;
    if (token == null) return false;
    try {
      final response = await _api.post('/auth/refresh', {'refreshToken': token});
      final json = response.json;
      _accessToken = json['accessToken'] as String?;
      _refreshToken = json['refreshToken'] as String?;
      await _store.write(_accessToken!, _refreshToken!);
      return true;
    } on ApiException catch (error) {
      if (error.isNetwork) return false;
      await _clear();
      sessionMessage.value = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';
      return false;
    }
  }

  Future<OtpInfo> register(String email, String password, String displayName) async {
    final response = await _api.post('/auth/register', {
      'email': email.trim(),
      'password': password,
      'displayName': displayName.trim(),
    });
    return OtpInfo.fromJson(response.json);
  }

  Future<void> verifyEmail(String email, String code) async {
    final response = await _api.post('/auth/verify-email', {'email': email.trim(), 'code': code.trim()});
    await _saveSession(response.json);
  }

  Future<OtpInfo> resendOtp(String email, {String purpose = 'verify_email'}) async {
    final response = await _api.post('/auth/resend-otp', {'email': email.trim(), 'purpose': purpose});
    return OtpInfo.fromJson(response.json);
  }

  /// Ném ApiException `EMAIL_NOT_VERIFIED` nếu chưa xác minh.
  Future<void> login(String email, String password) async {
    final response = await _api.post('/auth/login', {'email': email.trim(), 'password': password});
    await _saveSession(response.json);
  }

  Future<void> forgotPassword(String email) async {
    await _api.post('/auth/forgot-password', {'email': email.trim()});
  }

  Future<void> resetPassword(String email, String code, String newPassword) async {
    final response = await _api.post('/auth/reset-password', {
      'email': email.trim(),
      'code': code.trim(),
      'newPassword': newPassword,
    });
    await _saveSession(response.json);
  }

  Future<void> logout() async {
    final token = _refreshToken;
    if (token != null) {
      try {
        await _api.post('/auth/logout', {'refreshToken': token});
      } on ApiException {
        // Vẫn đăng xuất trên máy dù server không phản hồi.
      }
    }
    await _clear();
  }

  Future<void> updateDisplayName(String name) async {
    final response = await _api.patch('/me', {'displayName': name.trim()});
    _user = AppUser.fromJson(response.json);
    notifyListeners();
  }

  Future<void> changePassword(String current, String next) async {
    final response = await _api.post('/me/change-password', {
      'currentPassword': current,
      'newPassword': next,
    });
    await _saveSession(response.json);
  }

  Future<void> deleteAccount(String password) async {
    await _api.delete('/me', {'password': password});
    await _clear();
  }

  @override
  void dispose() {
    sessionMessage.dispose();
    super.dispose();
  }
}