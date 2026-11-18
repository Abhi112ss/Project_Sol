import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../features/active_trip/active_trip_console_screen.dart';
import '../../features/history/history_and_sync_screen.dart';
import '../../features/onboarding/driver_onboarding_screen.dart';
import '../../features/shell/driver_shell.dart';
import '../../features/today/commute_schedule_screen.dart';
import '../../features/today/today_duty_screen.dart';
import '../../features/today/trip_preview_screen.dart';
import '../state/driver_providers.dart';

final _driverRootKey = GlobalKey<NavigatorState>(debugLabel: 'driverRootNav');

final driverRouterProvider = Provider<GoRouter>((ref) {
  final onboardingState = ref.watch(driverOnboardingStateProvider);

  return GoRouter(
    navigatorKey: _driverRootKey,
    initialLocation: onboardingState.value ? '/today' : '/onboarding/permissions',
    refreshListenable: onboardingState,
    redirect: (context, state) {
      final done = onboardingState.value;
      final atOnboarding = state.matchedLocation == '/onboarding/permissions';
      if (!done && !atOnboarding) return '/onboarding/permissions';
      if (done && atOnboarding) return '/today';
      return null;
    },
    routes: [
      GoRoute(
        path: '/onboarding/permissions',
        builder: (context, state) => const DriverOnboardingScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => DriverShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/today',
                builder: (context, state) => const TodayDutyScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/history',
                builder: (context, state) => const HistoryAndSyncScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/commutes/:commuteId',
        parentNavigatorKey: _driverRootKey,
        builder: (context, state) {
          final commuteId = state.pathParameters['commuteId']!;
          return CommuteScheduleScreen(commuteId: commuteId);
        },
      ),
      GoRoute(
        path: '/trip/:tripId/preview',
        parentNavigatorKey: _driverRootKey,
        builder: (context, state) {
          final tripId = state.pathParameters['tripId']!;
          return TripPreviewScreen(tripId: tripId);
        },
      ),
      GoRoute(
        path: '/trip/:tripId/active',
        parentNavigatorKey: _driverRootKey,
        builder: (context, state) {
          final tripId = state.pathParameters['tripId']!;
          return ActiveTripConsoleScreen(tripId: tripId);
        },
      ),
    ],
  );
});

