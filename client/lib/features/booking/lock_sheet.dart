import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../booking/booking_service.dart';
import 'active_pass_screen.dart';

/// Sprint 2 — "Lock & pay" bottom sheet.
///
/// Calls `POST /bookings/lock` (Redis `SET NX EX 600` server-side), shows the
/// 10-minute countdown, then confirms payment to move `pending_lock -> reserved`
/// and hands off to the Active Pass.
class LockSheet extends StatefulWidget {
  const LockSheet({
    required this.api,
    required this.spot,
    this.bookingService,
    super.key,
  });

  final ApiClient api;
  final dynamic spot;
  final BookingService? bookingService;

  @override
  State<LockSheet> createState() => _LockSheetState();
}

class _LockSheetState extends State<LockSheet> {
  late final BookingService _booking = widget.bookingService ?? BookingService(widget.api);

  String? _vehicleId;
  double _durationHours = 2;
  bool _locking = false;
  String? _error;

  static const _lockTtl = Duration(minutes: 10);

  @override
  Widget build(BuildContext context) {
    final mute = (widget.spot['hourly_rate'] as num?)?.toDouble() ?? 0;
    final est = (mute * _durationHours);
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Book ${widget.spot['title'] ?? 'spot'}',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text('${widget.spot['address'] ?? ''} · free lock for 10 min while you pay'),
          const SizedBox(height: 16),
          Text('Duration'),
          Slider(
            min: 1,
            max: 8,
            divisions: 7,
            value: _durationHours,
            label: '${_durationHours.toInt()} h',
            onChanged: (v) => setState(() => _durationHours = v),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Estimated'),
              Text('₹${est.toStringAsFixed(0)} (₹$mute/h)',
                  style: Theme.of(context).textTheme.titleMedium),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Vehicle ID (optional)',
              border: OutlineInputBorder(),
              hintText: 'Select my first vehicle',
            ),
            onChanged: (v) => setState(() => _vehicleId = v),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _locking ? null : _lockAndPay,
              child: _locking
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text('Lock slot & pay ₹${est.toStringAsFixed(0)}'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _lockAndPay() async {
    setState(() {
      _locking = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      final vehicleId = _vehicleId ?? await _firstVehicleId();
      if (vehicleId == null) {
        setState(() {
          _locking = false;
          _error = 'Add a vehicle in your profile first.';
        });
        return;
      }
      final lock = await _booking.lockSpot(
        spotId: widget.spot['id'] as String,
        vehicleId: vehicleId,
        startTime: DateTime.now().add(const Duration(minutes: 5)),
        durationHours: _durationHours,
      );

      // Fast countdown in the sheet (drivers pay quick), then confirm.
      // ignore: use_build_context_synchronously - begin a modal after the lock
      final confirm = await showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        barrierColor: Colors.black45,
        isDismissible: false,
        builder: (_) => _CountdownConfirmSheet(
          booking: lock,
          lockTtl: _lockTtl,
          bookingService: _booking,
        ),
      );
      if (!mounted) return;
      if (confirm != null) {
        navigator.pop(confirm);
        await navigator.push(
          MaterialPageRoute<void>(
            builder: (_) => ActivePassScreen(
              bookingId: lock.bookingId,
              api: widget.api,
              initial: confirm,
            ),
          ),
        );
      } else {
        setState(() {
          _locking = false;
          _error = 'Lock expired. Please try again.';
        });
      }
    } on ApiException catch (e) {
      setState(() {
        _locking = false;
        _error = e.message;
      });
    } catch (e) {
      setState(() {
        _locking = false;
        _error = '$e';
      });
    }
  }

  Future<String?> _firstVehicleId() async {
    try {
      final data = await widget.api.get('vehicles');
      final list = (data as List).cast<dynamic>();
      if (list.isEmpty) return null;
      return (list.first as Map<String, dynamic>)['id'] as String;
    } catch (_) {
      return null;
    }
  }
}

/// Pay countdown sheet with a 10-minute live ring. On confirm it calls the
/// real `confirm-payment` endpoint.
class _CountdownConfirmSheet extends StatefulWidget {
  const _CountdownConfirmSheet({
    required this.booking,
    required this.lockTtl,
    required this.bookingService,
  });

  final BookingDetails booking;
  final Duration lockTtl;
  final BookingService bookingService;

  @override
  State<_CountdownConfirmSheet> createState() => _CountdownConfirmSheetState();
}

class _CountdownConfirmSheetState extends State<_CountdownConfirmSheet> {
  Timer? _ticker;
  int _remaining = 600;
  String? _error;
  bool _paying = false;

  @override
  void initState() {
    super.initState();
    _remaining = widget.lockTtl.inSeconds;
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_remaining <= 1) {
        _ticker?.cancel();
        if (mounted) Navigator.of(context).pop(); // expired
      } else {
        setState(() => _remaining--);
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  String get _mmss {
    final m = (_remaining ~/ 60).toString().padLeft(2, '0');
    final s = (_remaining % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  Future<void> _confirm() async {
    setState(() {
      _paying = true;
      _error = null;
    });
    try {
      final data = await widget.bookingService.confirmPayment(
        widget.booking.bookingId,
        paymentId: 'card_${widget.booking.bookingId}',
      );
      if (!mounted) return;
      Navigator.of(context).pop(data);
    } on ApiException catch (e) {
      setState(() {
        _paying = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Payment required in', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(
            _mmss,
            style: theme.textTheme.displayMedium!.copyWith(
              fontFeatures: const [FontFeature.tabularFigures()],
              color: _remaining < 120 ? theme.colorScheme.error : null,
            ),
          ),
          LinearProgressIndicator(
            value: _remaining / widget.lockTtl.inSeconds,
            minHeight: 6,
          ),
          const SizedBox(height: 20),
          Text(
            'This locks the spot in place. Press pay to confirm '
            '₹${widget.booking.baseAmount.toStringAsFixed(0)} ${widget.booking.currency}.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium,
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_error!,
                  style: TextStyle(color: theme.colorScheme.error)),
            ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _paying ? null : _confirm,
              child: _paying
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Confirm payment'),
            ),
          ),
        ],
      ),
    );
  }
}