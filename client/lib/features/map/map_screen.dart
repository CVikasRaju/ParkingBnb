import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api_client.dart';
import '../../core/deep_link.dart';
import '../../core/geolocation.dart';
import '../booking/booking_service.dart';
import '../booking/lock_sheet.dart';

/// Sprint 1 — Map screen: free OSM tiles, animated markers for live spots,
/// popup cards with rate + distance, and a "Navigate" action that fires the
/// OS-native turn-by-turn deep link.
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
                      width: selected ? 44 : 30,
                      height: selected ? 44 : 30,
                      child: _AnimatedSpotMarker(
                        rate: (s['hourly_rate'] as num?)?.toDouble() ?? 0,
                        selected: selected,
                        onTap: () => _onSpotTap(s),
                      ),
                    );
                  }).toList(),
                ),
            ],
          ),
          if (_loading)
            const Positioned(
              top: 12,
              left: 0,
              right: 0,
              child: LinearProgressIndicator(minHeight: 3),
            ),
          if (_error != null)
            Positioned(
              top: 12,
              left: 12,
              right: 12,
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
            top: 40,
            right: 12,
            child: FloatingActionButton.small(
              heroTag: 'recenter',
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
                onNavigate: () =>
                    _navigate((_selected['latitude'] as num).toDouble(),
                        (_selected['longitude'] as num).toDouble()),
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
}

class _AnimatedSpotMarker extends StatefulWidget {
  const _AnimatedSpotMarker(
      {required this.rate, required this.selected, required this.onTap});
  final double rate;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_AnimatedSpotMarker> createState() => _AnimatedSpotMarkerState();
}

class _AnimatedSpotMarkerState extends State<_AnimatedSpotMarker>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = Colors.teal;
    return GestureDetector(
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: widget.selected ? 1.2 : 1.0,
        duration: const Duration(milliseconds: 180),
        child: ScaleTransition(
          scale: Tween(begin: 1.0, end: 1.35)
              .animate(CurvedAnimation(parent: _pulse, curve: Curves.easeInOut)),
          child: Container(
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withValues(alpha: 0.15),
              border: Border.all(color: color, width: 2),
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
              ),
              child: Text(
                '₹${(widget.rate).round()}',
                style: const TextStyle(color: Colors.white, fontSize: 9),
              ),
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

  @override
  Widget build(BuildContext context) {
    final rate = (spot['hourly_rate'] as num?)?.toDouble() ?? 0;
    final dist = spot['distance_meters'];
    return Card(
      elevation: 6,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(spot['title'] ?? 'Parking spot',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              '${spot['address'] ?? ''}'
              '${dist != null ? ' · ${dist.round()} m away' : ''}',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 8),
            Text('₹$rate / hour',
                style: Theme.of(context).textTheme.titleMedium!.copyWith(
                    color: Colors.teal, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onNavigate,
                    icon: const Icon(Icons.navigation),
                    label: const Text('Navigate'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: onLockTap,
                    child: const Text('Book slot'),
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