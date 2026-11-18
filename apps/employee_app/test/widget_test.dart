import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:employee_app/core/models/employee_models.dart';
import 'package:employee_app/core/network/employee_api.dart';
import 'package:employee_app/core/network/realtime_sync.dart';
import 'package:employee_app/core/notifications/local_notification_coordinator.dart';
import 'package:employee_app/core/permissions/permission_coordinator.dart';
import 'package:employee_app/core/state/employee_providers.dart';
import 'package:employee_app/core/storage/commute_cache.dart';
import 'package:employee_app/features/rides/time_preference_selector.dart';
import 'package:employee_app/main.dart';
import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

class _FakePermissionCoordinator implements PermissionCoordinator {
  int notificationRequests = 0;
  int locationRequests = 0;
  bool notificationsGranted = false;
  bool locationGranted = false;

  @override
  Future<PermissionSnapshot> checkSnapshot() async => PermissionSnapshot(
        notificationsGranted: notificationsGranted,
        foregroundLocationGranted: locationGranted,
      );

  @override
  Future<void> openSystemSettings() async {}

  @override
  Future<CapturedCoordinate?> requestForegroundLocationAndCapture() async {
    locationRequests++;
    locationGranted = true;
    return const CapturedCoordinate(latitude: 17.4486, longitude: 78.3908, accuracyM: 12);
  }

  @override
  Future<bool> requestNotificationsPermission() async {
    notificationRequests++;
    notificationsGranted = true;
    return true;
  }
}

class _FakeEmployeeApi implements EmployeeApi {
  String lastRunningLateTripId = '';
  int? lastRunningLateMinutes;
  String? lastSosTripId;
  int unreadCalls = 0;
  int markAllReadCalls = 0;
  String? lastAppealTripId;
  String? lastAppealNote;
  List<String> registeredTokens = [];
  bool safeReachConfirmed = false;
  String passengerStatusOverride = 'SCHEDULED';
  String? lastBookingTimePreference;
  String? lastBookingDirection;
  String? lastSeriesRecurrence;
  String? lastSeriesTimePreference;
  bool seriesCancelled = false;
  int? arrivalDelaySecondsOverride;
  DateTime? scheduledPickupOverride;

  static const _office = OfficeSummary(
    id: '22222222-2222-4222-8222-222222222201',
    code: 'HYD-GCB-01',
    name: 'Gachibowli Campus',
    address: 'Financial District, Hyderabad',
    latitude: 17.4239,
    longitude: 78.3489,
  );

  static const _shiftLogin = ShiftSummary(
    id: '44444444-4444-4444-8444-444444444401',
    code: 'S1-LOGIN-0900',
    name: 'Morning Login',
    direction: 'LOGIN',
    shiftTimeLocal: '09:00',
  );

  @override
  Future<EmployeeProfileData> fetchProfile(String userId) async {
    final isPriya = userId.endsWith('22');
    return EmployeeProfileData(
      employeeId: isPriya ? 'emp-priya' : 'emp-aarav',
      employeeCode: isPriya ? 'EMP-1002' : 'EMP-1001',
      department: isPriya ? 'Customer Ops' : 'Platform Engineering',
      transportEligible: true,
      fullName: isPriya ? 'Priya Nair' : 'Aarav Sharma',
      email: isPriya ? 'priya@acme.local' : 'aarav@acme.local',
      phone: '+91-9000001021',
      emergencyContactName: 'Sunita Patel',
      emergencyContactPhone: '+91-9000001021',
      organizationName: 'Acme Mobility',
      office: _office,
      defaultShift: _shiftLogin,
      settings: const OrgSettingsPolicy(),
      availableOffices: const [_office],
      availableShifts: const [_shiftLogin],
      savedLocationsCount: 1,
    );
  }

  @override
  Future<List<SavedLocation>> fetchLocations(String userId) async => const [
        SavedLocation(
          id: 'loc-1',
          locationName: 'Home - Kukatpally Metro',
          address: 'KPHB Colony, Hyderabad',
          corridorTag: 'Kukatpally',
          latitude: 17.4849,
          longitude: 78.4138,
          geofenceRadiusM: 150,
          isDefault: true,
          verified: true,
        ),
      ];

  @override
  Future<List<EmployeeBooking>> fetchBookings(String userId) async => [
        EmployeeBooking(
          id: 'book-1',
          travelDate: '2026-11-20',
          direction: 'LOGIN',
          status: 'DISPATCHED',
          scheduledPickupAt: DateTime(2026, 11, 20, 8, 25),
          shiftId: _shiftLogin.id,
          shiftName: 'Morning Login',
          shiftTimeLocal: '09:00',
          officeId: _office.id,
          officeName: _office.name,
          pickupLocationId: 'loc-1',
          pickupLocationName: 'Home - Kukatpally Metro',
          pickupAddress: 'KPHB Colony',
          tripId: 'trip-1',
          tripCode: 'TRP-20261120-01',
          tripStatus: 'ASSIGNED',
          passengerStatus: 'SCHEDULED',
        ),
      ];

  @override
  Future<UpcomingTripDetail?> fetchUpcomingTrip(String userId) async {
    if (userId.endsWith('22')) return null;
    return UpcomingTripDetail(
      tripId: 'trip-1',
      tripCode: 'TRP-20261120-01',
      travelDate: '2026-11-20',
      direction: 'LOGIN',
      tripStatus: 'ASSIGNED',
      currentStopSequence: 1,
      officeName: 'Gachibowli Campus',
      shiftName: 'Morning Login',
      shiftTimeLocal: '09:00',
      driverId: 'drv-1',
      driverName: 'Ramesh Babu',
      driverPhone: '+91-9000000001',
      vehicleRegistrationNo: 'TS 07 UA 4821',
      vehicleModelName: 'Maruti Dzire Tour S',
      assignmentId: 'pa-2',
      bookingId: 'book-1',
      passengerStatus: passengerStatusOverride,
      scheduledPickupAt: scheduledPickupOverride ?? DateTime(2026, 11, 20, 8, 25),
      runningLateEtaMinutes: lastRunningLateMinutes,
      arrivalDelaySeconds: arrivalDelaySecondsOverride,
      safeReachConfirmedAt: safeReachConfirmed ? DateTime(2026, 11, 20, 9, 5) : null,
      yourStopSequence: 2,
      boardingOtp: '4829',
      passengersTotal: 2,
      stops: [
        TripStopView(
          id: 'stop-1',
          sequenceNo: 1,
          stopType: 'PICKUP',
          locationName: 'Pickup Stop #1',
          address: 'Hyderabad Corridor Stop',
          latitude: null,
          longitude: null,
          scheduledArrivalAt: DateTime(2026, 11, 20, 8, 10),
          status: 'PENDING',
          isYourStop: false,
          passengerCountAtStop: 1,
        ),
        TripStopView(
          id: 'stop-2',
          sequenceNo: 2,
          stopType: 'PICKUP',
          locationName: 'Home - Kukatpally Metro',
          address: 'KPHB Colony, Hyderabad',
          latitude: 17.4849,
          longitude: 78.4138,
          scheduledArrivalAt: DateTime(2026, 11, 20, 8, 25),
          status: 'PENDING',
          isYourStop: true,
          passengerCountAtStop: 1,
        ),
        TripStopView(
          id: 'stop-3',
          sequenceNo: 3,
          stopType: 'OFFICE',
          locationName: 'Gachibowli Campus',
          address: 'Financial District',
          latitude: 17.4239,
          longitude: 78.3489,
          scheduledArrivalAt: DateTime(2026, 11, 20, 9, 0),
          status: 'PENDING',
          isYourStop: false,
          passengerCountAtStop: 0,
        ),
      ],
      gpsTelemetry: null,
      settings: const OrgSettingsPolicy(),
    );
  }

  @override
  Future<List<EmployeeTripSummary>> fetchTrips(String userId) async => [
        EmployeeTripSummary(
          assignmentId: 'pa-2',
          tripId: 'trip-1',
          tripCode: 'TRP-20261120-01',
          travelDate: '2026-11-20',
          direction: 'LOGIN',
          tripStatus: 'ASSIGNED',
          passengerStatus: 'SCHEDULED',
          scheduledPickupAt: DateTime(2026, 11, 20, 8, 25),
          shiftName: 'Morning Login',
          shiftTimeLocal: '09:00',
          officeName: 'Gachibowli Campus',
          stopSequence: 2,
          pickupLocationName: 'Home - Kukatpally Metro',
          pickupAddress: 'KPHB Colony',
          driverName: 'Ramesh Babu',
          vehicleRegistrationNo: 'TS 07 UA 4821',
        ),
      ];

  @override
  Future<UpcomingTripDetail> fetchTripDetail(String userId, String tripId) async {
    return (await fetchUpcomingTrip(userId))!;
  }

  @override
  Future<List<EmployeeNotificationItem>> fetchNotifications(String userId) async => [
        EmployeeNotificationItem(
          id: 'notif-1',
          category: 'TRIP_DISPATCHED',
          title: 'Cab Dispatched · TRP-20261120-01',
          body: 'Driver Ramesh Babu assigned for Morning Login.',
          readAt: (unreadCalls > 0 || markAllReadCalls > 0) ? DateTime.now() : null,
          createdAt: DateTime.now().subtract(const Duration(minutes: 4)),
          unreadCount: (unreadCalls > 0 || markAllReadCalls > 0) ? 0 : 1,
        ),
      ];

  @override
  Future<void> markNotificationRead(String userId, String notificationId) async {
    unreadCalls++;
  }

  @override
  Future<int> markAllNotificationsRead(String userId) async {
    markAllReadCalls++;
    return 1;
  }

  @override
  Future<void> registerDeviceToken(
    String userId, {
    required String token,
    String platform = 'ANDROID',
  }) async {
    registeredTokens.add('$platform:$token');
  }

  @override
  Future<void> appealNoShow(
    String userId,
    String tripId, {
    required String appealNote,
  }) async {
    lastAppealTripId = tripId;
    lastAppealNote = appealNote;
  }

  @override
  Future<void> reportRunningLate(
    String userId,
    String tripId, {
    required int etaMinutes,
    String? note,
  }) async {
    lastRunningLateTripId = tripId;
    lastRunningLateMinutes = etaMinutes;
  }

  @override
  Future<void> confirmSafeReach(String userId, String tripId) async {
    safeReachConfirmed = true;
  }

  @override
  Future<SafetyAlertReceipt> triggerSos(
    String userId, {
    String? tripId,
    double? latitude,
    double? longitude,
    double? accuracyM,
    String? notes,
  }) async {
    lastSosTripId = tripId;
    return SafetyAlertReceipt(
      id: 'sos-1',
      alertType: 'SOS',
      severity: 'CRITICAL',
      status: 'OPEN',
      notes: notes,
      createdAt: DateTime.now(),
    );
  }

  @override
  Future<EmployeeBooking> cancelBooking(
    String userId,
    String bookingId, {
    required String reason,
  }) async =>
      (await fetchBookings(userId)).first;

  @override
  Future<EmployeeBooking> createBooking(
    String userId, {
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
    lastBookingDirection = direction;
    lastBookingTimePreference = timePreference;
    return (await fetchBookings(userId)).first;
  }

  @override
  Future<SeriesPreviewData> previewBookingSeries(
    String userId, {
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
  }) async {
    return SeriesPreviewData(
      recurrenceType: recurrenceType,
      startDate: startDate,
      endDate: endDate ?? '2026-11-29',
      selectedDaysOfWeek: selectedDaysOfWeek ?? const ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      direction: direction,
      timePreference: timePreference,
      requestedTimeLocal: requestedTimeLocal,
      timezone: timezone,
      totalDatesCount: 5,
      validDatesCount: 5,
      conflictingDatesCount: 0,
      infeasibleDatesCount: 0,
      occurrences: [
        SeriesOccurrencePreview(
          travelDate: startDate,
          dayOfWeek: 'MON',
          requestedPickupAt: DateTime(2026, 11, 23, 9, 0),
          scheduledPickupAt: DateTime(2026, 11, 23, 8, 25),
          estimatedArrivalAt: DateTime(2026, 11, 23, 9, 0),
          estimatedTravelMinutes: 25,
          isArriveByInfeasible: false,
          passesCutoff: true,
          hasConflict: false,
        ),
      ],
    );
  }

  @override
  Future<BookingSeriesSummary> createBookingSeries(
    String userId, {
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
    lastSeriesRecurrence = recurrenceType;
    lastSeriesTimePreference = timePreference;
    return BookingSeriesSummary(
      id: 'series-1',
      direction: direction,
      timePreference: timePreference,
      requestedTimeLocal: requestedTimeLocal,
      timezone: timezone,
      recurrenceType: recurrenceType,
      startDate: startDate,
      endDate: endDate ?? '2026-11-29',
      selectedDaysOfWeek: (selectedDaysOfWeek ?? const ['MON', 'WED', 'FRI']).join(','),
      status: 'ACTIVE',
      pickupLocationName: 'Home - Kukatpally Metro',
      officeName: 'Gachibowli Campus',
      totalCount: 3,
      activeCount: 3,
      dispatchedCount: 0,
      expiredCount: 0,
      cancelledCount: 0,
    );
  }

  @override
  Future<List<BookingSeriesSummary>> fetchBookingSeries(String userId) async => [
        BookingSeriesSummary(
          id: 'series-1',
          direction: 'LOGIN',
          timePreference: 'ARRIVE_BY',
          requestedTimeLocal: '09:00',
          timezone: 'Asia/Kolkata',
          recurrenceType: 'WEEKLY',
          startDate: '2026-11-23',
          endDate: '2026-11-29',
          selectedDaysOfWeek: 'MON,WED,FRI',
          status: seriesCancelled ? 'CANCELLED' : 'ACTIVE',
          pickupLocationName: 'Home - Kukatpally Metro',
          officeName: 'Gachibowli Campus',
          totalCount: 3,
          activeCount: seriesCancelled ? 0 : 3,
          dispatchedCount: 0,
          expiredCount: 0,
          cancelledCount: seriesCancelled ? 3 : 0,
        ),
      ];

  @override
  Future<void> skipSeriesDates(
    String userId,
    String seriesId, {
    required List<String> dates,
    String reason = 'Employee skipped date',
  }) async {}

  @override
  Future<void> extendBookingSeries(
    String userId,
    String seriesId, {
    required String newEndDate,
  }) async {}

  @override
  Future<void> cancelBookingSeries(
    String userId,
    String seriesId, {
    required String reason,
  }) async {
    seriesCancelled = true;
  }

  @override
  Future<({EmployeeBooking booking, Map<String, dynamic>? impactedTripAlert})>
      updateBookingOccurrence(
    String userId,
    String bookingId, {
    String? pickupLocationId,
    String? timePreference,
    String? requestedTimeLocal,
    String? timezone,
    required String reason,
  }) async =>
          (booking: (await fetchBookings(userId)).first, impactedTripAlert: null);

  @override
  Future<SavedLocation> addLocation(
    String userId, {
    required String locationName,
    required String address,
    String? corridorTag,
    required double latitude,
    required double longitude,
    int geofenceRadiusM = 150,
    bool isDefault = false,
  }) async =>
      (await fetchLocations(userId)).first;

  @override
  Future<SavedLocation> updateLocation(
    String userId,
    String locationId, {
    bool? isDefault,
    String? locationName,
    String? corridorTag,
  }) async =>
      (await fetchLocations(userId)).first;

  @override
  Future<EmployeeProfileData> updateProfile(
    String userId, {
    String? defaultShiftId,
    String? emergencyContactName,
    String? emergencyContactPhone,
  }) async =>
      fetchProfile(userId);

  @override
  Future<GpsTelemetry?> fetchTripLiveTelemetry(String userId, String tripId) async =>
      overrideGps;

  GpsTelemetry? overrideGps;
}

class _FakeAppNotificationCoordinator implements AppNotificationCoordinator {
  final List<({String title, String category, String body})> shown = [];
  final List<String> scheduledTripIds = [];
  final List<String> cancelledTripIds = [];

  @override
  Future<void> initialize({void Function(String? payload)? onNotificationTap}) async {}

  @override
  Future<void> showRealtimeNotification({
    required String idSeed,
    required String category,
    required String title,
    required String body,
    String? tripId,
  }) async {
    shown.add((title: title, category: category, body: body));
  }

  @override
  Future<void> schedulePrePickupReminder({
    required String tripId,
    required String tripCode,
    required String stopName,
    required DateTime scheduledPickupAt,
  }) async {
    scheduledTripIds.add(tripId);
  }

  @override
  Future<void> cancelPrePickupReminder(String tripId) async {
    cancelledTripIds.add(tripId);
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

void main() {
  Widget buildTestApp({
    required _FakeEmployeeApi fakeApi,
    required _FakePermissionCoordinator fakePerms,
    AppNotificationCoordinator fakeNotifs = const NoopAppNotificationCoordinator(),
    bool initialOnboardingCompleted = false,
    List<ConnectivityResult> connectivity = const [ConnectivityResult.wifi],
  }) {
    return ProviderScope(
      overrides: [
        employeeApiProvider.overrideWithValue(fakeApi),
        permissionCoordinatorProvider.overrideWithValue(fakePerms),
        appNotificationCoordinatorProvider.overrideWithValue(fakeNotifs),
        commuteCacheProvider.overrideWithValue(CommuteCacheStore(enableDiskPersistence: false)),
        realtimeSyncProvider.overrideWithValue(RealtimeSyncService(enabled: false)),
        enableMapTilesProvider.overrideWithValue(false),
        onboardingStateProvider.overrideWithValue(OnboardingState(initialOnboardingCompleted)),
        connectivityStreamProvider.overrideWith((_) => Stream.value(connectivity)),
      ],
      child: const EmployeeApp(),
    );
  }

  testWidgets('Progressive permission onboarding never requests location on launch and transitions to Home', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    final api = _FakeEmployeeApi();
    final perms = _FakePermissionCoordinator();

    await tester.pumpWidget(buildTestApp(fakeApi: api, fakePerms: perms));
    await tester.pumpAndSettle();

    expect(find.text('Calm, transparent office commutes.'), findsOneWidget);
    expect(perms.locationRequests, 0);
    expect(perms.notificationRequests, 0);

    final enableBtn = find.text('Enable Ride Alerts & Continue');
    await tester.ensureVisible(enableBtn);
    await tester.tap(enableBtn);
    await tester.pumpAndSettle();

    expect(perms.notificationRequests, 1);
    expect(perms.locationRequests, 0);
    expect(find.text('NEXT ASSIGNED RIDE'), findsOneWidget);
    expect(find.text('4829'), findsOneWidget);
    expect(find.text('NO LIVE SIGNAL · Schedule ETA'), findsOneWidget);
  });

  testWidgets('Home actions, Running Late sheet, Privacy-masked Timeline, SOS, and OfflineBanner work', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    final api = _FakeEmployeeApi();
    final perms = _FakePermissionCoordinator();

    await tester.pumpWidget(
      buildTestApp(
        fakeApi: api,
        fakePerms: perms,
        initialOnboardingCompleted: true,
        connectivity: const [ConnectivityResult.none],
      ),
    );
    await tester.pumpAndSettle();

    // Offline banner is visible while cached schedule renders cleanly
    expect(find.byType(OfflineBanner), findsOneWidget);
    expect(find.text('Aarav Sharma'), findsOneWidget);

    // Trigger Running Late sheet & submit +15 min
    await tester.ensureVisible(find.text('Running Late'));
    await tester.tap(find.text('Running Late'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('+15 min'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Notify Driver (+15 min)'));
    await tester.pumpAndSettle();
    expect(api.lastRunningLateTripId, 'trip-1');
    expect(api.lastRunningLateMinutes, 15);

    // Wait for floating SnackBar confirmation to dismiss cleanly
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();

    // Open live route & stop timeline -> verifies masked peer stop + unmasked personal stop
    await tester.ensureVisible(find.text('Open Live Route & Stop Timeline'));
    await tester.tap(find.text('Open Live Route & Stop Timeline'));
    await tester.pumpAndSettle();
    expect(find.text('Pickup Stop #1'), findsOneWidget);
    expect(find.text('Your Pickup · Home - Kukatpally Metro'), findsOneWidget);
    expect(find.text('Campus · Gachibowli Campus'), findsOneWidget);

    // Navigate to Safety tab & trigger SOS confirmation flow
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -650));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open Emergency SOS Center'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -350));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Trigger Emergency SOS'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Trigger SOS Now'));
    await tester.pumpAndSettle();
    expect(api.lastSosTripId, 'trip-1');
    expect(perms.locationRequests, 1);
    expect(find.text('SOS Logged · CRITICAL'), findsOneWidget);
  });

  testWidgets('Alerts mark-read, Book Ride modal, and Profile Dev Persona Switcher work', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    final api = _FakeEmployeeApi();
    final perms = _FakePermissionCoordinator();

    await tester.pumpWidget(
      buildTestApp(
        fakeApi: api,
        fakePerms: perms,
        initialOnboardingCompleted: true,
      ),
    );
    await tester.pumpAndSettle();

    // Open Book Ride bottom sheet & submit tomorrow morning login ride
    await tester.tap(find.text('Book Ride'));
    await tester.pumpAndSettle();
    expect(find.text('Book Shift Commute'), findsOneWidget);
    await tester.ensureVisible(find.text('Submit Ride Request'));
    await tester.tap(find.text('Submit Ride Request'));
    await tester.pumpAndSettle();

    // Switch to Rides tab, verify Trips & Bookings segment views + Cannot Board modal
    await tester.tap(find.text('Rides'));
    await tester.pumpAndSettle();
    expect(find.text('Stop #2 · Home - Kukatpally Metro'), findsOneWidget);
    await tester.tap(find.text('Bookings'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cannot Board'));
    await tester.pumpAndSettle();
    expect(find.text('Cannot Board Ride?'), findsOneWidget);
    await tester.tap(find.text('Confirm Cannot Board'));
    await tester.pumpAndSettle();

    // Open Alerts tab & mark notification read
    await tester.tap(find.text('Alerts'));
    await tester.pumpAndSettle();
    expect(find.text('Cab Dispatched · TRP-20261120-01'), findsOneWidget);
    await tester.tap(find.text('Cab Dispatched · TRP-20261120-01'));
    await tester.pumpAndSettle();
    expect(api.unreadCalls, 1);

    // Switch persona on Profile tab to Priya Nair
    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -450));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Priya Nair'));
    await tester.pumpAndSettle();
    expect(find.text('EMP-1002 · Customer Ops'), findsOneWidget);
  });

  testWidgets('Tablet width switches shell cleanly to NavigationRail', (tester) async {
    tester.view.physicalSize = const Size(900, 1100);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(
      buildTestApp(
        fakeApi: _FakeEmployeeApi(),
        fakePerms: _FakePermissionCoordinator(),
        initialOnboardingCompleted: true,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });

  testWidgets('TripDetailScreen displays live cab telemetry ETA and pauses cleanly when stale', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final fakeApi = _FakeEmployeeApi();
    fakeApi.overrideGps = GpsTelemetry(
      latitude: 17.4486,
      longitude: 78.3908,
      accuracyM: 18,
      speedMps: 8.5,
      headingDeg: 135,
      recordedAt: DateTime.now().subtract(const Duration(seconds: 6)),
      ageSeconds: 6,
      isStale: false,
      etaMinutes: 6,
    );

    await tester.pumpWidget(
      ProviderScope(
        key: const ValueKey('emp_live_gps'),
        overrides: [
          employeeApiProvider.overrideWithValue(fakeApi),
          permissionCoordinatorProvider.overrideWithValue(_FakePermissionCoordinator()),
          appNotificationCoordinatorProvider.overrideWithValue(
            const NoopAppNotificationCoordinator(),
          ),
          commuteCacheProvider.overrideWithValue(CommuteCacheStore(enableDiskPersistence: false)),
          realtimeSyncProvider.overrideWithValue(RealtimeSyncService(enabled: false)),
          enableMapTilesProvider.overrideWithValue(false),
          onboardingStateProvider.overrideWithValue(OnboardingState(true)),
          connectivityStreamProvider.overrideWith((_) => Stream.value(const [ConnectivityResult.wifi])),
          liveTelemetryCacheProvider.overrideWith(() {
            final n = _SeededTelemetryNotifier(fakeApi.overrideGps!);
            return n;
          }),
        ],
        child: const EmployeeApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Open Live Route & Stop Timeline'));
    await tester.tap(find.text('Open Live Route & Stop Timeline'));
    await tester.pumpAndSettle();

    expect(find.text('Trip Execution & Timeline'), findsOneWidget);
    expect(find.text('Est. ~6 min'), findsOneWidget);
    expect(find.text('Cab'), findsOneWidget);
    expect(find.textContaining('Pickup Stop #1'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Phase 6 schedules pre-pickup reminder, marks all alerts read, shows driver delay, and appeals No-Show',
    (tester) async {
      tester.view.physicalSize = const Size(412, 915);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      final fakeApi = _FakeEmployeeApi()
        ..scheduledPickupOverride = DateTime.now().add(const Duration(minutes: 45));
      final fakePerms = _FakePermissionCoordinator();
      final fakeNotifs = _FakeAppNotificationCoordinator();

      await tester.pumpWidget(
        buildTestApp(
          fakeApi: fakeApi,
          fakePerms: fakePerms,
          fakeNotifs: fakeNotifs,
          initialOnboardingCompleted: true,
        ),
      );
      await tester.pumpAndSettle();

      expect(fakeNotifs.scheduledTripIds, contains('trip-1'));

      // Alerts tab -> Mark all read
      await tester.tap(find.text('Alerts'));
      await tester.pumpAndSettle();
      expect(find.text('Mark all read'), findsOneWidget);
      await tester.tap(find.text('Mark all read'));
      await tester.pumpAndSettle();
      expect(fakeApi.markAllReadCalls, 1);
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();

      // Update mock state to NO_SHOW + 4-minute driver delay & open TripDetailScreen
      fakeApi.passengerStatusOverride = 'NO_SHOW';
      fakeApi.arrivalDelaySecondsOverride = 240;

      await tester.tap(find.text('Home'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Open Live Route & Stop Timeline'));
      await tester.tap(find.text('Open Live Route & Stop Timeline'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Driver Delayed · Running ~4 min behind schedule'), findsOneWidget);
      await tester.drag(find.byType(Scrollable).last, const Offset(0, -700));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Appeal No-Show'));
      await tester.pumpAndSettle();

      expect(find.text('Appeal No-Show Record'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Cab stopped at opposite gate B');
      await tester.tap(find.text('Submit Appeal'));
      await tester.pumpAndSettle();

      expect(fakeApi.lastAppealTripId, 'trip-1');
      expect(fakeApi.lastAppealNote, 'Cab stopped at opposite gate B');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Dynamic TimePreferenceSelector updates copy/icons for Home->Office vs Office->Home and handles 1.5x text scale without overflow',
    (tester) async {
      tester.view.physicalSize = const Size(340, 820);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      String currentDirection = 'LOGIN';
      BookingTimePreference currentPref = BookingTimePreference.pickupAt;

      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(1.5)),
            child: Scaffold(
              body: StatefulBuilder(
                builder: (context, setState) {
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        Wrap(
                          spacing: 8,
                          children: [
                            TextButton(
                              onPressed: () => setState(() => currentDirection = 'LOGIN'),
                              child: const Text('Set LOGIN'),
                            ),
                            TextButton(
                              onPressed: () => setState(() => currentDirection = 'LOGOUT'),
                              child: const Text('Set LOGOUT'),
                            ),
                          ],
                        ),
                        TimePreferenceSelector(
                          direction: currentDirection,
                          selected: currentPref,
                          onChanged: (next) => setState(() => currentPref = next),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      );

      // Default LOGIN + PICKUP_AT
      expect(find.text('Pick me up from home around'), findsOneWidget);
      expect(find.byIcon(Icons.home_outlined), findsAtLeastNWidgets(1));

      // Slide to ARRIVE_BY on LOGIN
      await tester.tap(find.byKey(const Key('time_pref_arrive_by')));
      await tester.pumpAndSettle();
      expect(find.text('Get me to the office by'), findsOneWidget);
      expect(find.byIcon(Icons.business_center_outlined), findsAtLeastNWidgets(1));

      // Switch direction to LOGOUT (Office -> Home) while ARRIVE_BY stays active
      await tester.tap(find.text('Set LOGOUT'));
      await tester.pumpAndSettle();
      expect(find.text('Get me home by'), findsOneWidget);
      expect(find.byIcon(Icons.home_work_outlined), findsAtLeastNWidgets(1));

      // Slide back to PICKUP_AT on LOGOUT
      await tester.tap(find.byKey(const Key('time_pref_pickup_at')));
      await tester.pumpAndSettle();
      expect(find.text('Pick me up from the office around'), findsOneWidget);
      expect(find.byIcon(Icons.business_outlined), findsAtLeastNWidgets(1));

      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Book Ride sheet supports WEEKLY recurring ARRIVE_BY booking preview/submit and Rides Series tab',
    (tester) async {
      tester.view.physicalSize = const Size(412, 915);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      final fakeApi = _FakeEmployeeApi();
      await tester.pumpWidget(
        buildTestApp(
          fakeApi: fakeApi,
          fakePerms: _FakePermissionCoordinator(),
          initialOnboardingCompleted: true,
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Book Ride'));
      await tester.pumpAndSettle();

      // Switch timing selector to ARRIVE_BY ("Get me to the office by")
      await tester.tap(find.byKey(const Key('time_pref_arrive_by')));
      await tester.pumpAndSettle();
      expect(find.text('Get me to the office by'), findsOneWidget);

      // Select Weekly duration
      await tester.ensureVisible(find.text('Weekly'));
      await tester.tap(find.text('Weekly'));
      await tester.pumpAndSettle();

      // Preview schedule dates cleanly
      await tester.ensureVisible(find.text('Preview Dates & Calculated Pickup'));
      await tester.tap(find.text('Preview Dates & Calculated Pickup'));
      await tester.pumpAndSettle();
      expect(find.textContaining('5/5 valid date(s)'), findsOneWidget);

      // Confirm recurring series submission
      await tester.ensureVisible(find.text('Confirm Recurring Series'));
      await tester.tap(find.text('Confirm Recurring Series'));
      await tester.pumpAndSettle();
      expect(fakeApi.lastSeriesRecurrence, 'WEEKLY');
      expect(fakeApi.lastSeriesTimePreference, 'ARRIVE_BY');

      // Open Rides -> Series tab & cancel series
      await tester.tap(find.text('Rides'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Series'));
      await tester.pumpAndSettle();
      expect(find.text('WEEKLY · Home -> Office'), findsOneWidget);
      await tester.tap(find.text('Cancel Series'));
      await tester.pumpAndSettle();
      expect(fakeApi.seriesCancelled, isTrue);
      expect(tester.takeException(), isNull);
    },
  );
}

class _SeededTelemetryNotifier extends LiveTelemetryCacheNotifier {
  _SeededTelemetryNotifier(this.initial);

  final GpsTelemetry initial;

  @override
  Map<String, GpsTelemetry> build() => {'trip-1': initial};
}
