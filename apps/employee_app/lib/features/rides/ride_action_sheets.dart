import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/models/employee_models.dart';
import '../../core/network/employee_api.dart';
import '../../core/state/employee_providers.dart';
import '../../core/utils/formatters.dart';
import 'time_preference_selector.dart';

Future<void> showBookRideSheet(BuildContext context, WidgetRef ref) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => const _BookRideSheet(),
  );
}

class _BookRideSheet extends ConsumerStatefulWidget {
  const _BookRideSheet();

  @override
  ConsumerState<_BookRideSheet> createState() => _BookRideSheetState();
}

class _BookRideSheetState extends ConsumerState<_BookRideSheet> {
  static const _allWeekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  late DateTime _selectedDate;
  DateTime? _customEndDate;
  String _direction = 'LOGIN';
  BookingTimePreference _timePreference = BookingTimePreference.pickupAt;
  TimeOfDay _requestedTime = const TimeOfDay(hour: 8, minute: 30);
  bool _hasCustomTime = false;
  String _recurrenceType = 'ONE_DAY';
  final Set<String> _selectedDays = {'MON', 'TUE', 'WED', 'THU', 'FRI'};
  String? _selectedShiftId;
  String? _selectedOfficeId;
  String? _selectedLocationId;
  final TextEditingController _notesCtrl = TextEditingController();
  bool _skipConflictingDates = false;
  bool _loadingPreview = false;
  SeriesPreviewData? _previewData;
  bool _submitting = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    _selectedDate = DateTime(tomorrow.year, tomorrow.month, tomorrow.day);
    _customEndDate = _selectedDate.add(const Duration(days: 13));
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  String _formatTimeOfDay(TimeOfDay tod) {
    final h = tod.hour.toString().padLeft(2, '0');
    final m = tod.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  TimeOfDay _effectiveRequestedTime(ShiftSummary shift) {
    if (_hasCustomTime) return _requestedTime;
    final parts = shift.shiftTimeLocal.split(':');
    final hour = parts.isNotEmpty ? (int.tryParse(parts[0]) ?? 9) : 9;
    final minute = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
    if (_direction == 'LOGIN' && _timePreference == BookingTimePreference.pickupAt) {
      final totalMins = (hour * 60 + minute - 35).clamp(0, 1439);
      return TimeOfDay(hour: totalMins ~/ 60, minute: totalMins % 60);
    }
    return TimeOfDay(hour: hour, minute: minute);
  }

  DateTime _computeScheduledPickup(ShiftSummary shift) {
    final tod = _effectiveRequestedTime(shift);
    final chosenMoment = DateTime(
      _selectedDate.year,
      _selectedDate.month,
      _selectedDate.day,
      tod.hour,
      tod.minute,
    );
    if (_timePreference == BookingTimePreference.arriveBy) {
      return chosenMoment.subtract(const Duration(minutes: 35));
    }
    return chosenMoment;
  }

  Future<void> _pickCalendarDate({bool isEndDate = false}) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final initial = isEndDate ? (_customEndDate ?? _selectedDate) : _selectedDate;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial.isBefore(today) ? today : initial,
      firstDate: isEndDate ? _selectedDate : today,
      lastDate: today.add(const Duration(days: 180)),
    );
    if (picked != null) {
      setState(() {
        final normalized = DateTime(picked.year, picked.month, picked.day);
        if (isEndDate) {
          _customEndDate = normalized;
        } else {
          _selectedDate = normalized;
          if (_customEndDate != null && _customEndDate!.isBefore(_selectedDate)) {
            _customEndDate = _selectedDate.add(const Duration(days: 6));
          }
        }
        _previewData = null;
        _errorMessage = null;
      });
    }
  }

  Future<void> _pickRequestedTime(ShiftSummary shift) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _effectiveRequestedTime(shift),
    );
    if (picked != null) {
      HarborMotion.hapticSelection();
      setState(() {
        _requestedTime = picked;
        _hasCustomTime = true;
        _previewData = null;
        _errorMessage = null;
      });
    }
  }

  Future<void> _loadPreview(
    EmployeeProfileData profile,
    List<SavedLocation> locations,
  ) async {
    final shift = _resolveShift(profile);
    final office = _resolveOffice(profile);
    final loc = _resolveLocation(locations);
    final persona = ref.read(activePersonaProvider);

    setState(() {
      _loadingPreview = true;
      _errorMessage = null;
    });
    try {
      final preview = await ref.read(employeeApiProvider).previewBookingSeries(
            persona.userId,
            officeId: office.id,
            shiftId: shift.id,
            pickupLocationId: loc.id,
            direction: _direction,
            timePreference: _timePreference.apiValue,
            requestedTimeLocal: _formatTimeOfDay(_effectiveRequestedTime(shift)),
            recurrenceType: _recurrenceType,
            startDate: SolFormatters.isoDate(_selectedDate),
            endDate: _recurrenceType == 'CUSTOM' && _customEndDate != null
                ? SolFormatters.isoDate(_customEndDate!)
                : null,
            selectedDaysOfWeek: _recurrenceType == 'ONE_DAY'
                ? null
                : _selectedDays.toList(),
          );
      if (mounted) setState(() => _previewData = preview);
    } on ApiException catch (e) {
      if (mounted) setState(() => _errorMessage = '${e.code}: ${e.message}');
    } catch (e) {
      if (mounted) setState(() => _errorMessage = e.toString());
    } finally {
      if (mounted) setState(() => _loadingPreview = false);
    }
  }

  ShiftSummary _resolveShift(EmployeeProfileData profile) {
    final shifts = profile.availableShifts;
    final matchingShifts = shifts.where((s) => s.direction == _direction).toList();
    final activeShifts = matchingShifts.isNotEmpty ? matchingShifts : shifts;
    return activeShifts.firstWhere(
      (s) => s.id == _selectedShiftId,
      orElse: () => activeShifts.first,
    );
  }

  OfficeSummary _resolveOffice(EmployeeProfileData profile) {
    return profile.availableOffices.firstWhere(
      (o) => o.id == _selectedOfficeId,
      orElse: () => profile.office ?? profile.availableOffices.first,
    );
  }

  SavedLocation _resolveLocation(List<SavedLocation> locations) {
    return locations.firstWhere(
      (l) => l.id == _selectedLocationId,
      orElse: () => locations.firstWhere((l) => l.isDefault, orElse: () => locations.first),
    );
  }

  Future<void> _submit(
    EmployeeProfileData profile,
    List<SavedLocation> locations,
  ) async {
    final shift = _resolveShift(profile);
    final office = _resolveOffice(profile);
    final loc = _resolveLocation(locations);
    final requestedTimeStr = _formatTimeOfDay(_effectiveRequestedTime(shift));

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    try {
      if (_recurrenceType == 'ONE_DAY') {
        await ref.read(employeeBookingsProvider.notifier).submitBooking(
              shiftId: shift.id,
              officeId: office.id,
              pickupLocationId: loc.id,
              travelDate: SolFormatters.isoDate(_selectedDate),
              direction: _direction,
              scheduledPickupAt: _computeScheduledPickup(shift),
              timePreference: _timePreference.apiValue,
              requestedTimeLocal: requestedTimeStr,
              notes: _notesCtrl.text,
            );
        if (mounted) {
          Navigator.of(context).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Shift booking submitted for ${SolFormatters.readableDate(_selectedDate)}.',
              ),
            ),
          );
        }
      } else {
        final created = await ref.read(employeeSeriesProvider.notifier).submitSeries(
              officeId: office.id,
              shiftId: shift.id,
              pickupLocationId: loc.id,
              direction: _direction,
              timePreference: _timePreference.apiValue,
              requestedTimeLocal: requestedTimeStr,
              recurrenceType: _recurrenceType,
              startDate: SolFormatters.isoDate(_selectedDate),
              endDate: _recurrenceType == 'CUSTOM' && _customEndDate != null
                  ? SolFormatters.isoDate(_customEndDate!)
                  : null,
              selectedDaysOfWeek: _selectedDays.toList(),
              skipConflictingDates: _skipConflictingDates,
              notes: _notesCtrl.text,
            );
        if (mounted) {
          Navigator.of(context).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Recurring $_recurrenceType commute scheduled (${created.startDate} to ${created.endDate}).',
              ),
            ),
          );
        }
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _errorMessage = '${e.code}: ${e.message}');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _errorMessage = e.toString());
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(employeeProfileProvider);
    final locationsAsync = ref.watch(savedLocationsProvider);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + bottomInset),
      child: profileAsync.when(
        loading: () => const SizedBox(height: 220, child: LoadingState(cardCount: 2)),
        error: (err, _) => ErrorState(
          title: 'Cannot load shift templates',
          message: err.toString(),
          onRetry: () => ref.invalidate(employeeProfileProvider),
        ),
        data: (profile) {
          final locations = locationsAsync.asData?.value ?? const <SavedLocation>[];
          if (locations.isEmpty) {
            return EmptyState(
              title: 'No pickup pin saved',
              message: 'Add a verified pickup pin under Profile before booking a shift ride.',
              actionLabel: 'Close',
              onAction: () => Navigator.of(context).pop(),
            );
          }

          final now = DateTime.now();
          final today = DateTime(now.year, now.month, now.day);
          final dateOptions = [
            (label: 'Today', date: today),
            (label: 'Tomorrow', date: today.add(const Duration(days: 1))),
            (label: '+2 Days', date: today.add(const Duration(days: 2))),
          ];

          final matchingShifts = profile.availableShifts
              .where((s) => s.direction == _direction)
              .toList();
          final shiftChoices =
              matchingShifts.isNotEmpty ? matchingShifts : profile.availableShifts;
          final effectiveShiftId = shiftChoices.any((s) => s.id == _selectedShiftId)
              ? _selectedShiftId!
              : shiftChoices.first.id;
          final activeShift = shiftChoices.firstWhere(
            (s) => s.id == effectiveShiftId,
            orElse: () => shiftChoices.first,
          );
          final effectiveOfficeId =
              _selectedOfficeId ?? profile.office?.id ?? profile.availableOffices.first.id;
          final defaultLoc =
              locations.firstWhere((l) => l.isDefault, orElse: () => locations.first);
          final effectiveLocationId = locations.any((l) => l.id == _selectedLocationId)
              ? _selectedLocationId!
              : defaultLoc.id;
          final timeCopy = TimePreferenceCopy.resolve(
            direction: _direction,
            preference: _timePreference,
          );
          final chosenTod = _effectiveRequestedTime(activeShift);
          final requestedTimeStr = _formatTimeOfDay(chosenTod);

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Book Shift Commute', style: TypographyTokens.sectionTitle),
                const SizedBox(height: 4),
                Text(
                  'Booking closes ${profile.settings.bookingCutoffMinutes} mins prior to scheduled pickup.',
                  style: TypographyTokens.bodyMuted,
                ),
                const SizedBox(height: 16),
                const Text('Direction', style: TypographyTokens.label),
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(
                      value: 'LOGIN',
                      label: Text('Home -> Office'),
                      icon: Icon(Icons.login_rounded, size: 16),
                    ),
                    ButtonSegment(
                      value: 'LOGOUT',
                      label: Text('Office -> Home'),
                      icon: Icon(Icons.logout_rounded, size: 16),
                    ),
                  ],
                  selected: {_direction},
                  onSelectionChanged: (set) {
                    HarborMotion.hapticSelection();
                    setState(() {
                      _direction = set.first;
                      _selectedShiftId = null;
                      _hasCustomTime = false;
                      _previewData = null;
                      _errorMessage = null;
                    });
                  },
                ),
                const SizedBox(height: 16),
                const Text('Timing Preference', style: TypographyTokens.label),
                const SizedBox(height: 8),
                TimePreferenceSelector(
                  direction: _direction,
                  selected: _timePreference,
                  onChanged: (next) {
                    setState(() {
                      _timePreference = next;
                      _hasCustomTime = false;
                      _previewData = null;
                      _errorMessage = null;
                    });
                  },
                ),
                const SizedBox(height: 12),
                Semantics(
                  button: true,
                  label: '${timeCopy.timeFieldLabel}: $requestedTimeStr. Tap to change time.',
                  child: InkWell(
                    borderRadius: const BorderRadius.all(Radius.circular(12)),
                    onTap: () => _pickRequestedTime(activeShift),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: ColorTokens.surface,
                        borderRadius: const BorderRadius.all(Radius.circular(12)),
                        border: Border.all(color: ColorTokens.borderStrong),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.access_time_rounded, size: 18, color: ColorTokens.primary),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              timeCopy.timeFieldLabel,
                              style: TypographyTokens.body.copyWith(fontWeight: FontWeight.w500),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            requestedTimeStr,
                            style: TypographyTokens.telemetryTabular.copyWith(
                              fontSize: 15,
                              color: ColorTokens.primaryPressed,
                            ),
                          ),
                          const SizedBox(width: 4),
                          const Icon(Icons.chevron_right_rounded, size: 18),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text('Schedule Duration', style: TypographyTokens.label),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final rec in const [
                      (code: 'ONE_DAY', label: 'One Day'),
                      (code: 'WEEKLY', label: 'Weekly'),
                      (code: 'MONTHLY', label: 'Monthly'),
                      (code: 'CUSTOM', label: 'Custom'),
                    ])
                      ChoiceChip(
                        label: Text(rec.label),
                        selected: _recurrenceType == rec.code,
                        onSelected: (_) {
                          HarborMotion.hapticSelection();
                          setState(() {
                            _recurrenceType = rec.code;
                            _previewData = null;
                            _errorMessage = null;
                          });
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _recurrenceType == 'ONE_DAY' ? 'Travel Date' : 'Start Date',
                        style: TypographyTokens.label,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      SolFormatters.readableDate(_selectedDate),
                      style: TypographyTokens.telemetryTabular.copyWith(
                        fontSize: 12.5,
                        color: ColorTokens.primaryPressed,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final opt in dateOptions)
                      ChoiceChip(
                        label: Text(opt.label),
                        selected: opt.date == _selectedDate,
                        onSelected: (_) {
                          HarborMotion.hapticSelection();
                          setState(() {
                            _selectedDate = opt.date;
                            _previewData = null;
                            _errorMessage = null;
                          });
                        },
                      ),
                    ActionChip(
                      avatar: const Icon(Icons.calendar_today_outlined, size: 16),
                      label: const Text('Calendar'),
                      onPressed: () => _pickCalendarDate(isEndDate: false),
                    ),
                    if (_recurrenceType == 'CUSTOM')
                      ActionChip(
                        avatar: const Icon(Icons.event_available_outlined, size: 16),
                        label: Text(
                          'End: ${SolFormatters.isoDate(_customEndDate ?? _selectedDate)}',
                        ),
                        onPressed: () => _pickCalendarDate(isEndDate: true),
                      ),
                  ],
                ),
                if (_recurrenceType != 'ONE_DAY') ...[
                  const SizedBox(height: 14),
                  const Text('Commute Days', style: TypographyTokens.label),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final day in _allWeekdays)
                        FilterChip(
                          label: Text(day),
                          selected: _selectedDays.contains(day),
                          onSelected: (checked) {
                            HarborMotion.hapticSelection();
                            setState(() {
                              if (checked) {
                                _selectedDays.add(day);
                              } else if (_selectedDays.length > 1) {
                                _selectedDays.remove(day);
                              }
                              _previewData = null;
                            });
                          },
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SecondaryButton(
                    label: _loadingPreview
                        ? 'Calculating Calendar Dates...'
                        : 'Preview Dates & Calculated Pickup',
                    icon: Icons.calendar_view_week_outlined,
                    fullWidth: true,
                    onPressed: _loadingPreview ? null : () => _loadPreview(profile, locations),
                  ),
                ],
                if (_previewData != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: ColorTokens.surfaceMuted,
                      borderRadius: const BorderRadius.all(Radius.circular(12)),
                      border: Border.all(color: ColorTokens.borderSubtle),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${_previewData!.startDate} to ${_previewData!.endDate} · ${_previewData!.validDatesCount}/${_previewData!.totalDatesCount} valid date(s)',
                          style: TypographyTokens.label,
                        ),
                        if (_previewData!.infeasibleDatesCount > 0) ...[
                          const SizedBox(height: 6),
                          Text(
                            '${_previewData!.infeasibleDatesCount} date(s) flagged ARRIVE_BY lead-time infeasible.',
                            style: TypographyTokens.bodyMuted.copyWith(
                              color: ColorTokens.warning,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                        if (_previewData!.conflictingDatesCount > 0) ...[
                          const SizedBox(height: 6),
                          Text(
                            '${_previewData!.conflictingDatesCount} date(s) overlap with existing active bookings.',
                            style: TypographyTokens.bodyMuted.copyWith(
                              color: ColorTokens.dangerPressed,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                            value: _skipConflictingDates,
                            title: const Text('Skip overlapping dates automatically'),
                            onChanged: (v) =>
                                setState(() => _skipConflictingDates = v ?? false),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                const Text('Shift', style: TypographyTokens.label),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final shift in shiftChoices)
                      ChoiceChip(
                        label: Text('${shift.shiftTimeLocal} · ${shift.name}'),
                        selected: shift.id == effectiveShiftId,
                        onSelected: (_) {
                          HarborMotion.hapticSelection();
                          setState(() {
                            _selectedShiftId = shift.id;
                            _previewData = null;
                            _errorMessage = null;
                          });
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: effectiveOfficeId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Campus Office'),
                  items: profile.availableOffices
                      .map(
                        (o) => DropdownMenuItem(
                          value: o.id,
                          child: Text(o.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                      )
                      .toList(),
                  onChanged: (v) => setState(() {
                    _selectedOfficeId = v;
                    _previewData = null;
                  }),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: effectiveLocationId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Pickup / Drop Pin'),
                  items: locations
                      .map(
                        (l) => DropdownMenuItem(
                          value: l.id,
                          child: Text(
                            l.isDefault ? '${l.locationName} (Default)' : l.locationName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (v) => setState(() {
                    _selectedLocationId = v;
                    _previewData = null;
                  }),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _notesCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Pickup Landmark Note (Optional)',
                    hintText: 'e.g. Waiting near West Gate pillar 4',
                  ),
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: ColorTokens.dangerSoft,
                      borderRadius: const BorderRadius.all(Radius.circular(12)),
                      border: Border.all(color: ColorTokens.dangerBorder),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline, size: 18, color: ColorTokens.danger),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style: TypographyTokens.body.copyWith(
                              fontSize: 13,
                              color: ColorTokens.dangerPressed,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                PrimaryButton(
                  label: _recurrenceType == 'ONE_DAY'
                      ? 'Submit Ride Request'
                      : 'Confirm Recurring Series',
                  icon: Icons.check_circle_outline_rounded,
                  isLoading: _submitting,
                  onPressed: () => _submit(profile, locations),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

Future<void> showEditBookingSheet(
  BuildContext context,
  WidgetRef ref, {
  required EmployeeBooking booking,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _EditBookingSheet(booking: booking),
  );
}

class _EditBookingSheet extends ConsumerStatefulWidget {
  const _EditBookingSheet({required this.booking});

  final EmployeeBooking booking;

  @override
  ConsumerState<_EditBookingSheet> createState() => _EditBookingSheetState();
}

class _EditBookingSheetState extends ConsumerState<_EditBookingSheet> {
  late BookingTimePreference _timePreference;
  late TimeOfDay _requestedTime;
  late String _pickupLocationId;
  final TextEditingController _reasonCtrl =
      TextEditingController(text: 'Employee adjusted future schedule');
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _timePreference = BookingTimePreference.fromApi(widget.booking.timePreference);
    _pickupLocationId = widget.booking.pickupLocationId;
    final parts = (widget.booking.requestedTimeLocal ??
            SolFormatters.timeHm(widget.booking.scheduledPickupAt))
        .split(':');
    _requestedTime = TimeOfDay(
      hour: int.tryParse(parts[0]) ?? widget.booking.scheduledPickupAt.hour,
      minute: parts.length > 1
          ? (int.tryParse(parts[1]) ?? widget.booking.scheduledPickupAt.minute)
          : 0,
    );
  }

  @override
  void dispose() {
    _reasonCtrl.dispose();
    super.dispose();
  }

  String _hm(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _save() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final alert = await ref.read(employeeBookingsProvider.notifier).updateBookingOccurrence(
            bookingId: widget.booking.id,
            pickupLocationId: _pickupLocationId,
            timePreference: _timePreference.apiValue,
            requestedTimeLocal: _hm(_requestedTime),
            reason: _reasonCtrl.text.trim().isEmpty
                ? 'Employee updated future booking'
                : _reasonCtrl.text.trim(),
          );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              alert != null
                  ? 'Updated booking & alerted dispatch to review published trip.'
                  : 'Booking schedule updated.',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locations = ref.watch(savedLocationsProvider).asData?.value ?? const <SavedLocation>[];
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final copy = TimePreferenceCopy.resolve(
      direction: widget.booking.direction,
      preference: _timePreference,
    );

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 8, 20, 20 + bottomInset),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Update Ride (${SolFormatters.readableIsoDate(widget.booking.travelDate)})',
              style: TypographyTokens.sectionTitle,
            ),
            const SizedBox(height: 12),
            TimePreferenceSelector(
              direction: widget.booking.direction,
              selected: _timePreference,
              onChanged: (next) => setState(() => _timePreference = next),
            ),
            const SizedBox(height: 12),
            SecondaryButton(
              label: '${copy.timeFieldLabel}: ${_hm(_requestedTime)}',
              icon: Icons.access_time_rounded,
              fullWidth: true,
              onPressed: () async {
                final picked = await showTimePicker(
                  context: context,
                  initialTime: _requestedTime,
                );
                if (picked != null) setState(() => _requestedTime = picked);
              },
            ),
            if (locations.isNotEmpty) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: locations.any((l) => l.id == _pickupLocationId)
                    ? _pickupLocationId
                    : locations.first.id,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Pickup / Drop Pin'),
                items: locations
                    .map((l) => DropdownMenuItem(value: l.id, child: Text(l.locationName)))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _pickupLocationId = v);
                },
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _reasonCtrl,
              decoration: const InputDecoration(labelText: 'Change Reason'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: TypographyTokens.bodyMuted.copyWith(color: ColorTokens.dangerPressed),
              ),
            ],
            const SizedBox(height: 16),
            PrimaryButton(
              label: 'Save Schedule Changes',
              icon: Icons.save_outlined,
              isLoading: _submitting,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> showRunningLateSheet(
  BuildContext context,
  WidgetRef ref, {
  required String tripId,
  int initialMinutes = 10,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _RunningLateSheet(tripId: tripId, initialMinutes: initialMinutes),
  );
}

class _RunningLateSheet extends ConsumerStatefulWidget {
  const _RunningLateSheet({required this.tripId, required this.initialMinutes});

  final String tripId;
  final int initialMinutes;

  @override
  ConsumerState<_RunningLateSheet> createState() => _RunningLateSheetState();
}

class _RunningLateSheetState extends ConsumerState<_RunningLateSheet> {
  late int _etaMinutes;
  final TextEditingController _noteCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _etaMinutes = widget.initialMinutes.clamp(5, 45);
  }

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      await ref.read(upcomingTripProvider.notifier).reportRunningLate(
            tripId: widget.tripId,
            etaMinutes: _etaMinutes,
            note: _noteCtrl.text,
          );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Driver & dispatch notified: +$_etaMinutes min late.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    const presets = [5, 10, 15, 20];

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Running Late', style: TypographyTokens.sectionTitle),
          const SizedBox(height: 6),
          const Text(
            'Alert your driver and dispatch desk immediately so route dwell timing stays accurate.',
            style: TypographyTokens.bodyMuted,
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final mins in presets)
                ChoiceChip(
                  label: Text('+$mins min'),
                  selected: _etaMinutes == mins,
                  onSelected: (_) {
                    HarborMotion.hapticSelection();
                    setState(() => _etaMinutes = mins);
                  },
                ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Text('Custom Delay', style: TypographyTokens.label),
              const Spacer(),
              Text(
                '+$_etaMinutes mins',
                style: TypographyTokens.telemetryTabular.copyWith(color: ColorTokens.warning),
              ),
            ],
          ),
          Slider(
            value: _etaMinutes.toDouble(),
            min: 2,
            max: 45,
            divisions: 43,
            onChanged: (v) => setState(() => _etaMinutes = v.round()),
          ),
          TextField(
            controller: _noteCtrl,
            decoration: const InputDecoration(
              labelText: 'Reason / Note for Driver (Optional)',
              hintText: 'e.g. Waiting for security gate clearance',
            ),
          ),
          const SizedBox(height: 18),
          PrimaryButton(
            label: 'Notify Driver (+$_etaMinutes min)',
            icon: Icons.schedule_send_rounded,
            isLoading: _submitting,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

Future<void> showCannotBoardDialog(
  BuildContext context,
  WidgetRef ref, {
  required String bookingId,
  required int cancelCutoffMinutes,
}) async {
  await showDialog<void>(
    context: context,
    builder: (_) => _CannotBoardDialog(
      bookingId: bookingId,
      cancelCutoffMinutes: cancelCutoffMinutes,
    ),
  );
}

class _CannotBoardDialog extends ConsumerStatefulWidget {
  const _CannotBoardDialog({
    required this.bookingId,
    required this.cancelCutoffMinutes,
  });

  final String bookingId;
  final int cancelCutoffMinutes;

  @override
  ConsumerState<_CannotBoardDialog> createState() => _CannotBoardDialogState();
}

class _CannotBoardDialogState extends ConsumerState<_CannotBoardDialog> {
  final TextEditingController _reasonCtrl =
      TextEditingController(text: 'Working from home today');
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _reasonCtrl.dispose();
    super.dispose();
  }

  Future<void> _confirmCancel() async {
    final reason = _reasonCtrl.text.trim();
    if (reason.length < 3) {
      setState(() => _error = 'Please enter at least 3 characters.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(employeeBookingsProvider.notifier).cancelBooking(
            widget.bookingId,
            reason,
          );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ride cancelled and driver manifest updated.')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = '${e.code}: ${e.message}');
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Cannot Board Ride?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Self-cancellation is allowed up to ${widget.cancelCutoffMinutes} minutes before pickup. The driver will automatically skip your stop.',
              style: TypographyTokens.bodyMuted,
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final quick in const [
                  'Working from home today',
                  'Shift extended',
                  'Taking personal vehicle',
                ])
                  ActionChip(
                    label: Text(quick, style: const TextStyle(fontSize: 12)),
                    onPressed: () {
                      _reasonCtrl.text = quick;
                      setState(() => _error = null);
                    },
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reasonCtrl,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Cancellation Reason'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: TypographyTokens.body.copyWith(
                  fontSize: 12.5,
                  color: ColorTokens.dangerPressed,
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('Keep Ride'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: ColorTokens.danger),
          onPressed: _submitting ? null : _confirmCancel,
          child: Text(_submitting ? 'Cancelling...' : 'Confirm Cannot Board'),
        ),
      ],
    );
  }
}
