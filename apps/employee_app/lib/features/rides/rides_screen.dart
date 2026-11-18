import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/models/employee_models.dart';
import '../../core/state/employee_providers.dart';
import '../../core/utils/formatters.dart';
import 'ride_action_sheets.dart';

class RidesScreen extends ConsumerStatefulWidget {
  const RidesScreen({super.key});

  @override
  ConsumerState<RidesScreen> createState() => _RidesScreenState();
}

class _RidesScreenState extends ConsumerState<RidesScreen> {
  int _tabIndex = 0;

  @override
  Widget build(BuildContext context) {
    final tripsAsync = ref.watch(employeeTripsProvider);
    final bookingsAsync = ref.watch(employeeBookingsProvider);
    final seriesAsync = ref.watch(employeeSeriesProvider);
    final profile = ref.watch(employeeProfileProvider).asData?.value;
    final cancelCutoff = profile?.settings.cancellationCutoffMinutes ?? 45;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Rides & Bookings'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: HarborPressable(
              onTap: () => showBookRideSheet(context, ref),
              borderRadius: const BorderRadius.all(Radius.circular(12)),
              semanticLabel: 'Book shift ride',
              child: Container(
                height: 40,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: ColorTokens.primary,
                  borderRadius: const BorderRadius.all(Radius.circular(12)),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add_rounded, size: 18, color: Colors.white),
                    SizedBox(width: 4),
                    Text(
                      'Book',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
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
          ref.invalidate(employeeTripsProvider);
          ref.invalidate(employeeBookingsProvider);
          ref.invalidate(employeeSeriesProvider);
          await Future.wait([
            ref.read(employeeTripsProvider.future),
            ref.read(employeeBookingsProvider.future),
            ref.read(employeeSeriesProvider.future),
          ]);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 680),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SegmentedButton<int>(
                      segments: const [
                        ButtonSegment(
                          value: 0,
                          label: Text('Trips'),
                          icon: Icon(Icons.route_rounded, size: 17),
                        ),
                        ButtonSegment(
                          value: 1,
                          label: Text('Bookings'),
                          icon: Icon(Icons.calendar_month_outlined, size: 17),
                        ),
                        ButtonSegment(
                          value: 2,
                          label: Text('Series'),
                          icon: Icon(Icons.repeat_rounded, size: 17),
                        ),
                      ],
                      selected: {_tabIndex},
                      onSelectionChanged: (set) {
                        HarborMotion.hapticSelection();
                        setState(() => _tabIndex = set.first);
                      },
                    ),
                    const SizedBox(height: 16),
                    if (_tabIndex == 0)
                      tripsAsync.when(
                        loading: () => const LoadingState(cardCount: 3),
                        error: (err, _) => ErrorState(
                          title: 'Could not load trips',
                          message: err.toString(),
                          onRetry: () => ref.invalidate(employeeTripsProvider),
                        ),
                        data: (items) {
                          if (items.isEmpty) {
                            return EmptyState(
                              icon: Icons.directions_car_outlined,
                              title: 'No dispatched rides yet',
                              message:
                                  'Once dispatch allocates a vehicle to your approved booking, your live trip card appears here.',
                              actionLabel: 'Book Shift Ride',
                              onAction: () => showBookRideSheet(context, ref),
                            );
                          }
                          return Column(
                            children: [
                              for (var i = 0; i < items.length; i++) ...[
                                TripCard(
                                  tripCode: items[i].tripCode,
                                  travelDate: SolFormatters.readableIsoDate(items[i].travelDate),
                                  direction: items[i].direction,
                                  status: items[i].tripStatus,
                                  shiftLabel: '${items[i].shiftTimeLocal} ${items[i].shiftName}',
                                  pickupLabel:
                                      'Stop #${items[i].stopSequence} · ${items[i].pickupLocationName}',
                                  officeLabel: items[i].officeName,
                                  driverSummary: items[i].driverName,
                                  vehicleSummary: items[i].vehicleRegistrationNo,
                                  etaLabel: SolFormatters.timeHm(items[i].scheduledPickupAt),
                                  onTap: () => context.push('/rides/trip/${items[i].tripId}'),
                                ),
                                if (i < items.length - 1) const SizedBox(height: 12),
                              ],
                            ],
                          );
                        },
                      )
                    else if (_tabIndex == 1)
                      bookingsAsync.when(
                        loading: () => const LoadingState(cardCount: 3),
                        error: (err, _) => ErrorState(
                          title: 'Could not load shift bookings',
                          message: err.toString(),
                          onRetry: () => ref.invalidate(employeeBookingsProvider),
                        ),
                        data: (items) {
                          if (items.isEmpty) {
                            return EmptyState(
                              icon: Icons.event_busy_outlined,
                              title: 'No bookings recorded',
                              message: 'Schedule your morning or evening commute in seconds.',
                              actionLabel: 'Request Commute',
                              onAction: () => showBookRideSheet(context, ref),
                            );
                          }
                          return Column(
                            children: [
                              for (var i = 0; i < items.length; i++) ...[
                                _BookingListCard(
                                  booking: items[i],
                                  onEdit: items[i].canCancel
                                      ? () => showEditBookingSheet(
                                            context,
                                            ref,
                                            booking: items[i],
                                          )
                                      : null,
                                  onViewTrip: items[i].tripId != null
                                      ? () => context.push('/rides/trip/${items[i].tripId}')
                                      : null,
                                  onCancel: items[i].canCancel
                                      ? () => showCannotBoardDialog(
                                            context,
                                            ref,
                                            bookingId: items[i].id,
                                            cancelCutoffMinutes: cancelCutoff,
                                          )
                                      : null,
                                ),
                                if (i < items.length - 1) const SizedBox(height: 12),
                              ],
                            ],
                          );
                        },
                      )
                    else
                      seriesAsync.when(
                        loading: () => const LoadingState(cardCount: 2),
                        error: (err, _) => ErrorState(
                          title: 'Could not load recurring series',
                          message: err.toString(),
                          onRetry: () => ref.invalidate(employeeSeriesProvider),
                        ),
                        data: (seriesList) {
                          if (seriesList.isEmpty) {
                            return EmptyState(
                              icon: Icons.repeat_rounded,
                              title: 'No recurring commute plans',
                              message: 'Schedule weekly or monthly office rides from Book Ride.',
                              actionLabel: 'Schedule Commute',
                              onAction: () => showBookRideSheet(context, ref),
                            );
                          }
                          return Column(
                            children: [
                              for (var i = 0; i < seriesList.length; i++) ...[
                                _SeriesListCard(
                                  series: seriesList[i],
                                  onSkipDate: seriesList[i].isActive
                                      ? () => _handleSkipSeriesDate(context, ref, seriesList[i])
                                      : null,
                                  onExtend: !seriesList[i].status.toUpperCase().contains('CANCELLED')
                                      ? () => _handleExtendSeries(context, ref, seriesList[i])
                                      : null,
                                  onCancel: seriesList[i].isActive
                                      ? () => _handleCancelSeries(context, ref, seriesList[i])
                                      : null,
                                ),
                                if (i < seriesList.length - 1) const SizedBox(height: 12),
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

Future<void> _handleSkipSeriesDate(
  BuildContext context,
  WidgetRef ref,
  BookingSeriesSummary series,
) async {
  final start = DateTime.tryParse(series.startDate) ?? DateTime.now();
  final end = DateTime.tryParse(series.endDate) ?? start.add(const Duration(days: 30));
  final picked = await showDatePicker(
    context: context,
    initialDate: start,
    firstDate: start,
    lastDate: end,
  );
  if (picked == null) return;
  await ref.read(employeeSeriesProvider.notifier).skipDates(
        series.id,
        [SolFormatters.isoDate(picked)],
      );
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Skipped ${SolFormatters.isoDate(picked)} from series.')),
    );
  }
}

Future<void> _handleExtendSeries(
  BuildContext context,
  WidgetRef ref,
  BookingSeriesSummary series,
) async {
  final curEnd = DateTime.tryParse(series.endDate) ?? DateTime.now();
  final picked = await showDatePicker(
    context: context,
    initialDate: curEnd.add(const Duration(days: 7)),
    firstDate: curEnd.add(const Duration(days: 1)),
    lastDate: curEnd.add(const Duration(days: 90)),
  );
  if (picked == null) return;
  await ref
      .read(employeeSeriesProvider.notifier)
      .extendSeries(series.id, SolFormatters.isoDate(picked));
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Series extended through ${SolFormatters.isoDate(picked)}.')),
    );
  }
}

Future<void> _handleCancelSeries(
  BuildContext context,
  WidgetRef ref,
  BookingSeriesSummary series,
) async {
  await ref
      .read(employeeSeriesProvider.notifier)
      .cancelSeries(series.id, 'Cancelled remaining recurring dates by employee');
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Remaining recurring commute rides cancelled.')),
    );
  }
}

class _SeriesListCard extends StatelessWidget {
  const _SeriesListCard({
    required this.series,
    this.onSkipDate,
    this.onExtend,
    this.onCancel,
  });

  final BookingSeriesSummary series;
  final VoidCallback? onSkipDate;
  final VoidCallback? onExtend;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final dirLabel = series.direction == 'LOGOUT' ? 'Office -> Home' : 'Home -> Office';
    final prefLabel = series.timePreference == 'ARRIVE_BY'
        ? 'Arrive by ${series.requestedTimeLocal}'
        : 'Pickup ~${series.requestedTimeLocal}';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ColorTokens.surface,
        borderRadius: const BorderRadius.all(Radius.circular(16)),
        border: Border.all(color: ColorTokens.borderSubtle, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${series.recurrenceType} · $dirLabel',
                  style: TypographyTokens.cardTitle.copyWith(fontSize: 15),
                ),
              ),
              const SizedBox(width: 8),
              StatusBadge.fromStatus(series.status),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${series.startDate} -> ${series.endDate} · ${series.selectedDaysOfWeek}',
            style: TypographyTokens.telemetryTabular.copyWith(fontSize: 12.5),
          ),
          const SizedBox(height: 4),
          Text(
            '$prefLabel · ${series.pickupLocationName} -> ${series.officeName}',
            style: TypographyTokens.bodyMuted,
          ),
          const SizedBox(height: 8),
          Text(
            '${series.activeCount} active · ${series.dispatchedCount} dispatched · ${series.expiredCount} expired · ${series.cancelledCount} cancelled',
            style: TypographyTokens.bodyMuted.copyWith(fontSize: 12),
          ),
          if (onSkipDate != null || onExtend != null || onCancel != null) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (onSkipDate != null)
                  SecondaryButton(
                    label: 'Skip Date',
                    icon: Icons.event_busy_outlined,
                    onPressed: onSkipDate,
                  ),
                if (onExtend != null)
                  SecondaryButton(
                    label: 'Extend',
                    icon: Icons.date_range_outlined,
                    onPressed: onExtend,
                  ),
                if (onCancel != null)
                  SecondaryButton(
                    label: 'Cancel Series',
                    isDanger: true,
                    onPressed: onCancel,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _BookingListCard extends StatelessWidget {
  const _BookingListCard({
    required this.booking,
    this.onEdit,
    this.onViewTrip,
    this.onCancel,
  });

  final EmployeeBooking booking;
  final VoidCallback? onEdit;
  final VoidCallback? onViewTrip;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final prefText = booking.timePreference == 'ARRIVE_BY'
        ? 'Arrive by ${booking.requestedTimeLocal ?? SolFormatters.timeHm(booking.scheduledPickupAt)}'
        : 'Pickup ~${booking.requestedTimeLocal ?? SolFormatters.timeHm(booking.scheduledPickupAt)}';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ColorTokens.surface,
        borderRadius: const BorderRadius.all(Radius.circular(16)),
        border: Border.all(color: ColorTokens.borderSubtle, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${SolFormatters.readableIsoDate(booking.travelDate)} · ${booking.shiftTimeLocal}',
                  style: TypographyTokens.telemetryTabular.copyWith(fontSize: 14),
                ),
              ),
              const SizedBox(width: 8),
              StatusBadge.fromStatus(booking.status),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${booking.shiftName} (${booking.direction}) · ${booking.officeName}',
            style: TypographyTokens.bodyMuted,
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              StatusBadge(
                label: prefText,
                tone: booking.timePreference == 'ARRIVE_BY'
                    ? StatusTone.info
                    : StatusTone.neutral,
              ),
              if (booking.isArriveByInfeasible)
                const StatusBadge(
                  label: 'Lead-time tight',
                  tone: StatusTone.warning,
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.place_outlined, size: 16, color: ColorTokens.primary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  booking.pickupLocationName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypographyTokens.body.copyWith(fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
          if (booking.cancellationReason != null) ...[
            const SizedBox(height: 6),
            Text(
              'Reason: ${booking.cancellationReason}',
              style: TypographyTokens.bodyMuted.copyWith(color: ColorTokens.dangerPressed),
            ),
          ],
          if (onEdit != null || onViewTrip != null || onCancel != null) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (onEdit != null)
                  SecondaryButton(
                    label: 'Edit Time',
                    icon: Icons.edit_calendar_outlined,
                    onPressed: onEdit,
                  ),
                if (onViewTrip != null)
                  SecondaryButton(
                    label: 'Inspect Trip',
                    icon: Icons.route_outlined,
                    onPressed: onViewTrip,
                  ),
                if (onCancel != null)
                  SecondaryButton(
                    label: 'Cannot Board',
                    isDanger: true,
                    onPressed: onCancel,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
