import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../features/home/home_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/onboarding/permission_onboarding_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/rides/rides_screen.dart';
import '../../features/rides/trip_detail_screen.dart';
import '../../features/safety/safety_screen.dart';
import '../../features/shell/employee_shell.dart';
import '../state/employee_providers.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'rootNav');

final appRouterProvider = Provider<GoRouter>((ref) {
  final onboardingState = ref.watch(onboardingStateProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: onboardingState.value ? '/home' : '/onboarding/permissions',
    refreshListenable: onboardingState,
    redirect: (context, state) {
      final completed = onboardingState.value;
      final atOnboarding = state.matchedLocation == '/onboarding/permissions';
      if (!completed && !atOnboarding) {
        return '/onboarding/permissions';
      }
      if (completed && atOnboarding) {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/onboarding/permissions',
        builder: (context, state) => const PermissionOnboardingScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return EmployeeShell(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home',
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/rides',
                builder: (context, state) => const RidesScreen(),
                routes: [
                  GoRoute(
                    path: 'trip/:tripId',
                    parentNavigatorKey: _rootNavigatorKey,
                    builder: (context, state) {
                      final tripId = state.pathParameters['tripId']!;
                      return TripDetailScreen(tripId: tripId);
                    },
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/notifications',
                builder: (context, state) => const NotificationsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/safety',
                builder: (context, state) => const SafetyScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/profile',
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

