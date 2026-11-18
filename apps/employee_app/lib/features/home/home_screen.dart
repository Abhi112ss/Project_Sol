import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/models/employee_models.dart';
import '../../core/state/employee_providers.dart';
import '../../core/utils/formatters.dart';
import '../rides/ride_action_sheets.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(employeeProfileProvider);
    final upcomingAsync = ref.watch(upcomingTripProvider);
    final bookingsAsync = ref.watch(employeeBookingsProvider);
    final locationsAsync = ref.watch(savedLocationsProvider);

    final profile = profileAsync.asData?.value;
    final persona = ref.watch(activePersonaProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'SolTransit',
              style: TypographyTokens.label.copyWith(
                color: ColorTokens.primary,
                letterSpacing: 0.4,
              ),
            ),
            Text(
              profile?.fullName ?? persona.name,
              style: TypographyTokens.sectionTitle,
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: HarborPressable(
              onTap: () => showBookRideSheet(context, ref),
              borderRadius: const BorderRadius.all(Radius.circular(12)),
              semanticLabel: 'Book shift commute',
              child: Container(
                height: 40,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: ColorTokens.primarySoft,
                  borderRadius: const BorderRadius.all(Radius.circular(12)),
                  border: Border.all(color: ColorTokens.primaryBorder),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add_rounded, size: 18, color: ColorTokens.primaryPressed),
                    SizedBox(width: 4),
                    Text(
                      'Book Ride',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: ColorTokens.primaryPressed,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(employeeProfileProvider);
          ref.invalidate(upcomingTripProvider);
          ref.invalidate(employeeBookingsProvider);
          ref.invalidate(savedLocationsProvider);
          await Future.wait([
            ref.read(upcomingTripProvider.future),
            ref.read(employeeProfileProvider.future),
          ]);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 680),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (profile != null) _CommuterIdentityBanner(profile: profile, locations: locationsAsync.asData?.value ?? const []),
                    const SizedBox(height: 16),
                    upcomingAsync.when(
                      loading: () => const LoadingState(cardCount: 1, cardHeight: 220),
                      error: (err, _) => ErrorState(
                        title: 'Could not sync next commute',
                        message: err.toString(),
                        onRetry: () => ref.invalidate(upcomingTripProvider),
                      ),
                      data: (trip) {
                        if (trip != null) {
                          return _HeroUpcomingTripCard(trip: trip);
                        }
                        final bookings = bookingsAsync.asData?.value ?? const [];
                        final activeBookings = bookings.where((b) => b.canCancel).toList();
                        return _NoDispatchedTripCard(
                          pendingBooking: activeBookings.isNotEmpty ? activeBookings.first : null,
                          cutoffMinutes: profile?.settings.bookingCutoffMinutes ?? 60,
                          onBookPressed: () => showBookRideSheet(context, ref),
                          onCancelBooking: activeBookings.isNotEmpty
                              ? () => showCannotBoardDialog(
                                    context,
                                    ref,
                                    bookingId: activeBookings.first.id,
                                    cancelCutoffMinutes:
                                        profile?.settings.cancellationCutoffMinutes ?? 45,
                                  )
                              : null,
                        );
                      },
                    ),
                    const SizedBox(height: 20),
                    _PolicyFooterStrip(
                      bookingCutoff: profile?.settings.bookingCutoffMinutes ?? 60,
                      cancelCutoff: profile?.settings.cancellationCutoffMinutes ?? 45,
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

class _CommuterIdentityBanner extends StatelessWidget {
  const _CommuterIdentityBanner({
    required this.profile,
    required this.locations,
  });

  final EmployeeProfileData profile;
  final List<SavedLocation> locations;

  @override
  Widget build(BuildContext context) {
    final defaultLoc = locations.isEmpty
        ? null
        : locations.firstWhere((l) => l.isDefault, orElse: () => locations.first);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: ColorTokens.surface,
        borderRadius: const BorderRadius.all(Radius.circular(14)),
        border: Border.all(color: ColorTokens.borderSubtle, width: 1),
      ),
      child: Row(
        children: [
          const Icon(Icons.business_rounded, size: 18, color: ColorTokens.inkSecondary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '${profile.employeeCode} · ${profile.office?.name ?? 'Campus'}'
              '${defaultLoc != null ? ' · Pin: ${defaultLoc.locationName}' : ''}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TypographyTokens.bodyMuted.copyWith(fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroUpcomingTripCard extends ConsumerWidget {
  const _HeroUpcomingTripCard({required this.trip});

  final UpcomingTripDetail trip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final yourStop = trip.yourStop;
    final gps = trip.gpsTelemetry;

    return HarborEnterTransition(
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: ColorTokens.surface,
          borderRadius: const BorderRadius.all(Radius.circular(20)),
          border: Border.all(color: ColorTokens.borderSubtle, width: 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'NEXT ASSIGNED RIDE',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TypographyTokens.label.copyWith(
                      color: ColorTokens.primaryPressed,
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                StatusBadge.fromStatus(trip.tripStatus),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              '${SolFormatters.readableIsoDate(trip.travelDate)} · ${trip.shiftTimeLocal}',
              style: TypographyTokens.sectionTitle.copyWith(
                fontFeatures: TypographyTokens.tabularFeatures,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${trip.shiftName} (${trip.direction}) · ${trip.officeName}',
              style: TypographyTokens.bodyMuted,
            ),
            const SizedBox(height: 14),
            GPSStatusIndicator.fromTelemetry(
              ageSeconds: gps?.ageSeconds,
              isStale: gps?.isStale ?? false,
            ),
            if (trip.boardingOtp != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: ColorTokens.primarySoft,
                  borderRadius: const BorderRadius.all(Radius.circular(14)),
                  border: Border.all(color: ColorTokens.primaryBorder),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'BOARDING PIN · ${trip.tripCode}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TypographyTokens.label,
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'Share with driver when boarding',
                            style: TypographyTokens.bodyMuted,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(trip.boardingOtp!, style: TypographyTokens.otpHero),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: ColorTokens.surfaceElevated,
                borderRadius: const BorderRadius.all(Radius.circular(14)),
                border: Border.all(color: ColorTokens.borderSubtle),
              ),
              child: Row(
                children: [
                  const Icon(Icons.pin_drop_outlined, size: 18, color: ColorTokens.primary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          yourStop != null
                              ? 'Stop #${yourStop.sequenceNo} of ${trip.stops.length} · ${yourStop.locationName}'
                              : 'Pickup scheduled for ${SolFormatters.timeHm(trip.scheduledPickupAt)}',
                          style: TypographyTokens.cardTitle.copyWith(fontSize: 14.5),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Scheduled pickup ${SolFormatters.timeHm(trip.scheduledPickupAt)}'
                          '${trip.runningLateEtaMinutes != null ? ' · Marked +${trip.runningLateEtaMinutes}m late' : ''}',
                          style: TypographyTokens.bodyMuted.copyWith(
                            fontFeatures: TypographyTokens.tabularFeatures,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (trip.driverName != null) ...[
              const SizedBox(height: 12),
              DriverCard(
                driverName: trip.driverName!,
                vehicleRegistration: trip.vehicleRegistrationNo,
                vehicleModel: trip.vehicleModelName,
                onCallPressed: trip.driverPhone != null
                    ? () => launchPhoneDialer(context, trip.driverPhone!)
                    : null,
              ),
            ],
            const SizedBox(height: 16),
            PrimaryButton(
              label: 'Open Live Route & Stop Timeline',
              icon: Icons.route_rounded,
              onPressed: () => context.push('/rides/trip/${trip.tripId}'),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: SecondaryButton(
                    label: 'Running Late',
                    icon: Icons.schedule_rounded,
                    fullWidth: true,
                    onPressed: () => showRunningLateSheet(
                      context,
                      ref,
                      tripId: trip.tripId,
                      initialMinutes: trip.runningLateEtaMinutes ?? 10,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: SecondaryButton(
                    label: 'Cannot Board',
                    icon: Icons.close_rounded,
                    isDanger: true,
                    fullWidth: true,
                    onPressed: () => showCannotBoardDialog(
                      context,
                      ref,
                      bookingId: trip.bookingId,
                      cancelCutoffMinutes: trip.settings.cancellationCutoffMinutes,
                    ),
                  ),
                ),
              ],
            ),
            if (trip.safeReachConfirmedAt == null) ...[
              const SizedBox(height: 10),
              SecondaryButton(
                label: 'Confirm Safe Reach',
                icon: Icons.verified_user_outlined,
                fullWidth: true,
                onPressed: () async {
                  await ref
                      .read(upcomingTripProvider.notifier)
                      .confirmSafeReach(trip.tripId);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Safe reach recorded with transport desk.'),
                      ),
                    );
                  }
                },
              ),
            ] else ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.verified_rounded, size: 16, color: ColorTokens.success),
                  const SizedBox(width: 6),
                  Text(
                    'Safe reach confirmed at ${SolFormatters.timeHm(trip.safeReachConfirmedAt!)}',
                    style: TypographyTokens.label.copyWith(color: ColorTokens.success),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _NoDispatchedTripCard extends StatelessWidget {
  const _NoDispatchedTripCard({
    this.pendingBooking,
    required this.cutoffMinutes,
    required this.onBookPressed,
    this.onCancelBooking,
  });

  final EmployeeBooking? pendingBooking;
  final int cutoffMinutes;
  final VoidCallback onBookPressed;
  final VoidCallback? onCancelBooking;

  @override
  Widget build(BuildContext context) {
    if (pendingBooking != null) {
      final b = pendingBooking!;
      return Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: ColorTokens.surface,
          borderRadius: const BorderRadius.all(Radius.circular(18)),
          border: Border.all(color: ColorTokens.borderSubtle, width: 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'AWAITING ROSTER DISPATCH',
                  style: TypographyTokens.label.copyWith(color: ColorTokens.inkSecondary),
                ),
                const Spacer(),
                StatusBadge.fromStatus(b.status),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              '${SolFormatters.readableIsoDate(b.travelDate)} · ${b.shiftTimeLocal}',
              style: TypographyTokens.sectionTitle,
            ),
            const SizedBox(height: 4),
            Text(
              '${b.shiftName} (${b.direction}) · ${b.pickupLocationName}',
              style: TypographyTokens.bodyMuted,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: PrimaryButton(
                    label: 'Book Another Shift',
                    icon: Icons.add_rounded,
                    onPressed: onBookPressed,
                  ),
                ),
                if (onCancelBooking != null) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: SecondaryButton(
                      label: 'Cannot Board',
                      isDanger: true,
                      fullWidth: true,
                      onPressed: onCancelBooking,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      );
    }

    return EmptyState(
      icon: Icons.directions_car_outlined,
      title: 'No upcoming cab assigned yet',
      message:
          'Request your login or logout commute at least $cutoffMinutes minutes before pickup.',
      actionLabel: 'Book Shift Commute',
      onAction: onBookPressed,
    );
  }
}

class _PolicyFooterStrip extends StatelessWidget {
  const _PolicyFooterStrip({
    required this.bookingCutoff,
    required this.cancelCutoff,
  });

  final int bookingCutoff;
  final int cancelCutoff;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ColorTokens.surfaceElevated,
        borderRadius: const BorderRadius.all(Radius.circular(14)),
        border: Border.all(color: ColorTokens.borderSubtle),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline_rounded, size: 18, color: ColorTokens.inkSecondary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Org Policy: Book at least ${bookingCutoff}m before shift · Cancel up to ${cancelCutoff}m before pickup · Privacy-masked co-passenger stops.',
              style: TypographyTokens.bodyMuted.copyWith(fontSize: 12.5),
            ),
          ),
        ],
      ),
    );
  }
}
