import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/models/driver_models.dart';
import '../../core/state/driver_providers.dart';
import '../../core/utils/driver_formatters.dart';

class TodayDutyScreen extends ConsumerWidget {
  const TodayDutyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(driverProfileProvider);
    final overviewAsync = ref.watch(driverCommutesOverviewProvider);
    final permAsync = ref.watch(driverPermissionSnapshotProvider);

    final profile = profileAsync.asData?.value;
    final dutyGpsActive = permAsync.asData?.value.foregroundDutyActive ?? false;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'SolTransit Driver',
              style: TypographyTokens.label.copyWith(
                color: ColorTokens.primary,
                letterSpacing: 0.4,
              ),
            ),
            Text(profile?.fullName ?? "Today's Duty", style: TypographyTokens.sectionTitle),
          ],
        ),
        actions: [
          Builder(
            builder: (context) {
              final unread = ref.watch(driverUnreadNotificationsCountProvider);
              return IconButton(
                tooltip: 'Duty alerts',
                onPressed: () => _showDriverNotificationsSheet(context),
                icon: Badge(
                  isLabelVisible: unread > 0,
                  label: Text(unread > 99 ? '99+' : '$unread'),
                  child: const Icon(Icons.notifications_outlined),
                ),
              );
            },
          ),
          IconButton(
            tooltip: 'Refresh duty queue',
            onPressed: () {
              ref.invalidate(driverProfileProvider);
              ref.invalidate(driverCommutesOverviewProvider);
              ref.invalidate(driverCommuteCalendarProvider);
              ref.invalidate(driverTripsProvider);
              ref.invalidate(driverNotificationsProvider);
            },
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(driverProfileProvider);
          ref.invalidate(driverCommutesOverviewProvider);
          ref.invalidate(driverCommuteCalendarProvider);
          ref.invalidate(driverTripsProvider);
          await ref.read(driverCommutesOverviewProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 680),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (profile != null) ...[
                      VehicleCard(
                        registrationNo: profile.vehicleRegistrationNo ?? 'No Assigned Cab',
                        modelName: profile.vehicleModelName ?? profile.vendorName ?? 'Fleet Unit',
                        vehicleType: profile.vehicleType,
                        seatingCapacity: profile.seatingCapacity,
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: Align(
                              alignment: Alignment.centerLeft,
                              child: GPSStatusIndicator(
                                freshness:
                                    dutyGpsActive ? GpsFreshness.live : GpsFreshness.unavailable,
                                ageSeconds: dutyGpsActive ? 2 : null,
                                compact: false,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          StatusBadge.fromStatus(profile.availabilityStatus),
                        ],
                      ),
                      const SizedBox(height: 16),
                    ],
                    overviewAsync.when(
                      loading: () => const LoadingState(cardCount: 2, cardHeight: 145),
                      error: (err, _) => ErrorState(
                        title: 'Could not load duty schedule',
                        message: err.toString(),
                        onRetry: () => ref.invalidate(driverCommutesOverviewProvider),
                      ),
                      data: (overview) {
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Expanded(
                                  child: Text("Today's Target", style: TypographyTokens.cardTitle),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: overview.todayTargets.isNotEmpty
                                        ? ColorTokens.primarySoft
                                        : ColorTokens.surfaceMuted,
                                    borderRadius: const BorderRadius.all(Radius.circular(999)),
                                  ),
                                  child: Text(
                                    '${overview.todayDate} · ${overview.todayTargets.length}',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: overview.todayTargets.isNotEmpty
                                          ? ColorTokens.primaryPressed
                                          : ColorTokens.inkMuted,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            if (overview.todayTargets.isEmpty)
                              const EmptyState(
                                icon: Icons.today_rounded,
                                title: 'No commute targets scheduled for today',
                                message:
                                    'Runs you need to attend today (or any active in-progress trip) appear here. Open any commute below to inspect your full schedule calendar.',
                              )
                            else
                              Column(
                                children: [
                                  for (var i = 0; i < overview.todayTargets.length; i++) ...[
                                    _TodayTargetTile(trip: overview.todayTargets[i]),
                                    if (i < overview.todayTargets.length - 1)
                                      const SizedBox(height: 12),
                                  ],
                                ],
                              ),
                            const SizedBox(height: 22),
                            Row(
                              children: [
                                const Expanded(
                                  child: Text('Assigned Commutes', style: TypographyTokens.cardTitle),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                  decoration: const BoxDecoration(
                                    color: ColorTokens.surfaceMuted,
                                    borderRadius: BorderRadius.all(Radius.circular(999)),
                                  ),
                                  child: Text(
                                    '${overview.commutes.length} commute(s)',
                                    style: TypographyTokens.label.copyWith(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            if (overview.commutes.isEmpty)
                              const EmptyState(
                                icon: Icons.check_circle_outline_rounded,
                                title: 'No assigned commutes',
                                message:
                                    'Dispatched commute routes assigned to your cab appear here as clean named schedule cards.',
                              )
                            else
                              Column(
                                children: [
                                  for (var i = 0; i < overview.commutes.length; i++) ...[
                                    _CommutePlanCard(commute: overview.commutes[i]),
                                    if (i < overview.commutes.length - 1)
                                      const SizedBox(height: 12),
                                  ],
                                ],
                              ),
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

class _TodayTargetTile extends StatelessWidget {
  const _TodayTargetTile({required this.trip});

  final DriverTripSummary trip;

  @override
  Widget build(BuildContext context) {
    final isInProgress = trip.status.toUpperCase() == 'IN_PROGRESS';

    return TripCard(
      tripCode: trip.tripCode,
      travelDate: trip.travelDate,
      direction: trip.direction,
      status: trip.status,
      shiftLabel: trip.commuteName != null && trip.commuteName!.isNotEmpty
          ? '${trip.commuteName} · ${trip.shiftTimeLocal}'
          : '${trip.shiftTimeLocal} ${trip.shiftName}',
      pickupLabel: '${trip.stopsCount} stops · ${trip.passengersCount} passenger(s)',
      officeLabel: trip.officeName,
      driverSummary: '${trip.pendingPassengersCount} pending',
      vehicleSummary: trip.vehicleRegistrationNo,
      trailing: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PrimaryButton(
            label: isInProgress ? 'Resume Active Console' : 'Review & Start Duty',
            icon: isInProgress ? Icons.play_circle_fill_rounded : Icons.route_rounded,
            onPressed: () {
              if (isInProgress) {
                context.push('/trip/${trip.id}/active');
              } else {
                context.push('/trip/${trip.id}/preview');
              }
            },
          ),
          if (trip.commuteId != null && trip.commuteId!.isNotEmpty) ...[
            const SizedBox(height: 6),
            TextButton.icon(
              onPressed: () =>
                  context.push('/commutes/${Uri.encodeComponent(trip.commuteId!)}'),
              icon: const Icon(Icons.calendar_month_rounded, size: 16),
              label: const Text('Open Commute Calendar'),
            ),
          ],
        ],
      ),
    );
  }
}

class _CommutePlanCard extends StatelessWidget {
  const _CommutePlanCard({required this.commute});

  final DriverCommuteCard commute;

  @override
  Widget build(BuildContext context) {
    final isLogin = commute.direction.toUpperCase() == 'LOGIN';
    final routeSummary = isLogin
        ? '${commute.localityName} -> ${commute.officeName}'
        : '${commute.officeName} -> ${commute.localityName}';

    return HarborPressable(
      onTap: () => context.push('/commutes/${Uri.encodeComponent(commute.commuteId)}'),
      borderRadius: const BorderRadius.all(Radius.circular(16)),
      semanticLabel: 'Open calendar schedule for ${commute.commuteName}',
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: ColorTokens.surface,
          borderRadius: const BorderRadius.all(Radius.circular(16)),
          border: Border.all(
            color: commute.hasInProgressTrip
                ? ColorTokens.primary
                : ColorTokens.borderSubtle,
            width: commute.hasInProgressTrip ? 1.5 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: isLogin ? ColorTokens.primarySoft : ColorTokens.surfaceMuted,
                    borderRadius: const BorderRadius.all(Radius.circular(8)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isLogin ? Icons.login_rounded : Icons.logout_rounded,
                        size: 14,
                        color: isLogin ? ColorTokens.primaryPressed : ColorTokens.inkSecondary,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        isLogin ? 'LOGIN' : 'LOGOUT',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: isLogin ? ColorTokens.primaryPressed : ColorTokens.inkSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    commute.shiftName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TypographyTokens.label.copyWith(fontWeight: FontWeight.w600),
                  ),
                ),
                if (commute.hasInProgressTrip)
                  StatusBadge.fromStatus('IN_PROGRESS')
                else
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: const BoxDecoration(
                      color: ColorTokens.primarySoft,
                      borderRadius: BorderRadius.all(Radius.circular(999)),
                    ),
                    child: Text(
                      '${commute.scheduledTripsCount} upcoming',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: ColorTokens.primaryPressed,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        commute.commuteName,
                        style: TypographyTokens.cardTitle,
                      ),
                      const SizedBox(height: 3),
                      Text(
                        routeSummary,
                        style: TypographyTokens.bodyMuted,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(
                  Icons.calendar_month_rounded,
                  color: ColorTokens.primary,
                  size: 22,
                ),
              ],
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: const BoxDecoration(
                color: ColorTokens.surfaceMuted,
                borderRadius: BorderRadius.all(Radius.circular(10)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.schedule_rounded, size: 14, color: ColorTokens.inkSecondary),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          '${commute.timePreferenceSummary} · ${commute.startDate} to ${commute.endDate}',
                          style: TypographyTokens.label.copyWith(
                            color: ColorTokens.inkPrimary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.event_available_rounded, size: 14, color: ColorTokens.primary),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Next run: ${commute.nextTripDate} · ${commute.nextTripStopsCount} stops · ${commute.nextTripPassengersCount} passenger(s)',
                          style: TypographyTokens.label.copyWith(color: ColorTokens.inkSecondary),
                        ),
                      ),
                      const Icon(
                        Icons.chevron_right_rounded,
                        size: 18,
                        color: ColorTokens.primary,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _showDriverNotificationsSheet(BuildContext context) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => const _DriverNotificationsSheet(),
  );
}

class _DriverNotificationsSheet extends ConsumerWidget {
  const _DriverNotificationsSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alertsAsync = ref.watch(driverNotificationsProvider);
    final unreadCount = ref.watch(driverUnreadNotificationsCountProvider);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.72,
      minChildSize: 0.45,
      maxChildSize: 0.92,
      builder: (context, scrollController) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text('Duty Alerts & Dispatch', style: TypographyTokens.sectionTitle),
                  ),
                  if (unreadCount > 0)
                    TextButton.icon(
                      onPressed: () async {
                        await ref.read(driverNotificationsProvider.notifier).markAllRead();
                      },
                      icon: const Icon(Icons.done_all_rounded, size: 18),
                      label: const Text('Mark all read'),
                    ),
                  IconButton(
                    tooltip: 'Close alerts',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Expanded(
                child: alertsAsync.when(
                  loading: () => const LoadingState(cardCount: 3),
                  error: (err, _) => ErrorState(
                    title: 'Could not load duty alerts',
                    message: err.toString(),
                    onRetry: () => ref.invalidate(driverNotificationsProvider),
                  ),
                  data: (items) {
                    if (items.isEmpty) {
                      return const EmptyState(
                        icon: Icons.notifications_none_rounded,
                        title: 'No duty alerts yet',
                        message:
                            'Trip dispatches, passenger cancellations, late notices, and SOS alerts appear here.',
                      );
                    }
                    return ListView.separated(
                      controller: scrollController,
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, i) {
                        final item = items[i];
                        return Card(
                          margin: EdgeInsets.zero,
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            onTap: item.isRead
                                ? null
                                : () => ref.read(driverNotificationsProvider.notifier).markRead(item.id),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      if (!item.isRead)
                                        Container(
                                          width: 8,
                                          height: 8,
                                          margin: const EdgeInsets.only(right: 8),
                                          decoration: const BoxDecoration(
                                            color: ColorTokens.primary,
                                            shape: BoxShape.circle,
                                          ),
                                        ),
                                      Expanded(
                                        child: Text(item.title, style: TypographyTokens.cardTitle),
                                      ),
                                      Text(
                                        DriverFormatters.timeHm(item.createdAt),
                                        style: TypographyTokens.telemetryTabular.copyWith(
                                          fontSize: 11.5,
                                          color: ColorTokens.inkMuted,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(item.body, style: TypographyTokens.bodyMuted),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

