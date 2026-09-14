import 'dart:html' as html;

import 'token_store.dart';

/// Web implementation backed by `window.localStorage`.
class TokenFactory implements TokenStore {
  @override
  Future<String?> read(String key) async => html.window.localStorage[key];

  @override
  Future<void> write(String key, String value) async {
    html.window.localStorage[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    html.window.localStorage.remove(key);
  }
}