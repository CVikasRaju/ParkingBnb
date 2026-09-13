import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

/// Thin typed API client for the ParkPeer backend (`/api/v1`).
///
/// Stores the JWT in secure storage and transparently attaches
/// `Authorization: Bearer …` to every request. All responses follow the
/// `{ success, data | error }` envelope from docs/API_SPEC.md.
class ApiClient {
  ApiClient({String? baseUrl, http.Client? httpClient})
      : baseUrl = baseUrl ?? _defaultBaseUrl,
        _http = httpClient ?? http.Client();

  final String baseUrl;
  final http.Client _http;
  static const _storage = FlutterSecureStorage();
  static const _tokenKey = 'parkpeer.jwt';
  static const _roleKey = 'parkpeer.role';

  String? _token;
  String? _role;

  static String get _defaultBaseUrl {
    if (kIsWeb) return 'https://localhost:8080/api/v1';
    if (Platform.isAndroid) {
      // 10.0.2.2 = host loopback from the Android emulator.
      return 'http://10.0.2.2:8080/api/v1';
    }
    return 'http://localhost:8080/api/v1';
  }

  String get basePath => baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  /// Persist the JWT after login/register.
  Future<void> persistSession(String token, String role) async {
    _token = token;
    _role = role;
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _roleKey, value: role);
  }

  Future<void> restoreSession() async {
    _token = await _storage.read(key: _tokenKey);
    _role = await _storage.read(key: _roleKey);
  }

  Future<void> clearSession() async {
    _token = null;
    _role = null;
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _roleKey);
  }

  String? get role => _role;
  String? get token => _token;
  bool get isAuthenticated => _token != null;

  /// Perform a request and return the decoded `data` object.
  /// Throws [ApiException] with a server-provided message on non-2xx.
  Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
  }) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    final encoded = body == null ? null : jsonEncode(body);

    final resp = await switch (method.toUpperCase()) {
      'GET' => _http.get(uri, headers: _headers),
      'POST' => _http.post(uri, headers: _headers, body: encoded),
      'PATCH' => _http.patch(uri, headers: _headers, body: encoded),
      'DELETE' => _http.delete(uri, headers: _headers),
      _ => throw ArgumentError('Unsupported method $method'),
    };

    final decoded = resp.body.isEmpty ? null : jsonDecode(resp.body);
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return decoded is Map<String, dynamic> ? decoded['data'] : decoded;
    }
    final msg = decoded is Map<String, dynamic>
        ? (decoded['error'] ?? decoded['message'] ?? 'Request failed')
            .toString()
        : 'HTTP ${resp.statusCode}';
    throw ApiException(resp.statusCode, msg);
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) =>
      request('GET', path, query: query);
  Future<dynamic> post(String path, {Map<String, dynamic>? body}) =>
      request('POST', path, body: body);
  Future<dynamic> patch(String path, {Map<String, dynamic>? body}) =>
      request('PATCH', path, body: body);

  /// Auth: returns `{ token, user }`.
  Future<Map<String, dynamic>> login(String email, String password) =>
      _auth('auth/login', email, password);

  /// Register with an explicit role and phone.
  Future<Map<String, dynamic>> register({
    required String fullName,
    required String email,
    required String phone,
    required String password,
    required String role,
  }) async {
    final data = await post('auth/register', body: {
      'full_name': fullName,
      'email': email,
      'phone_number': phone,
      'password': password,
      'role': role,
    });
    await _persistUser(data);
    return data as Map<String, dynamic>;
  }

  Future<void> _persistUser(dynamic data) async {
    final m = (data as Map<String, dynamic>);
    final token = m['token'] as String;
    final user = (m['user'] ?? m) as Map<String, dynamic>;
    final role = (user['role'] ?? 'driver') as String;
    await persistSession(token, role);
  }

  Future<Map<String, dynamic>> _auth(
      String path, String email, String password) async {
    final data = await post(path, body: {
      'email': email,
      'password': password,
    });
    await _persistUser(data);
    return data as Map<String, dynamic>;
  }

  /// `GET /spots/search` — radial PostGIS search.
  Future<List<dynamic>> searchSpots({
    required double lat,
    required double lng,
    double radiusM = 2000,
    String? startTime,
    double? durationHours,
  }) async {
    final q = <String, String>{
      'lat': '$lat',
      'lng': '$lng',
      'radius_m': '$radiusM',
      if (startTime != null) 'start_time': startTime,
      if (durationHours != null) 'duration_hours': '$durationHours',
    };
    final data = await get('spots/search', query: q);
    return (data as List).cast<dynamic>();
  }
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;

  @override
  String toString() => 'ApiException($statusCode): $message';
}