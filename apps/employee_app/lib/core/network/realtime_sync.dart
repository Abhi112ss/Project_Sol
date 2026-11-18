import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../config/app_config.dart';
import '../models/employee_models.dart';
import '../notifications/local_notification_coordinator.dart';

class LiveTripLocationUpdate {
  const LiveTripLocationUpdate({
    required this.tripId,
    required this.telemetry,
  });

  final String tripId;
  final GpsTelemetry telemetry;
}

/// Connects to NestJS Socket.IO `/ws/transport` namespace using Engine.IO v4
/// framing (`0` open, `40/ws/transport,` connect, `2`/`3` heartbeat) cleanly
/// and degrades safely to polling when offline or blocked.
class RealtimeSyncService {
  RealtimeSyncService({this.enabled = true});

  final bool enabled;

  final _eventsController = StreamController<String>.broadcast();
  final _locationController = StreamController<LiveTripLocationUpdate>.broadcast();
  final _connectionController = StreamController<bool>.broadcast();
  final _notificationsController =
      StreamController<IncomingNotificationPayload>.broadcast();
  final _rng = Random();
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _wsSub;
  Timer? _pollTimer;
  Timer? _reconnectTimer;
  String? _activeEmployeeId;
  String? _activeTripId;
  int _reconnectAttempt = 0;
  bool _socketConnected = false;
  bool _disposed = false;

  Stream<String> get refreshSignals => _eventsController.stream;

  Stream<LiveTripLocationUpdate> get locationUpdates => _locationController.stream;

  Stream<bool> get connectionStatusStream => _connectionController.stream;

  Stream<IncomingNotificationPayload> get notificationMessages =>
      _notificationsController.stream;

  bool get isSocketConnected => _socketConnected;

  void updateSubscriptions({required String? employeeId, required String? tripId}) {
    if (!enabled || _disposed) return;
    final changed = _activeEmployeeId != employeeId || _activeTripId != tripId;
    _activeEmployeeId = employeeId;
    _activeTripId = tripId;
    if (changed) {
      _sendJoin();
    }
    _ensureTimers();
    if (_channel == null) {
      _connect();
    }
  }

  void _ensureTimers() {
    _pollTimer ??= Timer.periodic(const Duration(seconds: 15), (_) {
      if (!_disposed && !_eventsController.isClosed) {
        _eventsController.add('poll.refresh');
      }
    });
  }

  void _connect() {
    if (!enabled || _disposed || _channel != null) return;
    try {
      final ch = WebSocketChannel.connect(AppConfig.buildWebSocketUri());
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

  void _setConnected(bool value) {
    if (_socketConnected != value) {
      _socketConnected = value;
      if (!_connectionController.isClosed) {
        _connectionController.add(value);
      }
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
      _setConnected(true);
      _sendJoin();
      return;
    }
    if (packet.startsWith('42/ws/transport,')) {
      final payload = packet.substring('42/ws/transport,'.length);
      try {
        final decoded = jsonDecode(payload);
        if (decoded is List && decoded.isNotEmpty) {
          final eventName = decoded.first.toString();
          if ((eventName == 'trip.location.updated' || eventName == 'vehicle.location') &&
              decoded.length > 1 &&
              decoded[1] is Map) {
            final map = Map<String, dynamic>.from(decoded[1] as Map);
            final tripId = map['tripId']?.toString();
            if (tripId != null && tripId.isNotEmpty && !_locationController.isClosed) {
              _locationController.add(
                LiveTripLocationUpdate(
                  tripId: tripId,
                  telemetry: GpsTelemetry.fromJson(map),
                ),
              );
            }
            return;
          }
          if (eventName == 'notification.created' &&
              decoded.length > 1 &&
              decoded[1] is Map &&
              !_notificationsController.isClosed) {
            final map = Map<String, dynamic>.from(decoded[1] as Map);
            final title = (map['title'] ?? '').toString();
            final body = (map['body'] ?? '').toString();
            if (title.isNotEmpty) {
              _notificationsController.add(
                IncomingNotificationPayload(
                  id: map['id']?.toString(),
                  category: (map['category'] ?? 'GENERAL').toString(),
                  title: title,
                  body: body,
                  tripId: map['tripId']?.toString(),
                  createdAt: DateTime.tryParse((map['createdAt'] ?? '').toString()),
                ),
              );
            }
          } else if (eventName == 'trip.delayed' &&
              decoded.length > 1 &&
              decoded[1] is Map &&
              !_notificationsController.isClosed) {
            final map = Map<String, dynamic>.from(decoded[1] as Map);
            final tripId = map['tripId']?.toString();
            final tripCode = (map['tripCode'] ?? 'Trip').toString();
            final delaySec = (map['delaySeconds'] as num?)?.toInt() ?? 180;
            final delayMin = (delaySec / 60).ceil();
            _notificationsController.add(
              IncomingNotificationPayload(
                category: 'DRIVER_DELAYED',
                title: 'Cab Delayed · $tripCode',
                body: 'Cab is running ~$delayMin min behind schedule.',
                tripId: tripId,
              ),
            );
          } else if ((eventName == 'safety.sos' || eventName == 'safety.alert.created') &&
              decoded.length > 1 &&
              decoded[1] is Map &&
              !_notificationsController.isClosed) {
            final map = Map<String, dynamic>.from(decoded[1] as Map);
            _notificationsController.add(
              IncomingNotificationPayload(
                id: map['id']?.toString(),
                category: (map['alertType'] ?? 'SAFETY_SOS').toString(),
                title: 'Safety Alert · ${(map['alertType'] ?? 'SOS').toString()}',
                body: (map['notes'] ?? 'Transport security desk notified.').toString(),
                tripId: map['tripId']?.toString(),
              ),
            );
          }
          if (!_eventsController.isClosed) {
            _eventsController.add(eventName);
          }
        }
      } catch (_) {
        // Ignore malformed frame safely.
      }
    }
  }

  void _sendJoin() {
    final ch = _channel;
    if (ch == null) return;
    final body = {
      'organizationId': AppConfig.organizationId,
      if (_activeEmployeeId != null) 'employeeId': _activeEmployeeId,
      if (_activeTripId != null) 'tripId': _activeTripId,
    };
    ch.sink.add('42/ws/transport,${jsonEncode(['join', body])}');
  }

  void _scheduleReconnect() {
    _setConnected(false);
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
    _setConnected(false);
    await _wsSub?.cancel();
    _wsSub = null;
    await _channel?.sink.close();
    _channel = null;
    if (_activeEmployeeId != null || _activeTripId != null) {
      _connect();
    }
  }

  void dispose() {
    _disposed = true;
    _setConnected(false);
    _pollTimer?.cancel();
    _reconnectTimer?.cancel();
    _wsSub?.cancel();
    _channel?.sink.close();
    _eventsController.close();
    _locationController.close();
    _connectionController.close();
    _notificationsController.close();
  }
}

