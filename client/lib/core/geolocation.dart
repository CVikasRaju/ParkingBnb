import 'dart:math' as math;

import 'package:geolocator/geolocator.dart';

/// Wraps platform geolocation with explicit permission handling.
class GeoLocatorService {
  /// Returns the device's current coordinates, or null if denied.
  Future<LatLngDevice?> currentPosition({bool forceFresh = false}) async {
    var permitted = await Geolocator.checkPermission();
    if (permitted == LocationPermission.denied) {
      permitted = await Geolocator.requestPermission();
    }
    if (permitted == LocationPermission.denied ||
        permitted == LocationPermission.deniedForever) {
      return null;
    }

    final pos = await Geolocator.getCurrentPosition(
      locationSettings: LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 15),
      ),
    );
    return LatLngDevice(pos.latitude, pos.longitude);
  }
}

class LatLngDevice {
  const LatLngDevice(this.latitude, this.longitude);
  final double latitude;
  final double longitude;
}

/// Client-side copy of the server's Haversine distance (backend/src/lib/geo.ts).
/// The server recomputes this authoritatively; the client uses it only for a
/// driver-facing "you are in range" hint before submitting check-in.
double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371000.0; // Earth radius, meters
  final dLat = _rad(lat2 - lat1);
  final dLng = _rad(lng2 - lng1);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(_rad(lat1)) * math.cos(_rad(lat2)) *
          math.sin(dLng / 2) * math.sin(dLng / 2);
  return 2 * r * math.asin(math.sqrt(a));
}

bool isWithinGeofence({
  required double driverLat,
  required double driverLng,
  required double spotLat,
  required double spotLng,
  double maxMeters = 50,
}) {
  return haversineMeters(driverLat, driverLng, spotLat, spotLng) <= maxMeters;
}

double _rad(double deg) => deg * math.pi / 180.0;