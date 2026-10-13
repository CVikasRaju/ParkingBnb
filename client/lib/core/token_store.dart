import 'token_store_stub.dart' as impl
    if (dart.library.io) 'token_store_io.dart';

/// Platform-adaptive JWT/role storage.
///
/// Native platforms use FlutterSecureStorage (Keychain/Keystore). The Flutter
/// web target was removed on request, so only the io implementation and a
/// no-op stub (unit-test VM) are needed.
///
/// The conditional import binds `impl.TokenFactory` to a concrete
/// implementation for the current compile target.
abstract class TokenStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);

  factory TokenStore() => impl.TokenFactory();
}