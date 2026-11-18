import 'dart:async';
import 'dart:math';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/driver_config.dart';
import '../models/driver_models.dart';
import '../network/driver_api.dart';
import '../network/driver_realtime.dart';
import '../notifications/driver_notification_coordinator.dart';
import '../permissions/driver_permission_coordinator.dart';
import '../storage/driver_offline_store.dart';

final driverApiProvider = Provider<DriverApi>((ref) => HttpDriverApi());

class DriverApiBaseUrlNotifier extends Notifier<String> {
  @override
  String build() => DriverConfig.apiBaseUrl;

  Future<void> setEndpoint(String? url) async {
    await DriverConfig.setRuntimeApiBaseUrl(url);
    state = DriverConfig.apiBaseUrl;
    await ref.read(driverRealtimeProvider).resetEndpoint();
    ref.invalidate(driverProfileProvider);
    ref.invalidate(driverTripsProvider);
    ref.invalidate(driverCommutesOverviewProvider);
    ref.invalidate(driverCommuteCalendarProvider);
    ref.invalidate(driverCommuteDateManifestProvider);
  }
}

final driverApiBaseUrlProvider = NotifierProvider<DriverApiBaseUrlNotifier, String>(
  DriverApiBaseUrlNotifier.new,
);

final driverOfflineStoreProvider = Provider<DriverOfflineStore>(
  (ref) => DriftDriverOfflineStore.openPersistent(),
);

final driverPermissionCoordinatorProvider = Provider<DriverPermissionCoordinator>(
  (ref) => DeviceDriverPermissionCoordinator(),
);

final driverRealtimeProvider = Provider<DriverRealtimeService>((ref) {
  final service = DriverRealtimeService();
  final sub = service.refreshSignals.listen((_) {
    ref.invalidate(driverTripsProvider);
    ref.invalidate(driverCommutesOverviewProvider);
    ref.invalidate(driverCommuteCalendarProvider);
    ref.invalidate(driverCommuteDateManifestProvider);
  });
  ref.onDispose(() {
    sub.cancel();
    service.dispose();
  });
  return service;
});

final driverConnectivityStreamProvider = StreamProvider<List<ConnectivityResult>>((ref) {
  try {
    return Connectivity().onConnectivityChanged;
  } catch (_) {
    return Stream<List<ConnectivityResult>>.value(const [ConnectivityResult.wifi]);
  }
});

final driverIsOfflineProvider = Provider<bool>((ref) {
  final asyncResults = ref.watch(driverConnectivityStreamProvider);
  return asyncResults.maybeWhen(
    data: (results) => results.isNotEmpty && results.every((r) => r == ConnectivityResult.none),
    orElse: () => false,
  );
});

class DriverOnboardingState extends ValueNotifier<bool> {
  DriverOnboardingState([super.value = false]);

  void complete() {
    if (!value) value = true;
  }
}

final driverOnboardingStateProvider = Provider<DriverOnboardingState>((ref) {
  final state = DriverOnboardingState(false);
  ref.onDispose(state.dispose);
  return state;
});

final driverProfileProvider = FutureProvider<DriverProfileData>((ref) async {
  return ref.read(driverApiProvider).fetchProfile();
});

final driverTripsProvider = FutureProvider<List<DriverTripSummary>>((ref) async {
  return ref.read(driverApiProvider).fetchTrips();
});

final driverCommutesOverviewProvider = FutureProvider<DriverCommutesOverviewData>((ref) async {
  return ref.read(driverApiProvider).fetchCommutesOverview();
});

final driverCommuteCalendarProvider =
    FutureProvider.family<DriverCommuteCalendarData, ({String commuteId, String? month})>(
  (ref, arg) async {
    return ref.read(driverApiProvider).fetchCommuteCalendar(arg.commuteId, month: arg.month);
  },
);

final driverCommuteDateManifestProvider =
    FutureProvider.family<DriverCommuteDateManifestData, ({String commuteId, String date})>(
  (ref, arg) async {
    return ref.read(driverApiProvider).fetchCommuteDateManifest(arg.commuteId, arg.date);
  },
);

final driverPermissionSnapshotProvider = FutureProvider<DriverPermissionSnapshot>((ref) async {
  return ref.read(driverPermissionCoordinatorProvider).checkSnapshot();
});

final pendingOfflineEventsProvider = FutureProvider<List<QueuedDriverEvent>>((ref) async {
  return ref.read(driverOfflineStoreProvider).listPendingEvents();
});

final lastSyncTimestampProvider = FutureProvider<DateTime?>((ref) async {
  return ref.read(driverOfflineStoreProvider).getLastSyncedAt();
});

final driverSyncCoordinatorProvider = Provider<DriverSyncCoordinator>((ref) {
  final coordinator = DriverSyncCoordinator(ref);
  ref.listen<bool>(driverIsOfflineProvider, (prev, next) {
    if (prev == true && next == false) {
      coordinator.flushPendingEvents();
      ref.read(driverTelemetryProvider.notifier).flushPendingSamples();
    }
  });
  return coordinator;
});

class DriverTelemetryNotifier extends Notifier<DriverTelemetryStatus> {
  StreamSubscription<DriverCoordinate>? _coordSub;
  StreamSubscription<String>? _errSub;
  Timer? _retryTimer;
  int _seq = 0;
  int _failures = 0;
  bool _flushing = false;
  bool _stopping = false;
  final Random _rng = Random();

  @override
  DriverTelemetryStatus build() {
    final perms = ref.read(driverPermissionCoordinatorProvider);
    _coordSub?.cancel();
    _errSub?.cancel();

    _coordSub = perms.coordinateStream.listen((coord) {
      unawaited(_handleIncomingCoordinate(coord));
    });
    _errSub = perms.telemetryErrorStream.listen((code) {
      if (code == 'GPS_DISABLED') {
        state = state.copyWith(health: DriverGpsHealth.gpsDisabled, lastError: 'Device GPS disabled');
      } else if (code == 'PERMISSION_REVOKED') {
        state = state.copyWith(
          health: DriverGpsHealth.permissionRevoked,
          lastError: 'Location permission revoked',
        );
      } else if (code == 'LOW_ACCURACY') {
        state = state.copyWith(health: DriverGpsHealth.lowAccuracy, clearError: true);
      } else if (code == 'GPS_RESTORED') {
        state = state.copyWith(health: DriverGpsHealth.live, clearError: true);
      }
    });

    ref.onDispose(() {
      _retryTimer?.cancel();
      _coordSub?.cancel();
      _errSub?.cancel();
    });

    unawaited(_refreshPendingCount());
    return const DriverTelemetryStatus();
  }

  Future<void> _refreshPendingCount() async {
    final count = await ref.read(driverOfflineStoreProvider).countPendingGpsSamples();
    state = state.copyWith(pendingSampleCount: count);
  }

  Future<void> ensureDutyTrackingForTrip(String tripId, String tripCode) async {
    if (state.activeTripId == tripId &&
        (state.health == DriverGpsHealth.live || state.health == DriverGpsHealth.lowAccuracy)) {
      return;
    }
    final perms = ref.read(driverPermissionCoordinatorProvider);
    state = state.copyWith(activeTripId: tripId, clearError: true);
    final started = await perms.startForegroundDutyTracking(tripCode);
    await _refreshPendingCount();
    if (!started) {
      final snap = await perms.checkSnapshot();
      final nextHealth = !snap.locationGranted
          ? DriverGpsHealth.permissionRevoked
          : !snap.gpsServiceEnabled
              ? DriverGpsHealth.gpsDisabled
              : DriverGpsHealth.idle;
      state = state.copyWith(health: nextHealth);
    } else {
      state = state.copyWith(health: DriverGpsHealth.live, clearError: true);
    }
    ref.invalidate(driverPermissionSnapshotProvider);
  }

  Future<void> stopDutyTracking() async {
    if (_stopping) return;
    _stopping = true;
    _retryTimer?.cancel();
    try {
      final previousTrip = state.activeTripId;
      final perms = ref.read(driverPermissionCoordinatorProvider);
      final snap = await perms.checkSnapshot();
      if (previousTrip == null && !snap.foregroundDutyActive) {
        if (state.health != DriverGpsHealth.idle) {
          state = state.copyWith(health: DriverGpsHealth.idle, clearError: true);
        }
        return;
      }
      state = state.copyWith(clearActiveTrip: true, health: DriverGpsHealth.idle, clearError: true);
      await perms.stopDutyTracking();
      ref.invalidate(driverPermissionSnapshotProvider);
      if (previousTrip != null) {
        await flushPendingSamples();
      }
    } finally {
      _stopping = false;
    }
  }

  Future<void> recordCoordinate(DriverCoordinate coord) async {
    await _handleIncomingCoordinate(coord);
  }

  Future<void> _handleIncomingCoordinate(DriverCoordinate coord) async {
    final tripId = state.activeTripId;
    if (tripId == null || !coord.isValidCoordinate) return;

    final store = ref.read(driverOfflineStoreProvider);
    final sync = ref.read(driverSyncCoordinatorProvider);
    final profile = ref.read(driverProfileProvider).asData?.value;
    _seq += 1;

    final now = DateTime.now().toUtc();
    final sample = GpsSampleRecord(
      sampleId: sync.generateClientEventId(),
      tripId: tripId,
      driverId: profile?.driverId ?? DriverConfig.defaultDriverId,
      sequenceNo: _seq,
      latitude: coord.latitude,
      longitude: coord.longitude,
      accuracyM: coord.accuracyM,
      speedMps: coord.speedMps,
      headingDeg: coord.headingDeg,
      altitudeM: coord.altitudeM,
      capturedAt: coord.recordedAt.toUtc(),
      createdAt: now,
    );

    await store.enqueueGpsSample(sample);
    final pendingCount = await store.countPendingGpsSamples();
    state = state.copyWith(
      health: coord.isPoorAccuracy ? DriverGpsHealth.lowAccuracy : DriverGpsHealth.live,
      pendingSampleCount: pendingCount,
      lastLatitude: coord.latitude,
      lastLongitude: coord.longitude,
      lastAccuracyM: coord.accuracyM,
      lastCapturedAt: coord.recordedAt,
      clearError: true,
    );

    if (!ref.read(driverIsOfflineProvider)) {
      await flushPendingSamples();
    }
  }

  Future<int> flushPendingSamples() async {
    if (_flushing) return 0;
    _flushing = true;
    var uploadedTotal = 0;

    try {
      final store = ref.read(driverOfflineStoreProvider);
      final api = ref.read(driverApiProvider);

      while (true) {
        final pending = await store.listPendingGpsSamples(limit: 50);
        if (pending.isEmpty) break;

        final byTrip = <String, List<GpsSampleRecord>>{};
        for (final s in pending) {
          byTrip.putIfAbsent(s.tripId, () => []).add(s);
        }

        var hadRetryableError = false;
        for (final entry in byTrip.entries) {
          final tripId = entry.key;
          final samples = entry.value;
          try {
            if (samples.length == 1 && state.activeTripId == tripId) {
              await api.uploadTripLocation(tripId, samples.first);
            } else {
              await api.uploadTripLocationBatch(tripId, samples);
            }
            final ackAt = DateTime.now().toUtc();
            await store.markGpsSamplesSynced(
              samples.map((s) => s.sampleId).toList(),
              ackAt,
            );
            await store.pruneOldSyncedGpsSamples();
            uploadedTotal += samples.length;
            _failures = 0;
            state = state.copyWith(
              syncedSampleCount: state.syncedSampleCount + samples.length,
              lastUploadedAt: ackAt,
              clearError: true,
            );
          } on DriverApiException catch (e) {
            if (!e.isNetworkFailure &&
                e.statusCode != null &&
                e.statusCode! >= 400 &&
                e.statusCode! < 500 &&
                e.statusCode != 408 &&
                e.statusCode != 429) {
              // Drop non-retryable terminal trip/validation rejections from endless queue blocking
              await store.markGpsSamplesSynced(
                samples.map((s) => s.sampleId).toList(),
                DateTime.now().toUtc(),
              );
              continue;
            }
            hadRetryableError = true;
            for (final s in samples) {
              await store.markGpsSampleRetry(s.sampleId, e.toString());
            }
            state = state.copyWith(lastError: e.message);
          } catch (e) {
            hadRetryableError = true;
            for (final s in samples) {
              await store.markGpsSampleRetry(s.sampleId, e.toString());
            }
            state = state.copyWith(lastError: e.toString());
          }
        }

        if (hadRetryableError) {
          _scheduleRetry();
          break;
        }
        if (pending.length < 50) break;
      }

      final remaining = await store.countPendingGpsSamples();
      state = state.copyWith(pendingSampleCount: remaining);
      ref.invalidate(pendingGpsSamplesCountProvider);
      return uploadedTotal;
    } finally {
      _flushing = false;
    }
  }

  void _scheduleRetry() {
    _retryTimer?.cancel();
    final exp = min(60, 4 * pow(2, min(_failures, 4)).toInt());
    final jitter = _rng.nextInt(4);
    _failures += 1;
    _retryTimer = Timer(Duration(seconds: exp + jitter), () {
      if (!ref.read(driverIsOfflineProvider)) {
        unawaited(flushPendingSamples());
      }
    });
  }
}

final driverTelemetryProvider =
    NotifierProvider<DriverTelemetryNotifier, DriverTelemetryStatus>(
  DriverTelemetryNotifier.new,
);

final pendingGpsSamplesCountProvider = FutureProvider<int>((ref) async {
  return ref.read(driverOfflineStoreProvider).countPendingGpsSamples();
});

class DriverSyncCoordinator {
  DriverSyncCoordinator(this._ref);

  final Ref _ref;
  bool _syncing = false;
  final Random _rng = Random.secure();

  String generateClientEventId() {
    final bytes = List<int>.generate(16, (_) => _rng.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }

  Future<int> flushPendingEvents() async {
    if (_syncing) return 0;
    _syncing = true;
    var syncedTotal = 0;

    try {
      final store = _ref.read(driverOfflineStoreProvider);
      final api = _ref.read(driverApiProvider);
      final pending = await store.listPendingEvents();
      if (pending.isEmpty) return 0;

      final byTrip = <String, List<QueuedDriverEvent>>{};
      for (final evt in pending) {
        byTrip.putIfAbsent(evt.tripId, () => []).add(evt);
      }

      for (final entry in byTrip.entries) {
        final tripId = entry.key;
        final events = entry.value;
        try {
          final updatedManifest = await api.syncEventsBatch(tripId, events);
          await store.markEventsSynced(events.map((e) => e.clientEventId).toList());
          await store.saveManifest(updatedManifest);
          await store.setLastSyncedAt(DateTime.now());
          syncedTotal += events.length;
          _ref.invalidate(tripManifestProvider(tripId));
        } catch (e) {
          for (final evt in events) {
            await store.markEventError(evt.clientEventId, e.toString());
          }
        }
      }

      _ref.invalidate(pendingOfflineEventsProvider);
      _ref.invalidate(lastSyncTimestampProvider);
      _ref.invalidate(driverTripsProvider);
      _ref.invalidate(driverCommutesOverviewProvider);
      _ref.invalidate(driverCommuteCalendarProvider);
      _ref.invalidate(driverCommuteDateManifestProvider);
      return syncedTotal;
    } finally {
      _syncing = false;
    }
  }
}

final tripManifestProvider =
    FutureProvider.family<DriverTripManifest, String>((ref, tripId) async {
  final api = ref.read(driverApiProvider);
  final store = ref.read(driverOfflineStoreProvider);
  ref.read(driverRealtimeProvider).updateTripSubscription(tripId);

  DriverTripManifest baseManifest;
  try {
    baseManifest = await api.fetchManifest(tripId);
    await store.saveManifest(baseManifest);
  } catch (_) {
    final cached = await store.readManifest(tripId);
    if (cached == null) rethrow;
    baseManifest = cached;
  }

  final queued = await store.listPendingEvents(tripId: tripId);
  var hydrated = baseManifest;
  for (final evt in queued) {
    hydrated = hydrated.applyQueuedEvent(evt);
  }
  return hydrated;
});

class TripExecutionActions {
  TripExecutionActions(this._ref);

  final Ref _ref;

  void _invalidateDutyViews(String tripId) {
    _ref.invalidate(tripManifestProvider(tripId));
    _ref.invalidate(driverTripsProvider);
    _ref.invalidate(driverCommutesOverviewProvider);
    _ref.invalidate(driverCommuteCalendarProvider);
    _ref.invalidate(driverCommuteDateManifestProvider);
  }

  Future<void> _queueAndApplyOffline(QueuedDriverEvent evt) async {
    final store = _ref.read(driverOfflineStoreProvider);
    await store.enqueueEvent(evt);
    final current = await store.readManifest(evt.tripId);
    if (current != null) {
      await store.saveManifest(current.applyQueuedEvent(evt));
    }
    _ref.invalidate(pendingOfflineEventsProvider);
    _ref.invalidate(tripManifestProvider(evt.tripId));
  }

  Future<void> acceptTrip(String tripId) async {
    final api = _ref.read(driverApiProvider);
    final isOffline = _ref.read(driverIsOfflineProvider);
    final sync = _ref.read(driverSyncCoordinatorProvider);

    if (isOffline) {
      await _queueAndApplyOffline(
        QueuedDriverEvent(
          clientEventId: sync.generateClientEventId(),
          tripId: tripId,
          eventType: 'TRIP_ACCEPT',
          occurredAtClient: DateTime.now(),
        ),
      );
      return;
    }

    try {
      await api.acceptTrip(tripId);
      _invalidateDutyViews(tripId);
    } on DriverApiException catch (e) {
      if (!e.isNetworkFailure) rethrow;
      await _queueAndApplyOffline(
        QueuedDriverEvent(
          clientEventId: sync.generateClientEventId(),
          tripId: tripId,
          eventType: 'TRIP_ACCEPT',
          occurredAtClient: DateTime.now(),
        ),
      );
    }
  }

  Future<void> startTrip(String tripId, String tripCode) async {
    final api = _ref.read(driverApiProvider);
    final sync = _ref.read(driverSyncCoordinatorProvider);
    final isOffline = _ref.read(driverIsOfflineProvider);

    // Start Android Foreground Location Service + live telemetry upload strictly for IN_PROGRESS duty
    await _ref.read(driverTelemetryProvider.notifier).ensureDutyTrackingForTrip(tripId, tripCode);

    if (isOffline) {
      await _queueAndApplyOffline(
        QueuedDriverEvent(
          clientEventId: sync.generateClientEventId(),
          tripId: tripId,
          eventType: 'TRIP_START',
          occurredAtClient: DateTime.now(),
        ),
      );
      return;
    }

    try {
      await api.startTrip(tripId);
      _invalidateDutyViews(tripId);
    } on DriverApiException catch (e) {
      if (!e.isNetworkFailure) rethrow;
      await _queueAndApplyOffline(
        QueuedDriverEvent(
          clientEventId: sync.generateClientEventId(),
          tripId: tripId,
          eventType: 'TRIP_START',
          occurredAtClient: DateTime.now(),
        ),
      );
    }
  }

  Future<void> arriveAtStop(String tripId, String stopId) async {
    final api = _ref.read(driverApiProvider);
    final perms = _ref.read(driverPermissionCoordinatorProvider);
    final sync = _ref.read(driverSyncCoordinatorProvider);
    final isOffline = _ref.read(driverIsOfflineProvider);
    final coord = await perms.readCurrentCoordinate();
    final now = DateTime.now();

    if (isOffline) {
      await _queueAndApplyOffline(
        QueuedDriverEvent(
          clientEventId: sync.generateClientEventId(),
          tripId: tripId,
          eventType: 'STOP_ARRIVE',
          stopId: stopId,
          occurredAtClient: now,
          latitude: coord?.latitude,
          longitude: coord?.longitude,
          accuracyM: coord?.accuracyM,
        ),
      );
      return;
    }

    try {
      await api.arriveAtStop(
        tripId,
        stopId,
        latitude: coord?.latitude,
        longitude: coord?.longitude,
        accuracyM: coord?.accuracyM,
        occurredAtClient: now,
      );
      _ref.invalidate(tripManifestProvider(tripId));
    } on DriverApiException catch (e) {
      if (!e.isNetworkFailure) rethrow;
      await _queueAndApplyOffline(
        QueuedDriverEvent(
          clientEventId: sync.generateClientEventId(),
          tripId: tripId,
          eventType: 'STOP_ARRIVE',
          stopId: stopId,
          occurredAtClient: now,
          latitude: coord?.latitude,
          longitude: coord?.longitude,
          accuracyM: coord?.accuracyM,
        ),
      );
    }
  }

  Future<void> pickupPassenger(
    String tripId,
    String stopId,
    String assignmentId, {
    String? otpCode,
  }) async {
    final api = _ref.read(driverApiProvider);
    final perms = _ref.read(driverPermissionCoordinatorProvider);
    final sync = _ref.read(driverSyncCoordinatorProvider);
    final isOffline = _ref.read(driverIsOfflineProvider);
    final coord = await perms.readCurrentCoordinate();
    final now = DateTime.now();

    if (isOffline) {
      await _queueAndApplyOffline(
        QueuedDriverEvent(
          clientEventId: sync.generateClientEventId(),
          tripId: tripId,
          eventType: 'PASSENGER_PICKUP',
          stopId: stopId,
          assignmentId: assignmentId,
          otpCode: otpCode,
          occurredAtClient: now,
          latitude: coord?.latitude,
          longitude: coord?.longitude,
          accuracyM: coord?.accuracyM,
        ),
      );
      return;
    }

    try {
      await api.pickupPassenger(
        tripId,
        stopId,
        assignmentId,
        otpCode: otpCode,
        latitude: coord?.latitude,
        longitude: coord?.longitude,
        accuracyM: coord?.accuracyM,
        occurredAtClient: now,
      );
      _invalidateDutyViews(tripId);
    } on DriverApiException catch (e) {
      if (!e.isNetworkFailure) rethrow;
      await _queueAndApplyOffline(
        QueuedDriverEvent(
          clientEventId: sync.generateClientEventId(),
          tripId: tripId,
          eventType: 'PASSENGER_PICKUP',
          stopId: stopId,
          assignmentId: assignmentId,
          otpCode: otpCode,
          occurredAtClient: now,
          latitude: coord?.latitude,
          longitude: coord?.longitude,
          accuracyM: coord?.accuracyM,
        ),
      );
    }
  }

  Future<void> markNoShow(
    String tripId,
    String stopId,
    String assignmentId, {
    required String reasonCode,
    String? notes,
  }) async {
    final api = _ref.read(driverApiProvider);
    final perms = _ref.read(driverPermissionCoordinatorProvider);
    final sync = _ref.read(driverSyncCoordinatorProvider);
    final isOffline = _ref.read(driverIsOfflineProvider);

    final coord = await perms.readCurrentCoordinate();
    if (coord == null) {
      throw const DriverApiException(
        code: 'GPS_FIX_REQUIRED',
        message: 'Live GPS coordinate is required as geofence evidence to mark a passenger No-Show.',
      );
    }

    final now = DateTime.now();
    if (isOffline) {
      await _queueAndApplyOffline(
        QueuedDriverEvent(
          clientEventId: sync.generateClientEventId(),
          tripId: tripId,
          eventType: 'PASSENGER_NO_SHOW',
          stopId: stopId,
          assignmentId: assignmentId,
          reasonCode: reasonCode,
          notes: notes,
          latitude: coord.latitude,
          longitude: coord.longitude,
          accuracyM: coord.accuracyM,
          occurredAtClient: now,
        ),
      );
      return;
    }

    try {
      await api.markNoShow(
        tripId,
        stopId,
        assignmentId,
        reasonCode: reasonCode,
        notes: notes,
        latitude: coord.latitude,
        longitude: coord.longitude,
        accuracyM: coord.accuracyM,
        occurredAtClient: now,
      );
      _invalidateDutyViews(tripId);
    } on DriverApiException catch (e) {
      if (!e.isNetworkFailure) rethrow;
      await _queueAndApplyOffline(
        QueuedDriverEvent(
          clientEventId: sync.generateClientEventId(),
          tripId: tripId,
          eventType: 'PASSENGER_NO_SHOW',
          stopId: stopId,
          assignmentId: assignmentId,
          reasonCode: reasonCode,
          notes: notes,
          latitude: coord.latitude,
          longitude: coord.longitude,
          accuracyM: coord.accuracyM,
          occurredAtClient: now,
        ),
      );
    }
  }

  Future<void> completeTrip(String tripId) async {
    final api = _ref.read(driverApiProvider);
    final perms = _ref.read(driverPermissionCoordinatorProvider);
    final sync = _ref.read(driverSyncCoordinatorProvider);
    final isOffline = _ref.read(driverIsOfflineProvider);
    final coord = await perms.readCurrentCoordinate();
    final now = DateTime.now();

    if (isOffline) {
      await _queueAndApplyOffline(
        QueuedDriverEvent(
          clientEventId: sync.generateClientEventId(),
          tripId: tripId,
          eventType: 'TRIP_COMPLETE',
          latitude: coord?.latitude,
          longitude: coord?.longitude,
          occurredAtClient: now,
        ),
      );
    } else {
      try {
        await api.completeTrip(
          tripId,
          latitude: coord?.latitude,
          longitude: coord?.longitude,
          occurredAtClient: now,
        );
        _invalidateDutyViews(tripId);
      } on DriverApiException catch (e) {
        if (!e.isNetworkFailure) rethrow;
        await _queueAndApplyOffline(
          QueuedDriverEvent(
            clientEventId: sync.generateClientEventId(),
            tripId: tripId,
            eventType: 'TRIP_COMPLETE',
            latitude: coord?.latitude,
            longitude: coord?.longitude,
            occurredAtClient: now,
          ),
        );
      }
    }

    // Programmatic stop: driver is NEVER tracked after trip completion
    await _ref.read(driverTelemetryProvider.notifier).stopDutyTracking();
  }

  Future<DriverSosReceipt> triggerDriverSos({
    String? tripId,
    String? notes,
  }) async {
    final perms = _ref.read(driverPermissionCoordinatorProvider);
    final coord = await perms.readCurrentCoordinate();
    final receipt = await _ref.read(driverApiProvider).triggerSos(
          tripId: tripId,
          latitude: coord?.latitude,
          longitude: coord?.longitude,
          accuracyM: coord?.accuracyM,
          notes: notes,
        );
    _ref.invalidate(driverNotificationsProvider);
    return receipt;
  }
}

final tripExecutionActionsProvider = Provider<TripExecutionActions>(
  (ref) => TripExecutionActions(ref),
);

final driverNotificationCoordinatorProvider = Provider<DriverNotificationCoordinator>((ref) {
  final coordinator = DeviceDriverNotificationCoordinator();
  ref.onDispose(coordinator.dispose);
  return coordinator;
});

class DriverNotificationsNotifier extends AsyncNotifier<List<DriverNotificationItem>> {
  @override
  Future<List<DriverNotificationItem>> build() async {
    return ref.read(driverApiProvider).fetchNotifications();
  }

  Future<void> markRead(String notificationId) async {
    final current = state.asData?.value ?? const <DriverNotificationItem>[];
    final now = DateTime.now();
    state = AsyncData(
      current
          .map((n) => n.id == notificationId && !n.isRead ? n.copyWith(readAt: now) : n)
          .toList(),
    );
    try {
      await ref.read(driverApiProvider).markNotificationRead(notificationId);
    } finally {
      ref.invalidateSelf();
    }
  }

  Future<void> markAllRead() async {
    final current = state.asData?.value ?? const <DriverNotificationItem>[];
    final now = DateTime.now();
    state = AsyncData(
      current.map((n) => n.isRead ? n : n.copyWith(readAt: now)).toList(),
    );
    try {
      await ref.read(driverApiProvider).markAllNotificationsRead();
    } finally {
      ref.invalidateSelf();
    }
  }
}

final driverNotificationsProvider =
    AsyncNotifierProvider<DriverNotificationsNotifier, List<DriverNotificationItem>>(
  DriverNotificationsNotifier.new,
);

final driverUnreadNotificationsCountProvider = Provider<int>((ref) {
  final items = ref.watch(driverNotificationsProvider).asData?.value;
  if (items == null || items.isEmpty) return 0;
  return items.where((n) => !n.isRead).length;
});

final driverNotificationBridgeProvider = Provider<void>((ref) {
  final coordinator = ref.watch(driverNotificationCoordinatorProvider);
  final realtime = ref.watch(driverRealtimeProvider);
  var tokenRegistered = false;

  unawaited(coordinator.initialize());

  final sub = realtime.notificationMessages.listen((msg) {
    final seed = msg.id ?? '${msg.category}-${msg.tripId ?? ''}-${msg.title}';
    unawaited(
      coordinator.showDutyAlert(
        idSeed: seed,
        category: msg.category,
        title: msg.title,
        body: msg.body,
        tripId: msg.tripId,
      ),
    );
    ref.invalidate(driverNotificationsProvider);
    ref.invalidate(driverTripsProvider);
    ref.invalidate(driverCommutesOverviewProvider);
    ref.invalidate(driverCommuteCalendarProvider);
    ref.invalidate(driverCommuteDateManifestProvider);
    if (msg.tripId != null && msg.tripId!.isNotEmpty) {
      ref.invalidate(tripManifestProvider(msg.tripId!));
    }
  });
  ref.onDispose(sub.cancel);

  void maybeRegisterToken(DriverPermissionSnapshot? snap) {
    if (tokenRegistered || snap == null || !snap.notificationsGranted) return;
    tokenRegistered = true;
    unawaited(
      coordinator.registerPushTokenIfPermitted(
        notificationsGranted: true,
        onToken: (token, platform) => ref.read(driverApiProvider).registerDeviceToken(
              token: token,
              platform: platform,
            ),
      ),
    );
  }

  maybeRegisterToken(ref.read(driverPermissionSnapshotProvider).asData?.value);
  ref.listen<AsyncValue<DriverPermissionSnapshot>>(driverPermissionSnapshotProvider, (_, next) {
    maybeRegisterToken(next.asData?.value);
  });
});

