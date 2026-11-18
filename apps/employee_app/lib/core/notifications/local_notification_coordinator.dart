import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

class IncomingNotificationPayload {
  const IncomingNotificationPayload({
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

abstract class AppNotificationCoordinator {
  Future<void> initialize({void Function(String? payload)? onNotificationTap});

  Future<void> showRealtimeNotification({
    required String idSeed,
    required String category,
    required String title,
    required String body,
    String? tripId,
  });

  Future<void> schedulePrePickupReminder({
    required String tripId,
    required String tripCode,
    required String stopName,
    required DateTime scheduledPickupAt,
  });

  Future<void> cancelPrePickupReminder(String tripId);

  Future<String?> registerPushTokenIfPermitted({
    required bool notificationsGranted,
    required Future<void> Function(String token, String platform) onToken,
  });

  void dispose();
}

class NoopAppNotificationCoordinator implements AppNotificationCoordinator {
  const NoopAppNotificationCoordinator();

  @override
  Future<void> cancelPrePickupReminder(String tripId) async {}

  @override
  void dispose() {}

  @override
  Future<void> initialize({void Function(String? payload)? onNotificationTap}) async {}

  @override
  Future<String?> registerPushTokenIfPermitted({
    required bool notificationsGranted,
    required Future<void> Function(String token, String platform) onToken,
  }) async =>
      null;

  @override
  Future<void> schedulePrePickupReminder({
    required String tripId,
    required String tripCode,
    required String stopName,
    required DateTime scheduledPickupAt,
  }) async {}

  @override
  Future<void> showRealtimeNotification({
    required String idSeed,
    required String category,
    required String title,
    required String body,
    String? tripId,
  }) async {}
}

/// Phase 6 hybrid push & local notification coordinator:
/// - Displays local system banners immediately for incoming Socket.IO dispatch/safety events.
/// - Schedules local 15-minute pre-pickup reminders via `AndroidScheduleMode.inexactAllowWhileIdle`.
/// - Wraps optional Firebase Cloud Messaging cleanly in try/catch so local/USB builds work
///   at ₹0 cost even without `google-services.json`.
class DeviceLocalNotificationCoordinator implements AppNotificationCoordinator {
  DeviceLocalNotificationCoordinator({
    FlutterLocalNotificationsPlugin? plugin,
  }) : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  bool _initialized = false;
  bool _tzInitialized = false;
  bool _fcmInitialized = false;
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _foregroundMsgSub;

  static const _tripChannelId = 'soltransit_trips';
  static const _safetyChannelId = 'soltransit_safety';

  @override
  Future<void> initialize({void Function(String? payload)? onNotificationTap}) async {
    if (_initialized) return;
    _initialized = true;
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        ),
        onDidReceiveNotificationResponse: (details) {
          onNotificationTap?.call(details.payload);
        },
      );

      final androidImpl = _plugin
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await androidImpl?.createNotificationChannel(
        const AndroidNotificationChannel(
          _tripChannelId,
          'Trip & Dispatch Alerts',
          description: 'Cab assignments, 15m reminders, approaching cab, and delay notices',
          importance: Importance.high,
        ),
      );
      await androidImpl?.createNotificationChannel(
        const AndroidNotificationChannel(
          _safetyChannelId,
          'Emergency SOS & Safety',
          description: 'Urgent safety escalations and overdue safe-reach checks',
          importance: Importance.max,
        ),
      );
    } catch (e) {
      debugPrint('Local notification initialization skipped: $e');
    }
  }

  void _ensureTimezoneReady() {
    if (_tzInitialized) return;
    tzdata.initializeTimeZones();
    _tzInitialized = true;
  }

  int _stableNotificationId(String seed) {
    return seed.hashCode & 0x7fffffff;
  }

  bool _isSafetyCategory(String category) {
    final upper = category.toUpperCase();
    return upper.contains('SAFETY') || upper.contains('SOS') || upper.contains('OVERDUE');
  }

  NotificationDetails _detailsForCategory(String category) {
    final safety = _isSafetyCategory(category);
    return NotificationDetails(
      android: AndroidNotificationDetails(
        safety ? _safetyChannelId : _tripChannelId,
        safety ? 'Emergency SOS & Safety' : 'Trip & Dispatch Alerts',
        importance: safety ? Importance.max : Importance.high,
        priority: safety ? Priority.max : Priority.high,
      ),
    );
  }

  @override
  Future<void> showRealtimeNotification({
    required String idSeed,
    required String category,
    required String title,
    required String body,
    String? tripId,
  }) async {
    await initialize();
    try {
      await _plugin.show(
        id: _stableNotificationId(idSeed),
        title: title,
        body: body,
        notificationDetails: _detailsForCategory(category),
        payload: tripId,
      );
    } catch (e) {
      debugPrint('Failed to render local notification: $e');
    }
  }

  @override
  Future<void> schedulePrePickupReminder({
    required String tripId,
    required String tripCode,
    required String stopName,
    required DateTime scheduledPickupAt,
  }) async {
    final reminderAt = scheduledPickupAt.subtract(const Duration(minutes: 15));
    final now = DateTime.now();
    if (!reminderAt.isAfter(now.add(const Duration(seconds: 10))) ||
        reminderAt.difference(now).inHours > 48) {
      return;
    }

    await initialize();
    try {
      _ensureTimezoneReady();
      final scheduledTz = tz.TZDateTime.from(reminderAt.toUtc(), tz.UTC);
      await _plugin.zonedSchedule(
        id: _stableNotificationId('pre_pickup_$tripId'),
        title: 'Pickup in 15m · $tripCode',
        body: 'Cab arrives at $stopName around 15m from reminder. Keep your 4-digit OTP ready.',
        scheduledDate: scheduledTz,
        notificationDetails: _detailsForCategory('PRE_PICKUP_15M'),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        payload: tripId,
      );
    } catch (e) {
      debugPrint('Pre-pickup local reminder skipped: $e');
    }
  }

  @override
  Future<void> cancelPrePickupReminder(String tripId) async {
    try {
      await _plugin.cancel(id: _stableNotificationId('pre_pickup_$tripId'));
    } catch (_) {
      // Ignore cancellation errors on headless/test hosts
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
        _tokenRefreshSub = messaging.onRegistered.listen((nextToken) {
          if (nextToken.trim().length >= 8) {
            onToken(nextToken.trim(), defaultTargetPlatform == TargetPlatform.iOS ? 'IOS' : 'ANDROID');
          }
        });
        _foregroundMsgSub = FirebaseMessaging.onMessage.listen((msg) {
          final n = msg.notification;
          if (n == null) return;
          showRealtimeNotification(
            idSeed: msg.messageId ?? DateTime.now().microsecondsSinceEpoch.toString(),
            category: (msg.data['category'] ?? 'GENERAL').toString(),
            title: n.title ?? 'SolTransit Update',
            body: n.body ?? '',
            tripId: msg.data['tripId']?.toString(),
          );
        });
      }
      await messaging.register();
    } catch (_) {
      // Firebase not configured (missing google-services.json in ₹0 local dev); Socket.IO local banners remain active.
    }
    return null;
  }

  @override
  void dispose() {
    _tokenRefreshSub?.cancel();
    _foregroundMsgSub?.cancel();
  }
}
