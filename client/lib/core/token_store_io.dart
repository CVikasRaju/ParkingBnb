import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'token_store.dart';

const _storage = FlutterSecureStorage();

/// Native implementation backed by the platform Keychain/Keystore.
class TokenFactory implements TokenStore {
  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}