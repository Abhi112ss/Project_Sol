import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../config/driver_config.dart';
import '../notifications/driver_notification_coordinator.dart';

class DriverRealtimeService {
  DriverRealtimeService({this.enabled = true});

  final bool enabled;

  final _controller = StreamController<String>.broadcast();
  final _notificationsController =
      StreamController<DriverIncomingNotification>.broadcast();
  final _rng = Random();
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _wsSub;
  Timer? _pollTimer;
  Timer? _reconnectTimer;
  String? _activeTripId;
  int _reconnectAttempt = 0;
  bool _disposed = false;

  Stream<String> get refreshSignals => _controller.stream;

  Stream<DriverIncomingNotification> get notificationMessages =>
      _notificationsController.stream;

  void updateTripSubscription(String? tripId) {
    if (!enabled || _disposed) return;
    final changed = _activeTripId != tripId;
    _activeTripId = tripId;
    if (changed) _sendJoin();

    _pollTimer ??= Timer.periodic(const Duration(seconds: 20), (_) {
      if (!_disposed && !_controller.isClosed) {
        _controller.add('poll.refresh');
      }
    });
    if (_channel == null) {
      _connect();
    }
  }

  void _connect() {
    if (!enabled || _disposed || _channel != null) return;
    try {
      final ch = WebSocketChannel.connect(DriverConfig.buildWebSocketUri());
      _channel = ch;
      _wsSub = ch.stream.listen(
        (raw) => _handlePacket(raw.toString()),
        onError: (_) => _scheduleReconnect(),
        onDone: _scheduleReconnect,
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _handlePacket(String packet) {
    if (packet == '2') {
      _channel?.sink.add('3');
      return;
    }
    if (packet.startsWith('0')) {
      _channel?.sink.add('40/ws/transport,');
      return;
    }
    if (packet.startsWith('40/ws/transport')) {
      _reconnectAttempt = 0;
      _sendJoin();
      return;
    }
    if (packet.startsWith('42/ws/transport,')) {
      final payload = packet.substring('42/ws/transport,'.length);
      try {
        final decoded = jsonDecode(payload);
        if (decoded is List && decoded.isNotEmpty) {
          final eventName = decoded.first.toString();
          if (decoded.length > 1 && decoded[1] is Map && !_notificationsController.isClosed) {
            final map = Map<String, dynamic>.from(decoded[1] as Map);
            if (eventName == 'notification.created') {
              final title = (map['title'] ?? '').toString();
              if (title.isNotEmpty) {
                _notificationsController.add(
                  DriverIncomingNotification(
                    id: map['id']?.toString(),
                    category: (map['category'] ?? 'GENERAL').toString(),
                    title: title,
                    body: (map['body'] ?? '').toString(),
                    tripId: map['tripId']?.toString(),
                    createdAt: DateTime.tryParse((map['createdAt'] ?? '').toString()),
                  ),
                );
              }
            } else if (eventName == 'passenger.running_late') {
              final etaMin = (map['etaMinutes'] as num?)?.toInt() ?? 5;
              _notificationsController.add(
                DriverIncomingNotification(
                  category: 'PASSENGER_RUNNING_LATE',
                  title: 'Passenger Running Late',
                  body: 'Commuter reported +$etaMin min delay for boarding.',
                  tripId: map['tripId']?.toString(),
                ),
              );
            } else if (eventName == 'passenger.cancelled') {
              _notificationsController.add(
                DriverIncomingNotification(
                  category: 'PASSENGER_CANCELLED',
                  title: 'Passenger Cancelled Ride',
                  body: 'A passenger on your manifest cancelled their seat.',
                  tripId: map['tripId']?.toString(),
                ),
              );
            } else if (eventName == 'safety.sos') {
              _notificationsController.add(
                DriverIncomingNotification(
                  id: map['id']?.toString(),
                  category: 'SAFETY_SOS',
                  title: 'CRITICAL SOS · Trip Alert',
                  body: (map['notes'] ?? 'Emergency escalation active.').toString(),
                  tripId: map['tripId']?.toString(),
                ),
              );
            }
          }
          if (!_controller.isClosed) {
            _controller.add(eventName);
          }
        }
      } catch (_) {}
    }
  }

  void _sendJoin() {
    final ch = _channel;
    if (ch == null) return;
    final body = {
      'organizationId': DriverConfig.organizationId,
      'driverId': DriverConfig.defaultDriverId,
      'tripId': ?_activeTripId,
    };
    ch.sink.add('42/ws/transport,${jsonEncode(['join', body])}');
  }

  void _scheduleReconnect() {
    _wsSub?.cancel();
    _wsSub = null;
    _channel = null;
    if (!enabled || _disposed) return;
    _reconnectTimer?.cancel();
    final exp = min(60, 4 * pow(2, min(_reconnectAttempt, 4)).toInt());
    final jitter = _rng.nextInt(4);
    _reconnectAttempt += 1;
    _reconnectTimer = Timer(Duration(seconds: exp + jitter), _connect);
  }

  Future<void> resetEndpoint() async {
    if (!enabled || _disposed) return;
    _reconnectTimer?.cancel();
    _reconnectAttempt = 0;
    await _wsSub?.cancel();
    _wsSub = null;
    await _channel?.sink.close();
    _channel = null;
    if (_activeTripId != null) {
      _connect();
    }
  }

  void dispose() {
    _disposed = true;
    _pollTimer?.cancel();
    _reconnectTimer?.cancel();
    _wsSub?.cancel();
    _channel?.sink.close();
    _controller.close();
    _notificationsController.close();
  }
}

