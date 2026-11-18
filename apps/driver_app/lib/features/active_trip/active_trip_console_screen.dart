import 'dart:async';

import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/models/driver_models.dart';
import '../../core/permissions/driver_permission_coordinator.dart';
import '../../core/state/driver_providers.dart';
import '../../core/utils/driver_formatters.dart';

class ActiveTripConsoleScreen extends ConsumerStatefulWidget {
  const ActiveTripConsoleScreen({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<ActiveTripConsoleScreen> createState() =>
      _ActiveTripConsoleScreenState();
}

class _ActiveTripConsoleScreenState extends ConsumerState<ActiveTripConsoleScreen> {
  Timer? _waitTicker;
  bool _actionBusy = false;

  @override
  void initState() {
    super.initState();
    _waitTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _waitTicker?.cancel();
    super.dispose();
  }

  Future<void> _handleArrive(DriverTripStop stop) async {
    setState(() => _actionBusy = true);
    try {
      await ref.read(tripExecutionActionsProvider).arriveAtStop(widget.tripId, stop.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Arrived at ${stop.locationName}. Wait timer active.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _handlePickup(
    DriverTripStop stop,
    DriverStopPassenger passenger,
  ) async {
    String? enteredOtp;
    if (passenger.otpRequired) {
      enteredOtp = await showDialog<String>(
        context: context,
        builder: (_) => _OtpEntryDialog(passengerName: passenger.fullName),
      );
      if (enteredOtp == null) return;
    }

    setState(() => _actionBusy = true);
    try {
      await ref.read(tripExecutionActionsProvider).pickupPassenger(
            widget.tripId,
            stop.id,
            passenger.id,
            otpCode: enteredOtp,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${passenger.fullName} marked Boarded.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _handleNoShow(
    DriverTripStop stop,
    DriverStopPassenger passenger,
  ) async {
    final result = await showModalBottomSheet<({String reasonCode, String notes})>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _NoShowReasonSheet(passengerName: passenger.fullName),
    );
    if (result == null) return;

    setState(() => _actionBusy = true);
    try {
      await ref.read(tripExecutionActionsProvider).markNoShow(
            widget.tripId,
            stop.id,
            passenger.id,
            reasonCode: result.reasonCode,
            notes: result.notes,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${passenger.fullName} logged as No-Show.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _handleCompleteTrip() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Complete Shift Trip?'),
        content: const Text(
          'Confirm all onboard passengers have reached destination safely. Live trip GPS tracking will stop immediately.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Not Yet'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Complete Trip'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _actionBusy = true);
    try {
      await ref.read(tripExecutionActionsProvider).completeTrip(widget.tripId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Trip completed. Active GPS tracking stopped.')),
        );
        context.go('/today');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _handleDriverSos() async {
    final result = await showDialog<({String notes})>(
      context: context,
      builder: (_) => const _DriverSosDialog(),
    );
    if (result == null || !mounted) return;

    HarborMotion.hapticAlert();
    setState(() => _actionBusy = true);
    try {
      await ref.read(tripExecutionActionsProvider).triggerDriverSos(
            tripId: widget.tripId,
            notes: result.notes.isEmpty ? null : result.notes,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('CRITICAL SOS sent to transport control desk.'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final manifestAsync = ref.watch(tripManifestProvider(widget.tripId));
    final isOffline = ref.watch(driverIsOfflineProvider);
    final pendingEvents = ref.watch(pendingOfflineEventsProvider).asData?.value ?? const [];
    final telemetry = ref.watch(driverTelemetryProvider);

    ref.listen<AsyncValue<DriverTripManifest>>(tripManifestProvider(widget.tripId), (_, next) {
      if (next.isLoading) return;
      final manifest = next.asData?.value;
      if (manifest == null) return;
      final st = manifest.status.toUpperCase();
      if (st == 'IN_PROGRESS') {
        ref
            .read(driverTelemetryProvider.notifier)
            .ensureDutyTrackingForTrip(manifest.tripId, manifest.tripCode);
      } else if (st == 'COMPLETED' || st == 'CANCELLED' || st == 'ABORTED') {
        ref.read(driverTelemetryProvider.notifier).stopDutyTracking();
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Active Trip Console'),
        actions: [
          IconButton(
            tooltip: 'Emergency SOS',
            onPressed: _actionBusy ? null : _handleDriverSos,
            icon: const Icon(Icons.sos_rounded, color: ColorTokens.danger),
          ),
          IconButton(
            tooltip: 'Sync now',
            onPressed: () {
              ref.read(driverSyncCoordinatorProvider).flushPendingEvents();
              ref.read(driverTelemetryProvider.notifier).flushPendingSamples();
              ref.invalidate(tripManifestProvider(widget.tripId));
            },
            icon: const Icon(Icons.sync_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          OfflineBanner(
            isOffline: isOffline || pendingEvents.isNotEmpty,
            message: isOffline
                ? 'Offline · ${pendingEvents.length} action(s) saved locally'
                : '${pendingEvents.length} queued event(s) syncing...',
          ),
          Expanded(
            child: manifestAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(16),
                child: LoadingState(cardCount: 2, cardHeight: 160),
              ),
              error: (err, _) => Padding(
                padding: const EdgeInsets.all(16),
                child: ErrorState(
                  title: 'Could not load trip console',
                  message: err.toString(),
                  onRetry: () => ref.invalidate(tripManifestProvider(widget.tripId)),
                ),
              ),
              data: (manifest) {
                final currentStop = manifest.nextPendingStop;
                final completedCount = manifest.stops.where((s) => s.status == 'COMPLETED').length;

                return Column(
                  children: [
                    // Telemetry Strip
                    Container(
                      width: double.infinity,
                      color: ColorTokens.surfaceElevated,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  '${manifest.tripCode} · Stop ${currentStop?.sequenceNo ?? manifest.stops.length} of ${manifest.stops.length}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TypographyTokens.telemetryTabular.copyWith(fontSize: 13),
                                ),
                              ),
                              const SizedBox(width: 8),
                              _DriverGpsPill(telemetry: telemetry),
                              const SizedBox(width: 6),
                              StatusBadge.fromStatus(manifest.status),
                            ],
                          ),
                          if (telemetry.health == DriverGpsHealth.gpsDisabled ||
                              telemetry.health == DriverGpsHealth.permissionRevoked) ...[
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: ColorTokens.dangerSoft,
                                borderRadius: const BorderRadius.all(Radius.circular(10)),
                                border: Border.all(color: ColorTokens.dangerBorder),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.gps_off_rounded,
                                      size: 16, color: ColorTokens.dangerPressed),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      telemetry.health == DriverGpsHealth.gpsDisabled
                                          ? 'Device GPS is turned off. Re-enable location services to share live ETA.'
                                          : 'Location permission revoked. Re-enable location access for active trip tracking.',
                                      style: TypographyTokens.bodyMuted.copyWith(
                                        color: ColorTokens.dangerPressed,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  TextButton(
                                    onPressed: () => ref
                                        .read(driverPermissionCoordinatorProvider)
                                        .openSystemSettings(),
                                    child: const Text('Settings'),
                                  ),
                                ],
                              ),
                            ),
                          ] else if (telemetry.pendingSampleCount > 0) ...[
                            const SizedBox(height: 4),
                            Text(
                              'Telemetry queue: ${telemetry.pendingSampleCount} GPS fix(es) awaiting upload',
                              style: TypographyTokens.bodyMuted.copyWith(fontSize: 11.5),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const Divider(height: 1),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
                        children: [
                          Center(
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 680),
                              child: currentStop == null || manifest.status == 'COMPLETED'
                                  ? EmptyState(
                                      icon: Icons.verified_rounded,
                                      title: 'All stops resolved',
                                      message:
                                          '$completedCount of ${manifest.stops.length} stops completed.',
                                      actionLabel: 'Back to Today Duty',
                                      onAction: () => context.go('/today'),
                                    )
                                  : Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        _CurrentStopHeroCard(
                                          stop: currentStop,
                                          requiredWaitSeconds: manifest.noShowWaitSeconds,
                                          actionBusy: _actionBusy,
                                          onPickup: (p) => _handlePickup(currentStop, p),
                                          onNoShow: (p) => _handleNoShow(currentStop, p),
                                        ),
                                      ],
                                    ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (currentStop != null && manifest.status != 'COMPLETED')
                      _BottomStationaryDock(
                        stop: currentStop,
                        tripStatus: manifest.status,
                        allPickupsResolved: manifest.allPickupsResolved,
                        busy: _actionBusy,
                        onNavigate: () => launchGoogleMapsTurnByTurn(
                          context,
                          navigationUrl: currentStop.navigationUrl,
                          latitude: currentStop.latitude,
                          longitude: currentStop.longitude,
                          label: currentStop.locationName,
                        ),
                        onArrive: () => _handleArrive(currentStop),
                        onCompleteTrip: _handleCompleteTrip,
                      ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _CurrentStopHeroCard extends StatelessWidget {
  const _CurrentStopHeroCard({
    required this.stop,
    required this.requiredWaitSeconds,
    required this.actionBusy,
    required this.onPickup,
    required this.onNoShow,
  });

  final DriverTripStop stop;
  final int requiredWaitSeconds;
  final bool actionBusy;
  final ValueChanged<DriverStopPassenger> onPickup;
  final ValueChanged<DriverStopPassenger> onNoShow;

  @override
  Widget build(BuildContext context) {
    final arrivedAt = stop.actualArrivalAt;
    final hasArrived = stop.status.toUpperCase() == 'ARRIVED' || arrivedAt != null;
    final elapsedWaitSec =
        arrivedAt != null ? DateTime.now().difference(arrivedAt).inSeconds.clamp(0, 86400) : 0;
    final remainingWaitSec = (requiredWaitSeconds - elapsedWaitSec).clamp(0, requiredWaitSeconds);
    final waitComplete = hasArrived && elapsedWaitSec >= requiredWaitSeconds;

    return Container(
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
                  stop.isOffice ? 'TERMINUS · CAMPUS DROP' : 'CURRENT STOP #${stop.sequenceNo}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypographyTokens.label.copyWith(
                    color: ColorTokens.primaryPressed,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              StatusBadge.fromStatus(stop.status),
            ],
          ),
          const SizedBox(height: 8),
          Text(stop.locationName, style: TypographyTokens.sectionTitle),
          const SizedBox(height: 4),
          Text(stop.address, style: TypographyTokens.bodyMuted),
          if (hasArrived && !stop.isOffice) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: waitComplete ? ColorTokens.warningSoft : ColorTokens.primarySoft,
                borderRadius: const BorderRadius.all(Radius.circular(14)),
                border: Border.all(
                  color: waitComplete ? ColorTokens.warningBorder : ColorTokens.primaryBorder,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.timer_outlined,
                        size: 18,
                        color: waitComplete
                            ? const Color(0xFFB45309)
                            : ColorTokens.primaryPressed,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          waitComplete
                              ? 'Wait Elapsed (${DriverFormatters.countdownMmSs(elapsedWaitSec)} / ${DriverFormatters.countdownMmSs(requiredWaitSeconds)})'
                              : 'Mandatory Wait · ${DriverFormatters.countdownMmSs(remainingWaitSec)} left',
                          style: TypographyTokens.telemetryTabular.copyWith(
                            fontSize: 13.5,
                            color: waitComplete
                                ? const Color(0xFFB45309)
                                : ColorTokens.primaryPressed,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: const BorderRadius.all(Radius.circular(99)),
                    child: LinearProgressIndicator(
                      minHeight: 6,
                      value: requiredWaitSeconds == 0
                          ? 1.0
                          : (elapsedWaitSec / requiredWaitSeconds).clamp(0.0, 1.0),
                      color: waitComplete ? ColorTokens.warning : ColorTokens.primary,
                      backgroundColor: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (!stop.isOffice && stop.passengers.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Divider(height: 1),
            const SizedBox(height: 14),
            for (var i = 0; i < stop.passengers.length; i++) ...[
              _DriverPassengerActionTile(
                passenger: stop.passengers[i],
                canAct: hasArrived && isPassengerPending(stop.passengers[i].status) && !actionBusy,
                waitComplete: waitComplete,
                remainingWaitSec: remainingWaitSec,
                onCall: () => launchDriverDialer(context, stop.passengers[i].phone),
                onPickup: () => onPickup(stop.passengers[i]),
                onNoShow: () => onNoShow(stop.passengers[i]),
              ),
              if (i < stop.passengers.length - 1) const SizedBox(height: 12),
            ],
          ],
          if (stop.isOffice) ...[
            const SizedBox(height: 12),
            const Text(
              'Drop onboard employees at main gate bay and tap Complete Trip below.',
              style: TypographyTokens.bodyMuted,
            ),
          ],
        ],
      ),
    );
  }
}

class _DriverPassengerActionTile extends StatelessWidget {
  const _DriverPassengerActionTile({
    required this.passenger,
    required this.canAct,
    required this.waitComplete,
    required this.remainingWaitSec,
    required this.onCall,
    required this.onPickup,
    required this.onNoShow,
  });

  final DriverStopPassenger passenger;
  final bool canAct;
  final bool waitComplete;
  final int remainingWaitSec;
  final VoidCallback onCall;
  final VoidCallback onPickup;
  final VoidCallback onNoShow;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ColorTokens.surfaceElevated,
        borderRadius: const BorderRadius.all(Radius.circular(14)),
        border: Border.all(color: ColorTokens.borderSubtle),
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
                    Text(passenger.fullName, style: TypographyTokens.cardTitle),
                    Text(
                      '${passenger.employeeCode} · ${passenger.department}',
                      style: TypographyTokens.bodyMuted,
                    ),
                  ],
                ),
              ),
              StatusBadge.fromStatus(passenger.status),
              const SizedBox(width: 6),
              SizedBox(
                width: 48,
                height: 48,
                child: IconButton.filledTonal(
                  tooltip: 'Call commuter',
                  onPressed: onCall,
                  icon: const Icon(Icons.call_rounded, size: 20),
                ),
              ),
            ],
          ),
          if (passenger.runningLateEtaMinutes != null) ...[
            const SizedBox(height: 8),
            StatusBadge(
              label: 'Commuter running +${passenger.runningLateEtaMinutes}m late',
              tone: StatusTone.warning,
              icon: Icons.schedule_rounded,
            ),
          ],
          if (canAct) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 54,
                    child: PrimaryButton(
                      label: passenger.otpRequired ? 'Picked Up (OTP)' : 'Picked Up',
                      icon: Icons.check_rounded,
                      onPressed: onPickup,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: SizedBox(
                    height: 54,
                    child: SecondaryButton(
                      label: waitComplete
                          ? 'No-Show'
                          : 'Wait ${DriverFormatters.countdownMmSs(remainingWaitSec)}',
                      icon: Icons.person_off_outlined,
                      isDanger: waitComplete,
                      fullWidth: true,
                      onPressed: waitComplete ? onNoShow : null,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _BottomStationaryDock extends StatelessWidget {
  const _BottomStationaryDock({
    required this.stop,
    required this.tripStatus,
    required this.allPickupsResolved,
    required this.busy,
    required this.onNavigate,
    required this.onArrive,
    required this.onCompleteTrip,
  });

  final DriverTripStop stop;
  final String tripStatus;
  final bool allPickupsResolved;
  final bool busy;
  final VoidCallback onNavigate;
  final VoidCallback onArrive;
  final VoidCallback onCompleteTrip;

  @override
  Widget build(BuildContext context) {
    final arrived = stop.status.toUpperCase() == 'ARRIVED' || stop.actualArrivalAt != null;

    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        decoration: const BoxDecoration(
          color: ColorTokens.surface,
          border: Border(top: BorderSide(color: ColorTokens.borderSubtle)),
        ),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  height: 58,
                  width: double.infinity,
                  child: PrimaryButton(
                    label: stop.isOffice
                        ? 'Navigate to ${stop.locationName}'
                        : 'Navigate in Google Maps',
                    icon: Icons.navigation_rounded,
                    onPressed: busy ? null : onNavigate,
                  ),
                ),
                const SizedBox(height: 10),
                if (stop.isOffice && allPickupsResolved && tripStatus == 'IN_PROGRESS')
                  SizedBox(
                    height: 56,
                    width: double.infinity,
                    child: SecondaryButton(
                      label: 'Complete Trip at Campus',
                      icon: Icons.flag_rounded,
                      fullWidth: true,
                      isLoading: busy,
                      onPressed: onCompleteTrip,
                    ),
                  )
                else if (!arrived)
                  SizedBox(
                    height: 56,
                    width: double.infinity,
                    child: SecondaryButton(
                      label: 'I Have Arrived at Stop #${stop.sequenceNo}',
                      icon: Icons.pin_drop_rounded,
                      fullWidth: true,
                      isLoading: busy,
                      onPressed: onArrive,
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

class _OtpEntryDialog extends StatefulWidget {
  const _OtpEntryDialog({required this.passengerName});

  final String passengerName;

  @override
  State<_OtpEntryDialog> createState() => _OtpEntryDialogState();
}

class _OtpEntryDialogState extends State<_OtpEntryDialog> {
  final TextEditingController _otpCtrl = TextEditingController();

  @override
  void dispose() {
    _otpCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Enter 4-Digit Boarding OTP'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Ask ${widget.passengerName} for their 4-digit boarding pass pin.',
            style: TypographyTokens.bodyMuted,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _otpCtrl,
            keyboardType: TextInputType.number,
            maxLength: 4,
            autofocus: true,
            style: TypographyTokens.otpHero,
            textAlign: TextAlign.center,
            decoration: const InputDecoration(
              labelText: '4-Digit OTP',
              counterText: '',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(null),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            final pin = _otpCtrl.text.trim();
            if (pin.length < 4) return;
            Navigator.of(context).pop(pin);
          },
          child: const Text('Confirm Boarding'),
        ),
      ],
    );
  }
}

class _NoShowReasonSheet extends StatefulWidget {
  const _NoShowReasonSheet({required this.passengerName});

  final String passengerName;

  @override
  State<_NoShowReasonSheet> createState() => _NoShowReasonSheetState();
}

class _NoShowReasonSheetState extends State<_NoShowReasonSheet> {
  String _selectedReason = 'PASSENGER_UNREACHABLE';
  final TextEditingController _notesCtrl = TextEditingController();

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const reasons = [
      'PASSENGER_UNREACHABLE',
      'DID_NOT_EXIT',
      'CANCELLED_AT_DOOR',
      'WRONG_LOCATION',
      'OTHER',
    ];
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + bottomInset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Mark ${widget.passengerName} No-Show', style: TypographyTokens.sectionTitle),
            const SizedBox(height: 6),
            const Text(
              'Select mandatory reason code. Your live GPS coordinate & wait duration are attached automatically.',
              style: TypographyTokens.bodyMuted,
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final code in reasons)
                  ChoiceChip(
                    label: Text(DriverFormatters.noShowReasonLabel(code)),
                    selected: _selectedReason == code,
                    onSelected: (_) {
                      HarborMotion.hapticSelection();
                      setState(() => _selectedReason = code);
                    },
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notesCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Driver Notes (Optional)',
                hintText: 'e.g. Called twice, no response at pickup gate',
              ),
            ),
            const SizedBox(height: 16),
            PrimaryButton(
              label: 'Confirm No-Show',
              isDanger: true,
              icon: Icons.person_off_rounded,
              onPressed: () => Navigator.of(context).pop((
                reasonCode: _selectedReason,
                notes: _notesCtrl.text.trim(),
              )),
            ),
          ],
        ),
      ),
    );
  }
}

class _DriverGpsPill extends StatelessWidget {
  const _DriverGpsPill({required this.telemetry});

  final DriverTelemetryStatus telemetry;

  @override
  Widget build(BuildContext context) {
    final (label, tone) = switch (telemetry.health) {
      DriverGpsHealth.live => (
          telemetry.lastAccuracyM != null
              ? 'GPS ±${telemetry.lastAccuracyM!.round()}m'
              : 'GPS Live',
          StatusTone.success,
        ),
      DriverGpsHealth.lowAccuracy => (
          telemetry.lastAccuracyM != null
              ? 'Low Acc ±${telemetry.lastAccuracyM!.round()}m'
              : 'Low Accuracy',
          StatusTone.warning,
        ),
      DriverGpsHealth.gpsDisabled => ('GPS Off', StatusTone.danger),
      DriverGpsHealth.permissionRevoked => ('No Perm', StatusTone.danger),
      DriverGpsHealth.idle => ('Standby', StatusTone.neutral),
    };
    return StatusBadge(label: label, tone: tone, icon: Icons.gps_fixed_rounded);
  }
}

class _DriverSosDialog extends StatefulWidget {
  const _DriverSosDialog();

  @override
  State<_DriverSosDialog> createState() => _DriverSosDialogState();
}

class _DriverSosDialogState extends State<_DriverSosDialog> {
  final TextEditingController _noteCtrl = TextEditingController();

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Trigger Driver Emergency SOS?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Immediately alerts the transport security desk as CRITICAL SOS with your latest cab GPS coordinates.',
            style: TypographyTokens.bodyMuted,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _noteCtrl,
            maxLength: 200,
            decoration: const InputDecoration(
              labelText: 'Situation (Optional)',
              hintText: 'Breakdown, road hazard, or medical assist',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(null),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: ColorTokens.danger),
          onPressed: () => Navigator.of(context).pop((notes: _noteCtrl.text.trim())),
          child: const Text('Send CRITICAL SOS'),
        ),
      ],
    );
  }
}

