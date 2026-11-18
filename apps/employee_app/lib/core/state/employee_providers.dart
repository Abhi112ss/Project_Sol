import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../models/employee_models.dart';
import '../network/employee_api.dart';
import '../network/realtime_sync.dart';
import '../notifications/local_notification_coordinator.dart';
import '../permissions/permission_coordinator.dart';
import '../storage/commute_cache.dart';

final employeeApiProvider = Provider<EmployeeApi>((ref) => HttpEmployeeApi());

class ApiBaseUrlNotifier extends Notifier<String> {
  @override
  String build() => AppConfig.apiBaseUrl;

  Future<void> setEndpoint(String? url) async {
    await AppConfig.setRuntimeApiBaseUrl(url);
    state = AppConfig.apiBaseUrl;
    await ref.read(realtimeSyncProvider).resetEndpoint();
    ref.invalidate(employeeProfileProvider);
    ref.invalidate(savedLocationsProvider);
    ref.invalidate(employeeBookingsProvider);
    ref.invalidate(upcomingTripProvider);
    ref.invalidate(employeeTripsProvider);
    ref.invalidate(notificationsProvider);
  }
}

final apiBaseUrlProvider = NotifierProvider<ApiBaseUrlNotifier, String>(
  ApiBaseUrlNotifier.new,
);

final commuteCacheProvider = Provider<CommuteCacheStore>((ref) => CommuteCacheStore());

final permissionCoordinatorProvider = Provider<PermissionCoordinator>(
  (ref) => DevicePermissionCoordinator(),
);

final enableMapTilesProvider = Provider<bool>((ref) => true);

class LiveTelemetryCacheNotifier extends Notifier<Map<String, GpsTelemetry>> {
  @override
  Map<String, GpsTelemetry> build() => const {};

  void patchTelemetry(String tripId, GpsTelemetry next) {
    final existing = state[tripId];
    if (existing != null && next.recordedAt.isBefore(existing.recordedAt)) {
      return;
    }
    state = {...state, tripId: next};
  }

  void clearTrip(String tripId) {
    if (!state.containsKey(tripId)) return;
    final copy = Map<String, GpsTelemetry>.from(state)..remove(tripId);
    state = copy;
  }
}

final liveTelemetryCacheProvider =
    NotifierProvider<LiveTelemetryCacheNotifier, Map<String, GpsTelemetry>>(
  LiveTelemetryCacheNotifier.new,
);

final socketConnectedProvider = StreamProvider<bool>((ref) {
  final sync = ref.read(realtimeSyncProvider);
  return Stream<bool>.multi((controller) {
    controller.add(sync.isSocketConnected);
    final sub = sync.connectionStatusStream.listen(controller.add);
    controller.onCancel = sub.cancel;
  });
});

final realtimeSyncProvider = Provider<RealtimeSyncService>((ref) {
  final service = RealtimeSyncService();
  final sub = service.refreshSignals.listen((signal) {
    if (signal == 'trip.gps.status.changed' || signal == 'poll.refresh') {
      final activeUpcoming = ref.read(upcomingTripProvider).asData?.value;
      if (activeUpcoming != null && activeUpcoming.tripStatus.toUpperCase() == 'IN_PROGRESS') {
        final userId = ref.read(activePersonaProvider).userId;
        ref.read(employeeApiProvider).fetchTripLiveTelemetry(userId, activeUpcoming.tripId).then((gps) {
          if (gps != null) {
            ref.read(liveTelemetryCacheProvider.notifier).patchTelemetry(activeUpcoming.tripId, gps);
          }
        }).catchError((_) {});
      }
      if (signal == 'poll.refresh') {
        ref.invalidate(upcomingTripProvider);
        ref.invalidate(notificationsProvider);
      }
      return;
    }
    ref.invalidate(upcomingTripProvider);
    ref.invalidate(notificationsProvider);
  });
  final locSub = service.locationUpdates.listen((evt) {
    ref.read(liveTelemetryCacheProvider.notifier).patchTelemetry(evt.tripId, evt.telemetry);
  });
  ref.onDispose(() {
    sub.cancel();
    locSub.cancel();
    service.dispose();
  });
  return service;
});

final connectivityStreamProvider = StreamProvider<List<ConnectivityResult>>((ref) {
  try {
    return Connectivity().onConnectivityChanged;
  } catch (_) {
    return Stream<List<ConnectivityResult>>.value(const [ConnectivityResult.wifi]);
  }
});

final isOfflineProvider = Provider<bool>((ref) {
  final asyncResults = ref.watch(connectivityStreamProvider);
  return asyncResults.maybeWhen(
    data: (results) => results.isNotEmpty && results.every((r) => r == ConnectivityResult.none),
    orElse: () => false,
  );
});

class OnboardingState extends ValueNotifier<bool> {
  OnboardingState([super.value = false]);

  void complete() {
    if (!value) value = true;
  }
}

final onboardingStateProvider = Provider<OnboardingState>((ref) {
  final notifier = OnboardingState(false);
  ref.onDispose(notifier.dispose);
  return notifier;
});

class ActivePersonaNotifier extends Notifier<DevPersona> {
  @override
  DevPersona build() => AppConfig.devPersonas.first;

  void selectPersona(DevPersona persona) {
    if (state.userId != persona.userId) {
      state = persona;
    }
  }
}

final activePersonaProvider = NotifierProvider<ActivePersonaNotifier, DevPersona>(
  ActivePersonaNotifier.new,
);

class PermissionSnapshotNotifier extends AsyncNotifier<PermissionSnapshot> {
  @override
  Future<PermissionSnapshot> build() async {
    return ref.read(permissionCoordinatorProvider).checkSnapshot();
  }

  Future<bool> requestNotifications() async {
    final granted = await ref.read(permissionCoordinatorProvider).requestNotificationsPermission();
    state = AsyncData(await ref.read(permissionCoordinatorProvider).checkSnapshot());
    return granted;
  }

  Future<CapturedCoordinate?> requestLocationPin() async {
    final coord =
        await ref.read(permissionCoordinatorProvider).requestForegroundLocationAndCapture();
    state = AsyncData(await ref.read(permissionCoordinatorProvider).checkSnapshot());
    return coord;
  }

  Future<void> refresh() async {
    state = AsyncData(await ref.read(permissionCoordinatorProvider).checkSnapshot());
  }
}

final permissionSnapshotProvider =
    AsyncNotifierProvider<PermissionSnapshotNotifier, PermissionSnapshot>(
  PermissionSnapshotNotifier.new,
);

class EmployeeProfileNotifier extends AsyncNotifier<EmployeeProfileData> {
  @override
  Future<EmployeeProfileData> build() async {
    final persona = ref.watch(activePersonaProvider);
    final api = ref.read(employeeApiProvider);
    final cache = ref.read(commuteCacheProvider);

    try {
      final profile = await api.fetchProfile(persona.userId);
      await cache.writeJson(persona.userId, 'profile', profile.toJson());
      return profile;
    } catch (e) {
      final cached = await cache.readJson(persona.userId, 'profile');
      if (cached is Map<String, dynamic>) {
        return EmployeeProfileData.fromJson(cached);
      }
      rethrow;
    }
  }

  Future<void> updateEmergencyContact({
    required String? name,
    required String? phone,
    String? defaultShiftId,
  }) async {
    final persona = ref.read(activePersonaProvider);
    final updated = await ref.read(employeeApiProvider).updateProfile(
          persona.userId,
          defaultShiftId: defaultShiftId,
          emergencyContactName: name,
          emergencyContactPhone: phone,
        );
    await ref.read(commuteCacheProvider).writeJson(persona.userId, 'profile', updated.toJson());
    state = AsyncData(updated);
  }
}

final employeeProfileProvider =
    AsyncNotifierProvider<EmployeeProfileNotifier, EmployeeProfileData>(
  EmployeeProfileNotifier.new,
);

class SavedLocationsNotifier extends AsyncNotifier<List<SavedLocation>> {
  @override
  Future<List<SavedLocation>> build() async {
    final persona = ref.watch(activePersonaProvider);
    final api = ref.read(employeeApiProvider);
    final cache = ref.read(commuteCacheProvider);

    try {
      final items = await api.fetchLocations(persona.userId);
      await cache.writeJson(
        persona.userId,
        'locations',
        items.map((l) => l.toJson()).toList(),
      );
      return items;
    } catch (_) {
      final cached = await cache.readJson(persona.userId, 'locations');
      if (cached is List) {
        return cached
            .whereType<Map>()
            .map((m) => SavedLocation.fromJson(Map<String, dynamic>.from(m)))
            .toList();
      }
      rethrow;
    }
  }

  Future<SavedLocation> addLocation({
    required String locationName,
    required String address,
    String? corridorTag,
    required double latitude,
    required double longitude,
    bool isDefault = false,
  }) async {
    final persona = ref.read(activePersonaProvider);
    final created = await ref.read(employeeApiProvider).addLocation(
          persona.userId,
          locationName: locationName,
          address: address,
          corridorTag: corridorTag,
          latitude: latitude,
          longitude: longitude,
          isDefault: isDefault,
        );
    ref.invalidateSelf();
    ref.invalidate(employeeProfileProvider);
    return created;
  }

  Future<void> setDefault(String locationId) async {
    final persona = ref.read(activePersonaProvider);
    await ref.read(employeeApiProvider).updateLocation(
          persona.userId,
          locationId,
          isDefault: true,
        );
    ref.invalidateSelf();
  }
}

final savedLocationsProvider =
    AsyncNotifierProvider<SavedLocationsNotifier, List<SavedLocation>>(
  SavedLocationsNotifier.new,
);

class EmployeeBookingsNotifier extends AsyncNotifier<List<EmployeeBooking>> {
  @override
  Future<List<EmployeeBooking>> build() async {
    final persona = ref.watch(activePersonaProvider);
    final api = ref.read(employeeApiProvider);
    final cache = ref.read(commuteCacheProvider);

    try {
      final items = await api.fetchBookings(persona.userId);
      await cache.writeJson(
        persona.userId,
        'bookings',
        items.map((b) => b.toJson()).toList(),
      );
      return items;
    } catch (_) {
      final cached = await cache.readJson(persona.userId, 'bookings');
      if (cached is List) {
        return cached
            .whereType<Map>()
            .map((m) => EmployeeBooking.fromJson(Map<String, dynamic>.from(m)))
            .toList();
      }
      rethrow;
    }
  }

  Future<EmployeeBooking> submitBooking({
    required String shiftId,
    required String officeId,
    required String pickupLocationId,
    required String travelDate,
    required String direction,
    required DateTime scheduledPickupAt,
    String timePreference = 'PICKUP_AT',
    String? requestedTimeLocal,
    String timezone = 'Asia/Kolkata',
    String? notes,
  }) async {
    final persona = ref.read(activePersonaProvider);
    final created = await ref.read(employeeApiProvider).createBooking(
          persona.userId,
          shiftId: shiftId,
          officeId: officeId,
          pickupLocationId: pickupLocationId,
          travelDate: travelDate,
          direction: direction,
          scheduledPickupAt: scheduledPickupAt,
          timePreference: timePreference,
          requestedTimeLocal: requestedTimeLocal,
          timezone: timezone,
          notes: notes,
        );
    ref.invalidateSelf();
    ref.invalidate(notificationsProvider);
    return created;
  }

  Future<Map<String, dynamic>?> updateBookingOccurrence({
    required String bookingId,
    String? pickupLocationId,
    String? timePreference,
    String? requestedTimeLocal,
    String? timezone,
    required String reason,
  }) async {
    final persona = ref.read(activePersonaProvider);
    final result = await ref.read(employeeApiProvider).updateBookingOccurrence(
          persona.userId,
          bookingId,
          pickupLocationId: pickupLocationId,
          timePreference: timePreference,
          requestedTimeLocal: requestedTimeLocal,
          timezone: timezone,
          reason: reason,
        );
    ref.invalidateSelf();
    ref.invalidate(upcomingTripProvider);
    ref.invalidate(employeeTripsProvider);
    return result.impactedTripAlert;
  }

  Future<void> cancelBooking(String bookingId, String reason) async {
    final persona = ref.read(activePersonaProvider);
    await ref.read(employeeApiProvider).cancelBooking(
          persona.userId,
          bookingId,
          reason: reason,
        );
    ref.invalidateSelf();
    ref.invalidate(upcomingTripProvider);
    ref.invalidate(employeeTripsProvider);
  }
}

class EmployeeSeriesNotifier extends AsyncNotifier<List<BookingSeriesSummary>> {
  @override
  Future<List<BookingSeriesSummary>> build() async {
    final persona = ref.watch(activePersonaProvider);
    return ref.read(employeeApiProvider).fetchBookingSeries(persona.userId);
  }

  Future<BookingSeriesSummary> submitSeries({
    String? officeId,
    required String shiftId,
    required String pickupLocationId,
    required String direction,
    required String timePreference,
    required String requestedTimeLocal,
    String timezone = 'Asia/Kolkata',
    required String recurrenceType,
    required String startDate,
    String? endDate,
    List<String>? selectedDaysOfWeek,
    bool skipConflictingDates = false,
    String? notes,
  }) async {
    final persona = ref.read(activePersonaProvider);
    final created = await ref.read(employeeApiProvider).createBookingSeries(
          persona.userId,
          officeId: officeId,
          shiftId: shiftId,
          pickupLocationId: pickupLocationId,
          direction: direction,
          timePreference: timePreference,
          requestedTimeLocal: requestedTimeLocal,
          timezone: timezone,
          recurrenceType: recurrenceType,
          startDate: startDate,
          endDate: endDate,
          selectedDaysOfWeek: selectedDaysOfWeek,
          skipConflictingDates: skipConflictingDates,
          notes: notes,
        );
    ref.invalidateSelf();
    ref.invalidate(employeeBookingsProvider);
    ref.invalidate(notificationsProvider);
    return created;
  }

  Future<void> skipDates(String seriesId, List<String> dates, {String reason = 'Skipped by employee'}) async {
    final persona = ref.read(activePersonaProvider);
    await ref.read(employeeApiProvider).skipSeriesDates(
          persona.userId,
          seriesId,
          dates: dates,
          reason: reason,
        );
    ref.invalidateSelf();
    ref.invalidate(employeeBookingsProvider);
    ref.invalidate(upcomingTripProvider);
  }

  Future<void> extendSeries(String seriesId, String newEndDate) async {
    final persona = ref.read(activePersonaProvider);
    await ref.read(employeeApiProvider).extendBookingSeries(
          persona.userId,
          seriesId,
          newEndDate: newEndDate,
        );
    ref.invalidateSelf();
    ref.invalidate(employeeBookingsProvider);
  }

  Future<void> cancelSeries(String seriesId, String reason) async {
    final persona = ref.read(activePersonaProvider);
    await ref.read(employeeApiProvider).cancelBookingSeries(
          persona.userId,
          seriesId,
          reason: reason,
        );
    ref.invalidateSelf();
    ref.invalidate(employeeBookingsProvider);
    ref.invalidate(upcomingTripProvider);
  }
}

final employeeSeriesProvider =
    AsyncNotifierProvider<EmployeeSeriesNotifier, List<BookingSeriesSummary>>(
  EmployeeSeriesNotifier.new,
);

final employeeBookingsProvider =
    AsyncNotifierProvider<EmployeeBookingsNotifier, List<EmployeeBooking>>(
  EmployeeBookingsNotifier.new,
);

class UpcomingTripNotifier extends AsyncNotifier<UpcomingTripDetail?> {
  @override
  Future<UpcomingTripDetail?> build() async {
    final persona = ref.watch(activePersonaProvider);
    final api = ref.read(employeeApiProvider);
    final cache = ref.read(commuteCacheProvider);
    final sync = ref.read(realtimeSyncProvider);

    try {
      final upcoming = await api.fetchUpcomingTrip(persona.userId);
      await cache.writeJson(persona.userId, 'upcoming_trip', upcoming?.toJson());
      sync.updateSubscriptions(employeeId: persona.employeeId, tripId: upcoming?.tripId);
      return upcoming;
    } catch (_) {
      final cached = await cache.readJson(persona.userId, 'upcoming_trip');
      if (cached == null) return null;
      if (cached is Map<String, dynamic>) {
        return UpcomingTripDetail.fromJson(cached);
      }
      rethrow;
    }
  }

  Future<void> reportRunningLate({
    required String tripId,
    required int etaMinutes,
    String? note,
  }) async {
    final persona = ref.read(activePersonaProvider);
    await ref.read(employeeApiProvider).reportRunningLate(
          persona.userId,
          tripId,
          etaMinutes: etaMinutes,
          note: note,
        );
    ref.invalidateSelf();
    ref.invalidate(employeeTripsProvider);
  }

  Future<void> confirmSafeReach(String tripId) async {
    final persona = ref.read(activePersonaProvider);
    await ref.read(employeeApiProvider).confirmSafeReach(persona.userId, tripId);
    ref.invalidateSelf();
    ref.invalidate(employeeTripsProvider);
  }

  Future<void> appealNoShow(String tripId, String appealNote) async {
    final persona = ref.read(activePersonaProvider);
    await ref.read(employeeApiProvider).appealNoShow(
          persona.userId,
          tripId,
          appealNote: appealNote,
        );
    ref.invalidate(tripDetailProvider(tripId));
    ref.invalidate(employeeTripsProvider);
    ref.invalidate(notificationsProvider);
  }
}

final upcomingTripProvider =
    AsyncNotifierProvider<UpcomingTripNotifier, UpcomingTripDetail?>(
  UpcomingTripNotifier.new,
);

class EmployeeTripsNotifier extends AsyncNotifier<List<EmployeeTripSummary>> {
  @override
  Future<List<EmployeeTripSummary>> build() async {
    final persona = ref.watch(activePersonaProvider);
    final api = ref.read(employeeApiProvider);
    final cache = ref.read(commuteCacheProvider);

    try {
      final items = await api.fetchTrips(persona.userId);
      await cache.writeJson(persona.userId, 'trips', items.map((t) => t.toJson()).toList());
      return items;
    } catch (_) {
      final cached = await cache.readJson(persona.userId, 'trips');
      if (cached is List) {
        return cached
            .whereType<Map>()
            .map((m) => EmployeeTripSummary.fromJson(Map<String, dynamic>.from(m)))
            .toList();
      }
      rethrow;
    }
  }
}

final employeeTripsProvider =
    AsyncNotifierProvider<EmployeeTripsNotifier, List<EmployeeTripSummary>>(
  EmployeeTripsNotifier.new,
);

final tripDetailProvider = FutureProvider.family<UpcomingTripDetail, String>((ref, tripId) async {
  final persona = ref.watch(activePersonaProvider);
  final detail = await ref.read(employeeApiProvider).fetchTripDetail(persona.userId, tripId);
  ref.read(realtimeSyncProvider).updateSubscriptions(
        employeeId: persona.employeeId,
        tripId: detail.tripId,
      );
  return detail;
});

final effectiveTripTelemetryProvider =
    Provider.family<GpsTelemetry?, ({String tripId, GpsTelemetry? base})>((ref, arg) {
  final liveMap = ref.watch(liveTelemetryCacheProvider);
  final patched = liveMap[arg.tripId];
  if (patched == null) return arg.base;
  if (arg.base != null && arg.base!.recordedAt.isAfter(patched.recordedAt)) {
    return arg.base;
  }
  return patched;
});

class NotificationsNotifier extends AsyncNotifier<List<EmployeeNotificationItem>> {
  @override
  Future<List<EmployeeNotificationItem>> build() async {
    final persona = ref.watch(activePersonaProvider);
    return ref.read(employeeApiProvider).fetchNotifications(persona.userId);
  }

  Future<void> markRead(String notificationId) async {
    final persona = ref.read(activePersonaProvider);
    final current = state.asData?.value ?? const <EmployeeNotificationItem>[];
    final optimistic = current
        .map((n) => n.id == notificationId && !n.isRead ? n.copyWith(readAt: DateTime.now()) : n)
        .toList();
    state = AsyncData(optimistic);
    try {
      await ref.read(employeeApiProvider).markNotificationRead(persona.userId, notificationId);
    } finally {
      ref.invalidateSelf();
    }
  }

  Future<void> markAllRead() async {
    final persona = ref.read(activePersonaProvider);
    final current = state.asData?.value ?? const <EmployeeNotificationItem>[];
    final now = DateTime.now();
    state = AsyncData(
      current.map((n) => n.isRead ? n : n.copyWith(readAt: now)).toList(),
    );
    try {
      await ref.read(employeeApiProvider).markAllNotificationsRead(persona.userId);
    } finally {
      ref.invalidateSelf();
    }
  }
}

final notificationsProvider =
    AsyncNotifierProvider<NotificationsNotifier, List<EmployeeNotificationItem>>(
  NotificationsNotifier.new,
);

final unreadNotificationsCountProvider = Provider<int>((ref) {
  final items = ref.watch(notificationsProvider).asData?.value;
  if (items == null || items.isEmpty) return 0;
  return items.where((n) => !n.isRead).length;
});

final appNotificationCoordinatorProvider = Provider<AppNotificationCoordinator>((ref) {
  final coordinator = DeviceLocalNotificationCoordinator();
  ref.onDispose(coordinator.dispose);
  return coordinator;
});

final employeeNotificationBridgeProvider = Provider<void>((ref) {
  final coordinator = ref.watch(appNotificationCoordinatorProvider);
  final sync = ref.watch(realtimeSyncProvider);
  var lastRegisteredUserId = '';
  var lastScheduledKey = '';
  var lastScheduledTripId = '';

  unawaited(coordinator.initialize());

  final sub = sync.notificationMessages.listen((msg) {
    final seed = msg.id ?? '${msg.category}-${msg.tripId ?? ''}-${msg.title}';
    unawaited(
      coordinator.showRealtimeNotification(
        idSeed: seed,
        category: msg.category,
        title: msg.title,
        body: msg.body,
        tripId: msg.tripId,
      ),
    );
    ref.invalidate(notificationsProvider);
    if (msg.tripId != null && msg.tripId!.isNotEmpty) {
      ref.invalidate(upcomingTripProvider);
      ref.invalidate(employeeTripsProvider);
      ref.invalidate(tripDetailProvider(msg.tripId!));
    }
  });
  ref.onDispose(sub.cancel);

  void maybeSyncUpcomingReminder(UpcomingTripDetail? trip) {
    if (trip == null) {
      if (lastScheduledTripId.isNotEmpty) {
        unawaited(coordinator.cancelPrePickupReminder(lastScheduledTripId));
        lastScheduledTripId = '';
        lastScheduledKey = '';
      }
      return;
    }
    final activePassenger = const {'SCHEDULED', 'EN_ROUTE'}
        .contains(trip.passengerStatus.toUpperCase());
    final activeTrip = const {'ASSIGNED', 'DRIVER_ACCEPTED', 'IN_PROGRESS'}
        .contains(trip.tripStatus.toUpperCase());
    if (activePassenger && activeTrip) {
      final key = '${trip.tripId}:${trip.scheduledPickupAt.millisecondsSinceEpoch}';
      if (key != lastScheduledKey) {
        lastScheduledKey = key;
        lastScheduledTripId = trip.tripId;
        unawaited(
          coordinator.schedulePrePickupReminder(
            tripId: trip.tripId,
            tripCode: trip.tripCode,
            stopName: trip.yourStop?.locationName ?? trip.officeName,
            scheduledPickupAt: trip.scheduledPickupAt,
          ),
        );
      }
    } else {
      if (lastScheduledTripId == trip.tripId || lastScheduledTripId.isEmpty) {
        unawaited(coordinator.cancelPrePickupReminder(trip.tripId));
        lastScheduledTripId = '';
        lastScheduledKey = '';
      }
    }
  }

  void maybeRegisterToken(DevPersona persona, PermissionSnapshot? perms) {
    if (perms == null || !perms.notificationsGranted) return;
    if (lastRegisteredUserId == persona.userId) return;
    lastRegisteredUserId = persona.userId;
    unawaited(
      coordinator.registerPushTokenIfPermitted(
        notificationsGranted: true,
        onToken: (token, platform) => ref.read(employeeApiProvider).registerDeviceToken(
              persona.userId,
              token: token,
              platform: platform,
            ),
      ),
    );
  }

  maybeSyncUpcomingReminder(ref.read(upcomingTripProvider).asData?.value);
  maybeRegisterToken(
    ref.read(activePersonaProvider),
    ref.read(permissionSnapshotProvider).asData?.value,
  );

  ref.listen<AsyncValue<UpcomingTripDetail?>>(upcomingTripProvider, (_, next) {
    if (!next.isLoading) {
      maybeSyncUpcomingReminder(next.asData?.value);
    }
  });

  ref.listen<DevPersona>(activePersonaProvider, (_, next) {
    lastRegisteredUserId = '';
    maybeRegisterToken(next, ref.read(permissionSnapshotProvider).asData?.value);
  });

  ref.listen<AsyncValue<PermissionSnapshot>>(permissionSnapshotProvider, (_, next) {
    maybeRegisterToken(ref.read(activePersonaProvider), next.asData?.value);
  });
});

