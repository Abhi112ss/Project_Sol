import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/models/driver_models.dart';
import '../../core/permissions/driver_permission_coordinator.dart';
import '../../core/state/driver_providers.dart';
import '../../core/utils/driver_formatters.dart';

class CommuteScheduleScreen extends ConsumerStatefulWidget {
  const CommuteScheduleScreen({super.key, required this.commuteId});

  final String commuteId;

  @override
  ConsumerState<CommuteScheduleScreen> createState() => _CommuteScheduleScreenState();
}

class _CommuteScheduleScreenState extends ConsumerState<CommuteScheduleScreen> {
  String? _monthOverride;
  String? _selectedDate;

  static const List<String> _monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  static const List<String> _weekdaysShort = [
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ];

  static String _formatMonthYear(String ym) {
    final parts = ym.split('-');
    if (parts.length != 2) return ym;
    final year = int.tryParse(parts[0]);
    final month = int.tryParse(parts[1]);
    if (year == null || month == null || month < 1 || month > 12) return ym;
    return '${_monthNames[month - 1]} $year';
  }

  static String _shiftMonth(String ym, int deltaMonths) {
    final parts = ym.split('-');
    if (parts.length != 2) return ym;
    final year = int.tryParse(parts[0]) ?? 2026;
    final month = int.tryParse(parts[1]) ?? 1;
    final dt = DateTime(year, month + deltaMonths, 1);
    return '${dt.year.toString().padLeft(4, '0')}-${dt.month.toString().padLeft(2, '0')}';
  }

  static String _formatReadableDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    final wd = _weekdaysShort[(dt.weekday - 1).clamp(0, 6)];
    final mName = _monthNames[(dt.month - 1).clamp(0, 11)];
    return '$wd, ${dt.day} $mName ${dt.year}';
  }

  String _resolveInitialDate(DriverCommuteCalendarData data) {
    if (_selectedDate != null && _selectedDate!.startsWith('${data.month}-')) {
      return _selectedDate!;
    }
    final byDate = data.byDate;
    if (data.todayDate.startsWith('${data.month}-') && byDate.containsKey(data.todayDate)) {
      return data.todayDate;
    }
    if (data.scheduledDates.isNotEmpty) {
      return data.scheduledDates.first.date;
    }
    if (data.todayDate.startsWith('${data.month}-')) {
      return data.todayDate;
    }
    return '${data.month}-01';
  }

  void _changeMonth(String nextMonth, {String? selectDate}) {
    setState(() {
      _monthOverride = nextMonth;
      _selectedDate = selectDate;
    });
  }

  @override
  Widget build(BuildContext context) {
    final calendarAsync = ref.watch(
      driverCommuteCalendarProvider((commuteId: widget.commuteId, month: _monthOverride)),
    );

    return Scaffold(
      appBar: AppBar(
        title: calendarAsync.maybeWhen(
          data: (cal) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                cal.commute.commuteName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TypographyTokens.sectionTitle,
              ),
              Text(
                '${cal.commute.officeName} · ${cal.commute.shiftTimeLocal} (${cal.commute.direction})',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TypographyTokens.label,
              ),
            ],
          ),
          orElse: () => const Text('Commute Schedule', style: TypographyTokens.sectionTitle),
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh schedule',
            onPressed: () {
              ref.invalidate(
                driverCommuteCalendarProvider((
                  commuteId: widget.commuteId,
                  month: _monthOverride,
                )),
              );
              if (_selectedDate != null) {
                ref.invalidate(
                  driverCommuteDateManifestProvider((
                    commuteId: widget.commuteId,
                    date: _selectedDate!,
                  )),
                );
              }
            },
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: calendarAsync.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(16),
          child: LoadingState(cardCount: 2, cardHeight: 210),
        ),
        error: (err, _) => Padding(
          padding: const EdgeInsets.all(16),
          child: ErrorState(
            title: 'Could not load commute calendar',
            message: err.toString(),
            onRetry: () => ref.invalidate(
              driverCommuteCalendarProvider((
                commuteId: widget.commuteId,
                month: _monthOverride,
              )),
            ),
          ),
        ),
        data: (cal) {
          final selectedIso = _resolveInitialDate(cal);
          final byDate = cal.byDate;
          final scheduledSummary = byDate[selectedIso];

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(
                driverCommuteCalendarProvider((
                  commuteId: widget.commuteId,
                  month: _monthOverride,
                )),
              );
              await ref.read(
                driverCommuteCalendarProvider((
                  commuteId: widget.commuteId,
                  month: _monthOverride,
                )).future,
              );
              if (scheduledSummary != null) {
                ref.invalidate(
                  driverCommuteDateManifestProvider((
                    commuteId: widget.commuteId,
                    date: selectedIso,
                  )),
                );
              }
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
              children: [
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 680),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _CommuteSummaryBanner(commute: cal.commute),
                        const SizedBox(height: 14),
                        _InteractiveMonthCalendar(
                          calendar: cal,
                          selectedDate: selectedIso,
                          monthTitle: _formatMonthYear(cal.month),
                          onPrevMonth: () => _changeMonth(_shiftMonth(cal.month, -1)),
                          onNextMonth: () => _changeMonth(_shiftMonth(cal.month, 1)),
                          onJumpToday: () => _changeMonth(
                            cal.todayDate.substring(0, 7),
                            selectDate: cal.todayDate,
                          ),
                          onSelectMonth: (ym) => _changeMonth(ym),
                          onSelectDate: (iso) => setState(() => _selectedDate = iso),
                        ),
                        const SizedBox(height: 18),
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _formatReadableDate(selectedIso),
                                    style: TypographyTokens.sectionTitle,
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    selectedIso == cal.todayDate
                                        ? 'Today · $selectedIso'
                                        : selectedIso,
                                    style: TypographyTokens.label,
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: scheduledSummary != null
                                    ? ColorTokens.primarySoft
                                    : ColorTokens.surfaceMuted,
                                borderRadius: const BorderRadius.all(Radius.circular(999)),
                                border: Border.all(
                                  color: scheduledSummary != null
                                      ? ColorTokens.primaryBorder
                                      : ColorTokens.borderSubtle,
                                ),
                              ),
                              child: Text(
                                scheduledSummary != null
                                    ? '${scheduledSummary.tripCount} Assigned Trip(s)'
                                    : 'Unassigned',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: scheduledSummary != null
                                      ? ColorTokens.primaryPressed
                                      : ColorTokens.inkMuted,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        if (scheduledSummary == null)
                          const _NoTripAssignedCard()
                        else
                          _DateManifestSection(
                            commuteId: widget.commuteId,
                            selectedDate: selectedIso,
                            onCalendarOutOfSync: () {
                              ref.invalidate(
                                driverCommuteCalendarProvider((
                                  commuteId: widget.commuteId,
                                  month: _monthOverride,
                                )),
                              );
                            },
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _CommuteSummaryBanner extends StatelessWidget {
  const _CommuteSummaryBanner({required this.commute});

  final DriverCalendarCommuteMeta commute;

  @override
  Widget build(BuildContext context) {
    final isLogin = commute.direction.toUpperCase() == 'LOGIN';
    return Container(
      padding: const EdgeInsets.all(14),
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
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: isLogin ? ColorTokens.primarySoft : ColorTokens.surfaceMuted,
                  borderRadius: const BorderRadius.all(Radius.circular(8)),
                ),
                child: Text(
                  isLogin ? 'LOGIN PICKUP' : 'LOGOUT DROP',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: isLogin ? ColorTokens.primaryPressed : ColorTokens.inkSecondary,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  commute.localityName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypographyTokens.label,
                ),
              ),
              Text(
                '${commute.totalAssignedTripsCount} total runs',
                style: TypographyTokens.label.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '${commute.timePreferenceSummary} · ${commute.shiftName} (${commute.shiftTimeLocal})',
            style: TypographyTokens.body,
          ),
          const SizedBox(height: 3),
          Text(
            'Active window: ${commute.startDate} to ${commute.endDate} · ${commute.officeName}',
            style: TypographyTokens.bodyMuted,
          ),
        ],
      ),
    );
  }
}

class _InteractiveMonthCalendar extends StatelessWidget {
  const _InteractiveMonthCalendar({
    required this.calendar,
    required this.selectedDate,
    required this.monthTitle,
    required this.onPrevMonth,
    required this.onNextMonth,
    required this.onJumpToday,
    required this.onSelectMonth,
    required this.onSelectDate,
  });

  final DriverCommuteCalendarData calendar;
  final String selectedDate;
  final String monthTitle;
  final VoidCallback onPrevMonth;
  final VoidCallback onNextMonth;
  final VoidCallback onJumpToday;
  final ValueChanged<String> onSelectMonth;
  final ValueChanged<String> onSelectDate;

  @override
  Widget build(BuildContext context) {
    final parts = calendar.month.split('-');
    final year = int.tryParse(parts[0]) ?? 2026;
    final month = parts.length > 1 ? (int.tryParse(parts[1]) ?? 1) : 1;

    final firstDay = DateTime(year, month, 1);
    final leadingEmpty = (firstDay.weekday - 1).clamp(0, 6);
    final daysInMonth = DateTime(year, month + 1, 0).day;
    final totalCells = leadingEmpty + daysInMonth;
    final rowsCount = (totalCells / 7).ceil();

    final byDate = calendar.byDate;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ColorTokens.surface,
        borderRadius: const BorderRadius.all(Radius.circular(18)),
        border: Border.all(color: ColorTokens.borderSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                tooltip: 'Previous month',
                onPressed: onPrevMonth,
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.chevron_left_rounded),
              ),
              Expanded(
                child: Text(
                  monthTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TypographyTokens.cardTitle,
                ),
              ),
              IconButton(
                tooltip: 'Next month',
                onPressed: onNextMonth,
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.chevron_right_rounded),
              ),
              const SizedBox(width: 4),
              OutlinedButton(
                onPressed: onJumpToday,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  minimumSize: const Size(0, 32),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('Today', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          if (calendar.activeMonths.length > 1) ...[
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final ym in calendar.activeMonths) ...[
                    ChoiceChip(
                      label: Text(ym),
                      selected: ym == calendar.month,
                      onSelected: (_) => onSelectMonth(ym),
                      visualDensity: VisualDensity.compact,
                    ),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: [
              _CalendarLegendChip(
                color: ColorTokens.primary,
                bgColor: ColorTokens.primarySoft,
                borderColor: ColorTokens.primaryBorder,
                label: 'Blue · Assigned trip (${calendar.scheduledDates.length})',
              ),
              const _CalendarLegendChip(
                color: ColorTokens.inkMuted,
                bgColor: ColorTokens.surfaceMuted,
                borderColor: ColorTokens.borderSubtle,
                label: 'Grey · No trip assigned',
              ),
              const _CalendarLegendChip(
                color: ColorTokens.inkPrimary,
                bgColor: ColorTokens.surface,
                borderColor: ColorTokens.inkPrimary,
                label: 'Ring · Today',
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Row(
            children: [
              _WeekdayHeader('Mon'),
              _WeekdayHeader('Tue'),
              _WeekdayHeader('Wed'),
              _WeekdayHeader('Thu'),
              _WeekdayHeader('Fri'),
              _WeekdayHeader('Sat'),
              _WeekdayHeader('Sun'),
            ],
          ),
          const SizedBox(height: 6),
          for (var row = 0; row < rowsCount; row++)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  for (var col = 0; col < 7; col++)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
                        child: _buildDayCell(
                          row: row,
                          col: col,
                          leadingEmpty: leadingEmpty,
                          daysInMonth: daysInMonth,
                          year: year,
                          month: month,
                          byDate: byDate,
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDayCell({
    required int row,
    required int col,
    required int leadingEmpty,
    required int daysInMonth,
    required int year,
    required int month,
    required Map<String, DriverCalendarScheduledDate> byDate,
  }) {
    final dayNumber = (row * 7 + col) - leadingEmpty + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return const SizedBox(height: 46);
    }

    final iso =
        '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${dayNumber.toString().padLeft(2, '0')}';
    final scheduled = byDate[iso];
    final isScheduled = scheduled != null;
    final isSelected = iso == selectedDate;
    final isToday = iso == calendar.todayDate;

    final Color bgColor;
    final Color textColor;
    final Color borderColor;
    final double borderWidth;

    if (isScheduled) {
      bgColor = isSelected ? ColorTokens.primary : ColorTokens.primarySoft;
      textColor = isSelected ? ColorTokens.surface : ColorTokens.primaryPressed;
      borderColor = isToday
          ? ColorTokens.inkPrimary
          : (isSelected ? ColorTokens.primaryPressed : ColorTokens.primaryBorder);
      borderWidth = isToday || isSelected ? 2 : 1.2;
    } else {
      bgColor = isSelected ? ColorTokens.neutralSoft : ColorTokens.surfaceMuted;
      textColor = isSelected ? ColorTokens.inkPrimary : ColorTokens.inkMuted;
      borderColor = isToday
          ? ColorTokens.inkPrimary
          : (isSelected ? ColorTokens.inkSecondary : ColorTokens.borderSubtle);
      borderWidth = isToday || isSelected ? 2 : 1;
    }

    return Semantics(
      button: true,
      selected: isSelected,
      label: '$iso ${isScheduled ? 'assigned trip' : 'no trip assigned'}${isToday ? ', today' : ''}',
      child: Material(
        color: bgColor,
        borderRadius: const BorderRadius.all(Radius.circular(10)),
        child: InkWell(
          key: ValueKey('cal-day-$iso'),
          borderRadius: const BorderRadius.all(Radius.circular(10)),
          onTap: () => onSelectDate(iso),
          child: Container(
            height: 46,
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.all(Radius.circular(10)),
              border: Border.all(color: borderColor, width: borderWidth),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '$dayNumber',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: isScheduled || isToday ? FontWeight.w800 : FontWeight.w600,
                    color: textColor,
                  ),
                ),
                const SizedBox(height: 2),
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isScheduled
                        ? (isSelected ? ColorTokens.surface : ColorTokens.primary)
                        : Colors.transparent,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _WeekdayHeader extends StatelessWidget {
  const _WeekdayHeader(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Center(
        child: Text(
          label,
          style: TypographyTokens.label.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

class _CalendarLegendChip extends StatelessWidget {
  const _CalendarLegendChip({
    required this.color,
    required this.bgColor,
    required this.borderColor,
    required this.label,
  });

  final Color color;
  final Color bgColor;
  final Color borderColor;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: const BorderRadius.all(Radius.circular(4)),
            border: Border.all(color: borderColor, width: 1.5),
          ),
          child: Center(
            child: Container(
              width: 5,
              height: 5,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
          ),
        ),
        const SizedBox(width: 5),
        Text(label, style: TypographyTokens.label),
      ],
    );
  }
}

class _NoTripAssignedCard extends StatelessWidget {
  const _NoTripAssignedCard();

  @override
  Widget build(BuildContext context) {
    return const EmptyState(
      icon: Icons.event_busy_rounded,
      title: 'No trip assigned for this date.',
      message:
          'Grey dates indicate days with no assigned duty for this commute (unscheduled, skipped, cancelled, or reassigned to another cab).',
    );
  }
}

class _DateManifestSection extends ConsumerWidget {
  const _DateManifestSection({
    required this.commuteId,
    required this.selectedDate,
    required this.onCalendarOutOfSync,
  });

  final String commuteId;
  final String selectedDate;
  final VoidCallback onCalendarOutOfSync;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final manifestAsync = ref.watch(
      driverCommuteDateManifestProvider((commuteId: commuteId, date: selectedDate)),
    );

    return manifestAsync.when(
      loading: () => const LoadingState(cardCount: 1, cardHeight: 190),
      error: (err, _) => ErrorState(
        title: 'Could not load date duty',
        message: err.toString(),
        onRetry: () => ref.invalidate(
          driverCommuteDateManifestProvider((commuteId: commuteId, date: selectedDate)),
        ),
      ),
      data: (manifestData) {
        if (manifestData.trips.isEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) => onCalendarOutOfSync());
          return const _NoTripAssignedCard();
        }
        return Column(
          children: [
            for (var i = 0; i < manifestData.trips.length; i++) ...[
              _AssignedDayTripManifestCard(manifest: manifestData.trips[i]),
              if (i < manifestData.trips.length - 1) const SizedBox(height: 12),
            ],
          ],
        );
      },
    );
  }
}

class _AssignedDayTripManifestCard extends StatelessWidget {
  const _AssignedDayTripManifestCard({required this.manifest});

  final DriverTripManifest manifest;

  @override
  Widget build(BuildContext context) {
    final isInProgress = manifest.status.toUpperCase() == 'IN_PROGRESS';
    final isCompleted = manifest.status.toUpperCase() == 'COMPLETED';
    final totalPassengers = manifest.stops.expand((s) => s.passengers).length;
    final startTimeText = manifest.plannedStartAt != null
        ? DriverFormatters.timeHm(manifest.plannedStartAt!)
        : manifest.shiftTimeLocal;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ColorTokens.surface,
        borderRadius: const BorderRadius.all(Radius.circular(16)),
        border: Border.all(color: ColorTokens.primaryBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      manifest.tripCode,
                      style: TypographyTokens.telemetryTabular.copyWith(
                        color: ColorTokens.primaryPressed,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Start $startTimeText · ${manifest.shiftName} (${manifest.direction})',
                      style: TypographyTokens.cardTitle,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              StatusBadge.fromStatus(manifest.status),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 12,
            runSpacing: 6,
            children: [
              _ManifestMetaChip(
                icon: Icons.directions_car_rounded,
                label: [
                  manifest.vehicleRegistrationNo ?? 'Assigned Cab',
                  if (manifest.vehicleModelName != null && manifest.vehicleModelName!.isNotEmpty)
                    manifest.vehicleModelName!,
                ].join(' · '),
              ),
              _ManifestMetaChip(
                icon: Icons.people_alt_outlined,
                label: '$totalPassengers passenger(s) · ${manifest.stops.length} stop(s)',
              ),
              _ManifestMetaChip(
                icon: Icons.apartment_rounded,
                label: manifest.officeName,
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Text('Stops & Boarding Sequence', style: TypographyTokens.label),
          const SizedBox(height: 8),
          for (var i = 0; i < manifest.stops.length; i++) ...[
            _StopRowTile(stop: manifest.stops[i]),
            if (i < manifest.stops.length - 1) const SizedBox(height: 8),
          ],
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: PrimaryButton(
              label: isInProgress
                  ? 'Resume Active Console'
                  : (isCompleted ? 'View Completed Duty' : 'Review & Start Duty'),
              icon: isInProgress ? Icons.play_circle_fill_rounded : Icons.route_rounded,
              onPressed: () {
                if (isInProgress) {
                  context.push('/trip/${manifest.tripId}/active');
                } else {
                  context.push('/trip/${manifest.tripId}/preview');
                }
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ManifestMetaChip extends StatelessWidget {
  const _ManifestMetaChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: ColorTokens.surfaceMuted,
        borderRadius: const BorderRadius.all(Radius.circular(8)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: ColorTokens.inkSecondary),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TypographyTokens.label.copyWith(color: ColorTokens.inkPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

class _StopRowTile extends StatelessWidget {
  const _StopRowTile({required this.stop});

  final DriverTripStop stop;

  @override
  Widget build(BuildContext context) {
    final passengerNames = stop.passengers.map((p) => p.fullName).join(', ');
    final timeStr =
        stop.scheduledArrivalAt != null ? DriverFormatters.timeHm(stop.scheduledArrivalAt!) : '--:--';

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: stop.isOffice ? ColorTokens.surfaceElevated : ColorTokens.surface,
        borderRadius: const BorderRadius.all(Radius.circular(12)),
        border: Border.all(color: ColorTokens.borderSubtle),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              color: stop.isOffice ? ColorTokens.inkPrimary : ColorTokens.primarySoft,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                '${stop.sequenceNo}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: stop.isOffice ? ColorTokens.surface : ColorTokens.primaryPressed,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(stop.locationName, style: TypographyTokens.body.copyWith(fontWeight: FontWeight.w700)),
                    ),
                    Text(
                      timeStr,
                      style: TypographyTokens.telemetryTabular.copyWith(fontSize: 12),
                    ),
                  ],
                ),
                if (stop.address.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(stop.address, style: TypographyTokens.label),
                ],
                if (passengerNames.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Passengers: $passengerNames',
                    style: TypographyTokens.label.copyWith(
                      color: ColorTokens.primaryPressed,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
          IconButton(
            tooltip: 'Navigate in Maps',
            onPressed: () => launchGoogleMapsTurnByTurn(
              context,
              navigationUrl: stop.navigationUrl,
              latitude: stop.latitude,
              longitude: stop.longitude,
              label: stop.locationName,
            ),
            icon: const Icon(Icons.directions_rounded, color: ColorTokens.primary),
          ),
        ],
      ),
    );
  }
}
