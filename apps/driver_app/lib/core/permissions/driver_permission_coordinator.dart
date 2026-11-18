import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:material_ui/material_ui.dart';
import 'package:permission_handler/permission_handler.dart' hide ServiceStatus;
import 'package:url_launcher/url_launcher.dart';

class DriverCoordinate {
  const DriverCoordinate({
    required this.latitude,
    required this.longitude,
    this.accuracyM,
    this.speedMps,
    this.headingDeg,
    this.altitudeM,
    required this.recordedAt,
  });

  final double latitude;
  final double longitude;
  final double? accuracyM;
  final double? speedMps;
  final double? headingDeg;
  final double? altitudeM;
  final DateTime recordedAt;

  bool get isValidCoordinate =>
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180 &&
      !(latitude.abs() < 0.0001 && longitude.abs() < 0.0001);

  bool get isPoorAccuracy => accuracyM != null && accuracyM! > 100;
}

class DriverPermissionSnapshot {
  const DriverPermissionSnapshot({
    required this.notificationsGranted,
    required this.locationGranted,
    required this.foregroundDutyActive,
    this.gpsServiceEnabled = true,
  });

  final bool notificationsGranted;
  final bool locationGranted;
  final bool foregroundDutyActive;
  final bool gpsServiceEnabled;
}

/// Manages progressive driver permissions and foreground-service GPS tracking
/// strictly bounded to `IN_PROGRESS` trip duty (`MOBILE_PERMISSIONS.md`).
abstract class DriverPermissionCoordinator {
  Stream<DriverCoordinate> get coordinateStream;

  Stream<String> get telemetryErrorStream;

  Future<DriverPermissionSnapshot> checkSnapshot();

  Future<bool> requestNotifications();

  Future<bool> startForegroundDutyTracking(String tripCode);

  Future<void> stopDutyTracking();

  Future<DriverCoordinate?> readCurrentCoordinate();

  Future<void> openSystemSettings();
}

class DeviceDriverPermissionCoordinator implements DriverPermissionCoordinator {
  final StreamController<DriverCoordinate> _coordController =
      StreamController<DriverCoordinate>.broadcast();
  final StreamController<String> _errorController =
      StreamController<String>.broadcast();
  StreamSubscription<Position>? _dutySub;
  StreamSubscription<ServiceStatus>? _serviceStatusSub;
  DriverCoordinate? _latestCoord;
  bool _dutyActive = false;

  @override
  Stream<DriverCoordinate> get coordinateStream => _coordController.stream;

  @override
  Stream<String> get telemetryErrorStream => _errorController.stream;

  @override
  Future<DriverPermissionSnapshot> checkSnapshot() async {
    try {
      final notif = await Permission.notification.status;
      final loc = await Permission.locationWhenInUse.status;
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      return DriverPermissionSnapshot(
        notificationsGranted: notif.isGranted,
        locationGranted: loc.isGranted,
        foregroundDutyActive: _dutyActive,
        gpsServiceEnabled: serviceEnabled,
      );
    } catch (_) {
      return DriverPermissionSnapshot(
        notificationsGranted: false,
        locationGranted: false,
        foregroundDutyActive: _dutyActive,
        gpsServiceEnabled: true,
      );
    }
  }

  @override
  Future<bool> requestNotifications() async {
    try {
      final res = await Permission.notification.request();
      return res.isGranted || res.isProvisional;
    } catch (_) {
      return false;
    }
  }

  DriverCoordinate? _toValidatedCoordinate(Position pos) {
    final coord = DriverCoordinate(
      latitude: pos.latitude,
      longitude: pos.longitude,
      accuracyM: pos.accuracy,
      speedMps: pos.speed.isFinite && pos.speed >= 0 ? pos.speed : null,
      headingDeg: pos.heading.isFinite && pos.heading >= 0 && pos.heading <= 360
          ? pos.heading
          : null,
      altitudeM: pos.altitude.isFinite ? pos.altitude : null,
      recordedAt: pos.timestamp.toUtc(),
    );
    if (!coord.isValidCoordinate) return null;
    return coord;
  }

  @override
  Future<bool> startForegroundDutyTracking(String tripCode) async {
    try {
      final locStatus = await Permission.locationWhenInUse.request();
      if (!locStatus.isGranted) {
        _errorController.add('PERMISSION_REVOKED');
        return false;
      }

      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        _errorController.add('GPS_DISABLED');
        return false;
      }

      final settings = !kIsWeb && defaultTargetPlatform == TargetPlatform.android
          ? AndroidSettings(
              accuracy: LocationAccuracy.high,
              distanceFilter: 8,
              intervalDuration: const Duration(seconds: 5),
              foregroundNotificationConfig: ForegroundNotificationConfig(
                notificationTitle: 'SolTransit Active Trip · $tripCode',
                notificationText:
                    'Sharing live vehicle telemetry while shift trip is in progress.',
                enableWakeLock: true,
                setOngoing: true,
              ),
            )
          : const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 8);

      await _dutySub?.cancel();
      await _serviceStatusSub?.cancel();
      _dutyActive = true;

      _serviceStatusSub = Geolocator.getServiceStatusStream().listen((status) {
        if (status == ServiceStatus.disabled) {
          _errorController.add('GPS_DISABLED');
        } else {
          _errorController.add('GPS_RESTORED');
        }
      });

      _dutySub = Geolocator.getPositionStream(locationSettings: settings).listen(
        (pos) {
          final coord = _toValidatedCoordinate(pos);
          if (coord == null) return;
          _latestCoord = coord;
          if (!_coordController.isClosed) {
            _coordController.add(coord);
          }
          if (coord.isPoorAccuracy && !_errorController.isClosed) {
            _errorController.add('LOW_ACCURACY');
          }
        },
        onError: (_) async {
          final perm = await Permission.locationWhenInUse.status;
          if (!perm.isGranted && !_errorController.isClosed) {
            _errorController.add('PERMISSION_REVOKED');
          } else if (!(await Geolocator.isLocationServiceEnabled()) &&
              !_errorController.isClosed) {
            _errorController.add('GPS_DISABLED');
          }
        },
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> stopDutyTracking() async {
    _dutyActive = false;
    await _dutySub?.cancel();
    await _serviceStatusSub?.cancel();
    _dutySub = null;
    _serviceStatusSub = null;
  }

  @override
  Future<DriverCoordinate?> readCurrentCoordinate() async {
    if (_latestCoord != null &&
        DateTime.now().toUtc().difference(_latestCoord!.recordedAt).inSeconds <= 20) {
      return _latestCoord;
    }
    try {
      final status = await Permission.locationWhenInUse.status;
      if (!status.isGranted) return _latestCoord;
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 6),
        ),
      );
      final validated = _toValidatedCoordinate(pos);
      if (validated != null) {
        _latestCoord = validated;
      }
      return _latestCoord;
    } catch (_) {
      return _latestCoord;
    }
  }

  @override
  Future<void> openSystemSettings() async {
    try {
      await openAppSettings();
    } catch (_) {}
  }
}

/// Launches Turn-by-Turn Navigation in external Google Maps app cleanly at ₹0 API cost,
/// falling back to generic `geo:` / browser URL if Google Maps is uninstalled.
Future<void> launchGoogleMapsTurnByTurn(
  BuildContext context, {
  required String navigationUrl,
  required double latitude,
  required double longitude,
  required String label,
}) async {
  final primaryUri = Uri.parse(navigationUrl);
  try {
    final launched = await launchUrl(primaryUri, mode: LaunchMode.externalApplication);
    if (launched) return;
  } catch (_) {}

  final fallbackGeo = Uri.parse('geo:$latitude,$longitude?q=$latitude,$longitude($label)');
  try {
    final launchedGeo = await launchUrl(fallbackGeo, mode: LaunchMode.platformDefault);
    if (launchedGeo) return;
  } catch (_) {}

  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Maps app unavailable. Navigate to $label (${latitude.toStringAsFixed(4)}, ${longitude.toStringAsFixed(4)}).',
        ),
      ),
    );
  }
}

Future<void> launchDriverDialer(BuildContext context, String phone) async {
  final cleaned = phone.trim().replaceAll(' ', '');
  final uri = Uri(scheme: 'tel', path: cleaned);
  try {
    final ok = await launchUrl(uri);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Call $cleaned directly on your phone.')),
      );
    }
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Phone: $cleaned')),
      );
    }
  }
}

