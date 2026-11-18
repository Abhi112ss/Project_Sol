import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/config/driver_config.dart';
import '../../core/state/driver_providers.dart';
import '../../core/utils/driver_formatters.dart';

class HistoryAndSyncScreen extends ConsumerWidget {
  const HistoryAndSyncScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tripsAsync = ref.watch(driverTripsProvider);
    final pendingAsync = ref.watch(pendingOfflineEventsProvider);
    final pendingGpsAsync = ref.watch(pendingGpsSamplesCountProvider);
    final telemetry = ref.watch(driverTelemetryProvider);
    final lastSyncAsync = ref.watch(lastSyncTimestampProvider);
    final permAsync = ref.watch(driverPermissionSnapshotProvider);

    final pending = pendingAsync.asData?.value ?? const [];
    final pendingGpsCount = pendingGpsAsync.asData?.value ?? telemetry.pendingSampleCount;
    final totalQueued = pending.length + pendingGpsCount;
    final lastSync = lastSyncAsync.asData?.value;

    return Scaffold(
      appBar: AppBar(title: const Text('History & Offline Sync')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(driverTripsProvider);
          ref.invalidate(pendingOfflineEventsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 680),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: ColorTokens.surface,
                        borderRadius: const BorderRadius.all(Radius.circular(16)),
                        border: Border.all(color: ColorTokens.borderSubtle),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Drift SQLite Offline Sync Queue',
                                  style: TypographyTokens.cardTitle,
                                ),
                              ),
                              StatusBadge(
                                label: totalQueued == 0 ? 'Synced' : '$totalQueued Queued',
                                tone: totalQueued == 0 ? StatusTone.success : StatusTone.warning,
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            lastSync != null
                                ? 'Last synchronized at ${DriverFormatters.timeHm(lastSync)} · ${pending.length} event(s), $pendingGpsCount GPS fix(es)'
                                : 'All online actions sync immediately · $pendingGpsCount queued GPS fix(es).',
                            style: TypographyTokens.bodyMuted,
                          ),
                          const SizedBox(height: 12),
                          SecondaryButton(
                            label: 'Sync Queued Events Now',
                            icon: Icons.sync_rounded,
                            fullWidth: true,
                            onPressed: () async {
                              final eventCount = await ref
                                  .read(driverSyncCoordinatorProvider)
                                  .flushPendingEvents();
                              final gpsCount = await ref
                                  .read(driverTelemetryProvider.notifier)
                                  .flushPendingSamples();
                              final totalCount = eventCount + gpsCount;
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(
                                      totalCount > 0
                                          ? 'Synchronized $eventCount event(s) & $gpsCount GPS fix(es).'
                                          : 'Offline queue already up to date.',
                                    ),
                                  ),
                                );
                              }
                            },
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    permAsync.when(
                      loading: () => const SizedBox.shrink(),
                      error: (_, _) => const SizedBox.shrink(),
                      data: (snap) => Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: ColorTokens.surface,
                          borderRadius: const BorderRadius.all(Radius.circular(16)),
                          border: Border.all(color: ColorTokens.borderSubtle),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Duty Privacy & Permissions', style: TypographyTokens.cardTitle),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                const Expanded(
                                  child: Text('Foreground Trip Tracking', style: TypographyTokens.body),
                                ),
                                StatusBadge(
                                  label: snap.foregroundDutyActive ? 'Active on Duty' : 'Stopped (Off Duty)',
                                  tone: snap.foregroundDutyActive
                                      ? StatusTone.info
                                      : StatusTone.success,
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            SecondaryButton(
                              label: 'Open System Settings',
                              icon: Icons.settings_outlined,
                              fullWidth: true,
                              onPressed: () =>
                                  ref.read(driverPermissionCoordinatorProvider).openSystemSettings(),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    ServerEndpointCard(
                      currentUrl: ref.watch(driverApiBaseUrlProvider),
                      onConfigurePressed: () async {
                        final choice = await showServerEndpointDialog(
                          context,
                          currentUrl: ref.read(driverApiBaseUrlProvider),
                          defaultUrl: DriverConfig.defaultApiBaseUrl,
                        );
                        if (choice == null) return;
                        await ref
                            .read(driverApiBaseUrlProvider.notifier)
                            .setEndpoint(choice.resetToDefault ? null : choice.url);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                'Backend switched to ${ref.read(driverApiBaseUrlProvider)}',
                              ),
                            ),
                          );
                        }
                      },
                    ),
                    const SizedBox(height: 18),
                    const Text('Completed & Past Duty Trips', style: TypographyTokens.cardTitle),
                    const SizedBox(height: 10),
                    tripsAsync.when(
                      loading: () => const LoadingState(cardCount: 2),
                      error: (err, _) => ErrorState(
                        title: 'Could not load trip history',
                        message: err.toString(),
                        onRetry: () => ref.invalidate(driverTripsProvider),
                      ),
                      data: (items) {
                        final past = items.where((t) => !t.isActiveOrAssigned).toList();
                        if (past.isEmpty) {
                          return const EmptyState(
                            icon: Icons.history_rounded,
                            title: 'No completed duty trips yet',
                            message: 'Finished shift trips will appear here after completion.',
                          );
                        }
                        return Column(
                          children: [
                            for (var i = 0; i < past.length; i++) ...[
                              TripCard(
                                tripCode: past[i].tripCode,
                                travelDate: past[i].travelDate,
                                direction: past[i].direction,
                                status: past[i].status,
                                shiftLabel: '${past[i].shiftTimeLocal} ${past[i].shiftName}',
                                pickupLabel:
                                    '${past[i].stopsCount} stops · ${past[i].passengersCount} passenger(s)',
                                officeLabel: past[i].officeName,
                                vehicleSummary: past[i].vehicleRegistrationNo,
                              ),
                              if (i < past.length - 1) const SizedBox(height: 10),
                            ],
                          ],
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

