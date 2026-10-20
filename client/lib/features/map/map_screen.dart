import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api_client.dart';
import '../../core/deep_link.dart';
import '../../core/geolocation.dart';
import '../booking/booking_service.dart';
import '../booking/lock_sheet.dart';

/// Interactive Map screen:
///  - Vector OSM tiles
///  - Category filter bar (🅿️ All Parking, ⚡ P2P EV Charge, ⚡ Fast Hubs, ⛽ Petrol/CNG)
///  - Category-coded animated markers
///  - Detailed spot cards with EV specs
///  - Native OS turn-by-turn navigation deep-link dispatchers
class MapScreen extends StatefulWidget {
  const MapScreen({
    required this.api,
    required this.nav,
    this.realtime,
    super.key,
  });

  final ApiClient api;
  final NavigationLauncher nav;
  final void Function(String spotId, String status)? realtime;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final MapController _map = MapController();
  final GeoLocatorService _geo = GeoLocatorService();

  LatLng? _center;
  List<dynamic> _spots = [];
  dynamic _selected;
  bool _loading = true;
  String? _error;
  String? _selectedCategory; // null = All, 'ev_p2p_charge', 'commercial_cpo', 'fuel_pump'

  final List<({String? key, String label, IconData icon})> _categories = const [
    (key: null, label: '🅿️ All Parking', icon: Icons.local_parking),
    (key: 'ev_p2p_charge', label: '⚡ P2P EV Charge', icon: Icons.ev_station),
    (key: 'commercial_cpo', label: '⚡ Fast Hubs', icon: Icons.flash_on),
    (key: 'fuel_pump', label: '⛽ Petrol/CNG', icon: Icons.local_gas_station),
  ];

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final pos = await _geo.currentPosition();
    if (!mounted) return;
    setState(() => _center = LatLng(pos?.latitude ?? 12.9716, pos?.longitude ?? 77.5946));
    await _reload();
  }

  Future<void> _reload() async {
    final center = _center ?? const LatLng(12.9716, 77.5946);
    setState(() => _loading = true);
    try {
      final results = await widget.api.searchSpots(
        lat: center.latitude,
        lng: center.longitude,
        radiusM: 3000,
        category: _selectedCategory,
      );
      if (!mounted) return;
      setState(() {
        _spots = results;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$e';
      });
    }
  }

  Future<void> _onCategorySelected(String? cat) async {
    if (_selectedCategory == cat) return;
    setState(() {
      _selectedCategory = cat;
      _selected = null;
    });
    await _reload();
  }

  Future<void> _onSpotTap(dynamic spot) async {
    setState(() => _selected = spot);
    _map.move(
      LatLng(
        (spot['latitude'] as num).toDouble(),
        (spot['longitude'] as num).toDouble(),
      ),
      16,
    );
  }

  Future<void> _navigate(double lat, double lng) async {
    await widget.nav.launchTurnByTurnNavigation(destLat: lat, destLng: lng);
  }

  @override
  Widget build(BuildContext context) {
    if (_center == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      body: Stack(
        children: [
          FlutterMap(
            mapController: _map,
            options: MapOptions(
              initialCenter: _center!,
              initialZoom: 14,
              onTap: (_, __) => setState(() => _selected = null),
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.parkpeer.parkpeer',
                maxZoom: 19,
              ),
              if (_center != null)
                MarkerLayer(
                  markers: _spots.map((s) {
                    final lat = (s['latitude'] as num).toDouble();
                    final lng = (s['longitude'] as num).toDouble();
                    final selected = identical(s, _selected);
                    return Marker(
                      point: LatLng(lat, lng),
                      width: selected ? 50 : 36,
                      height: selected ? 50 : 36,
                      child: _AnimatedSpotMarker(
                        rate: (s['hourly_rate'] as num?)?.toDouble() ?? 0,
                        category: (s['category'] as String?) ?? 'parking_only',
                        selected: selected,
                        onTap: () => _onSpotTap(s),
                      ),
                    );
                  }).toList(),
                ),
            ],
          ),

          // Top category filter bar
          Positioned(
            top: 48,
            left: 0,
            right: 0,
            child: SizedBox(
              height: 44,
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                scrollDirection: Axis.horizontal,
                itemCount: _categories.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final cat = _categories[index];
                  final isSelected = _selectedCategory == cat.key;
                  return ChoiceChip(
                    label: Text(
                      cat.label,
                      style: TextStyle(
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                        color: isSelected ? Colors.white : Colors.black87,
                        fontSize: 13,
                      ),
                    ),
                    selected: isSelected,
                    selectedColor: _categoryColor(cat.key),
                    backgroundColor: Colors.white.withValues(alpha: 0.95),
                    elevation: 3,
                    onSelected: (_) => _onCategorySelected(cat.key),
                  );
                },
              ),
            ),
          ),

          if (_loading)
            const Positioned(
              top: 96,
              left: 0,
              right: 0,
              child: LinearProgressIndicator(minHeight: 3),
            ),

          if (_error != null)
            Positioned(
              top: 104,
              left: 16,
              right: 16,
              child: Material(
                color: Colors.red.shade100,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Expanded(child: Text('Error: $_error')),
                      IconButton(
                        icon: const Icon(Icons.refresh),
                        onPressed: () => _reload(),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          Positioned(
            top: 104,
            right: 16,
            child: FloatingActionButton.small(
              heroTag: 'recenter',
              backgroundColor: Colors.white,
              foregroundColor: Colors.teal.shade800,
              onPressed: () async {
                final pos = await _geo.currentPosition();
                if (pos != null && mounted) {
                  setState(() => _center = LatLng(pos.latitude, pos.longitude));
                  _map.move(LatLng(pos.latitude, pos.longitude), 15);
                }
              },
              child: const Icon(Icons.my_location),
            ),
          ),

          if (_selected != null)
            Positioned(
              left: 12,
              right: 12,
              bottom: 24,
              child: _SpotCard(
                spot: _selected!,
                onNavigate: () => _navigate(
                  (_selected['latitude'] as num).toDouble(),
                  (_selected['longitude'] as num).toDouble(),
                ),
                onLockTap: () => _startLockFlow(_selected!),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _startLockFlow(dynamic spot) async {
    final bookingService = BookingService(widget.api);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => LockSheet(
        api: widget.api,
        spot: spot,
        bookingService: bookingService,
      ),
    );
    await _reload();
  }

  Color _categoryColor(String? cat) {
    return switch (cat) {
      'ev_p2p_charge' => const Color(0xFF10B981), // Emerald
      'commercial_cpo' => const Color(0xFF3B82F6), // Blue
      'fuel_pump' => const Color(0xFFF59E0B), // Amber
      _ => const Color(0xFF0D9488), // Teal
    };
  }
}

class _AnimatedSpotMarker extends StatefulWidget {
  const _AnimatedSpotMarker({
    required this.rate,
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final double rate;
  final String category;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_AnimatedSpotMarker> createState() => _AnimatedSpotMarkerState();
}

class _AnimatedSpotMarkerState extends State<_AnimatedSpotMarker>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  Color get _color {
    return switch (widget.category) {
      'ev_p2p_charge' => const Color(0xFF10B981),
      'commercial_cpo' => const Color(0xFF2563EB),
      'fuel_pump' => const Color(0xFFD97706),
      _ => const Color(0xFF0D9488),
    };
  }

  IconData get _icon {
    return switch (widget.category) {
      'ev_p2p_charge' => Icons.electric_bolt,
      'commercial_cpo' => Icons.flash_on,
      'fuel_pump' => Icons.local_gas_station,
      _ => Icons.local_parking,
    };
  }

  @override
  Widget build(BuildContext context) {
    final color = _color;
    return GestureDetector(
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: widget.selected ? 1.25 : 1.0,
        duration: const Duration(milliseconds: 180),
        child: ScaleTransition(
          scale: Tween(begin: 1.0, end: 1.25)
              .animate(CurvedAnimation(parent: _pulse, curve: Curves.easeInOut)),
          child: Container(
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withValues(alpha: 0.2),
              border: Border.all(color: color, width: widget.selected ? 3 : 2),
            ),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
              ),
              child: Icon(_icon, color: Colors.white, size: widget.selected ? 18 : 14),
            ),
          ),
        ),
      ),
    );
  }
}

class _SpotCard extends StatelessWidget {
  const _SpotCard({
    required this.spot,
    required this.onNavigate,
    required this.onLockTap,
  });

  final dynamic spot;
  final VoidCallback onNavigate;
  final VoidCallback onLockTap;

  String get _categoryLabel {
    final cat = spot['category'] as String?;
    return switch (cat) {
      'ev_p2p_charge' => '⚡ P2P Residential EV Socket',
      'commercial_cpo' => '⚡ Commercial Fast Charger',
      'fuel_pump' => '⛽ Petrol / Diesel / CNG Pump',
      _ => '🅿️ Dedicated Parking Space',
    };
  }

  Color get _categoryBadgeColor {
    final cat = spot['category'] as String?;
    return switch (cat) {
      'ev_p2p_charge' => Colors.green,
      'commercial_cpo' => Colors.blue,
      'fuel_pump' => Colors.amber.shade800,
      _ => Colors.teal,
    };
  }

  @override
  Widget build(BuildContext context) {
    final rate = (spot['hourly_rate'] as num?)?.toDouble() ?? 0;
    final dist = spot['distance_meters'];
    final isEv = spot['category'] == 'ev_p2p_charge' ||
        spot['category'] == 'commercial_cpo' ||
        (spot['power_output_kw'] as num? ?? 0) > 0;
    final powerKw = (spot['power_output_kw'] as num?)?.toDouble() ?? 0;
    final plugType = (spot['plug_type'] as String?) ?? '15A';
    final energyRate = (spot['energy_rate_per_kwh'] as num?)?.toDouble() ?? 0;

    return Card(
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _categoryBadgeColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    _categoryLabel,
                    style: TextStyle(
                      color: _categoryBadgeColor,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (dist != null)
                  Text(
                    '${(dist as num).round()} m away',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              spot['title'] ?? 'Spot',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              spot['address'] ?? '',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey.shade700,
                  ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),

            // Rates line
            Row(
              children: [
                Text(
                  '₹${rate.toStringAsFixed(0)} / hr',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.primary,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                if (isEv && energyRate > 0) ...[
                  const SizedBox(width: 8),
                  Text(
                    '+ ₹${energyRate.toStringAsFixed(0)}/kWh',
                    style: const TextStyle(
                      color: Color(0xFF059669),
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                ],
              ],
            ),

            if (isEv) ...[
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: Colors.green.shade200),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.flash_on, size: 14, color: Color(0xFF059669)),
                    const SizedBox(width: 4),
                    Text(
                      'Socket: $powerKw kW ($plugType) · Smart Breaker',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF059669),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onNavigate,
                    icon: const Icon(Icons.navigation, size: 18),
                    label: const Text('Navigate'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: onLockTap,
                    icon: const Icon(Icons.lock_clock, size: 18),
                    label: const Text('Book slot'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
