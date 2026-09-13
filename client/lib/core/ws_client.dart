import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

/// Message bus for the `/ws` realtime gateway (API_SPEC §6).
///
/// Clients send `{op, ...}` frames and receive pushed events:
///  - {"type":"spot_status","spotId":…,"status":"locked"|"available"}
///  - {"type":"driver_alert","driverId":…,"alert":"overstay_warning",…}
class RealtimeChannel {
  RealtimeChannel(this.wsUrl) {
    _connect();
  }

  static RealtimeChannel? _instance;
  static RealtimeChannel of(String wsUrl) =>
      _instance ??= RealtimeChannel(wsUrl);

  final String wsUrl;
  WebSocketChannel? _channel;
  final _listeners = <void Function(Map<String, dynamic>)>{};
  StreamSubscription? _sub;
  Timer? _reconnect;
  bool _closed = false;

  /// Subscribe to spot status changes. Returns an unsubscribe closure.
  void Function() onSpotStatus(void Function(String spotId, String status) cb) {
    return _listen((e) {
      if (e['type'] == 'spot_status') {
        cb(e['spotId'] as String, e['status'] as String);
      }
    });
  }

  /// Subscribe to driver alerts (e.g. overstay warnings).
  void Function() onDriverAlert(void Function(Map<String, dynamic> e) cb) {
    return _listen((e) {
      if (e['type'] == 'driver_alert') cb(e);
    });
  }

  void Function() _listen(void Function(Map<String, dynamic>) cb) {
    _listeners.add(cb);
    return () => _listeners.remove(cb);
  }

  void _connect() {
    _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
    _sub = _channel!.stream.listen(
      (raw) {
        if (raw is String) {
          final e = jsonDecode(raw) as Map<String, dynamic>;
          for (final l in List.of(_listeners)) {
            try {
              l(e);
            } catch (_) {}
          }
        }
      },
      onError: (_) => _scheduleReconnect(),
      onDone: () {
        if (!_closed) _scheduleReconnect();
      },
      cancelOnError: true,
    );
  }

  void subscribeSpot(String spotId) =>
      _send({'op': 'subscribe_spot', 'spot_id': spotId});

  void subscribeDriver(String driverId) =>
      _send({'op': 'subscribe_driver', 'driver_id': driverId});

  void _send(Map<String, dynamic> msg) {
    final ch = _channel;
    if (ch == null) return;
    ch.sink.add(jsonEncode(msg));
  }

  void _scheduleReconnect() {
    if (_closed) return;
    _reconnect ??= Timer(const Duration(seconds: 3), () {
      _reconnect = null;
      _connect();
    });
  }

  void dispose() {
    _closed = true;
    _reconnect?.cancel();
    _sub?.cancel();
    _channel?.sink.close();
    if (identical(_instance, this)) _instance = null;
  }
}