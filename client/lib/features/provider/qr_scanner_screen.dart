import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../core/api_client.dart';
import '../booking/booking_service.dart';
import 'dart:convert';

/// In-App Host QR Scanner with Haptic & Visual Feedback.
class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {

  static String? _decodeJwtPayload(String compactJwt) {
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

  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  StreamSubscription<Object?>? _sub;
  bool _processing = false;
  String? _statusText;

  @override
  void initState() {
    super.initState();
    _sub = _controller.barcodes.listen(_onBarcodeDetected);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onBarcodeDetected(Object? event) async {
    if (event is! BarcodeCapture || _processing) return;
    final barcodes = event.barcodes;
    if (barcodes.isEmpty) return;

    for (final b in barcodes) {
      final raw = b.rawValue;
      if (raw == null || raw.isEmpty) continue;

      final bookingId = _decodeJwtPayload(raw);
      if (bookingId == null) {
        setState(() {
          _processing = true;
          _statusText = 'Invalid Code: Not a valid ParkPeer QR payload.';
        });
        HapticFeedback.vibrate();
        Future.delayed(const Duration(seconds: 2), () {
          if (mounted) setState(() => _processing = false);
        });
        return;
      }

      setState(() {
        _processing = true;
        _statusText = 'Verifying HMAC signature with server...';
      });

      try {
        final bookingService = BookingService(widget.api);
        final res = await bookingService.checkIn(
          bookingId,
          method: 'qr_code',
          qrToken: raw,
        );

        // Haptic feedback confirmation
        await HapticFeedback.heavyImpact();

        if (!mounted) return;
        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.check_circle, color: Colors.green, size: 28),
                SizedBox(width: 8),
                Text('Driver Checked In!'),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Booking ID: ${res['booking_id'] ?? bookingId}'),
                const SizedBox(height: 8),
                const Text(
                  '⚡ Gate unlocked and smart EV socket energized (if applicable). Session timer is running.',
                  style: TextStyle(fontSize: 13, color: Colors.black87),
                ),
              ],
            ),
            actions: [
              FilledButton(
                onPressed: () {
                  Navigator.of(ctx).pop();
                  Navigator.of(context).pop();
                },
                child: const Text('Done'),
              ),
            ],
          ),
        );
      } on ApiException catch (e) {
        HapticFeedback.vibrate();
        if (!mounted) return;
        setState(() {
          _statusText = 'Check-in failed: ${e.message}';
        });
        Future.delayed(const Duration(seconds: 3), () {
          if (mounted) setState(() => _processing = false);
        });
      } catch (e) {
        HapticFeedback.vibrate();
        if (!mounted) return;
        setState(() {
          _statusText = 'Error: $e';
        });
        Future.delayed(const Duration(seconds: 3), () {
          if (mounted) setState(() => _processing = false);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Host QR Scanner'),
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            onPressed: () => _controller.toggleTorch(),
          ),
        ],
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _controller,
          ),
          Center(
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.tealAccent, width: 3),
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
          Positioned(
            bottom: 40,
            left: 20,
            right: 20,
            child: Card(
              color: Colors.black87,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                child: Text(
                  _statusText ?? 'Point camera at the driver\'s ParkPeer rotating QR pass',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
