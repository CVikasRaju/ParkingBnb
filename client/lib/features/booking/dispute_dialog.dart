import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import 'booking_service.dart';

/// Dispute & Emergency Reporting Dialog / Sheet.
class DisputeDialog extends StatefulWidget {
  const DisputeDialog({
    required this.bookingId,
    required this.api,
    this.spotTitle,
    super.key,
  });

  final String bookingId;
  final ApiClient api;
  final String? spotTitle;

  static Future<bool?> show(
    BuildContext context, {
    required String bookingId,
    required ApiClient api,
    String? spotTitle,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => DisputeDialog(
        bookingId: bookingId,
        api: api,
        spotTitle: spotTitle,
      ),
    );
  }

  @override
  State<DisputeDialog> createState() => _DisputeDialogState();
}

class _DisputeDialogState extends State<DisputeDialog> {
  String _reason = 'spot_blocked';
  final _notesController = TextEditingController();
  final _photoUrlController = TextEditingController(
    text: 'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=800',
  );
  bool _submitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _notesController.dispose();
    _photoUrlController.dispose();
    super.dispose();
  }

  Future<void> _submitDispute() async {
    final notes = _notesController.text.trim();
    if (notes.isEmpty) {
      setState(() => _errorMessage = 'Please describe what went wrong or why the spot is blocked.');
      return;
    }

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    try {
      final bookingService = BookingService(widget.api);
      final res = await bookingService.reportBlockedSpot(
        widget.bookingId,
        reason: _reason,
        notes: notes,
        photoUrls: [_photoUrlController.text.trim()],
      );

      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.shield, color: Colors.teal),
              SizedBox(width: 8),
              Text('Instant Refund Initiated'),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Refund Amount: ₹${res['refunded_amount'] ?? 'Full Base Amount'} credited back to your account.',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              const Text(
                'The host has been notified, and the spot has been taken off the map for inspection.',
                style: TextStyle(fontSize: 13, color: Colors.black87),
              ),
            ],
          ),
          actions: [
            FilledButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                Navigator.of(context).pop(true);
              },
              child: const Text('Find Nearby Spot (Reroute)'),
            ),
          ],
        ),
      );
    } on ApiException catch (e) {
      setState(() {
        _submitting = false;
        _errorMessage = e.message;
      });
    } catch (e) {
      setState(() {
        _submitting = false;
        _errorMessage = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.warning_amber_rounded, color: Colors.orange, size: 28),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Report Issue & Instant Refund',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    if (widget.spotTitle != null)
                      Text(widget.spotTitle!, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: 24),
          if (_errorMessage != null)
            Container(
              padding: const EdgeInsets.all(8),
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(6)),
              child: Text(_errorMessage!, style: const TextStyle(color: Colors.red, fontSize: 12)),
            ),
          const Text('Select Issue:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _reason,
            decoration: const InputDecoration(border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
            items: const [
              DropdownMenuItem(value: 'spot_blocked', child: Text('🚫 Spot is Blocked / Another Car Parked')),
              DropdownMenuItem(value: 'overstay_refusal', child: Text('⏰ Previous Driver Refuses to Leave')),
              DropdownMenuItem(value: 'damage', child: Text('⚡ EV Socket Broken / No Power')),
              DropdownMenuItem(value: 'other', child: Text('❓ Other Gate / Access Issue')),
            ],
            onChanged: (v) => setState(() => _reason = v ?? 'spot_blocked'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notesController,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Description *',
              hintText: 'e.g. A silver sedan is parked inside driveway with hazard lights on.',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _photoUrlController,
            decoration: const InputDecoration(
              labelText: 'Photo Evidence URL (Camera simulator)',
              prefixIcon: Icon(Icons.camera_alt),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
              onPressed: _submitting ? null : _submitDispute,
              icon: _submitting
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.report_problem),
              label: Text(_submitting ? 'Submitting...' : 'Submit Report & Refund Base Fee'),
            ),
          ),
        ],
      ),
    );
  }
}
