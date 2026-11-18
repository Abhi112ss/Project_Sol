import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class DriverIncomingNotification {
  const DriverIncomingNotification({
    this.id,
    required this.category,
    required this.title,
    required this.body,
    this.tripId,
    this.createdAt,
  });

  final String? id;
  final String category;
  final String title;
  final String body;
  final String? tripId;
  final DateTime? createdAt;
}

abstract class DriverNotificationCoordinator {
  Future<void> initialize();

  Future<void> showDutyAlert({
    required String idSeed,
    required String category,
    required String title,
    required String body,
    String? tripId,
  });

  Future<String?> registerPushTokenIfPermitted({
    required bool notificationsGranted,
    required Future<void> Function(String token, String platform) onToken,
  });

  void dispose();
}

class NoopDriverNotificationCoordinator implements DriverNotificationCoordinator {
  const NoopDriverNotificationCoordinator();

  @override
  void dispose() {}

  @override
  Future<void> initialize() async {}

  @override
  Future<String?> registerPushTokenIfPermitted({
    required bool notificationsGranted,
    required Future<void> Function(String token, String platform) onToken,
  }) async =>
      null;

  @override
  Future<void> showDutyAlert({
    required String idSeed,
    required String category,
    required String title,
    required String body,
    String? tripId,
  }) async {}
}

class DeviceDriverNotificationCoordinator implements DriverNotificationCoordinator {
  DeviceDriverNotificationCoordinator({
    FlutterLocalNotificationsPlugin? plugin,
  }) : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  bool _initialized = false;
  bool _fcmInitialized = false;
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _foregroundMsgSub;

  static const _dutyChannelId = 'soltransit_driver_alerts';
  static const _sosChannelId = 'soltransit_driver_sos';

  @override
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        ),
      );
      final androidImpl = _plugin
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await androidImpl?.createNotificationChannel(
        const AndroidNotificationChannel(
          _dutyChannelId,
          'Driver Duty Alerts',
          description: 'Trip dispatches, passenger cancellations, and running-late notices',
          importance: Importance.high,
        ),
      );
      await androidImpl?.createNotificationChannel(
        const AndroidNotificationChannel(
          _sosChannelId,
          'Safety & Emergency Alerts',
          description: 'Emergency SOS escalations for active duty trips',
          importance: Importance.max,
        ),
      );
    } catch (e) {
      debugPrint('Driver local notifications skipped: $e');
    }
  }

  @override
  Future<void> showDutyAlert({
    required String idSeed,
    required String category,
    required String title,
    required String body,
    String? tripId,
  }) async {
    await initialize();
    final isSafety = category.toUpperCase().contains('SOS') ||
        category.toUpperCase().contains('SAFETY');
    try {
      await _plugin.show(
        id: idSeed.hashCode & 0x7fffffff,
        title: title,
        body: body,
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            isSafety ? _sosChannelId : _dutyChannelId,
            isSafety ? 'Safety & Emergency Alerts' : 'Driver Duty Alerts',
            importance: isSafety ? Importance.max : Importance.high,
            priority: isSafety ? Priority.max : Priority.high,
          ),
        ),
        payload: tripId,
      );
    } catch (e) {
      debugPrint('Failed to display driver duty notification: $e');
    }
  }

  @override
  Future<String?> registerPushTokenIfPermitted({
    required bool notificationsGranted,
    required Future<void> Function(String token, String platform) onToken,
  }) async {
    if (!notificationsGranted) return null;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
      final messaging = FirebaseMessaging.instance;
      if (!_fcmInitialized) {
        _fcmInitialized = true;
        _tokenRefreshSub = messaging.onRegistered.listen((token) {
          if (token.trim().length >= 8) {
            onToken(token.trim(), defaultTargetPlatform == TargetPlatform.iOS ? 'IOS' : 'ANDROID');
          }
        });
        _foregroundMsgSub = FirebaseMessaging.onMessage.listen((msg) {
          final n = msg.notification;
          if (n == null) return;
          showDutyAlert(
            idSeed: msg.messageId ?? DateTime.now().microsecondsSinceEpoch.toString(),
            category: (msg.data['category'] ?? 'DUTY_ALERT').toString(),
            title: n.title ?? 'Duty Update',
            body: n.body ?? '',
            tripId: msg.data['tripId']?.toString(),
          );
        });
      }
      await messaging.register();
    } catch (_) {
      // Optional Firebase config absent in ₹0 local/USB dev mode; Socket.IO banners stay active.
    }
    return null;
  }

  @override
  void dispose() {
    _tokenRefreshSub?.cancel();
    _foregroundMsgSub?.cancel();
  }
}
