import 'token_store_stub.dart' as impl
    if (dart.library.io) 'token_store_io.dart'
    if (dart.library.html) 'token_store_web.dart';

/// Platform-adaptive JWT/role storage.
///
/// Native platforms use FlutterSecureStorage (Keychain/Keystore). The web uses
/// `window.localStorage`, the supported storage primitive there, avoiding
/// web-secure-storage bootstrap failures in browsers.
///
/// The conditional import binds `impl.TokenFactory` to a concrete
/// implementation for the current compile target.
abstract class TokenStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);

  factory TokenStore() => impl.TokenFactory();
}