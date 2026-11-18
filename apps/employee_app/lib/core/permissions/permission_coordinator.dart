import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

class CapturedCoordinate {
  const CapturedCoordinate({
    required this.latitude,
    required this.longitude,
    this.accuracyM,
  });

  final double latitude;
  final double longitude;
  final double? accuracyM;
}

class PermissionSnapshot {
  const PermissionSnapshot({
    required this.notificationsGranted,
    required this.foregroundLocationGranted,
  });

  final bool notificationsGranted;
  final bool foregroundLocationGranted;
}

/// Just-in-time permission & contextual GPS coordinator compliant with
/// `MOBILE_PERMISSIONS.md`: never requests background location in Employee App,
/// and never forces location access during app startup.
abstract class PermissionCoordinator {
  Future<PermissionSnapshot> checkSnapshot();

  Future<bool> requestNotificationsPermission();

  Future<CapturedCoordinate?> requestForegroundLocationAndCapture();

  Future<void> openSystemSettings();
}

class DevicePermissionCoordinator implements PermissionCoordinator {
  @override
  Future<PermissionSnapshot> checkSnapshot() async {
    try {
      final notif = await Permission.notification.status;
      final loc = await Permission.locationWhenInUse.status;
      return PermissionSnapshot(
        notificationsGranted: notif.isGranted,
        foregroundLocationGranted: loc.isGranted,
      );
    } catch (_) {
      return const PermissionSnapshot(
        notificationsGranted: false,
        foregroundLocationGranted: false,
      );
    }
  }

  @override
  Future<bool> requestNotificationsPermission() async {
    try {
      final status = await Permission.notification.request();
      return status.isGranted || status.isProvisional;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<CapturedCoordinate?> requestForegroundLocationAndCapture() async {
    try {
      final status = await Permission.locationWhenInUse.request();
      if (!status.isGranted) return null;

      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) return null;

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 8),
        ),
      );
      return CapturedCoordinate(
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracyM: pos.accuracy,
      );
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> openSystemSettings() async {
    try {
      await openAppSettings();
    } catch (_) {
      // Safe no-op on non-mobile test targets.
    }
  }
}

