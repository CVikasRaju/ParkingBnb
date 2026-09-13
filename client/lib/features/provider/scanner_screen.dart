import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/api_client.dart';
import '../booking/booking_service.dart';

/// Sprint 3 — Provider-side QR scanner (mobile_scanner).
///
/// Scans the driver's rotating QR payload, extracts the booking id field from
/// the signed payload via the backend check-in endpoint, then calls check-in
/// with the scanned token. The server verifies HMAC + 60s expiry.
class ProviderScannerScreen extends StatefulWidget {
  const ProviderScannerScreen({
    required this.api,
    required this.spotId,
    super.key,
  });

  final ApiClient api;
  final String spotId;

  /// Decode the unverified payload of a compact JWT to extract `booking_id`.
  /// The backend re-verifies the HMAC signature + exp window; this is only to
  /// learn which booking to POST against.
  @visibleForTesting
  static String? decodeBookingId(String compactJwt) {
    final parts = compactJwt.split('.');
    if (parts.length != 3) return null;
    final payload = parts[1];
    try {
      final json = utf8.decode(base64Url.decode(base64Url.normalize(payload)));
      final decoded = jsonDecode(json) as Map<String, dynamic>;
      return decoded['booking_id'] as String?;
    } catch (_) {
      return null;
    }
  }

  @override
  State<ProviderScannerScreen> createState() => _ProviderScannerScreenState();
}

class _ProviderScannerScreenState extends State<ProviderScannerScreen> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  StreamSubscription<Object?>? _sub;
  bool _handling = false;
  String? _status;

  @override
  void initState() {
    super.initState();
    _sub = _controller.barcodes.listen(_onBarcode);
  }

  Future<void> _onBarcode(Object? event) async {
    if (event is! BarcodeCapture || _handling) return;
    final barcodes = event.barcodes;
    if (barcodes.isEmpty) return;
    for (final b in barcodes) {
      final raw = b.rawValue;
      if (raw == null || raw.isEmpty) continue;

      // The driver's QR is a server-signed compact JWT. We decode the payload
      // (base64url, non-secret) to learn the booking id; the backend re-verifies
      // the HMAC signature, booking binding, and 60s `exp` window.
      final bookingId = ProviderScannerScreen.decodeBookingId(raw);
      if (bookingId == null) {
        setState(() {
          _handling = true;
          _status = 'Rejected: not a ParkPeer QR code';
        });
        Future.delayed(const Duration(seconds: 2), () {
          if (mounted) setState(() => _handling = false);
        });
        return;
      }

      setState(() {
        _handling = true;
        _status = 'Verifying…';
      });
      try {
        final bookingService = BookingService(widget.api);
        final res = await bookingService.checkIn(
          bookingId,
          method: 'qr_code',
          qrToken: raw,
        );
        if (!mounted) return;
        setState(() => _status = 'Checked in! ${res['booking_id']}');
        await _controller.stop();
      } on ApiException catch (e) {
        if (!mounted) return;
        setState(() {
          _status = 'Rejected: ${e.message}';
          _handling = false;
        });
      }
      return;
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan driver QR')),
      body: Column(
        children: [
          Expanded(
            child: MobileScanner(
              controller: _controller,
              fit: BoxFit.cover,
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: _status == null
                ? const Text('Point the camera at the driver\'s rotating QR.')
                : Text(_status!,
                    textAlign: TextAlign.center,
                    style: _status!.startsWith('Checked')
                        ? const TextStyle(color: Colors.green)
                        : const TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}