import 'package:web/web.dart' as web;

import 'token_store.dart';

/// Web implementation backed by `window.localStorage`.
class TokenFactory implements TokenStore {
  @override
  Future<String?> read(String key) async => web.window.localStorage.getItem(key);

  @override
  Future<void> write(String key, String value) async {
    web.window.localStorage.setItem(key, value);
  }

  @override
  Future<void> delete(String key) async {
    web.window.localStorage.removeItem(key);
  }
}
