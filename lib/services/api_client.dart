import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// Địa chỉ API. Đổi khi build: `--dart-define=API_BASE_URL=http://10.0.2.2:9999/api/v1`.
const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://homnayangi.site/api/v1',
);

const _timeout = Duration(seconds: 20);

/// Lỗi server theo dạng `{ error: { code, message, fields } }`,
/// hoặc lỗi mạng (`code = NETWORK_ERROR`).
class ApiException implements Exception {
  ApiException(
    this.status,
    this.code,
    this.message, {
    this.fields = const {},
    this.details = const {},
  });

  factory ApiException.network() => ApiException(
        0,
        'NETWORK_ERROR',
        'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );

  final int status;
  final String code;
  final String message;
  final Map<String, String> fields;
  final Map<String, Object?> details;

  bool get isNetwork => code == 'NETWORK_ERROR';

  @override
  String toString() => 'ApiException($status $code: $message)';
}

/// Cung cấp access token và làm mới khi hết hạn (AuthService cài đặt).
abstract interface class TokenProvider {
  String? get accessToken;

  /// Trả true nếu làm mới thành công.
  Future<bool> refresh();
}

class ApiResponse {
  ApiResponse(this.status, this.body, this.headers);

  final int status;
  final Object? body;
  final Map<String, String> headers;

  Map<String, dynamic> get json => (body as Map).cast<String, dynamic>();
}

/// Ảnh gửi kèm multipart: tên trường và byte của file.
class UploadFile {
  UploadFile(this.field, this.bytes, this.filename);

  final String field;
  final List<int> bytes;
  final String filename;
}

class ApiClient {
  ApiClient({http.Client? httpClient, String baseUrl = apiBaseUrl})
      : _http = httpClient ?? http.Client(),
        _baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), '');

  final http.Client _http;
  final String _baseUrl;

  /// Gán sau khi tạo AuthService.
  TokenProvider? tokens;

  Uri uri(String path, [Map<String, Object?>? query]) {
    final params = <String, String>{
      for (final entry in (query ?? const <String, Object?>{}).entries)
        if (entry.value != null) entry.key: '${entry.value}',
    };
    return Uri.parse('$_baseUrl$path')
        .replace(queryParameters: params.isEmpty ? null : params);
  }

  Future<ApiResponse> get(
    String path, {
    Map<String, Object?>? query,
    Map<String, String>? headers,
  }) =>
      _send(() => http.Request('GET', uri(path, query)), headers: headers);

  Future<ApiResponse> post(String path, [Object? body]) =>
      _send(() => _jsonRequest('POST', path, body));

  Future<ApiResponse> patch(String path, Object? body) =>
      _send(() => _jsonRequest('PATCH', path, body));

  Future<ApiResponse> put(String path, [Object? body]) =>
      _send(() => _jsonRequest('PUT', path, body));

  Future<ApiResponse> delete(String path, [Object? body]) =>
      _send(() => _jsonRequest('DELETE', path, body));

  /// Multipart (review có ảnh). Danh sách được gửi dạng `ten[0]`, `ten[1]`
  /// để multer đọc thành mảng.
  Future<ApiResponse> multipart(
    String method,
    String path, {
    Map<String, Object?> fields = const {},
    Map<String, List<Object>> listFields = const {},
    List<UploadFile> files = const [],
  }) =>
      _send(() {
        final request = http.MultipartRequest(method, uri(path));
        for (final entry in fields.entries) {
          if (entry.value != null) request.fields[entry.key] = '${entry.value}';
        }
        for (final entry in listFields.entries) {
          for (final (index, value) in entry.value.indexed) {
            request.fields['${entry.key}[$index]'] = '$value';
          }
        }
        for (final file in files) {
          request.files.add(http.MultipartFile.fromBytes(
            file.field,
            file.bytes,
            filename: file.filename,
          ));
        }
        return request;
      });

  http.Request _jsonRequest(String method, String path, Object? body) {
    final request = http.Request(method, uri(path));
    if (body != null) {
      request.headers['Content-Type'] = 'application/json; charset=utf-8';
      request.body = jsonEncode(body);
    }
    return request;
  }

  Future<ApiResponse> _send(
    http.BaseRequest Function() build, {
    Map<String, String>? headers,
    bool retried = false,
  }) async {
    final request = build();
    request.headers['Accept'] = 'application/json';
    if (headers != null) request.headers.addAll(headers);
    final token = tokens?.accessToken;
    if (token != null) request.headers['Authorization'] = 'Bearer $token';

    http.Response response;
    try {
      response = await http.Response.fromStream(
        await _http.send(request).timeout(_timeout),
      ).timeout(_timeout);
    } on TimeoutException {
      throw ApiException.network();
    } on http.ClientException {
      throw ApiException.network();
    } catch (error) {
      // SocketException/HandshakeException (dart:io) không có trên web.
      final text = '$error';
      if (text.contains('Socket') || text.contains('Handshake')) {
        throw ApiException.network();
      }
      rethrow;
    }

    Object? body;
    if (response.bodyBytes.isNotEmpty) {
      try {
        body = jsonDecode(utf8.decode(response.bodyBytes));
      } on FormatException {
        body = null;
      }
    }

    // Access token hết hạn: làm mới một lần rồi gửi lại (FR-M11).
    final provider = tokens;
    if (response.statusCode == 401 &&
        !retried &&
        provider != null &&
        _errorCode(body) == 'TOKEN_EXPIRED' &&
        await provider.refresh()) {
      return _send(build, headers: headers, retried: true);
    }

    if (response.statusCode >= 400) {
      throw _toException(response.statusCode, body);
    }
    return ApiResponse(response.statusCode, body, response.headers);
  }

  static String? _errorCode(Object? body) {
    if (body is Map && body['error'] is Map) {
      return (body['error'] as Map)['code'] as String?;
    }
    return null;
  }

  static ApiException _toException(int status, Object? body) {
    if (body is Map && body['error'] is Map) {
      final error = (body['error'] as Map).cast<String, Object?>();
      final fields = error['fields'];
      return ApiException(
        status,
        error['code'] as String? ?? 'ERROR',
        error['message'] as String? ?? 'Đã có lỗi xảy ra',
        fields: fields is Map
            ? {for (final e in fields.entries) '${e.key}': '${e.value}'}
            : const {},
        details: error,
      );
    }
    return ApiException(
      status,
      'HTTP_$status',
      'Máy chủ đang gặp sự cố, vui lòng thử lại sau.',
    );
  }
}
