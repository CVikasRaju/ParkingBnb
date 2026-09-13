import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import 'scanner_screen.dart';

/// Sprint 1/3/4 — Provider home: spot listing management, arrival alerts,
/// check-in scanner entry, and payout balance.
class ProviderScreen extends StatefulWidget {
  const ProviderScreen({
    required this.api,
    super.key,
  });

  final ApiClient api;

  @override
  State<ProviderScreen> createState() => _ProviderScreenState();
}

class _ProviderScreenState extends State<ProviderScreen> {
  List<dynamic>? _spots;
  String? _error;
  double _walletBalance = 0;
  String? _activeSpotId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final spots = await widget.api.get('spots/mine');
      final wallet = await widget.api.get('payments/wallet');
      if (!mounted) return;
      setState(() {
        _spots = (spots as List).cast<dynamic>();
        _walletBalance = (wallet is Map<String, dynamic>
                ? wallet['wallet_balance'] ?? 0
                : 0)
            .toDouble();
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Provider'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'My spots', icon: Icon(Icons.local_parking)),
              Tab(text: 'Scanner', icon: Icon(Icons.qr_code_scanner)),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _spotsList(context),
            if (_activeSpotId != null)
              ProviderScannerScreen(
                api: widget.api,
                spotId: _activeSpotId!,
              )
            else
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'Choose a spot above to arm the arrival scanner.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _error == null && _spots != null ? _createSpot : null,
          icon: const Icon(Icons.add),
          label: const Text('Add spot'),
        ),
      ),
    );
  }

  Widget _spotsList(BuildContext context) {
    if (_error != null) {
      return Center(child: Text('Could not load spots: $_error'));
    }
    final spots = _spots;
    if (spots == null) return const Center(child: CircularProgressIndicator());
    if (spots.isEmpty) {
      return const Center(child: Text('No spots yet. Add your first listing.'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: spots.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          return Card(
            child: ListTile(
              leading: const Icon(Icons.account_balance_wallet),
              title: Text('Wallet balance'),
              subtitle: Text('₹${_walletBalance.toStringAsFixed(0)}'),
              trailing: const Icon(Icons.chevron_right),
            ),
          );
        }
        final s = spots[index - 1] as Map<String, dynamic>;
        final id = s['id'] as String;
        final active = id == _activeSpotId;
        return Card(
          child: ListTile(
            leading: const Icon(Icons.local_parking),
            title: Text(s['title'] ?? 'Untitled'),
            subtitle: Text(
              '${s['status'] ?? 'available'}'
              '${s['hourly_rate'] != null ? ' · ₹${s['hourly_rate']}/h' : ''}',
            ),
            trailing: active
                ? const Chip(label: Text('Scanner armed'))
                : const Icon(Icons.chevron_right),
            onTap: () {
              setState(() => _activeSpotId = active ? null : id);
              // Notify the TabBar to switch to scanner.
              DefaultTabController.of(context).animateTo(1);
            },
          ),
        );
      },
    );
  }

  Future<void> _createSpot() async {
    final title = await _promptForTitle();
    if (title == null || title.isEmpty || !mounted) return;
    try {
      await widget.api.post('spots', body: {
        'title': title,
        'address': 'Test address, Bengaluru',
        'latitude': 12.9716,
        'longitude': 77.5946,
        'hourly_rate': 30,
        'overstay_multiplier': 2.0,
        'entry_instructions': 'Ring bell at the gate',
      });
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<String?> _promptForTitle() {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New spot'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Title',
            hintText: 'Driveway near Indiranagar',
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(ctrl.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }
}