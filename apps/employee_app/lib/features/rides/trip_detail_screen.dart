import 'dart:ui' show lerpDouble;

import 'package:etms_core/etms_core.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/models/employee_models.dart';
import '../../core/state/employee_providers.dart';
import '../../core/utils/formatters.dart';
import 'ride_action_sheets.dart';

class TripDetailScreen extends ConsumerStatefulWidget {
  const TripDetailScreen({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<TripDetailScreen> createState() => _TripDetailScreenState();
}

class _TripDetailScreenState extends ConsumerState<TripDetailScreen> {
  final MapController _mapController = MapController();
  LatLng? _previousCabPos;
  LatLng? _currentCabPos;

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  Future<void> _showNoShowAppealDialog(String tripId) async {
    final note = await showDialog<String>(
      context: context,
      builder: (_) => const _NoShowAppealDialog(),
    );
    if (note == null || note.isEmpty || !mounted) return;

    try {
      await ref.read(upcomingTripProvider.notifier).appealNoShow(tripId, note);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No-show appeal submitted to transport desk.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final detailAsync = ref.watch(tripDetailProvider(widget.tripId));
    final showMapTiles = ref.watch(enableMapTilesProvider);
    final isSocketConnected = ref.watch(socketConnectedProvider).asData?.value ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Trip Execution & Timeline'),
        actions: [
          IconButton(
            tooltip: 'Refresh telemetry',
            onPressed: () => ref.invalidate(tripDetailProvider(widget.tripId)),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: detailAsync.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(16),
          child: LoadingState(cardCount: 3),
        ),
        error: (err, _) => Padding(
          padding: const EdgeInsets.all(16),
          child: ErrorState(
            title: 'Could not load trip timeline',
            message: err.toString(),
            onRetry: () => ref.invalidate(tripDetailProvider(widget.tripId)),
          ),
        ),
        data: (trip) {
          final yourStop = trip.yourStop;
          final officeStop = trip.officeStop;
          final gps = ref.watch(
            effectiveTripTelemetryProvider((tripId: trip.tripId, base: trip.gpsTelemetry)),
          );
          if (gps != null) {
            final nextLatLng = LatLng(gps.latitude, gps.longitude);
            if (_currentCabPos == null) {
              _previousCabPos = nextLatLng;
              _currentCabPos = nextLatLng;
            } else if (_currentCabPos!.latitude != nextLatLng.latitude ||
                _currentCabPos!.longitude != nextLatLng.longitude) {
              _previousCabPos = _currentCabPos;
              _currentCabPos = nextLatLng;
            }
          }
          final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;

          final visiblePoints = <LatLng>[
            if (yourStop?.latitude != null && yourStop?.longitude != null)
              LatLng(yourStop!.latitude!, yourStop.longitude!),
            if (officeStop?.latitude != null && officeStop?.longitude != null)
              LatLng(officeStop!.latitude!, officeStop.longitude!),
            if (gps != null) LatLng(gps.latitude, gps.longitude),
          ];
          final centerPoint = visiblePoints.isNotEmpty
              ? visiblePoints.first
              : const LatLng(17.4486, 78.3908);

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(tripDetailProvider(widget.tripId));
              await ref.read(tripDetailProvider(widget.tripId).future);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 720),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: const BorderRadius.all(Radius.circular(18)),
                          child: Container(
                            height: 260,
                            decoration: BoxDecoration(
                              color: ColorTokens.surfaceMuted,
                              border: Border.all(color: ColorTokens.borderSubtle),
                              borderRadius: const BorderRadius.all(Radius.circular(18)),
                            ),
                            child: Stack(
                              children: [
                                TweenAnimationBuilder<double>(
                                  tween: Tween<double>(
                                    begin: (reduceMotion || (gps?.isStale ?? false)) ? 1.0 : 0.0,
                                    end: 1.0,
                                  ),
                                  duration: const Duration(milliseconds: 850),
                                  curve: Curves.easeOutCubic,
                                  key: ValueKey(
                                    gps == null ? 'no-gps' : '${gps.latitude}:${gps.longitude}',
                                  ),
                                  builder: (context, t, _) {
                                    final cabPos = gps == null
                                        ? null
                                        : (_previousCabPos != null && !gps.isStale && !reduceMotion)
                                            ? LatLng(
                                                lerpDouble(
                                                    _previousCabPos!.latitude, gps.latitude, t)!,
                                                lerpDouble(
                                                    _previousCabPos!.longitude, gps.longitude, t)!,
                                              )
                                            : LatLng(gps.latitude, gps.longitude);

                                    return FlutterMap(
                                      mapController: _mapController,
                                      options: MapOptions(
                                        initialCenter: centerPoint,
                                        initialZoom: 12.6,
                                      ),
                                      children: [
                                        if (showMapTiles)
                                          TileLayer(
                                            urlTemplate:
                                                'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                                            userAgentPackageName: 'com.projectsol.employee_app',
                                          ),
                                        if (yourStop?.latitude != null &&
                                            officeStop?.latitude != null)
                                          PolylineLayer(
                                            polylines: [
                                              Polyline(
                                                points: [
                                                  LatLng(yourStop!.latitude!, yourStop.longitude!),
                                                  LatLng(officeStop!.latitude!, officeStop.longitude!),
                                                ],
                                                color: ColorTokens.primary,
                                                strokeWidth: 3.5,
                                              ),
                                            ],
                                          ),
                                        if (cabPos != null &&
                                            gps?.accuracyM != null &&
                                            gps!.accuracyM! > 0)
                                          CircleLayer(
                                            circles: [
                                              CircleMarker(
                                                point: cabPos,
                                                radius: gps.accuracyM!.clamp(15, 250),
                                                useRadiusInMeter: true,
                                                color: (gps.isStale
                                                        ? ColorTokens.warning
                                                        : ColorTokens.primary)
                                                    .withValues(alpha: 0.12),
                                                borderColor: (gps.isStale
                                                        ? ColorTokens.warning
                                                        : ColorTokens.primary)
                                                    .withValues(alpha: 0.45),
                                                borderStrokeWidth: 1.2,
                                              ),
                                            ],
                                          ),
                                        MarkerLayer(
                                          markers: [
                                            if (yourStop?.latitude != null)
                                              Marker(
                                                point: LatLng(
                                                  yourStop!.latitude!,
                                                  yourStop.longitude!,
                                                ),
                                                width: 42,
                                                height: 42,
                                                child: const _MapPinBadge(
                                                  icon: Icons.person_pin_circle_rounded,
                                                  color: ColorTokens.primary,
                                                ),
                                              ),
                                            if (officeStop?.latitude != null)
                                              Marker(
                                                point: LatLng(
                                                  officeStop!.latitude!,
                                                  officeStop.longitude!,
                                                ),
                                                width: 42,
                                                height: 42,
                                                child: const _MapPinBadge(
                                                  icon: Icons.apartment_rounded,
                                                  color: ColorTokens.inkPrimary,
                                                ),
                                              ),
                                            if (cabPos != null)
                                              Marker(
                                                point: cabPos,
                                                width: 46,
                                                height: 46,
                                                child: Transform.rotate(
                                                  angle: (gps?.headingDeg != null && !(gps?.isStale ?? false))
                                                      ? gps!.headingDeg! * 0.0174532925
                                                      : 0.0,
                                                  child: _MapPinBadge(
                                                    icon: gps?.headingDeg != null && !(gps?.isStale ?? false)
                                                        ? Icons.navigation_rounded
                                                        : Icons.local_taxi_rounded,
                                                    color: (gps?.isStale ?? false)
                                                        ? ColorTokens.warning
                                                        : ColorTokens.success,
                                                  ),
                                                ),
                                              ),
                                          ],
                                        ),
                                      ],
                                    );
                                  },
                                ),
                                Positioned(
                                  top: 12,
                                  left: 12,
                                  right: 12,
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Flexible(
                                        child: HarborGlassSurface(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 6,
                                          ),
                                          child: GPSStatusIndicator.fromTelemetry(
                                            ageSeconds: gps?.ageSeconds,
                                            isStale: gps?.isStale ?? false,
                                          ),
                                        ),
                                      ),
                                      if (gps != null) ...[
                                        const SizedBox(width: 8),
                                        HarborPressable(
                                          onTap: () => _mapController.move(
                                            LatLng(gps.latitude, gps.longitude),
                                            14.2,
                                          ),
                                          child: const HarborGlassSurface(
                                            padding: EdgeInsets.symmetric(
                                              horizontal: 10,
                                              vertical: 6,
                                            ),
                                            child: Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                Icon(
                                                  Icons.my_location_rounded,
                                                  size: 14,
                                                  color: ColorTokens.inkPrimary,
                                                ),
                                                SizedBox(width: 4),
                                                Text(
                                                  'Cab',
                                                  style: TextStyle(
                                                    fontSize: 12,
                                                    fontWeight: FontWeight.w700,
                                                    color: ColorTokens.inkPrimary,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ],
                                      if (yourStop?.latitude != null) ...[
                                        const SizedBox(width: 8),
                                        HarborPressable(
                                          onTap: () => launchExternalMaps(
                                            context,
                                            yourStop!.latitude!,
                                            yourStop.longitude!,
                                          ),
                                          child: const HarborGlassSurface(
                                            padding: EdgeInsets.symmetric(
                                              horizontal: 10,
                                              vertical: 6,
                                            ),
                                            child: Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                Icon(
                                                  Icons.open_in_new_rounded,
                                                  size: 14,
                                                  color: ColorTokens.inkPrimary,
                                                ),
                                                SizedBox(width: 4),
                                                Text(
                                                  'Maps',
                                                  style: TextStyle(
                                                    fontSize: 12,
                                                    fontWeight: FontWeight.w700,
                                                    color: ColorTokens.inkPrimary,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                                Positioned(
                                  left: 12,
                                  right: 12,
                                  bottom: 12,
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      HarborGlassSurface(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 10,
                                          vertical: 5,
                                        ),
                                        child: Text(
                                          isSocketConnected ? 'Live Stream Active' : 'Auto-Sync Mode',
                                          style: TypographyTokens.bodyMuted.copyWith(
                                            fontSize: 11.5,
                                            fontWeight: FontWeight.w600,
                                            color: ColorTokens.inkPrimary,
                                          ),
                                        ),
                                      ),
                                      if (gps != null && !gps.isStale && gps.etaMinutes != null)
                                        HarborGlassSurface(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 5,
                                          ),
                                          child: Text(
                                            'Est. ~${gps.etaMinutes} min',
                                            style: TypographyTokens.telemetryTabular.copyWith(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w700,
                                              color: ColorTokens.primaryPressed,
                                            ),
                                          ),
                                        )
                                      else if (gps != null && gps.isStale)
                                        HarborGlassSurface(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 5,
                                          ),
                                          child: Text(
                                            'Signal paused · Last fix ${SolFormatters.timeHm(gps.recordedAt)}',
                                            style: TypographyTokens.bodyMuted.copyWith(
                                              fontSize: 11.5,
                                              fontWeight: FontWeight.w600,
                                              color: const Color(0xFFB45309),
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    trip.tripCode,
                                    style: TypographyTokens.telemetryTabular.copyWith(
                                      fontSize: 13,
                                      color: ColorTokens.inkSecondary,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${SolFormatters.readableIsoDate(trip.travelDate)} · ${trip.shiftTimeLocal}',
                                    style: TypographyTokens.sectionTitle,
                                  ),
                                ],
                              ),
                            ),
                            StatusBadge.fromStatus(trip.tripStatus),
                          ],
                        ),
                        if ((trip.arrivalDelaySeconds ?? 0) > 120) ...[
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFFBEB),
                              borderRadius: const BorderRadius.all(Radius.circular(12)),
                              border: Border.all(color: const Color(0xFFFDE68A)),
                            ),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.schedule_send_rounded,
                                  size: 18,
                                  color: Color(0xFFB45309),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    'Driver Delayed · Running ~${((trip.arrivalDelaySeconds ?? 0) / 60).round()} min behind schedule',
                                    style: TypographyTokens.bodyMuted.copyWith(
                                      fontWeight: FontWeight.w600,
                                      color: const Color(0xFFB45309),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        if (trip.boardingOtp != null) ...[
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            decoration: BoxDecoration(
                              color: ColorTokens.primarySoft,
                              borderRadius: const BorderRadius.all(Radius.circular(14)),
                              border: Border.all(color: ColorTokens.primaryBorder),
                            ),
                            child: Row(
                              children: [
                                const Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('BOARDING OTP', style: TypographyTokens.label),
                                      SizedBox(height: 2),
                                      Text(
                                        'Verify this 4-digit pin with your driver at pickup',
                                        style: TypographyTokens.bodyMuted,
                                      ),
                                    ],
                                  ),
                                ),
                                Text(trip.boardingOtp!, style: TypographyTokens.otpHero),
                              ],
                            ),
                          ),
                        ],
                        if (trip.driverName != null) ...[
                          const SizedBox(height: 14),
                          DriverCard(
                            driverName: trip.driverName!,
                            vehicleRegistration: trip.vehicleRegistrationNo,
                            vehicleModel: trip.vehicleModelName,
                            onCallPressed: trip.driverPhone != null
                                ? () => launchPhoneDialer(context, trip.driverPhone!)
                                : null,
                          ),
                        ],
                        const SizedBox(height: 18),
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'Pickup Sequence Timeline',
                                style: TypographyTokens.cardTitle,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              '${trip.passengersTotal} passenger(s)',
                              style: TypographyTokens.bodyMuted,
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Co-passenger residential addresses are privacy-masked by dispatch.',
                          style: TypographyTokens.bodyMuted,
                        ),
                        const SizedBox(height: 12),
                        for (var i = 0; i < trip.stops.length; i++) ...[
                          _StopTimelineRow(stop: trip.stops[i], trip: trip),
                          if (i < trip.stops.length - 1) const SizedBox(height: 10),
                        ],
                        const SizedBox(height: 20),
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
                                  cancelCutoffMinutes:
                                      trip.settings.cancellationCutoffMinutes,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        if (trip.safeReachConfirmedAt == null)
                          PrimaryButton(
                            label: 'Confirm Safe Reach',
                            icon: Icons.verified_user_rounded,
                            onPressed: () async {
                              await ref
                                  .read(upcomingTripProvider.notifier)
                                  .confirmSafeReach(trip.tripId);
                              ref.invalidate(tripDetailProvider(widget.tripId));
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Safe reach timestamp logged cleanly.'),
                                  ),
                                );
                              }
                            },
                          )
                        else
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: ColorTokens.successSoft,
                              borderRadius: const BorderRadius.all(Radius.circular(14)),
                              border: Border.all(color: ColorTokens.successBorder),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.verified_rounded, color: ColorTokens.success),
                                const SizedBox(width: 10),
                                Text(
                                  'Safe reach confirmed at ${SolFormatters.timeHm(trip.safeReachConfirmedAt!)}',
                                  style: TypographyTokens.label.copyWith(
                                    color: const Color(0xFF047857),
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        if (trip.passengerStatus.toUpperCase() == 'NO_SHOW') ...[
                          const SizedBox(height: 10),
                          SecondaryButton(
                            label: 'Appeal No-Show',
                            icon: Icons.gavel_rounded,
                            fullWidth: true,
                            onPressed: () => _showNoShowAppealDialog(trip.tripId),
                          ),
                        ],
                        const SizedBox(height: 10),
                        SecondaryButton(
                          label: 'Open Emergency SOS Center',
                          icon: Icons.shield_outlined,
                          isDanger: true,
                          fullWidth: true,
                          onPressed: () => context.go('/safety'),
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

class _StopTimelineRow extends StatelessWidget {
  const _StopTimelineRow({required this.stop, required this.trip});

  final TripStopView stop;
  final UpcomingTripDetail trip;

  @override
  Widget build(BuildContext context) {
    final sched = stop.scheduledArrivalAt != null
        ? 'ETA ${SolFormatters.timeHm(stop.scheduledArrivalAt!)}'
        : null;
    final delayNote = stop.isYourStop && trip.runningLateEtaMinutes != null
        ? 'Running +${trip.runningLateEtaMinutes}m late'
        : null;

    final title = stop.isYourStop
        ? 'Your Pickup · ${stop.locationName}'
        : stop.stopType.toUpperCase() == 'OFFICE'
            ? 'Campus · ${stop.locationName}'
            : stop.locationName;

    return PassengerCard(
      sequenceNo: stop.sequenceNo,
      title: title,
      subtitle: stop.address,
      status: stop.status,
      isHighlighted: stop.isYourStop,
      scheduledTimeLabel: sched,
      delayNote: delayNote,
    );
  }
}

class _MapPinBadge extends StatelessWidget {
  const _MapPinBadge({required this.icon, required this.color});

  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 2.5),
      ),
      child: Icon(icon, size: 22, color: color),
    );
  }
}

class _NoShowAppealDialog extends StatefulWidget {
  const _NoShowAppealDialog();

  @override
  State<_NoShowAppealDialog> createState() => _NoShowAppealDialogState();
}

class _NoShowAppealDialogState extends State<_NoShowAppealDialog> {
  final TextEditingController _noteCtrl = TextEditingController();
  String? _validationError;

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Appeal No-Show Record'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Share what happened at your pickup pin so the transport desk can review this No-Show record.',
            style: TypographyTokens.bodyMuted,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _noteCtrl,
            minLines: 2,
            maxLines: 4,
            maxLength: 500,
            decoration: InputDecoration(
              labelText: 'Appeal Reason',
              hintText: 'e.g. Cab parked at gate B instead of main pin',
              errorText: _validationError,
            ),
            onChanged: (_) {
              if (_validationError != null) {
                setState(() => _validationError = null);
              }
            },
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
            final trimmed = _noteCtrl.text.trim();
            if (trimmed.length < 5) {
              setState(() => _validationError = 'Please enter at least 5 characters.');
              return;
            }
            Navigator.of(context).pop(trimmed);
          },
          child: const Text('Submit Appeal'),
        ),
      ],
    );
  }
}
