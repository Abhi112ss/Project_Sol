import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/permissions/driver_permission_coordinator.dart';
import '../../core/state/driver_providers.dart';
import '../../core/utils/driver_formatters.dart';

class TripPreviewScreen extends ConsumerStatefulWidget {
  const TripPreviewScreen({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<TripPreviewScreen> createState() => _TripPreviewScreenState();
}

class _TripPreviewScreenState extends ConsumerState<TripPreviewScreen> {
  bool _busy = false;

  Future<void> _acceptDuty() async {
    setState(() => _busy = true);
    try {
      await ref.read(tripExecutionActionsProvider).acceptTrip(widget.tripId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Duty acknowledged with dispatch desk.'),
            behavior: SnackBarBehavior.floating,
            margin: EdgeInsets.fromLTRB(16, 0, 16, 132),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _startTrip(String tripCode) async {
    setState(() => _busy = true);
    try {
      await ref.read(tripExecutionActionsProvider).startTrip(widget.tripId, tripCode);
      if (mounted) {
        context.pushReplacement('/trip/${widget.tripId}/active');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final manifestAsync = ref.watch(tripManifestProvider(widget.tripId));

    return Scaffold(
      appBar: AppBar(title: const Text('Pre-Trip Stop Manifest')),
      body: manifestAsync.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(16),
          child: LoadingState(cardCount: 3),
        ),
        error: (err, _) => Padding(
          padding: const EdgeInsets.all(16),
          child: ErrorState(
            title: 'Cannot load trip manifest',
            message: err.toString(),
            onRetry: () => ref.invalidate(tripManifestProvider(widget.tripId)),
          ),
        ),
        data: (manifest) {
          final isAssigned = manifest.status.toUpperCase() == 'ASSIGNED';
          final isAccepted = manifest.status.toUpperCase() == 'DRIVER_ACCEPTED';

          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
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
                                      Expanded(
                                        child: Text(
                                          manifest.tripCode,
                                          style: TypographyTokens.telemetryTabular.copyWith(
                                            color: ColorTokens.inkSecondary,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      StatusBadge.fromStatus(manifest.status),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    '${manifest.travelDate} · ${manifest.shiftTimeLocal} (${manifest.direction})',
                                    style: TypographyTokens.sectionTitle,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${manifest.shiftName} · ${manifest.officeName}',
                                    style: TypographyTokens.bodyMuted,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 16),
                            const Text('Ordered Stop Sequence', style: TypographyTokens.cardTitle),
                            const SizedBox(height: 10),
                            for (var i = 0; i < manifest.stops.length; i++) ...[
                              _PreviewStopCard(
                                stopNo: manifest.stops[i].sequenceNo,
                                title: manifest.stops[i].locationName,
                                address: manifest.stops[i].address,
                                isOffice: manifest.stops[i].isOffice,
                                passengerNames: manifest.stops[i].passengers
                                    .map((p) => p.fullName)
                                    .join(', '),
                                scheduledTime: manifest.stops[i].scheduledArrivalAt != null
                                    ? DriverFormatters.timeHm(
                                        manifest.stops[i].scheduledArrivalAt!,
                                      )
                                    : null,
                                status: manifest.stops[i].status,
                                onMapPressed: () => launchGoogleMapsTurnByTurn(
                                  context,
                                  navigationUrl: manifest.stops[i].navigationUrl,
                                  latitude: manifest.stops[i].latitude,
                                  longitude: manifest.stops[i].longitude,
                                  label: manifest.stops[i].locationName,
                                ),
                              ),
                              if (i < manifest.stops.length - 1) const SizedBox(height: 10),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              SafeArea(
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
                          if (isAssigned) ...[
                            SecondaryButton(
                              label: 'Accept Duty Allocation',
                              icon: Icons.thumb_up_alt_outlined,
                              fullWidth: true,
                              isLoading: _busy,
                              onPressed: _acceptDuty,
                            ),
                            const SizedBox(height: 10),
                          ],
                          SizedBox(
                            height: 58,
                            width: double.infinity,
                            child: PrimaryButton(
                              label: isAssigned || isAccepted
                                  ? 'Start Trip & Enable Live GPS'
                                  : 'Open Active Trip Console',
                              icon: Icons.play_arrow_rounded,
                              isLoading: _busy,
                              onPressed: () {
                                if (isAssigned || isAccepted) {
                                  _startTrip(manifest.tripCode);
                                } else {
                                  context.pushReplacement('/trip/${widget.tripId}/active');
                                }
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _PreviewStopCard extends StatelessWidget {
  const _PreviewStopCard({
    required this.stopNo,
    required this.title,
    required this.address,
    required this.isOffice,
    required this.passengerNames,
    this.scheduledTime,
    required this.status,
    required this.onMapPressed,
  });

  final int stopNo;
  final String title;
  final String address;
  final bool isOffice;
  final String passengerNames;
  final String? scheduledTime;
  final String status;
  final VoidCallback onMapPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ColorTokens.surface,
        borderRadius: const BorderRadius.all(Radius.circular(14)),
        border: Border.all(color: ColorTokens.borderSubtle),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: isOffice ? ColorTokens.inkPrimary : ColorTokens.primarySoft,
            child: Text(
              '$stopNo',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: isOffice ? Colors.white : ColorTokens.primaryPressed,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TypographyTokens.cardTitle.copyWith(fontSize: 14.5)),
                const SizedBox(height: 2),
                Text(address, style: TypographyTokens.bodyMuted),
                if (passengerNames.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    passengerNames,
                    style: TypographyTokens.label.copyWith(color: ColorTokens.inkPrimary),
                  ),
                ],
                if (scheduledTime != null) ...[
                  const SizedBox(height: 4),
                  Text('Scheduled $scheduledTime', style: TypographyTokens.bodyMuted),
                ],
              ],
            ),
          ),
          IconButton(
            tooltip: 'Open in Google Maps',
            onPressed: onMapPressed,
            icon: const Icon(Icons.directions_outlined, color: ColorTokens.primary),
          ),
        ],
      ),
    );
  }
}

