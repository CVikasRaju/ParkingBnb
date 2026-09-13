import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/deep_link.dart';
import '../booking/booking_service.dart';
import 'rotating_qr.dart';

/// Sprint 2/3 — Driver "Active Pass" (Phases 1–3 of the lifecycle).
///
/// After `confirm-payment` the server returns navigation + verification data.
/// This screen renders the booked spot's address/gate instructions, fires the
/// OS-native turn-by-turn deep link, and shows the rotating QR / PIN pass that
/// the provider scans at check-in.
class ActivePassScreen extends StatefulWidget {
  const ActivePassScreen({
    required this.bookingId,
    required this.api,
    this.initial,
    this.nav,
    super.key,
  });

  final String bookingId;
  final ApiClient api;
  final Map<String, dynamic>? initial;
  final NavigationLauncher? nav;

  @override
  State<ActivePassScreen> createState() => _ActivePassScreenState();
}

class _ActivePassScreenState extends State<ActivePassScreen> {
  Map<String, dynamic> _data = {};
  late final BookingService _booking = BookingService(widget.api);
  late final NavigationLauncher _nav = widget.nav ?? NavigationLauncher();

  @override
  void initState() {
    super.initState();
    _data = widget.initial ?? {};
  }

  Map<String, dynamic> get _navigation =>
      (_data['navigation'] as Map<String, dynamic>?) ?? {};

  Map<String, dynamic> get _verification =>
      (_data['verification'] as Map<String, dynamic>?) ?? {};

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final nav = _navigation;
    final verify = _verification;
    return Scaffold(
      appBar: AppBar(title: const Text('Active Pass')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Booked & paid', style: theme.textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Text(nav['address'] ?? 'Your spot'),
                  if (nav['entry_instructions'] != null) ...[
                    const SizedBox(height: 8),
                    Text('Gate: ${nav['entry_instructions']}'),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () => _navigate(nav),
                          icon: const Icon(Icons.navigation),
                          label: const Text('Start navigation'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (verify.isNotEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Text('Verify your arrival', style: theme.textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(
                      'Show this to the provider, or scan your QR at the gate.',
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(height: 12),
                    _VerificationToggle(
                      bookingId: widget.bookingId,
                      bookingService: _booking,
                      initialPayload: verify['dynamic_qr_payload'] as String?,
                      pinCode: verify['pin_code'] as String?,
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('Check out now'),
              subtitle: const Text('Ends the session and settles escrow'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () async {
                final navigator = Navigator.of(context);
                final res = await _booking.checkOut(widget.bookingId);
                if (!mounted) return;
                // ignore: use_build_context_synchronously - guard is mounted check
                navigator.push(
                  DialogRoute<void>(
                    context: context,
                    builder: (_) => AlertDialog(
                      title: const Text('Checked out'),
                      content: Text(
                        'Total charged '
                        '₹${(res['breakdown']?['total_charged'] ?? '0')}. '
                        'Thanks for parking!',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.of(context).pop(),
                          child: const Text('OK'),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _navigate(Map<String, dynamic> nav) async {
    final messenger = ScaffoldMessenger.of(context);
    final lat = (nav['latitude'] as num?)?.toDouble();
    final lng = (nav['longitude'] as num?)?.toDouble();
    if (lat == null || lng == null) {
      messenger.showSnackBar(
        const SnackBar(content: Text('No coordinates for this spot.')),
      );
      return;
    }
    final opened = await _nav.launchTurnByTurnNavigation(
      destLat: lat,
      destLng: lng,
    );
    if (!opened) {
      messenger.showSnackBar(
        const SnackBar(content: Text('No navigation app installed.')),
      );
    }
  }
}

class _VerificationToggle extends StatefulWidget {
  const _VerificationToggle({
    required this.bookingId,
    required this.bookingService,
    this.initialPayload,
    this.pinCode,
  });

  final String bookingId;
  final BookingService bookingService;
  final String? initialPayload;
  final String? pinCode;

  @override
  State<_VerificationToggle> createState() => _VerificationToggleState();
}

class _VerificationToggleState extends State<_VerificationToggle> {
  bool _showQr = true;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: true, label: Text('QR'), icon: Icon(Icons.qr_code)),
            ButtonSegment(value: false, label: Text('PIN'), icon: Icon(Icons.pin)),
          ],
          selected: {_showQr},
          onSelectionChanged: (s) => setState(() => _showQr = s.first),
        ),
        const SizedBox(height: 16),
        if (_showQr)
          RotatingQrView(
            bookingId: widget.bookingId,
            bookingService: widget.bookingService,
          )
        else
          Column(
            children: [
              Text(
                (widget.pinCode ?? '••••'),
                style: Theme.of(context).textTheme.displayMedium!.copyWith(
                      letterSpacing: 12,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
              ),
              TextButton.icon(
                onPressed: () => Clipboard.setData(
                  ClipboardData(text: widget.pinCode ?? ''),
                ),
                icon: const Icon(Icons.copy, size: 16),
                label: const Text('Copy PIN'),
              ),
            ],
          ),
      ],
    );
  }
}