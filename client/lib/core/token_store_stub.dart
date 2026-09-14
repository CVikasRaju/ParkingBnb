import 'token_store.dart';

/// Fallback implementation (non-IO, non-HTML platforms, e.g. unit-test VM).
class TokenFactory implements TokenStore {
  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> delete(String key) async {}
}