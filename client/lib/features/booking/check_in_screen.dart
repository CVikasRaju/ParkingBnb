import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/geolocation.dart';
import '../booking/booking_service.dart';

/// Sprint 3 — Driver-side check-in screen (Phase 3).
///
/// Supports the three low-tech methods from ARCHITECTURE §4:
///  - PIN: driver enters the server-issued 4-digit PIN
///  - QR: provider scans the rotating QR (this screen wires a manual entry
///    fallback plus the geofence button as primary UX)
///  - Geofence: auto check-in when within 50 m of the spot
class CheckInScreen extends StatefulWidget {
  const CheckInScreen({
    required this.bookingId,
    required this.api,
    this.spotLat,
    this.spotLng,
    super.key,
  });

  final String bookingId;
  final ApiClient api;
  final double? spotLat;
  final double? spotLng;

  @override
  State<CheckInScreen> createState() => _CheckInScreenState();
}

class _CheckInScreenState extends State<CheckInScreen> {
  late final BookingService _booking = BookingService(widget.api);
  final _pinController = TextEditingController();
  String? _pin;
  String? _error;
  String? _geoStatus;
  bool _working = false;

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _checkIn({String? method, String? pinCode, String? qrToken}) async {
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final res = await _booking.checkIn(
        widget.bookingId,
        method: method,
        pinCode: pinCode ?? _pin,
        qrToken: qrToken,
        latitude: _driverLatitude,
        longitude: _driverLongitude,
      );
      if (!mounted) return;
      setState(() => _working = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Checked in! Session is now live.')),
      );
      Navigator.of(context).pop(res);
    } on ApiException catch (e) {
      setState(() {
        _working = false;
        _error = e.message;
      });
    }
  }

  double? _driverLatitude;
  double? _driverLongitude;

  Future<void> _geofenceCheckIn() async {
    setState(() {
      _working = true;
      _geoStatus = 'Locating…';
      _error = null;
    });
    final geo = GeoLocatorService();
    final pos = await geo.currentPosition();
    if (pos == null || widget.spotLat == null || widget.spotLng == null) {
      setState(() {
        _working = false;
        _geoStatus = null;
        _error = 'Location unavailable, or this spot has no coordinates.';
      });
      return;
    }
    _driverLatitude = pos.latitude;
    _driverLongitude = pos.longitude;
    final dist = haversineMeters(
      pos.latitude, pos.longitude, widget.spotLat!, widget.spotLng!,
    );
    if (dist > 50) {
      setState(() {
        _working = false;
        _geoStatus = null;
        _error = 'You are ${dist.round()} m away — the geofence allows ≤ 50 m.';
      });
      return;
    }
    setState(() => _geoStatus = 'Within 50 m — verifying…');
    await _checkIn(method: 'geofence');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Check in')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Options', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text('PIN — enter the 4-digit code from your pass'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _pinController,
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    decoration: const InputDecoration(
                      labelText: '4-digit PIN',
                      border: OutlineInputBorder(),
                      counterText: '',
                    ),
                    onChanged: (v) => setState(() => _pin = v),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed:
                        _working || (_pin?.length ?? 0) != 4 ? null : () => _checkIn(method: 'pin'),
                    child: const Text('Check in with PIN'),
                  ),
                ],
              ),
            ),
          ),
          if (widget.spotLat != null) ...[
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Text('Geofence (≤ 50 m)', style: theme.textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Text(_geoStatus ?? 'We verify your location against the spot server-side.'),
                    const SizedBox(height: 8),
                    FilledButton(
                      onPressed: _working ? null : _geofenceCheckIn,
                      child: const Text('Auto-check-in at spot'),
                    ),
                  ],
                ),
              ),
            ),
          ],
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(
                _error!,
                style: TextStyle(color: theme.colorScheme.error),
                textAlign: TextAlign.center,
              ),
            ),
        ],
      ),
    );
  }
}