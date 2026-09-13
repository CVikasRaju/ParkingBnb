import 'package:flutter_test/flutter_test.dart';
import 'package:parkpeer/core/geolocation.dart';
import 'package:parkpeer/features/provider/scanner_screen.dart';

void main() {
  group('haversineMeters', () {
    test('zero distance at same point', () {
      expect(haversineMeters(12.9716, 77.5946, 12.9716, 77.5946), lessThan(0.001));
    });

    test('handles ~111km per degree on the equator', () {
      // 1 degree of latitude at equator ≈ 111.19 km
      final d = haversineMeters(0, 0, 1, 0);
      expect(d, closeTo(111195, 500));
    });
  });

  group('isWithinGeofence', () {
    test('40m is inside the 50m fence', () {
      // 0.0004 degrees lat ≈ 44m
      expect(
        isWithinGeofence(driverLat: 12.9712, driverLng: 77.5946, spotLat: 12.9716, spotLng: 77.5946),
        isTrue,
      );
    });

    test('1km is outside', () {
      expect(
        isWithinGeofence(driverLat: 12.98, driverLng: 77.5946, spotLat: 12.9716, spotLng: 77.5946),
        isFalse,
      );
    });
  });

  group('decodeBookingId', () {
    test('no payload returns null', () {
      expect(ProviderScannerScreen.decodeBookingId('abc'), isNull);
      expect(ProviderScannerScreen.decodeBookingId('a.b'), isNull);
    });
    test('extracts booking_id from payload', () {
      final header = _b64Url('{"alg":"HS256"}');
      final payload = _b64Url('{"booking_id":"b1"}');
      final token = '$header.$payload.sig';
      expect(ProviderScannerScreen.decodeBookingId(token), 'b1');
    });
  });
}

String _b64Url(String input) {
  final bytes = List<int>.from(input.codeUnits);
  const codes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  final out = StringBuffer();
  for (var i = 0; i < bytes.length; i += 3) {
    final b0 = bytes[i];
    final b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    final b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out.write(codes[b0 >> 2]);
    out.write(codes[((b0 & 3) << 4) | (b1 >> 4)]);
    if (i + 1 < bytes.length) {
      out.write(codes[((b1 & 15) << 2) | (b2 >> 6)]);
    }
    if (i + 2 < bytes.length) {
      out.write(codes[b2 & 63]);
    }
  }
  return out.toString();
}