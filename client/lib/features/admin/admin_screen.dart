import 'package:flutter/material.dart';

import '../../core/api_client.dart';

/// Sprint 4 — Admin dashboard: dispute inbox + emergency lock unlock.
class AdminScreen extends StatefulWidget {
  const AdminScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  List<Map<String, dynamic>>? _disputes;
  String? _error;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final disputes = await widget.api.get('admin/disputes') as List;
      if (!mounted) return;
      setState(() {
        _disputes = disputes.cast<Map<String, dynamic>>();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.message;
        });
      }
    }
  }

  Future<void> _resolve(String disputeId, String action) async {
    try {
      await widget.api.patch('admin/disputes/$disputeId', body: {
        'action': action,
        'admin_notes': 'Resolved from dashboard ($action)',
      });
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _emergencyUnlock() async {
    final bookingId = await _promptBookingId();
    if (bookingId == null || bookingId.isEmpty || !mounted) return;
    try {
      final res = await widget.api.post('admin/locks/unlock', body: {
        'booking_id': bookingId,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Released: ${(res as Map<String, dynamic>)['status'] ?? 'ok'}',
          ),
        ),
      );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<String?> _promptBookingId() {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Emergency unlock'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Releases an orphaned Redis lock. Use only when a driver '
              'abandoned a payment.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Booking UUID',
                hintText: '123e4567-…',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(ctrl.text.trim()),
            child: const Text('Unlock'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin'),
        actions: [
          IconButton(
            tooltip: 'Refresh disputes',
            onPressed: _load,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: 'Emergency unlock',
            onPressed: _emergencyUnlock,
            icon: const Icon(Icons.lock_open),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading && _disputes == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _disputes == null) {
      return Center(child: Text('Could not load disputes: $_error'));
    }
    final disputes = _disputes ?? [];
    if (disputes.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('No disputes. Re-run with a blocked-spot scenario.'),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: disputes.length,
      itemBuilder: (context, i) {
        final d = disputes[i];
        final resolved = d['resolved'] == true;
        return Card(
          child: ListTile(
            leading: Icon(
              resolved ? Icons.done_all : Icons.warning_amber,
              color: resolved ? Colors.green : Colors.orange,
            ),
            title: Text(d['reason']?.toString() ?? 'dispute'),
            subtitle: Text(
              'Booking ${(d['booking_id'] as String?)?.substring(0, 8)}… · '
              '${d['spot_title'] ?? ''}'
              '${d['description'] != null ? '\n${d['description']}' : ''}',
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: resolved
                ? Text('Resolved: ${d['admin_notes'] ?? ''}',
                    style: const TextStyle(color: Colors.green, fontSize: 12))
                : Wrap(
                    spacing: 4,
                    children: [
                      IconButton(
                        tooltip: 'Refund driver',
                        icon: const Icon(Icons.currency_rupee, color: Colors.green),
                        onPressed: () =>
                            _resolve(d['id'] as String, 'refund'),
                      ),
                      IconButton(
                        tooltip: 'Release spot',
                        icon: const Icon(Icons.home_work, color: Colors.blue),
                        onPressed: () =>
                            _resolve(d['id'] as String, 'release'),
                      ),
                      IconButton(
                        tooltip: 'Reject dispute',
                        icon: const Icon(Icons.block, color: Colors.red),
                        onPressed: () =>
                            _resolve(d['id'] as String, 'reject'),
                      ),
                    ],
                  ),
          ),
        );
      },
    );
  }
}