import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/state/employee_providers.dart';

/// Adaptive Material 3 app shell (`NavigationBar` on phones <600dp,
/// `NavigationRail` on tablets/foldables >=600dp) paired with persistent
/// offline telemetry banner.
class EmployeeShell extends ConsumerWidget {
  const EmployeeShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  void _onDestinationSelected(int index) {
    HarborMotion.hapticSelection();
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(employeeNotificationBridgeProvider);
    final isOffline = ref.watch(isOfflineProvider);
    final unreadCount = ref.watch(unreadNotificationsCountProvider);
    final useRail = MediaQuery.sizeOf(context).width >= 600;

    final alertBadgeIcon = Badge(
      isLabelVisible: unreadCount > 0,
      label: Text(unreadCount > 99 ? '99+' : '$unreadCount'),
      child: const Icon(Icons.notifications_outlined),
    );
    final alertSelectedIcon = Badge(
      isLabelVisible: unreadCount > 0,
      label: Text(unreadCount > 99 ? '99+' : '$unreadCount'),
      child: const Icon(Icons.notifications_rounded),
    );

    final destinations = [
      const NavigationDestination(
        icon: Icon(Icons.home_outlined),
        selectedIcon: Icon(Icons.home_rounded),
        label: 'Home',
      ),
      const NavigationDestination(
        icon: Icon(Icons.directions_car_outlined),
        selectedIcon: Icon(Icons.directions_car_rounded),
        label: 'Rides',
      ),
      NavigationDestination(
        icon: alertBadgeIcon,
        selectedIcon: alertSelectedIcon,
        label: 'Alerts',
      ),
      const NavigationDestination(
        icon: Icon(Icons.shield_outlined),
        selectedIcon: Icon(Icons.shield_rounded),
        label: 'Safety',
      ),
      const NavigationDestination(
        icon: Icon(Icons.person_outline_rounded),
        selectedIcon: Icon(Icons.person_rounded),
        label: 'Profile',
      ),
    ];

    final railDestinations = [
      const NavigationRailDestination(
        icon: Icon(Icons.home_outlined),
        selectedIcon: Icon(Icons.home_rounded),
        label: Text('Home'),
      ),
      const NavigationRailDestination(
        icon: Icon(Icons.directions_car_outlined),
        selectedIcon: Icon(Icons.directions_car_rounded),
        label: Text('Rides'),
      ),
      NavigationRailDestination(
        icon: alertBadgeIcon,
        selectedIcon: alertSelectedIcon,
        label: const Text('Alerts'),
      ),
      const NavigationRailDestination(
        icon: Icon(Icons.shield_outlined),
        selectedIcon: Icon(Icons.shield_rounded),
        label: Text('Safety'),
      ),
      const NavigationRailDestination(
        icon: Icon(Icons.person_outline_rounded),
        selectedIcon: Icon(Icons.person_rounded),
        label: Text('Profile'),
      ),
    ];

    final offlineStrip = OfflineBanner(
      isOffline: isOffline,
      onRetry: () {
        ref.invalidate(upcomingTripProvider);
        ref.invalidate(employeeBookingsProvider);
        ref.invalidate(notificationsProvider);
      },
    );

    if (useRail) {
      return Scaffold(
        body: Column(
          children: [
            offlineStrip,
            Expanded(
              child: Row(
                children: [
                  NavigationRail(
                    selectedIndex: navigationShell.currentIndex,
                    onDestinationSelected: _onDestinationSelected,
                    labelType: NavigationRailLabelType.all,
                    destinations: railDestinations,
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(child: navigationShell),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      body: Column(
        children: [
          offlineStrip,
          Expanded(child: navigationShell),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: ColorTokens.borderSubtle, width: 1)),
        ),
        child: NavigationBar(
          selectedIndex: navigationShell.currentIndex,
          onDestinationSelected: _onDestinationSelected,
          destinations: destinations,
        ),
      ),
    );
  }
}

