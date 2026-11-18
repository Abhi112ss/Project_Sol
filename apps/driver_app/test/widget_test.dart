import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:driver_app/core/models/driver_models.dart';
import 'package:driver_app/core/network/driver_api.dart';
import 'package:driver_app/core/network/driver_realtime.dart';
import 'package:driver_app/core/notifications/driver_notification_coordinator.dart';
import 'package:driver_app/core/permissions/driver_permission_coordinator.dart';
import 'package:driver_app/core/state/driver_providers.dart';
import 'package:driver_app/core/storage/driver_offline_store.dart';
import 'package:driver_app/main.dart';
import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

class _FakePermissionCoordinator implements DriverPermissionCoordinator {
  final _coordCtrl = StreamController<DriverCoordinate>.broadcast();
  final _errCtrl = StreamController<String>.broadcast();
  int notificationsRequested = 0;
  int trackingStartedCount = 0;
  int trackingStoppedCount = 0;
  bool dutyActive = false;
  DriverCoordinate? nextCoordinate = DriverCoordinate(
    latitude: 17.4486,
    longitude: 78.3908,
    accuracyM: 6.5,
    recordedAt: DateTime(2026, 11, 17, 8, 15),
  );

  @override
  Stream<DriverCoordinate> get coordinateStream => _coordCtrl.stream;

  @override
  Stream<String> get telemetryErrorStream => _errCtrl.stream;

  void emitCoordinate(DriverCoordinate coord) => _coordCtrl.add(coord);

  void emitError(String code) => _errCtrl.add(code);

  void dispose() {
    _coordCtrl.close();
    _errCtrl.close();
  }

  @override
  Future<DriverPermissionSnapshot> checkSnapshot() async {
    return DriverPermissionSnapshot(
      notificationsGranted: notificationsRequested > 0,
      locationGranted: trackingStartedCount > 0,
      foregroundDutyActive: dutyActive,
    );
  }

  @override
  Future<bool> requestNotifications() async {
    notificationsRequested += 1;
    return true;
  }

  @override
  Future<bool> startForegroundDutyTracking(String tripCode) async {
    trackingStartedCount += 1;
    dutyActive = true;
    return true;
  }

  @override
  Future<void> stopDutyTracking() async {
    trackingStoppedCount += 1;
    dutyActive = false;
  }

  @override
  Future<DriverCoordinate?> readCurrentCoordinate() async => nextCoordinate;

  @override
  Future<void> openSystemSettings() async {}
}

class _FakeDriverApi implements DriverApi {
  _FakeDriverApi({
    required DriverTripManifest initialManifest,
    this.customOverview,
    this.customCalendars = const {},
    this.customDateManifests = const {},
  }) : manifest = initialManifest;

  DriverTripManifest manifest;
  final DriverCommutesOverviewData? customOverview;
  final Map<String, DriverCommuteCalendarData> customCalendars;
  final Map<String, DriverCommuteDateManifestData> customDateManifests;
  final List<String> capturedOtps = [];
  final List<({String reasonCode, String? notes, double lat, double lng})> capturedNoShows = [];
  final List<List<QueuedDriverEvent>> syncedBatches = [];
  final List<GpsSampleRecord> uploadedGpsSamples = [];
  final List<List<GpsSampleRecord>> uploadedGpsBatches = [];
  final List<({String? tripId, String? notes, double? lat, double? lng})> capturedSos = [];
  final List<String> markedReadIds = [];
  int markAllReadCalls = 0;

  @override
  Future<DriverProfileData> fetchProfile() async {
    return const DriverProfileData(
      driverId: 'drv-1',
      driverCode: 'DRV-001',
      licenseNo: 'KA01-2026-DRV1',
      availabilityStatus: 'AVAILABLE',
      isSuspended: false,
      fullName: 'Ramesh Rao',
      phone: '+919900000111',
      vehicleRegistrationNo: 'KA01AB1234',
      vehicleModelName: 'Toyota Innova Crysta',
      vehicleType: 'SUV',
      seatingCapacity: 6,
      vendorName: 'SolFleet Mobility',
      noShowWaitSeconds: 300,
      requireBoardingOtp: true,
    );
  }

  @override
  Future<List<DriverTripSummary>> fetchTrips() async {
    return [
      DriverTripSummary(
        id: manifest.tripId,
        tripCode: manifest.tripCode,
        travelDate: manifest.travelDate,
        direction: manifest.direction,
        status: manifest.status,
        currentStopSequence: manifest.currentStopSequence,
        plannedStartAt: manifest.plannedStartAt,
        actualStartAt: manifest.actualStartAt,
        completedAt: manifest.completedAt,
        officeName: manifest.officeName,
        shiftName: manifest.shiftName,
        shiftTimeLocal: manifest.shiftTimeLocal,
        vehicleRegistrationNo: manifest.vehicleRegistrationNo,
        vehicleModelName: manifest.vehicleModelName,
        stopsCount: manifest.stops.length,
        passengersCount: manifest.stops.expand((s) => s.passengers).length,
        pendingPassengersCount: manifest.stops
            .expand((s) => s.passengers)
            .where((p) => isPassengerPending(p.status))
            .length,
      ),
    ];
  }

  @override
  Future<DriverTripManifest> fetchManifest(String tripId) async => manifest;

  @override
  Future<void> acceptTrip(String tripId) async {
    manifest = manifest.copyWith(status: 'DRIVER_ACCEPTED');
  }

  @override
  Future<DriverTripManifest> startTrip(String tripId) async {
    manifest = manifest.applyQueuedEvent(
      QueuedDriverEvent(
        clientEventId: 'srv-start',
        tripId: tripId,
        eventType: 'TRIP_START',
        occurredAtClient: DateTime.now(),
      ),
    );
    return manifest;
  }

  @override
  Future<Map<String, dynamic>> arriveAtStop(
    String tripId,
    String stopId, {
    double? latitude,
    double? longitude,
    double? accuracyM,
    DateTime? occurredAtClient,
    String? clientEventId,
  }) async {
    manifest = manifest.applyQueuedEvent(
      QueuedDriverEvent(
        clientEventId: clientEventId ?? 'srv-arrive-$stopId',
        tripId: tripId,
        eventType: 'STOP_ARRIVE',
        stopId: stopId,
        occurredAtClient: occurredAtClient ?? DateTime.now(),
        latitude: latitude,
        longitude: longitude,
        accuracyM: accuracyM,
      ),
    );
    return {'status': 'ARRIVED'};
  }

  @override
  Future<void> pickupPassenger(
    String tripId,
    String stopId,
    String assignmentId, {
    String? otpCode,
    double? latitude,
    double? longitude,
    double? accuracyM,
    DateTime? occurredAtClient,
    String? clientEventId,
  }) async {
    if (otpCode != null) capturedOtps.add(otpCode);
    manifest = manifest.applyQueuedEvent(
      QueuedDriverEvent(
        clientEventId: clientEventId ?? 'srv-pickup-$assignmentId',
        tripId: tripId,
        eventType: 'PASSENGER_PICKUP',
        stopId: stopId,
        assignmentId: assignmentId,
        otpCode: otpCode,
        occurredAtClient: occurredAtClient ?? DateTime.now(),
      ),
    );
  }

  @override
  Future<void> markNoShow(
    String tripId,
    String stopId,
    String assignmentId, {
    required String reasonCode,
    String? notes,
    required double latitude,
    required double longitude,
    double? accuracyM,
    DateTime? occurredAtClient,
    String? clientEventId,
  }) async {
    capturedNoShows.add((
      reasonCode: reasonCode,
      notes: notes,
      lat: latitude,
      lng: longitude,
    ));
    manifest = manifest.applyQueuedEvent(
      QueuedDriverEvent(
        clientEventId: clientEventId ?? 'srv-noshow-$assignmentId',
        tripId: tripId,
        eventType: 'PASSENGER_NO_SHOW',
        stopId: stopId,
        assignmentId: assignmentId,
        reasonCode: reasonCode,
        notes: notes,
        occurredAtClient: occurredAtClient ?? DateTime.now(),
      ),
    );
  }

  @override
  Future<void> completeTrip(
    String tripId, {
    double? latitude,
    double? longitude,
    DateTime? occurredAtClient,
    String? clientEventId,
  }) async {
    manifest = manifest.applyQueuedEvent(
      QueuedDriverEvent(
        clientEventId: clientEventId ?? 'srv-complete',
        tripId: tripId,
        eventType: 'TRIP_COMPLETE',
        occurredAtClient: occurredAtClient ?? DateTime.now(),
      ),
    );
  }

  @override
  Future<DriverTripManifest> syncEventsBatch(
    String tripId,
    List<QueuedDriverEvent> events,
  ) async {
    syncedBatches.add(List<QueuedDriverEvent>.from(events));
    var next = manifest;
    for (final evt in events) {
      next = next.applyQueuedEvent(evt);
    }
    manifest = next;
    return manifest;
  }

  @override
  Future<void> uploadTripLocation(String tripId, GpsSampleRecord sample) async {
    uploadedGpsSamples.add(sample);
  }

  @override
  Future<void> uploadTripLocationBatch(String tripId, List<GpsSampleRecord> samples) async {
    uploadedGpsBatches.add(List<GpsSampleRecord>.from(samples));
  }

  @override
  Future<List<DriverNotificationItem>> fetchNotifications() async => [
        DriverNotificationItem(
          id: 'drv-notif-1',
          category: 'PASSENGER_RUNNING_LATE',
          title: 'Passenger Running Late · Aarav Sharma',
          body: 'Commuter reported +10m delay at Stop #1.',
          readAt: (markAllReadCalls > 0 || markedReadIds.isNotEmpty) ? DateTime.now() : null,
          createdAt: DateTime.now().subtract(const Duration(minutes: 2)),
          unreadCount: (markAllReadCalls > 0 || markedReadIds.isNotEmpty) ? 0 : 1,
        ),
      ];

  @override
  Future<void> markNotificationRead(String notificationId) async {
    markedReadIds.add(notificationId);
  }

  @override
  Future<int> markAllNotificationsRead() async {
    markAllReadCalls++;
    return 1;
  }

  @override
  Future<void> registerDeviceToken({
    required String token,
    String platform = 'ANDROID',
  }) async {}

  @override
  Future<DriverSosReceipt> triggerSos({
    String? tripId,
    double? latitude,
    double? longitude,
    double? accuracyM,
    String? notes,
  }) async {
    capturedSos.add((tripId: tripId, notes: notes, lat: latitude, lng: longitude));
    return DriverSosReceipt(
      id: 'drv-sos-1',
      alertType: 'SOS',
      severity: 'CRITICAL',
      status: 'OPEN',
      notes: notes,
      createdAt: DateTime.now(),
    );
  }

  @override
  Future<DriverCommutesOverviewData> fetchCommutesOverview() async {
    if (customOverview != null) return customOverview!;
    final s = manifest.status.toUpperCase();
    final isActive = s == 'ASSIGNED' || s == 'DRIVER_ACCEPTED' || s == 'IN_PROGRESS';
    final totalPax = manifest.stops.expand((st) => st.passengers).length;
    final pendingPax =
        manifest.stops.expand((st) => st.passengers).where((p) => isPassengerPending(p.status)).length;
    final summary = DriverTripSummary(
      id: manifest.tripId,
      tripCode: manifest.tripCode,
      travelDate: manifest.travelDate,
      direction: manifest.direction,
      status: manifest.status,
      currentStopSequence: manifest.currentStopSequence,
      plannedStartAt: manifest.plannedStartAt,
      actualStartAt: manifest.actualStartAt,
      completedAt: manifest.completedAt,
      officeName: manifest.officeName,
      shiftName: manifest.shiftName,
      shiftTimeLocal: manifest.shiftTimeLocal,
      vehicleRegistrationNo: manifest.vehicleRegistrationNo,
      vehicleModelName: manifest.vehicleModelName,
      stopsCount: manifest.stops.length,
      passengersCount: totalPax,
      pendingPassengersCount: pendingPax,
      commuteId: 'cm-test-1',
      commuteName: 'Madhapur Morning Pickup',
      localityName: 'Madhapur',
    );
    return DriverCommutesOverviewData(
      todayDate: manifest.travelDate,
      todayTargets: isActive ? [summary] : const [],
      commutes: isActive
          ? [
              DriverCommuteCard(
                commuteId: 'cm-test-1',
                commuteName: 'Madhapur Morning Pickup',
                direction: manifest.direction,
                officeName: manifest.officeName,
                shiftName: manifest.shiftName,
                shiftTimeLocal: manifest.shiftTimeLocal,
                localityName: 'Madhapur',
                timePreferenceSummary: 'Pickup 08:15',
                startDate: manifest.travelDate,
                endDate: manifest.travelDate,
                scheduledTripsCount: 1,
                totalAssignedTripsCount: 1,
                completedTripsCount: 0,
                hasInProgressTrip: s == 'IN_PROGRESS',
                nextTripId: manifest.tripId,
                nextTripCode: manifest.tripCode,
                nextTripDate: manifest.travelDate,
                nextTripStatus: manifest.status,
                nextTripStartAt: manifest.plannedStartAt,
                nextTripStopsCount: manifest.stops.length,
                nextTripPassengersCount: totalPax,
              ),
            ]
          : const [],
    );
  }

  @override
  Future<DriverCommuteCalendarData> fetchCommuteCalendar(
    String commuteId, {
    String? month,
  }) async {
    final targetMonth = (month != null && month.isNotEmpty)
        ? month
        : manifest.travelDate.substring(0, 7);
    if (customCalendars.containsKey('$commuteId|$targetMonth')) {
      return customCalendars['$commuteId|$targetMonth']!;
    }
    if (customCalendars.containsKey(targetMonth)) {
      return customCalendars[targetMonth]!;
    }
    final inMonth = manifest.travelDate.startsWith(targetMonth);
    final totalPax = manifest.stops.expand((st) => st.passengers).length;
    return DriverCommuteCalendarData(
      commute: DriverCalendarCommuteMeta(
        commuteId: commuteId,
        commuteName: 'Madhapur Morning Pickup',
        direction: manifest.direction,
        officeName: manifest.officeName,
        shiftName: manifest.shiftName,
        shiftTimeLocal: manifest.shiftTimeLocal,
        localityName: 'Madhapur',
        timePreferenceSummary: 'Pickup 08:15',
        startDate: manifest.travelDate,
        endDate: manifest.travelDate,
        totalAssignedTripsCount: 1,
      ),
      month: targetMonth,
      todayDate: manifest.travelDate,
      activeMonths: [manifest.travelDate.substring(0, 7)],
      scheduledDates: inMonth
          ? [
              DriverCalendarScheduledDate(
                date: manifest.travelDate,
                tripCount: 1,
                statuses: [manifest.status],
                primaryTripId: manifest.tripId,
                primaryTripCode: manifest.tripCode,
                plannedStartAt: manifest.plannedStartAt,
                plannedStartTimeLocal: '08:15',
                passengerCount: totalPax,
                stopsCount: manifest.stops.length,
              ),
            ]
          : const [],
    );
  }

  @override
  Future<DriverCommuteDateManifestData> fetchCommuteDateManifest(
    String commuteId,
    String date,
  ) async {
    if (customDateManifests.containsKey(date)) {
      return customDateManifests[date]!;
    }
    return DriverCommuteDateManifestData(
      date: date,
      commuteId: commuteId,
      trips: date == manifest.travelDate ? [manifest] : const [],
    );
  }
}

class _FakeDriverNotificationCoordinator implements DriverNotificationCoordinator {
  final List<({String title, String category, String body})> shownAlerts = [];

  @override
  Future<void> initialize() async {}

  @override
  Future<void> showDutyAlert({
    required String idSeed,
    required String category,
    required String title,
    required String body,
    String? tripId,
  }) async {
    shownAlerts.add((title: title, category: category, body: body));
  }

  @override
  Future<String?> registerPushTokenIfPermitted({
    required bool notificationsGranted,
    required Future<void> Function(String token, String platform) onToken,
  }) async =>
      null;

  @override
  void dispose() {}
}

DriverTripManifest _sampleManifest({
  String status = 'ASSIGNED',
  DateTime? stop1ActualArrivalAt,
  String stop1Status = 'PENDING',
  String passengerStatus = 'SCHEDULED',
}) {
  return DriverTripManifest(
    tripId: 'trip-1',
    tripCode: 'TRP-20261117-01',
    travelDate: '2026-11-17',
    direction: 'LOGIN',
    status: status,
    currentStopSequence: 1,
    plannedStartAt: DateTime(2026, 11, 17, 8, 15),
    officeName: 'SolTransit Mindspace Campus',
    officeAddress: 'Tower B, Hitec City, Hyderabad',
    shiftName: 'Morning 09:00',
    shiftTimeLocal: '09:00',
    vehicleRegistrationNo: 'KA01AB1234',
    vehicleModelName: 'Toyota Innova Crysta',
    noShowWaitSeconds: 300,
    requireBoardingOtp: true,
    stops: [
      DriverTripStop(
        id: 'stop-1',
        sequenceNo: 1,
        stopType: 'PICKUP',
        locationName: 'Stop 1 Gate',
        address: 'Madhapur Main Road, Plot 42',
        latitude: 17.4486,
        longitude: 78.3908,
        geofenceRadiusM: 150,
        status: stop1Status,
        scheduledArrivalAt: DateTime(2026, 11, 17, 8, 25),
        actualArrivalAt: stop1ActualArrivalAt,
        navigationUrl:
            'https://www.google.com/maps/dir/?api=1&destination=17.4486,78.3908&travelmode=driving&dir_action=navigate',
        passengers: [
          DriverStopPassenger(
            id: 'assign-1',
            bookingId: 'bk-1',
            employeeId: 'emp-1',
            employeeCode: 'EMP-101',
            department: 'Engineering',
            fullName: 'Aarav Sharma',
            phone: '+919800000101',
            status: passengerStatus,
            scheduledPickupAt: DateTime(2026, 11, 17, 8, 25),
            driverArrivedAt: stop1ActualArrivalAt,
            otpRequired: true,
          ),
        ],
      ),
      DriverTripStop(
        id: 'stop-2',
        sequenceNo: 2,
        stopType: 'OFFICE',
        locationName: 'SolTransit Mindspace Campus',
        address: 'Tower B, Hitec City, Hyderabad',
        latitude: 17.4401,
        longitude: 78.3782,
        geofenceRadiusM: 200,
        status: 'PENDING',
        scheduledArrivalAt: DateTime(2026, 11, 17, 8, 55),
        navigationUrl:
            'https://www.google.com/maps/dir/?api=1&destination=17.4401,78.3782&travelmode=driving&dir_action=navigate',
        passengers: const [],
      ),
    ],
  );
}

Future<void> _pumpUi(WidgetTester tester, {int ticks = 8}) async {
  for (var i = 0; i < ticks; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

void _setPhoneViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(412, 915);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

void main() {
  testWidgets(
    'progressive onboarding avoids eager GPS start and executes online OTP trip flow end-to-end',
    (tester) async {
      _setPhoneViewport(tester);

      final fakePerms = _FakePermissionCoordinator();
      final fakeApi = _FakeDriverApi(initialManifest: _sampleManifest());
      final fakeStore = InMemoryDriverOfflineStore();
      final connectivityController = StreamController<List<ConnectivityResult>>.broadcast();
      addTearDown(connectivityController.close);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            driverApiProvider.overrideWithValue(fakeApi),
            driverOfflineStoreProvider.overrideWithValue(fakeStore),
            driverPermissionCoordinatorProvider.overrideWithValue(fakePerms),
            driverRealtimeProvider.overrideWithValue(DriverRealtimeService(enabled: false)),
            driverNotificationCoordinatorProvider.overrideWithValue(
              const NoopDriverNotificationCoordinator(),
            ),
            driverConnectivityStreamProvider.overrideWith(
              (ref) => connectivityController.stream,
            ),
          ],
          child: const DriverApp(),
        ),
      );
      await _pumpUi(tester);

      // Progressive onboarding appears without starting background/foreground location
      expect(find.text('Driver Duty & Dispatch Console'), findsOneWidget);
      expect(fakePerms.trackingStartedCount, 0);

      await tester.tap(find.text('Enable Duty Alerts & Enter Console'));
      await _pumpUi(tester);

      expect(fakePerms.notificationsRequested, 1);
      expect(fakePerms.trackingStartedCount, 0);

      // Today's duty dashboard shows assigned cab and trip card
      expect(find.text('KA01AB1234'), findsOneWidget);
      expect(find.text('TRP-20261117-01'), findsOneWidget);

      await tester.tap(find.text('Review & Start Duty'));
      await _pumpUi(tester);

      // Trip Preview allows duty acceptance + trip start
      expect(find.text('Pre-Trip Stop Manifest'), findsOneWidget);
      await tester.tap(find.text('Accept Duty Allocation'));
      await _pumpUi(tester);
      expect(fakeApi.manifest.status, 'DRIVER_ACCEPTED');

      await tester.tap(find.text('Start Trip & Enable Live GPS'));
      await _pumpUi(tester, ticks: 12);

      // Starting trip starts foreground duty tracking and enters active console
      expect(fakePerms.trackingStartedCount, 1);
      expect(fakePerms.dutyActive, isTrue);
      expect(find.text('CURRENT STOP #1'), findsOneWidget);
      expect(find.text('Stop 1 Gate'), findsOneWidget);

      // Arrive at pickup stop #1
      await tester.tap(find.text('I Have Arrived at Stop #1'));
      await _pumpUi(tester);

      expect(find.text('Picked Up (OTP)'), findsOneWidget);
      expect(find.textContaining('Mandatory Wait'), findsOneWidget);
      expect(find.text('No-Show'), findsNothing);

      // Open OTP modal and enter 4-digit pin
      await tester.tap(find.text('Picked Up (OTP)'));
      await _pumpUi(tester);
      expect(find.text('Enter 4-Digit Boarding OTP'), findsOneWidget);

      await tester.enterText(find.byType(TextField), '4821');
      await _pumpUi(tester, ticks: 2);
      await tester.tap(find.text('Confirm Boarding'));
      await _pumpUi(tester);

      expect(fakeApi.capturedOtps, ['4821']);

      // Automatically progressed to Stop #2 (OFFICE terminus)
      expect(find.text('TERMINUS · CAMPUS DROP'), findsOneWidget);
      expect(find.text('Complete Trip at Campus'), findsOneWidget);

      await tester.tap(find.text('Complete Trip at Campus'));
      await _pumpUi(tester);
      expect(find.text('Complete Shift Trip?'), findsOneWidget);

      await tester.tap(find.text('Complete Trip'));
      await _pumpUi(tester, ticks: 12);

      // Trip completion automatically tears down foreground GPS duty service
      expect(fakePerms.trackingStoppedCount, 1);
      expect(fakePerms.dutyActive, isFalse);
      expect(find.text('No commute targets scheduled for today'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'offline execution queues chronological events locally and syncs upon reconnection',
    (tester) async {
      _setPhoneViewport(tester);

      final fakePerms = _FakePermissionCoordinator();
      final fakeApi = _FakeDriverApi(
        initialManifest: _sampleManifest(status: 'IN_PROGRESS'),
      );
      final fakeStore = InMemoryDriverOfflineStore();
      await fakeStore.saveManifest(fakeApi.manifest);

      final connectivityController = StreamController<List<ConnectivityResult>>.broadcast();
      addTearDown(connectivityController.close);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            driverApiProvider.overrideWithValue(fakeApi),
            driverOfflineStoreProvider.overrideWithValue(fakeStore),
            driverPermissionCoordinatorProvider.overrideWithValue(fakePerms),
            driverRealtimeProvider.overrideWithValue(DriverRealtimeService(enabled: false)),
            driverNotificationCoordinatorProvider.overrideWithValue(
              const NoopDriverNotificationCoordinator(),
            ),
            driverOnboardingStateProvider.overrideWithValue(DriverOnboardingState(true)),
            driverConnectivityStreamProvider.overrideWith(
              (ref) => connectivityController.stream,
            ),
          ],
          child: const DriverApp(),
        ),
      );
      await _pumpUi(tester);

      // Drop into offline state before resuming active trip
      connectivityController.add([ConnectivityResult.none]);
      await _pumpUi(tester);

      await tester.tap(find.text('Resume Active Console'));
      await _pumpUi(tester);
      expect(find.textContaining('Offline · 0 action(s) saved locally'), findsOneWidget);

      // Queue STOP_ARRIVE offline -> optimistic local transition
      await tester.tap(find.text('I Have Arrived at Stop #1'));
      await _pumpUi(tester);

      var pending = await fakeStore.listPendingEvents();
      expect(pending.map((e) => e.eventType).toList(), ['STOP_ARRIVE']);
      expect(find.textContaining('Offline · 1 action(s) saved locally'), findsOneWidget);
      expect(find.text('Picked Up (OTP)'), findsOneWidget);

      // Queue PASSENGER_PICKUP offline -> advances locally to terminus
      await tester.tap(find.text('Picked Up (OTP)'));
      await _pumpUi(tester);
      await tester.enterText(find.byType(TextField), '7390');
      await _pumpUi(tester, ticks: 2);
      await tester.tap(find.text('Confirm Boarding'));
      await _pumpUi(tester);

      pending = await fakeStore.listPendingEvents();
      expect(pending.map((e) => e.eventType).toList(), ['STOP_ARRIVE', 'PASSENGER_PICKUP']);
      expect(find.text('TERMINUS · CAMPUS DROP'), findsOneWidget);

      // Reconnect triggers auto-flush via DriverSyncCoordinator listener
      connectivityController.add([ConnectivityResult.wifi]);
      await _pumpUi(tester, ticks: 12);

      expect(fakeApi.syncedBatches.length, 1);
      expect(
        fakeApi.syncedBatches.single.map((e) => e.eventType).toList(),
        ['STOP_ARRIVE', 'PASSENGER_PICKUP'],
      );
      expect(await fakeStore.listPendingEvents(), isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'no-show countdown stays locked while timer active and submits reason once wait elapses',
    (tester) async {
      _setPhoneViewport(tester);

      // Case A: Just arrived -> Wait timer active -> No-Show button disabled
      final recentPerms = _FakePermissionCoordinator();
      final recentApi = _FakeDriverApi(
        initialManifest: _sampleManifest(
          status: 'IN_PROGRESS',
          stop1Status: 'ARRIVED',
          passengerStatus: 'ARRIVED',
          stop1ActualArrivalAt: DateTime.now().subtract(const Duration(seconds: 5)),
        ),
      );
      await tester.pumpWidget(
        ProviderScope(
          key: const ValueKey('case_a'),
          overrides: [
            driverApiProvider.overrideWithValue(recentApi),
            driverOfflineStoreProvider.overrideWithValue(InMemoryDriverOfflineStore()),
            driverPermissionCoordinatorProvider.overrideWithValue(recentPerms),
            driverRealtimeProvider.overrideWithValue(DriverRealtimeService(enabled: false)),
            driverNotificationCoordinatorProvider.overrideWithValue(
              const NoopDriverNotificationCoordinator(),
            ),
            driverOnboardingStateProvider.overrideWithValue(DriverOnboardingState(true)),
          ],
          child: const DriverApp(),
        ),
      );
      await _pumpUi(tester);
      await tester.tap(find.text('Resume Active Console'));
      await _pumpUi(tester);

      expect(find.textContaining('Wait 04:'), findsOneWidget);
      expect(find.text('No-Show'), findsNothing);

      // Unmount Case A cleanly before mounting Case B where wait elapsed (> 300s)
      await tester.pumpWidget(const SizedBox.shrink());
      await _pumpUi(tester, ticks: 2);

      final elapsedPerms = _FakePermissionCoordinator();
      final elapsedApi = _FakeDriverApi(
        initialManifest: _sampleManifest(
          status: 'IN_PROGRESS',
          stop1Status: 'ARRIVED',
          passengerStatus: 'ARRIVED',
          stop1ActualArrivalAt: DateTime.now().subtract(const Duration(seconds: 350)),
        ),
      );
      await tester.pumpWidget(
        ProviderScope(
          key: const ValueKey('case_b'),
          overrides: [
            driverApiProvider.overrideWithValue(elapsedApi),
            driverOfflineStoreProvider.overrideWithValue(InMemoryDriverOfflineStore()),
            driverPermissionCoordinatorProvider.overrideWithValue(elapsedPerms),
            driverRealtimeProvider.overrideWithValue(DriverRealtimeService(enabled: false)),
            driverNotificationCoordinatorProvider.overrideWithValue(
              const NoopDriverNotificationCoordinator(),
            ),
            driverOnboardingStateProvider.overrideWithValue(DriverOnboardingState(true)),
          ],
          child: const DriverApp(),
        ),
      );
      await _pumpUi(tester);
      await tester.tap(find.text('Resume Active Console'));
      await _pumpUi(tester);

      expect(find.text('No-Show'), findsOneWidget);
      await tester.tap(find.text('No-Show'));
      await _pumpUi(tester);

      expect(find.text('Mark Aarav Sharma No-Show'), findsOneWidget);
      await tester.tap(find.text('Confirm No-Show'));
      await _pumpUi(tester);

      expect(elapsedApi.capturedNoShows.length, 1);
      expect(elapsedApi.capturedNoShows.single.reasonCode, 'PASSENGER_UNREACHABLE');
      expect(elapsedApi.capturedNoShows.single.lat, closeTo(17.4486, 0.0001));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('tablet breakpoint switches bottom bar to NavigationRail without overflow', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(900, 1100);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final fakeApi = _FakeDriverApi(initialManifest: _sampleManifest());

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          driverApiProvider.overrideWithValue(fakeApi),
          driverOfflineStoreProvider.overrideWithValue(InMemoryDriverOfflineStore()),
          driverPermissionCoordinatorProvider.overrideWithValue(_FakePermissionCoordinator()),
          driverRealtimeProvider.overrideWithValue(DriverRealtimeService(enabled: false)),
          driverNotificationCoordinatorProvider.overrideWithValue(
            const NoopDriverNotificationCoordinator(),
          ),
          driverOnboardingStateProvider.overrideWithValue(DriverOnboardingState(true)),
        ],
        child: const DriverApp(),
      ),
    );
    await _pumpUi(tester);

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'queues GPS telemetry fixes locally when offline, batch-uploads on reconnect, and shows GPS_DISABLED warning',
    (tester) async {
      _setPhoneViewport(tester);

      final fakePerms = _FakePermissionCoordinator();
      addTearDown(fakePerms.dispose);
      final fakeApi = _FakeDriverApi(
        initialManifest: _sampleManifest(status: 'IN_PROGRESS'),
      );
      final fakeStore = InMemoryDriverOfflineStore();
      await fakeStore.saveManifest(fakeApi.manifest);

      final connectivityController = StreamController<List<ConnectivityResult>>.broadcast();
      addTearDown(connectivityController.close);

      await tester.pumpWidget(
        ProviderScope(
          key: const ValueKey('gps_telemetry_test'),
          overrides: [
            driverApiProvider.overrideWithValue(fakeApi),
            driverOfflineStoreProvider.overrideWithValue(fakeStore),
            driverPermissionCoordinatorProvider.overrideWithValue(fakePerms),
            driverRealtimeProvider.overrideWithValue(DriverRealtimeService(enabled: false)),
            driverNotificationCoordinatorProvider.overrideWithValue(
              const NoopDriverNotificationCoordinator(),
            ),
            driverOnboardingStateProvider.overrideWithValue(DriverOnboardingState(true)),
            driverConnectivityStreamProvider.overrideWith(
              (ref) => connectivityController.stream,
            ),
          ],
          child: const DriverApp(),
        ),
      );
      await _pumpUi(tester);

      await tester.tap(find.text('Resume Active Console'));
      await _pumpUi(tester);

      // Go offline and stream 2 live GPS fixes -> persisted local-first in offline outbox
      connectivityController.add([ConnectivityResult.none]);
      await _pumpUi(tester, ticks: 2);

      fakePerms.emitCoordinate(
        DriverCoordinate(
          latitude: 17.4501,
          longitude: 78.3921,
          accuracyM: 8.5,
          speedMps: 9.2,
          headingDeg: 110,
          recordedAt: DateTime.utc(2026, 11, 17, 8, 20),
        ),
      );
      await _pumpUi(tester, ticks: 3);

      fakePerms.emitCoordinate(
        DriverCoordinate(
          latitude: 17.4522,
          longitude: 78.3944,
          accuracyM: 7.0,
          speedMps: 10.4,
          headingDeg: 115,
          recordedAt: DateTime.utc(2026, 11, 17, 8, 21),
        ),
      );
      await _pumpUi(tester, ticks: 3);

      expect(await fakeStore.countPendingGpsSamples(), 2);
      expect(find.textContaining('2 GPS fix(es) awaiting upload'), findsOneWidget);

      // Simulate GPS hardware disabled mid-trip -> honest banner & recovery action appear
      fakePerms.emitError('GPS_DISABLED');
      await _pumpUi(tester, ticks: 2);
      expect(find.text('GPS Off'), findsOneWidget);
      expect(find.textContaining('Device GPS is turned off'), findsOneWidget);

      // Recover connectivity -> queued samples upload in one batch & clear queue
      connectivityController.add([ConnectivityResult.wifi]);
      await _pumpUi(tester, ticks: 10);

      expect(fakeApi.uploadedGpsBatches.length, 1);
      expect(fakeApi.uploadedGpsBatches.single.length, 2);
      expect(await fakeStore.countPendingGpsSamples(), 0);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Phase 6 displays Duty Alerts inbox, marks all read, and submits Driver Emergency SOS from Active Console',
    (tester) async {
      _setPhoneViewport(tester);

      final fakePerms = _FakePermissionCoordinator();
      addTearDown(fakePerms.dispose);
      final fakeApi = _FakeDriverApi(
        initialManifest: _sampleManifest(status: 'IN_PROGRESS'),
      );
      final fakeNotifs = _FakeDriverNotificationCoordinator();

      await tester.pumpWidget(
        ProviderScope(
          key: const ValueKey('driver_phase6_test'),
          overrides: [
            driverApiProvider.overrideWithValue(fakeApi),
            driverOfflineStoreProvider.overrideWithValue(InMemoryDriverOfflineStore()),
            driverPermissionCoordinatorProvider.overrideWithValue(fakePerms),
            driverRealtimeProvider.overrideWithValue(DriverRealtimeService(enabled: false)),
            driverNotificationCoordinatorProvider.overrideWithValue(fakeNotifs),
            driverOnboardingStateProvider.overrideWithValue(DriverOnboardingState(true)),
          ],
          child: const DriverApp(),
        ),
      );
      await _pumpUi(tester);

      // Open Duty Alerts modal sheet & mark all read
      await tester.tap(find.byTooltip('Duty alerts'));
      await _pumpUi(tester);
      expect(find.text('Duty Alerts & Dispatch'), findsOneWidget);
      expect(find.text('Passenger Running Late · Aarav Sharma'), findsOneWidget);
      await tester.tap(find.text('Mark all read'));
      await _pumpUi(tester);
      expect(fakeApi.markAllReadCalls, 1);

      await tester.tap(find.byTooltip('Close alerts'));
      await _pumpUi(tester);

      // Open Active Trip Console and trigger confirmed Driver SOS
      await tester.tap(find.text('Resume Active Console'));
      await _pumpUi(tester);
      await tester.tap(find.byTooltip('Emergency SOS'));
      await _pumpUi(tester);
      expect(find.text('Trigger Driver Emergency SOS?'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'Flat tyre near junction');
      await _pumpUi(tester, ticks: 2);
      await tester.tap(find.text('Send CRITICAL SOS'));
      await _pumpUi(tester);

      expect(fakeApi.capturedSos.length, 1);
      expect(fakeApi.capturedSos.single.tripId, 'trip-1');
      expect(fakeApi.capturedSos.single.notes, 'Flat tyre near junction');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'commute-centred driver home shows Todays Target, 1 grouped commute card, and interactive blue/grey schedule calendar',
    (tester) async {
      _setPhoneViewport(tester);

      const commuteId = 'cm-chinthal-morning';
      final mar2Manifest = _sampleManifest(status: 'ASSIGNED').copyWith(
        status: 'ASSIGNED',
      );
      final mar5Manifest = DriverTripManifest(
        tripId: 'trip-mar-05',
        tripCode: 'TRP-20270305-01',
        travelDate: '2027-03-05',
        direction: 'LOGIN',
        status: 'ASSIGNED',
        currentStopSequence: 1,
        plannedStartAt: DateTime(2027, 3, 5, 8, 20),
        officeName: 'Gachibowli Campus',
        officeAddress: 'Tower B, Financial District, Hyderabad',
        shiftName: 'Morning Login S1',
        shiftTimeLocal: '09:00',
        vehicleRegistrationNo: 'TS07UA4821',
        vehicleModelName: 'Maruti Dzire Tour S',
        stops: mar2Manifest.stops,
      );

      const commuteMeta = DriverCalendarCommuteMeta(
        commuteId: commuteId,
        commuteName: 'Chinthal Morning Pickup',
        direction: 'LOGIN',
        officeName: 'Gachibowli Campus',
        shiftName: 'Morning Login S1',
        shiftTimeLocal: '09:00',
        localityName: 'Chinthal',
        timePreferenceSummary: 'Pickup 08:20',
        startDate: '2027-03-01',
        endDate: '2027-03-31',
        totalAssignedTripsCount: 22,
      );

      final fakeApi = _FakeDriverApi(
        initialManifest: mar5Manifest,
        customOverview: DriverCommutesOverviewData(
          todayDate: '2027-03-02',
          todayTargets: [
            DriverTripSummary(
              id: 'trip-mar-02',
              tripCode: 'TRP-20270302-01',
              travelDate: '2027-03-02',
              direction: 'LOGIN',
              status: 'ASSIGNED',
              currentStopSequence: 1,
              plannedStartAt: DateTime(2027, 3, 2, 8, 20),
              officeName: 'Gachibowli Campus',
              shiftName: 'Morning Login S1',
              shiftTimeLocal: '09:00',
              vehicleRegistrationNo: 'TS07UA4821',
              vehicleModelName: 'Maruti Dzire Tour S',
              stopsCount: 2,
              passengersCount: 2,
              pendingPassengersCount: 2,
              commuteId: commuteId,
              commuteName: 'Chinthal Morning Pickup',
              localityName: 'Chinthal',
            ),
          ],
          commutes: [
            DriverCommuteCard(
              commuteId: commuteId,
              commuteName: 'Chinthal Morning Pickup',
              direction: 'LOGIN',
              officeName: 'Gachibowli Campus',
              shiftName: 'Morning Login S1',
              shiftTimeLocal: '09:00',
              localityName: 'Chinthal',
              timePreferenceSummary: 'Pickup 08:20',
              startDate: '2027-03-01',
              endDate: '2027-03-31',
              scheduledTripsCount: 22,
              totalAssignedTripsCount: 22,
              completedTripsCount: 0,
              hasInProgressTrip: false,
              nextTripId: 'trip-mar-02',
              nextTripCode: 'TRP-20270302-01',
              nextTripDate: '2027-03-02',
              nextTripStatus: 'ASSIGNED',
              nextTripStartAt: DateTime(2027, 3, 2, 8, 20),
              nextTripStopsCount: 2,
              nextTripPassengersCount: 2,
            ),
          ],
        ),
        customCalendars: {
          '$commuteId|2027-03': DriverCommuteCalendarData(
            commute: commuteMeta,
            month: '2027-03',
            todayDate: '2027-03-02',
            activeMonths: const ['2027-03', '2027-04'],
            scheduledDates: [
              DriverCalendarScheduledDate(
                date: '2027-03-02',
                tripCount: 1,
                statuses: const ['ASSIGNED'],
                primaryTripId: 'trip-mar-02',
                primaryTripCode: 'TRP-20270302-01',
                plannedStartAt: DateTime(2027, 3, 2, 8, 20),
                plannedStartTimeLocal: '08:20',
                passengerCount: 2,
                stopsCount: 2,
              ),
              DriverCalendarScheduledDate(
                date: '2027-03-05',
                tripCount: 1,
                statuses: const ['ASSIGNED'],
                primaryTripId: 'trip-mar-05',
                primaryTripCode: 'TRP-20270305-01',
                plannedStartAt: DateTime(2027, 3, 5, 8, 20),
                plannedStartTimeLocal: '08:20',
                passengerCount: 1,
                stopsCount: 2,
              ),
            ],
          ),
          '$commuteId|2027-04': const DriverCommuteCalendarData(
            commute: commuteMeta,
            month: '2027-04',
            todayDate: '2027-03-02',
            activeMonths: ['2027-03', '2027-04'],
            scheduledDates: [],
          ),
        },
        customDateManifests: {
          '2027-03-02': DriverCommuteDateManifestData(
            date: '2027-03-02',
            commuteId: commuteId,
            trips: [mar2Manifest],
          ),
          '2027-03-05': DriverCommuteDateManifestData(
            date: '2027-03-05',
            commuteId: commuteId,
            trips: [mar5Manifest],
          ),
        },
      );

      await tester.pumpWidget(
        ProviderScope(
          key: const ValueKey('driver_commute_calendar_test'),
          overrides: [
            driverApiProvider.overrideWithValue(fakeApi),
            driverOfflineStoreProvider.overrideWithValue(InMemoryDriverOfflineStore()),
            driverPermissionCoordinatorProvider.overrideWithValue(_FakePermissionCoordinator()),
            driverRealtimeProvider.overrideWithValue(DriverRealtimeService(enabled: false)),
            driverNotificationCoordinatorProvider.overrideWithValue(
              const NoopDriverNotificationCoordinator(),
            ),
            driverOnboardingStateProvider.overrideWithValue(DriverOnboardingState(true)),
          ],
          child: const DriverApp(),
        ),
      );
      await _pumpUi(tester);

      // Home displays Today's Target + single named commute card instead of 22 separate trip cards
      expect(find.text("Today's Target"), findsOneWidget);
      expect(find.text('TRP-20270302-01'), findsOneWidget);
      expect(find.text('Assigned Commutes'), findsOneWidget);
      expect(find.text('Chinthal Morning Pickup'), findsOneWidget);
      expect(find.text('22 upcoming'), findsOneWidget);
      expect(find.text('1 commute(s)'), findsOneWidget);

      // Tap named commute card -> opens interactive CommuteScheduleScreen calendar
      final commuteCardFinder = find.text('Chinthal Morning Pickup');
      await tester.ensureVisible(commuteCardFinder);
      await tester.tap(commuteCardFinder);
      await _pumpUi(tester);

      expect(find.text('March 2027'), findsOneWidget);

      // Blue scheduled cell vs Grey unassigned cell verification
      final mar5Cell = find.byKey(const ValueKey('cal-day-2027-03-05'));
      final mar3Cell = find.byKey(const ValueKey('cal-day-2027-03-03'));
      expect(mar5Cell, findsOneWidget);
      expect(mar3Cell, findsOneWidget);

      final mar5Material = tester.widget<Material>(
        find.ancestor(of: mar5Cell, matching: find.byType(Material)).first,
      );
      final mar3Material = tester.widget<Material>(
        find.ancestor(of: mar3Cell, matching: find.byType(Material)).first,
      );
      expect(mar5Material.color, ColorTokens.primarySoft);
      expect(mar3Material.color, ColorTokens.surfaceMuted);

      // Tapping grey date displays clear message
      await tester.tap(mar3Cell);
      await _pumpUi(tester);
      expect(find.text('No trip assigned for this date.'), findsOneWidget);

      // Tapping blue date renders day's duty manifest and Review & Start Duty action
      await tester.tap(mar5Cell);
      await _pumpUi(tester);
      expect(find.text('TRP-20270305-01'), findsOneWidget);
      expect(find.text('Stop 1 Gate'), findsOneWidget);

      final reviewBtn = find.text('Review & Start Duty');
      await tester.ensureVisible(reviewBtn);
      await _pumpUi(tester);
      await tester.tap(reviewBtn);
      await _pumpUi(tester);
      expect(find.text('Pre-Trip Stop Manifest'), findsOneWidget);

      // Navigate back to schedule and advance to April 2027
      await tester.tap(find.byTooltip('Back').last);
      await _pumpUi(tester);
      final nextMonthBtn = find.byTooltip('Next month');
      await tester.ensureVisible(nextMonthBtn);
      await _pumpUi(tester);
      await tester.tap(nextMonthBtn);
      await _pumpUi(tester);
      expect(find.text('April 2027'), findsOneWidget);
      expect(find.text('No trip assigned for this date.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
