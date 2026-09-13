import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../booking/booking_service.dart';

/// Sprint 4 — "Report Blocked Spot" flow (auto-refund).
class ReportBlockedSpotScreen extends StatefulWidget {
  const ReportBlockedSpotScreen({
    required this.bookingId,
    required this.api,
    super.key,
  });

  final String bookingId;
  final ApiClient api;

  @override
  State<ReportBlockedSpotScreen> createState() => _ReportBlockedSpotScreenState();
}

class _ReportBlockedSpotScreenState extends State<ReportBlockedSpotScreen> {
  final _notes = TextEditingController();
  String? _selectedReason = 'spot_blocked';
  bool _submitting = false;
  String? _error;
  Map<String, dynamic>? _result;

  static const _reasons = [
    ('spot_blocked', 'Blocked by vehicle / object'),
    ('overstay_refusal', 'Driver refuses to pay overstay'),
  ];

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final service = BookingService(widget.api);
      final res = await service.reportBlockedSpot(
        widget.bookingId,
        reason: _selectedReason!,
        notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _result = res;
      });
    } on ApiException catch (e) {
      setState(() {
        _submitting = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Report Blocked Spot')),
      body: _result != null
          ? _SuccessView(result: _result!)
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Reason', style: theme.textTheme.titleMedium),
                        const SizedBox(height: 8),
                        for (final (value, label) in _reasons)
                          RadioListTile<String>(
                            dense: true,
                            value: value,
                            groupValue: _selectedReason,
                            title: Text(label),
                            onChanged: (v) => setState(() => _selectedReason = v),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Add details (optional)',
                            style: theme.textTheme.titleMedium),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _notes,
                          maxLines: 3,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            hintText: 'e.g. a parked car is occupying the space',
                          ),
                        ),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          onPressed: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Camera attachment is stubbed in this build — '
                                  'server accepts photo URLs via the API.',
                                ),
                              ),
                            );
                          },
                          icon: const Icon(Icons.camera_alt_outlined),
                          label: const Text('Attach photo (server URLs)'),
                        ),
                      ],
                    ),
                  ),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error!,
                        style: TextStyle(color: theme.colorScheme.error)),
                  ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Submit report (auto-refund on approval)'),
                ),
                const SizedBox(height: 8),
                Text(
                  'A confirmed spot_blocked report opens a dispute and triggers an '
                  'automatic refund to your payment method.',
                  style: theme.textTheme.bodySmall,
                  textAlign: TextAlign.center,
                ),
              ],
            ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.result});
  final Map<String, dynamic> result;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.verified, color: Colors.green, size: 64),
            const SizedBox(height: 12),
            Text('Report received', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              'Dispute ${result['dispute_id'] ?? ''} opened. '
              'Refund: ₹${result['refund_amount'] ?? 'N/A'}',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
              child: const Text('Done'),
            ),
          ],
        ),
      ),
    );
  }
}