import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import 'create_spot_screen.dart';
import 'qr_scanner_screen.dart';

/// Provider Dashboard & Wallet Screen.
class ProviderDashboardScreen extends StatefulWidget {
  const ProviderDashboardScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<ProviderDashboardScreen> createState() => _ProviderDashboardScreenState();
}

class _ProviderDashboardScreenState extends State<ProviderDashboardScreen> {
  bool _loading = true;
  String? _error;
  List<dynamic> _spots = [];
  List<dynamic> _incomingBookings = [];
  double _walletBalance = 0;
  List<dynamic> _payoutHistory = [];

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final spotsRes = await widget.api.get('spots/mine');
      final walletRes = await widget.api.get('payments/wallet');
      final bookingsRes = await widget.api.get('bookings', query: {'role': 'provider'});

      if (!mounted) return;
      setState(() {
        _spots = (spotsRes as List?)?.cast<dynamic>() ?? [];
        if (walletRes is Map<String, dynamic>) {
          _walletBalance = (walletRes['wallet_balance'] as num?)?.toDouble() ?? 0.0;
          _payoutHistory = (walletRes['payouts'] as List?)?.cast<dynamic>() ?? [];
        }
        _incomingBookings = (bookingsRes as List?)?.cast<dynamic>() ?? [];
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _toggleSpotStatus(String spotId, bool currentlyAvailable) async {
    final nextStatus = currentlyAvailable ? 'maintenance' : 'available';
    try {
      await widget.api.patch('spots/$spotId/status', body: {'status': nextStatus});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Spot marked as ${nextStatus == "available" ? "Active" : "Paused"}')),
      );
      _loadDashboard();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Host & EV Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.qr_code_scanner),
            tooltip: 'Arrival Scanner',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => QrScannerScreen(api: widget.api),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadDashboard,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Error: $_error', style: const TextStyle(color: Colors.red)),
                      const SizedBox(height: 12),
                      ElevatedButton(onPressed: _loadDashboard, child: const Text('Retry')),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadDashboard,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Wallet & Earnings Card
                      _buildWalletCard(theme),
                      const SizedBox(height: 20),

                      // Incoming Reservations Section
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Incoming Reservations', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                          Text('${_incomingBookings.length} total', style: const TextStyle(color: Colors.grey)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (_incomingBookings.isEmpty)
                        const Card(
                          child: Padding(
                            padding: EdgeInsets.all(16),
                            child: Text('No active reservations currently scheduled.', textAlign: TextAlign.center),
                          ),
                        )
                      else
                        ..._incomingBookings.take(5).map((b) => _buildBookingCard(b)),

                      const SizedBox(height: 20),

                      // My Listed Spots Section
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('My Parking & Charging Bays', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                          FilledButton.icon(
                            onPressed: () async {
                              final created = await Navigator.of(context).push<bool>(
                                MaterialPageRoute(builder: (_) => CreateSpotScreen(api: widget.api)),
                              );
                              if (created == true) _loadDashboard();
                            },
                            icon: const Icon(Icons.add, size: 18),
                            label: const Text('Add Spot'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (_spots.isEmpty)
                        const Card(
                          child: Padding(
                            padding: EdgeInsets.all(24),
                            child: Text('You have not listed any parking spots or EV chargers yet.', textAlign: TextAlign.center),
                          ),
                        )
                      else
                        ..._spots.map((s) => _buildSpotCard(s)),

                      const SizedBox(height: 20),

                      // Payout History
                      if (_payoutHistory.isNotEmpty) ...[
                        Text('Recent Payout History', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        ..._payoutHistory.take(5).map((p) => ListTile(
                              leading: const Icon(Icons.check_circle, color: Colors.green),
                              title: Text('₹${p['provider_earnings'] ?? p['gross_amount']}'),
                              subtitle: Text('Status: ${p['status'] ?? 'paid'} · Ref: ${p['gateway_ref'] ?? 'Direct Transfer'}'),
                              trailing: Text((p['created_at'] as String?)?.split('T').first ?? ''),
                            )),
                      ],
                    ],
                  ),
                ),
    );
  }

  Widget _buildWalletCard(ThemeData theme) {
    return Card(
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            colors: [Color(0xFF00695C), Color(0xFF00897B)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('HOST ESCROW WALLET', style: TextStyle(color: Colors.white70, fontSize: 12, letterSpacing: 1.2)),
                Icon(Icons.bolt, color: Colors.amberAccent),
              ],
            ),
            const SizedBox(height: 8),
            Text('₹${_walletBalance.toStringAsFixed(2)}',
                style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.verified, color: Colors.white70, size: 16),
                const SizedBox(width: 6),
                Text('85% Escrow Settlement on Auto-Payout', style: TextStyle(color: Colors.teal.shade100, fontSize: 12)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBookingCard(dynamic booking) {
    final status = (booking['status'] as String?) ?? 'pending';
    final driverName = booking['driver_name'] ?? 'Driver';
    final vehiclePlate = booking['license_plate'] ?? 'N/A';
    final vehicleModel = booking['make_model'] ?? 'Vehicle';
    final startTime = (booking['start_time'] as String?) ?? '';
    final spotTitle = booking['spot_title'] ?? 'Your Spot';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    driverName,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                ),
                Chip(
                  label: Text(status.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                  backgroundColor: status == 'active' ? Colors.green.shade100 : Colors.blue.shade100,
                  padding: EdgeInsets.zero,
                ),
              ],
            ),
            Text('$vehicleModel · $vehiclePlate', style: const TextStyle(color: Colors.black87)),
            const SizedBox(height: 4),
            Text('Spot: $spotTitle', style: const TextStyle(color: Colors.grey, fontSize: 12)),
            Text('Scheduled: ${startTime.replaceFirst('T', ' ').substring(0, startTime.length > 16 ? 16 : startTime.length)}',
                style: const TextStyle(color: Colors.grey, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _buildSpotCard(dynamic spot) {
    final isAvailable = spot['status'] == 'available';
    final title = spot['title'] ?? 'Untitled Spot';
    final address = spot['address'] ?? '';
    final rate = spot['hourly_rate'] ?? 0;
    final cat = spot['category'] as String?;
    final isEv = cat == 'ev_p2p_charge' || cat == 'commercial_cpo';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isEv ? Icons.ev_station : Icons.local_parking,
                  color: isEv ? Colors.green : Colors.teal,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                ),
                Switch(
                  value: isAvailable,
                  activeThumbColor: Colors.green,
                  onChanged: (val) => _toggleSpotStatus(spot['id'], isAvailable),
                ),
              ],
            ),
            Text(address, style: const TextStyle(color: Colors.grey, fontSize: 12)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              children: [
                Text('₹$rate/hr', style: const TextStyle(fontWeight: FontWeight.bold)),
                if (isEv) ...[
                  Text('· ${spot['power_output_kw'] ?? 7.4} kW'),
                  Text('· ₹${spot['energy_rate_per_kwh'] ?? 15}/kWh'),
                ],
                Chip(
                  label: Text(isAvailable ? 'ACTIVE' : 'PAUSED', style: const TextStyle(fontSize: 10)),
                  backgroundColor: isAvailable ? Colors.green.shade50 : Colors.amber.shade50,
                  padding: EdgeInsets.zero,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
