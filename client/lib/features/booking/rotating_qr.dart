import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../booking/booking_service.dart';

/// Rotating dynamic QR widget (ARCHITECTURE §4).
///
/// The driver's app fetches a freshly server-signed payload from
/// `GET /bookings/{id}/qr` and re-renders it shortly before its 60s expiry.
/// A countdown ring discourages screenshot fraud: the token is useless after
/// the timeout because check-in verifies `exp` server-side.
class RotatingQrView extends StatefulWidget {
  const RotatingQrView({
    required this.bookingId,
    required this.bookingService,
    this.rotateSeconds = 30,
    super.key,
  });

  final String bookingId;
  final BookingService bookingService;
  final int rotateSeconds;

  @override
  State<RotatingQrView> createState() => _RotatingQrViewState();
}

class _RotatingQrViewState extends State<RotatingQrView> {
  String? _payload;
  Timer? _timer;
  int _secondsLeft = 30;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_secondsLeft <= 1) {
        _refresh();
      } else {
        setState(() => _secondsLeft--);
      }
    });
  }

  Future<void> _refresh() async {
    try {
      final data = await widget.bookingService.getQrToken(widget.bookingId);
      if (!mounted) return;
      setState(() {
        _payload = data['dynamic_qr_payload'] as String;
        _secondsLeft = widget.rotateSeconds;
        _error = false;
      });
    } catch (_) {
      if (mounted) setState(() => _error = true);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_error)
          Text('QR unavailable — pull to refresh',
              style: theme.textTheme.bodyMedium!.copyWith(color: theme.colorScheme.error))
        else if (_payload == null)
          const Padding(
            padding: EdgeInsets.all(32),
            child: CircularProgressIndicator(),
          )
        else ...[
          DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.black12),
            ),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: QrImageView(
                data: _payload!,
                version: QrVersions.auto,
                size: 220,
                backgroundColor: Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Rotates every ${widget.rotateSeconds}s — expires in $_secondsLeft s',
            style: theme.textTheme.labelMedium,
          ),
          LinearProgressIndicator(
            value: _secondsLeft / widget.rotateSeconds,
            minHeight: 3,
            backgroundColor: theme.colorScheme.surfaceContainerHighest,
          ),
        ],
      ],
    );
  }
}