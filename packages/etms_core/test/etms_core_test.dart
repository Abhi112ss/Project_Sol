import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'package:etms_core/etms_core.dart';

void main() {
  Widget wrap(Widget child, {bool disableAnimations = false}) {
    return MediaQuery(
      data: MediaQueryData(disableAnimations: disableAnimations),
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );
  }

  test('ColorTokens and TypographyTokens maintain Harbor Pilot baseline', () {
    final theme = AppTheme.light();
    expect(theme.scaffoldBackgroundColor, ColorTokens.canvas);
    expect(theme.colorScheme.primary, ColorTokens.primary);
    expect(TypographyTokens.otpHero.fontFeatures, isNotEmpty);
  });

  testWidgets('PrimaryButton and SecondaryButton meet >=48dp touch height', (tester) async {
    var tapped = 0;
    await tester.pumpWidget(
      wrap(
        Column(
          children: [
            PrimaryButton(
              label: 'Book Shift Ride',
              icon: Icons.add_rounded,
              onPressed: () => tapped++,
            ),
            const SizedBox(height: 12),
            SecondaryButton(
              label: 'Running Late',
              onPressed: () => tapped++,
            ),
          ],
        ),
      ),
    );

    final primarySize = tester.getSize(find.byType(PrimaryButton).first);
    final secondarySize = tester.getSize(find.byType(SecondaryButton).first);
    expect(primarySize.height, greaterThanOrEqualTo(48));
    expect(secondarySize.height, greaterThanOrEqualTo(48));

    await tester.tap(find.text('Book Shift Ride'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Running Late'));
    await tester.pumpAndSettle();
    expect(tapped, 2);

    // Loading state renders inline progress indicator and disables interaction.
    await tester.pumpWidget(
      wrap(
        PrimaryButton(
          label: 'Submitting',
          isLoading: true,
          onPressed: () => tapped++,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 60));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.tap(find.text('Submitting'));
    await tester.pump(const Duration(milliseconds: 60));
    expect(tapped, 2);
  });

  testWidgets('GPSStatusIndicator reflects live, stale, and missing telemetry truthfully', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrap(
        Column(
          children: [
            GPSStatusIndicator.fromTelemetry(ageSeconds: 12, isStale: false),
            GPSStatusIndicator.fromTelemetry(ageSeconds: 185, isStale: true),
            GPSStatusIndicator.fromTelemetry(ageSeconds: null, isStale: false),
          ],
        ),
      ),
    );

    expect(find.text('LIVE GPS · 12s ago'), findsOneWidget);
    expect(find.text('STALE SIGNAL · 3m ago'), findsOneWidget);
    expect(find.text('NO LIVE SIGNAL · Schedule ETA'), findsOneWidget);
  });

  testWidgets('StatusBadge, OfflineBanner, cards and state views render properly', (tester) async {
    var retried = false;
    await tester.pumpWidget(
      wrap(
        Column(
          children: [
            OfflineBanner(isOffline: true, onRetry: () => retried = true),
            StatusBadge.fromStatus('PENDING_APPROVAL'),
            StatusBadge.fromStatus('IN_PROGRESS'),
            const TripCard(
              tripCode: 'TRP-20261117-01',
              travelDate: '2026-11-17',
              direction: 'LOGIN',
              status: 'ASSIGNED',
              shiftLabel: '09:00 Morning',
              pickupLabel: 'Home - Kukatpally Metro',
              officeLabel: 'Gachibowli Campus',
              driverSummary: 'Ramesh Babu',
              vehicleSummary: 'TS 07 UA 4821',
            ),
            const PassengerCard(
              sequenceNo: 1,
              title: 'Stop #1 · Your Pickup',
              subtitle: 'KPHB Phase 1',
              status: 'SCHEDULED',
              isHighlighted: true,
              delayNote: 'Running +5m late',
            ),
            const VehicleCard(
              registrationNo: 'TS 07 UA 4821',
              modelName: 'Maruti Dzire Tour S',
              vehicleType: 'SEDAN',
              seatingCapacity: 4,
            ),
            DriverCard(
              driverName: 'Ramesh Babu',
              vehicleRegistration: 'TS 07 UA 4821',
              vehicleModel: 'Maruti Dzire Tour S',
              onCallPressed: () {},
            ),
            const NotificationTile(
              title: 'Trip Dispatched',
              body: 'Driver assigned for tomorrow.',
              category: 'TRIP_DISPATCHED',
              timestampLabel: '2m ago',
              isRead: false,
            ),
            EmptyState(
              title: 'No upcoming rides',
              message: 'Book a shift ride to get scheduled.',
              actionLabel: 'Book Ride',
              onAction: () {},
            ),
            ErrorState(
              title: 'Network error',
              message: 'Could not reach dispatch API.',
              errorCode: 'NET_TIMEOUT',
              onRetry: () {},
            ),
            const LoadingState(cardCount: 1),
          ],
        ),
        disableAnimations: true,
      ),
    );

    expect(find.text('Pending Approval'), findsOneWidget);
    expect(find.text('In Transit'), findsOneWidget);
    expect(find.text('TS 07 UA 4821'), findsOneWidget);
    expect(find.text('Trip Dispatched'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    expect(retried, isTrue);
  });

  test('normalizeSolApiBaseUrl and buildSolWebSocketUri handle LAN and USB hosts cleanly', () {
    expect(
      normalizeSolApiBaseUrl('192.168.31.210:3001'),
      'http://192.168.31.210:3001/api/v1',
    );
    expect(
      normalizeSolApiBaseUrl('https://transit.example.com/api/v1/'),
      'https://transit.example.com/api/v1',
    );
    expect(normalizeSolApiBaseUrl(''), isNull);

    final wsUri = buildSolWebSocketUri('http://192.168.31.210:3001/api/v1');
    expect(wsUri.scheme, 'ws');
    expect(wsUri.host, '192.168.31.210');
    expect(wsUri.port, 3001);
    expect(wsUri.path, '/socket.io/');
  });
}
