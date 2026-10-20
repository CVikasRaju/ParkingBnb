import 'package:flutter/material.dart';
import '../../core/api_client.dart';

/// Driver Vehicle Management Screen.
class VehiclesScreen extends StatefulWidget {
  const VehiclesScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<VehiclesScreen> createState() => _VehiclesScreenState();
}

class _VehiclesScreenState extends State<VehiclesScreen> {
  bool _loading = true;
  String? _error;
  List<dynamic> _vehicles = [];

  @override
  void initState() {
    super.initState();
    _loadVehicles();
  }

  Future<void> _loadVehicles() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final res = await widget.api.get('vehicles');
      if (!mounted) return;
      setState(() {
        _vehicles = (res as List?)?.cast<dynamic>() ?? [];
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

  Future<void> _addOrEditVehicle([Map<String, dynamic>? existing]) async {
    final plateCtrl = TextEditingController(text: existing?['license_plate'] ?? '');
    final makeCtrl = TextEditingController(text: existing?['make_model'] ?? '');
    String vehicleType = existing?['vehicle_type'] ?? 'sedan';
    String? dialogError;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(existing == null ? 'Add Vehicle' : 'Edit Vehicle'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (dialogError != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(dialogError!, style: const TextStyle(color: Colors.red, fontSize: 12)),
                ),
              TextField(
                controller: plateCtrl,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'License Plate *',
                  hintText: 'e.g. KA 01 AB 1234',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: makeCtrl,
                decoration: const InputDecoration(
                  labelText: 'Make & Model *',
                  hintText: 'e.g. Tata Nexon EV',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: vehicleType,
                decoration: const InputDecoration(
                  labelText: 'Vehicle Class',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'sedan', child: Text('🚗 Sedan')),
                  DropdownMenuItem(value: 'suv', child: Text('🚙 SUV / Crossover')),
                  DropdownMenuItem(value: 'hatchback', child: Text('🚗 Hatchback')),
                  DropdownMenuItem(value: 'ev', child: Text('⚡ Electric Vehicle (EV)')),
                  DropdownMenuItem(value: 'motorcycle', child: Text('🏍️ 2-Wheeler / Bike')),
                ],
                onChanged: (v) => setDialogState(() => vehicleType = v ?? 'sedan'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                final plate = plateCtrl.text.trim();
                final make = makeCtrl.text.trim();
                if (plate.isEmpty || make.isEmpty) {
                  setDialogState(() => dialogError = 'All fields are required');
                  return;
                }

                try {
                  if (existing == null) {
                    await widget.api.post('vehicles', body: {
                      'license_plate': plate,
                      'make_model': make,
                      'vehicle_type': vehicleType,
                    });
                  } else {
                    await widget.api.patch('vehicles/${existing['id']}', body: {
                      'license_plate': plate,
                      'make_model': make,
                      'vehicle_type': vehicleType,
                    });
                  }
                  if (context.mounted) Navigator.of(ctx).pop(true);
                } on ApiException catch (e) {
                  setDialogState(() => dialogError = e.message);
                }
              },
              child: Text(existing == null ? 'Save' : 'Update'),
            ),
          ],
        ),
      ),
    );

    if (result == true) {
      _loadVehicles();
    }
  }

  Future<void> _deleteVehicle(String id, String plate) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Vehicle'),
        content: Text('Are you sure you want to remove vehicle "$plate"?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await widget.api.delete('vehicles/$id');
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Vehicle $plate deleted.')),
        );
        _loadVehicles();
      } on ApiException catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: Colors.red),
        );
      }
    }
  }

  IconData _iconForType(String? type) {
    return switch (type) {
      'ev' => Icons.electric_car,
      'suv' => Icons.directions_car_filled,
      'motorcycle' => Icons.two_wheeler,
      _ => Icons.directions_car,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Vehicles'),
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
                      ElevatedButton(onPressed: _loadVehicles, child: const Text('Retry')),
                    ],
                  ),
                )
              : _vehicles.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.directions_car_outlined, size: 64, color: Colors.grey.shade400),
                          const SizedBox(height: 12),
                          const Text('No vehicles added yet.', style: TextStyle(fontSize: 16)),
                          const SizedBox(height: 8),
                          const Text('Add your vehicle to enable instant 1-tap spot locks.', style: TextStyle(color: Colors.grey, fontSize: 13)),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: _vehicles.length,
                      itemBuilder: (context, index) {
                        final v = _vehicles[index];
                        final id = v['id'] as String;
                        final plate = v['license_plate'] ?? '';
                        final make = v['make_model'] ?? '';
                        final type = v['vehicle_type'] as String?;

                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: type == 'ev' ? Colors.green.shade100 : Colors.teal.shade50,
                              child: Icon(_iconForType(type), color: type == 'ev' ? Colors.green : Colors.teal),
                            ),
                            title: Text(plate, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            subtitle: Text('$make · ${(type ?? 'sedan').toUpperCase()}'),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.edit, size: 20),
                                  onPressed: () => _addOrEditVehicle(v as Map<String, dynamic>),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, size: 20, color: Colors.red),
                                  onPressed: () => _deleteVehicle(id, plate),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addOrEditVehicle(),
        icon: const Icon(Icons.add),
        label: const Text('Add Vehicle'),
      ),
    );
  }
}
