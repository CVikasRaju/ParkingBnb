import 'package:flutter/material.dart';
import '../../core/api_client.dart';

/// Spot & EV Socket Onboarding Flow for Hosts / Providers.
class CreateSpotScreen extends StatefulWidget {
  const CreateSpotScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<CreateSpotScreen> createState() => _CreateSpotScreenState();
}

class _CreateSpotScreenState extends State<CreateSpotScreen> {
  int _currentStep = 0;
  bool _submitting = false;
  String? _errorMessage;

  // Step 1: Basic Info
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  final _addressController = TextEditingController();
  double _latitude = 12.9716;
  double _longitude = 77.5946;
  String _category = 'parking_only';

  // Step 2: Rates & EV Specs
  final _hourlyRateController = TextEditingController(text: '40');
  final _overstayMultController = TextEditingController(text: '1.5');
  String _plugType = 'type2_ac';
  final _powerKwController = TextEditingController(text: '7.4');
  final _energyRateController = TextEditingController(text: '15');
  bool _byoc = true; // Bring Your Own Cable

  // Step 3: Schedule & Access
  final _entryInstructionsController = TextEditingController();
  final _gateCodeController = TextEditingController();
  bool _hasIotBarrier = false;
  final Set<int> _selectedDays = {0, 1, 2, 3, 4, 5, 6}; // Sun-Sat
  TimeOfDay _openTime = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _closeTime = const TimeOfDay(hour: 22, minute: 0);

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    _addressController.dispose();
    _hourlyRateController.dispose();
    _overstayMultController.dispose();
    _powerKwController.dispose();
    _energyRateController.dispose();
    _entryInstructionsController.dispose();
    _gateCodeController.dispose();
    super.dispose();
  }

  bool get _isEv => _category == 'ev_p2p_charge' || _category == 'commercial_cpo';

  Future<void> _submitSpot() async {
    if (_titleController.text.trim().isEmpty || _addressController.text.trim().isEmpty) {
      setState(() => _errorMessage = 'Please complete the title and address fields.');
      return;
    }

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    try {
      final hourlyRate = double.tryParse(_hourlyRateController.text.trim()) ?? 40.0;
      final overstayMult = double.tryParse(_overstayMultController.text.trim()) ?? 1.5;
      final powerKw = _isEv ? (double.tryParse(_powerKwController.text.trim()) ?? 7.4) : 0.0;
      final energyRate = _isEv ? (double.tryParse(_energyRateController.text.trim()) ?? 15.0) : 0.0;

      String formatTime(TimeOfDay t) =>
          '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

      String instructions = _entryInstructionsController.text.trim();
      if (_gateCodeController.text.trim().isNotEmpty) {
        instructions += ' Gate Code: ${_gateCodeController.text.trim()}';
      }
      if (_isEv && _byoc) {
        instructions += ' (Bring your own cable required).';
      }

      final schedules = [
        {
          'dow': _selectedDays.toList(),
          'open_time': formatTime(_openTime),
          'close_time': formatTime(_closeTime),
        }
      ];

      await widget.api.post('spots', body: {
        'title': _titleController.text.trim(),
        'description': _descController.text.trim(),
        'address': _addressController.text.trim(),
        'latitude': _latitude,
        'longitude': _longitude,
        'hourly_rate': hourlyRate,
        'overstay_multiplier': overstayMult,
        'category': _category,
        'plug_type': _isEv ? _plugType : 'none',
        'power_output_kw': powerKw,
        'energy_rate_per_kwh': energyRate,
        'entry_instructions': instructions,
        'has_iot_barrier': _hasIotBarrier,
        'schedules': schedules,
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('🎉 Spot listed successfully!')),
      );
      Navigator.of(context).pop(true);
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('List New Spot & Socket'),
      ),
      body: Stepper(
        currentStep: _currentStep,
        onStepContinue: () {
          if (_currentStep < 2) {
            setState(() => _currentStep += 1);
          } else {
            _submitSpot();
          }
        },
        onStepCancel: () {
          if (_currentStep > 0) {
            setState(() => _currentStep -= 1);
          } else {
            Navigator.of(context).pop();
          }
        },
        controlsBuilder: (context, details) {
          return Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Row(
              children: [
                FilledButton(
                  onPressed: _submitting ? null : details.onStepContinue,
                  child: _submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(_currentStep == 2 ? 'Publish Listing' : 'Next Step'),
                ),
                const SizedBox(width: 12),
                if (_currentStep > 0)
                  OutlinedButton(
                    onPressed: _submitting ? null : details.onStepCancel,
                    child: const Text('Back'),
                  ),
              ],
            ),
          );
        },
        steps: [
          Step(
            title: const Text('Spot Details & Category'),
            isActive: _currentStep >= 0,
            state: _currentStep > 0 ? StepState.complete : StepState.indexed,
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_errorMessage != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(_errorMessage!, style: const TextStyle(color: Colors.red)),
                  ),
                TextField(
                  controller: _titleController,
                  decoration: const InputDecoration(
                    labelText: 'Listing Title *',
                    hintText: 'e.g., Secure Driveway with 11kW Type-2 EV Charger',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _descController,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    hintText: 'Mention security cameras, lighting, gate clearance, etc.',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _addressController,
                  decoration: const InputDecoration(
                    labelText: 'Street Address *',
                    hintText: '12th Main Rd, HAL 2nd Stage, Indiranagar, Bengaluru',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                const Text('Category:', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    ChoiceChip(
                      label: const Text('🅿️ Parking Only'),
                      selected: _category == 'parking_only',
                      onSelected: (sel) {
                        if (sel) setState(() => _category = 'parking_only');
                      },
                    ),
                    ChoiceChip(
                      label: const Text('⚡ P2P EV Socket'),
                      selected: _category == 'ev_p2p_charge',
                      onSelected: (sel) {
                        if (sel) setState(() => _category = 'ev_p2p_charge');
                      },
                    ),
                    ChoiceChip(
                      label: const Text('⚡ Fast CPO Hub'),
                      selected: _category == 'commercial_cpo',
                      onSelected: (sel) {
                        if (sel) setState(() => _category = 'commercial_cpo');
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Card(
                  elevation: 0,
                  color: Colors.grey.shade100,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        const Icon(Icons.pin_drop, color: Colors.teal),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'GPS Location: ${_latitude.toStringAsFixed(4)}, ${_longitude.toStringAsFixed(4)}',
                            style: const TextStyle(fontSize: 13),
                          ),
                        ),
                        TextButton(
                          onPressed: () {
                            // Coordinate nudge simulation for Bangalore area
                            setState(() {
                              _latitude = 12.9716 + (0.005 * (_selectedDays.length % 3));
                              _longitude = 77.5946 + (0.005 * (_selectedDays.length % 2));
                            });
                          },
                          child: const Text('Update GPS'),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Step(
            title: const Text('Pricing & EV Specifications'),
            isActive: _currentStep >= 1,
            state: _currentStep > 1 ? StepState.complete : StepState.indexed,
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _hourlyRateController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Base Rate (₹/hr)',
                          prefixText: '₹ ',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _overstayMultController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Overstay Multiplier',
                          suffixText: 'x',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                if (_isEv) ...[
                  const SizedBox(height: 16),
                  const Divider(),
                  const Text('⚡ EV Socket Hardware & Tariffs',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _plugType,
                    decoration: const InputDecoration(
                      labelText: 'Socket / Plug Type',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: '15A_domestic', child: Text('15A 3-Pin Domestic Socket')),
                      DropdownMenuItem(value: 'type2_ac', child: Text('Type-2 AC Socket (7.4kW – 22kW)')),
                      DropdownMenuItem(value: 'ccs2_dc', child: Text('CCS2 Fast DC Socket (30kW+)')),
                      DropdownMenuItem(value: 'chademo', child: Text('CHAdeMO DC Fast Plug')),
                    ],
                    onChanged: (val) => setState(() => _plugType = val ?? 'type2_ac'),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _powerKwController,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            labelText: 'Power (kW)',
                            suffixText: 'kW',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextField(
                          controller: _energyRateController,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            labelText: 'Energy Tariff (₹/kWh)',
                            prefixText: '₹ ',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    title: const Text('Bring Your Own Cable (BYOC)'),
                    subtitle: const Text('Driver must bring their own charging cable'),
                    value: _byoc,
                    onChanged: (v) => setState(() => _byoc = v),
                    contentPadding: EdgeInsets.zero,
                  ),
                ],
              ],
            ),
          ),
          Step(
            title: const Text('Access & Operating Hours'),
            isActive: _currentStep >= 2,
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _entryInstructionsController,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Entry Instructions',
                    hintText: 'e.g., Gate is on the left side of the white bungalow.',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _gateCodeController,
                  decoration: const InputDecoration(
                    labelText: 'Gate Access / Lockbox PIN (Optional)',
                    hintText: '4-digit code given to confirmed drivers',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  title: const Text('Automated IoT Barrier / Smart Relay'),
                  subtitle: const Text('Automatically opens gate or energizes socket on arrival'),
                  value: _hasIotBarrier,
                  onChanged: (v) => setState(() => _hasIotBarrier = v),
                  contentPadding: EdgeInsets.zero,
                ),
                const SizedBox(height: 16),
                const Text('Operating Schedule:', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 4,
                  children: [
                    for (int i = 0; i < 7; i++)
                      FilterChip(
                        label: Text(['S', 'M', 'T', 'W', 'T', 'F', 'S'][i]),
                        selected: _selectedDays.contains(i),
                        onSelected: (sel) {
                          setState(() {
                            if (sel) {
                              _selectedDays.add(i);
                            } else if (_selectedDays.length > 1) {
                              _selectedDays.remove(i);
                            }
                          });
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.access_time),
                        label: Text('Open: ${_openTime.format(context)}'),
                        onPressed: () async {
                          final t = await showTimePicker(context: context, initialTime: _openTime);
                          if (t != null) setState(() => _openTime = t);
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.access_time_filled),
                        label: Text('Close: ${_closeTime.format(context)}'),
                        onPressed: () async {
                          final t = await showTimePicker(context: context, initialTime: _closeTime);
                          if (t != null) setState(() => _closeTime = t);
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
