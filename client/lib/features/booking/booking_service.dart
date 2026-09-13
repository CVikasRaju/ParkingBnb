import '../../core/api_client.dart';

/// Server models for bookings and spots (docs/API_SPEC.md §4–§5).
class SpotListing {
  SpotListing.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = (j['title'] ?? '') as String,
        address = (j['address'] ?? '') as String,
        hourlyRate = (j['hourly_rate'] is num)
            ? (j['hourly_rate'] as num).toDouble()
            : double.tryParse('${j['hourly_rate']}') ?? 0,
        latitude = (j['latitude'] as num).toDouble(),
        longitude = (j['longitude'] as num).toDouble(),
        distanceMeters = (j['distance_meters'] as num?)?.toDouble(),
        hasIotBarrier = (j['has_iot_barrier'] ?? false) as bool;

  final String id;
  final String title;
  final String address;
  final double hourlyRate;
  final double latitude;
  final double longitude;
  final double? distanceMeters;
  final bool hasIotBarrier;
}

class BookingDetails {
  BookingDetails.fromJson(Map<String, dynamic> j)
      : bookingId = j['booking_id'] as String,
        status = (j['status'] ?? '') as String,
        baseAmount = (j['base_amount'] is num)
            ? (j['base_amount'] as num).toDouble()
            : _tryNum(j['base_amount']),
        lockExpiresAt = j['lock_expires_at'] as String?,
        currency = (j['currency'] ?? 'INR') as String;

  final String bookingId;
  final String status;
  final double baseAmount;
  final String? lockExpiresAt;
  final String currency;

  static double _tryNum(dynamic v) =>
      v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
}

class BookingService {
  BookingService(this._api);
  final ApiClient _api;

  /// `POST /bookings/lock` — acquires the atomic Redis lock + auth capture.
  Future<BookingDetails> lockSpot({
    required String spotId,
    required String vehicleId,
    required DateTime startTime,
    required double durationHours,
  }) async {
    final data = await _api.post('bookings/lock', body: {
      'spot_id': spotId,
      'vehicle_id': vehicleId,
      'start_time': startTime.toUtc().toIso8601String(),
      'duration_hours': durationHours,
    });
    return BookingDetails.fromJson(data as Map<String, dynamic>);
  }

  /// `POST /bookings/{id}/confirm-payment` — payment confirmed → `reserved`.
  Future<Map<String, dynamic>> confirmPayment(
    String bookingId, {
    required String paymentId,
    String signature = 'client-confirmed',
  }) async {
    final data = await _api.post('bookings/$bookingId/confirm-payment', body: {
      'payment_id': paymentId,
      'signature': signature,
    });
    return data as Map<String, dynamic>;
  }

  /// `POST /bookings/{id}/check-in` — any of the verification methods.
  Future<Map<String, dynamic>> checkIn(
    String bookingId, {
    String? method,
    String? pinCode,
    String? qrToken,
    double? latitude,
    double? longitude,
  }) async {
    final data = await _api.post('bookings/$bookingId/check-in', body: {
      'method': method ?? _pickMethod(),
      if (pinCode != null) 'pin_code': pinCode,
      if (qrToken != null) 'qr_token': qrToken,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
    });
    return data as Map<String, dynamic>;
  }

  static String _pickMethod() => 'pin';

  /// `POST /bookings/{id}/check-out` — ends session, splits escrow.
  Future<Map<String, dynamic>> checkOut(String bookingId) async {
    final data = await _api.post('bookings/$bookingId/check-out');
    return data as Map<String, dynamic>;
  }

  /// `POST /bookings/{id}/cancel` — driver cancels before check-in.
  Future<Map<String, dynamic>> cancel(String bookingId) async {
    final data = await _api.post('bookings/$bookingId/cancel');
    return data as Map<String, dynamic>;
  }

  /// `GET /bookings/{id}/qr` — fresh server-signed QR payload for rotation.
  Future<Map<String, dynamic>> getQrToken(String bookingId) async {
    final data = await _api.get('bookings/$bookingId/qr');
    return data as Map<String, dynamic>;
  }

  /// `POST /disputes/report` — Report Blocked Spot flow (auto-refund).
  Future<Map<String, dynamic>> reportBlockedSpot(
    String bookingId, {
    String reason = 'spot_blocked',
    List<String> photoUrls = const [],
    String? notes,
  }) async {
    final data = await _api.post('disputes/report', body: {
      'booking_id': bookingId,
      'reason': reason,
      if (photoUrls.isNotEmpty) 'photos': photoUrls,
      if (notes != null) 'description': notes,
    });
    return data as Map<String, dynamic>;
  }
}