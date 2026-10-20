import 'package:flutter/material.dart';
import '../../core/api_client.dart';

/// Driver Bookings History & Itemized Receipt Screen.
class BookingHistoryScreen extends StatefulWidget {
  const BookingHistoryScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<BookingHistoryScreen> createState() => _BookingHistoryScreenState();
}

class _BookingHistoryScreenState extends State<BookingHistoryScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _loading = true;
  String? _error;
  List<dynamic> _bookings = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadBookings();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadBookings() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final res = await widget.api.get('bookings');
      if (!mounted) return;
      setState(() {
        _bookings = (res as List?)?.cast<dynamic>() ?? [];
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

  List<dynamic> _filterBookings(String filter) {
    if (filter == 'all') return _bookings;
    if (filter == 'active') {
      return _bookings.where((b) => b['status'] == 'active' || b['status'] == 'reserved' || b['status'] == 'pending_lock').toList();
    }
    if (filter == 'completed') {
      return _bookings.where((b) => b['status'] == 'completed').toList();
    }
    if (filter == 'cancelled') {
      return _bookings.where((b) => b['status'] == 'cancelled' || b['status'] == 'disputed').toList();
    }
    return _bookings;
  }

  void _showItemizedReceipt(dynamic booking) {
    final base = (booking['base_amount'] as num?)?.toDouble() ?? 0.0;
    final overstay = (booking['overstay_amount'] as num?)?.toDouble() ?? 0.0;
    final energyAmount = (booking['energy_amount'] as num?)?.toDouble() ?? 0.0;
    final energyKwh = (booking['energy_kwh'] as num?)?.toDouble() ?? 0.0;
    final total = base + overstay + energyAmount;
    final cat = booking['category'] as String?;
    final isEv = cat == 'ev_p2p_charge' || cat == 'commercial_cpo' || energyKwh > 0;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Itemized Receipt', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                Chip(
                  label: Text((booking['status'] ?? '').toString().toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                  backgroundColor: Colors.teal.shade50,
                ),
              ],
            ),
            Text(booking['spot_title'] ?? 'Parking Spot', style: const TextStyle(color: Colors.grey, fontSize: 13)),
            const Divider(height: 24),
            _receiptRow('Base Parking Fee', '₹${base.toStringAsFixed(2)}'),
            if (overstay > 0)
              _receiptRow('Overstay Penalty', '₹${overstay.toStringAsFixed(2)}', isPenalty: true),
            if (isEv) ...[
              _receiptRow('EV Energy Consumed ($energyKwh kWh)', '₹${energyAmount.toStringAsFixed(2)}', isEnergy: true),
            ],
            const Divider(height: 24),
            _receiptRow('Total Charged', '₹${total.toStringAsFixed(2)}', isTotal: true),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(8)),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Provider Payout (85%):', style: TextStyle(fontSize: 12, color: Colors.black54)),
                      Text('₹${(booking['provider_earnings'] ?? (total * 0.85)).toString()}', style: const TextStyle(fontSize: 12)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Platform Fee (15%):', style: TextStyle(fontSize: 12, color: Colors.black54)),
                      Text('₹${(booking['platform_fee'] ?? (total * 0.15)).toString()}', style: const TextStyle(fontSize: 12)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Close'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _receiptRow(String label, String value, {bool isPenalty = false, bool isEnergy = false, bool isTotal = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: isTotal ? 16 : 14,
              fontWeight: isTotal ? FontWeight.bold : FontWeight.normal,
              color: isPenalty ? Colors.red : (isEnergy ? Colors.green : Colors.black87),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: isTotal ? 18 : 14,
              fontWeight: isTotal ? FontWeight.bold : FontWeight.w600,
              color: isPenalty ? Colors.red : (isEnergy ? Colors.green : Colors.black),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Bookings & Receipts'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'All'),
            Tab(text: 'Active'),
            Tab(text: 'Completed'),
            Tab(text: 'Cancelled'),
          ],
        ),
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
                      ElevatedButton(onPressed: _loadBookings, child: const Text('Retry')),
                    ],
                  ),
                )
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildList('all'),
                    _buildList('active'),
                    _buildList('completed'),
                    _buildList('cancelled'),
                  ],
                ),
    );
  }

  Widget _buildList(String filter) {
    final list = _filterBookings(filter);
    if (list.isEmpty) {
      return Center(
        child: Text('No $filter bookings found.', style: const TextStyle(color: Colors.grey)),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: list.length,
      itemBuilder: (context, index) {
        final b = list[index];
        final status = (b['status'] ?? 'pending').toString();
        final base = (b['base_amount'] as num?)?.toDouble() ?? 0.0;
        final total = base + ((b['overstay_amount'] as num?)?.toDouble() ?? 0.0) + ((b['energy_amount'] as num?)?.toDouble() ?? 0.0);
        final title = b['spot_title'] ?? 'Parking Spot';
        final vehicle = '${b['make_model'] ?? ''} (${b['license_plate'] ?? ''})';
        final isEv = b['category'] == 'ev_p2p_charge' || b['category'] == 'commercial_cpo';

        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: isEv ? Colors.green.shade100 : Colors.teal.shade100,
              child: Icon(isEv ? Icons.electric_bolt : Icons.local_parking, color: isEv ? Colors.green : Colors.teal),
            ),
            title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(vehicle, style: const TextStyle(fontSize: 12)),
                Text('Status: ${status.toUpperCase()} · ₹${total.toStringAsFixed(2)}',
                    style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.black87, fontSize: 12)),
              ],
            ),
            trailing: const Icon(Icons.receipt_long),
            onTap: () => _showItemizedReceipt(b),
          ),
        );
      },
    );
  }
}
