import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/state/driver_providers.dart';

/// Focused 2-tab stationary-safe shell (`Today`, `History & Sync`) avoiding
/// cluttered chrome for active cab drivers (`DESIGN_SYSTEM.md` Deliverable 7).
class DriverShell extends ConsumerWidget {
  const DriverShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Keep auto-sync listener active whenever shell is mounted
    ref.watch(driverSyncCoordinatorProvider);
    ref.watch(driverNotificationBridgeProvider);
    final isOffline = ref.watch(driverIsOfflineProvider);
    final pendingEvents = ref.watch(pendingOfflineEventsProvider).asData?.value ?? const [];
    final useRail = MediaQuery.sizeOf(context).width >= 600;

    final pendingBadgeIcon = Badge(
      isLabelVisible: pendingEvents.isNotEmpty,
      label: Text('${pendingEvents.length}'),
      child: const Icon(Icons.sync_alt_rounded),
    );

    final offlineBanner = OfflineBanner(
      isOffline: isOffline || pendingEvents.isNotEmpty,
      message: isOffline
          ? 'Offline · ${pendingEvents.length} event(s) queued safely. Auto-syncs when reconnected.'
          : 'Reconnected · ${pendingEvents.length} queued event(s) awaiting sync.',
      onRetry: isOffline
          ? null
          : () => ref.read(driverSyncCoordinatorProvider).flushPendingEvents(),
    );

    void onDestTap(int idx) {
      HarborMotion.hapticSelection();
      navigationShell.goBranch(idx, initialLocation: idx == navigationShell.currentIndex);
    }

    if (useRail) {
      return Scaffold(
        body: Column(
          children: [
            offlineBanner,
            Expanded(
              child: Row(
                children: [
                  NavigationRail(
                    selectedIndex: navigationShell.currentIndex,
                    onDestinationSelected: onDestTap,
                    labelType: NavigationRailLabelType.all,
                    destinations: [
                      const NavigationRailDestination(
                        icon: Icon(Icons.directions_car_outlined),
                        selectedIcon: Icon(Icons.directions_car_rounded),
                        label: Text('Duty'),
                      ),
                      NavigationRailDestination(
                        icon: pendingBadgeIcon,
                        selectedIcon: pendingBadgeIcon,
                        label: const Text('History & Sync'),
                      ),
                    ],
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
          offlineBanner,
          Expanded(child: navigationShell),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: ColorTokens.borderSubtle, width: 1)),
        ),
        child: NavigationBar(
          selectedIndex: navigationShell.currentIndex,
          onDestinationSelected: onDestTap,
          destinations: [
            const NavigationDestination(
              icon: Icon(Icons.directions_car_outlined),
              selectedIcon: Icon(Icons.directions_car_rounded),
              label: "Today's Duty",
            ),
            NavigationDestination(
              icon: pendingBadgeIcon,
              selectedIcon: pendingBadgeIcon,
              label: 'History & Sync',
            ),
          ],
        ),
      ),
    );
  }
}

