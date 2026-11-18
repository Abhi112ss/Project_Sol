import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/config/app_config.dart';
import '../../core/models/employee_models.dart';
import '../../core/state/employee_providers.dart';
import '../../core/utils/formatters.dart';

class SafetyScreen extends ConsumerStatefulWidget {
  const SafetyScreen({super.key});

  @override
  ConsumerState<SafetyScreen> createState() => _SafetyScreenState();
}

class _SafetyScreenState extends ConsumerState<SafetyScreen> {
  final TextEditingController _noteCtrl = TextEditingController();
  bool _includeCurrentGps = true;
  bool _sendingSos = false;
  SafetyAlertReceipt? _lastReceipt;

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _confirmAndSendSos() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Trigger Emergency SOS?'),
        content: const Text(
          'This immediately escalates a CRITICAL alert to the transport security desk and your active trip monitor.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: ColorTokens.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Trigger SOS Now'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    await _dispatchSos();
  }

  Future<void> _dispatchSos() async {
    HarborMotion.hapticAlert();
    setState(() => _sendingSos = true);

    try {
      final persona = ref.read(activePersonaProvider);
      final upcoming = ref.read(upcomingTripProvider).asData?.value;

      double? lat;
      double? lng;
      double? accuracy;
      if (_includeCurrentGps) {
        final coord = await ref
            .read(permissionSnapshotProvider.notifier)
            .requestLocationPin();
        if (coord != null) {
          lat = coord.latitude;
          lng = coord.longitude;
          accuracy = coord.accuracyM;
        }
      }

      final receipt = await ref.read(employeeApiProvider).triggerSos(
            persona.userId,
            tripId: upcoming?.tripId,
            latitude: lat,
            longitude: lng,
            accuracyM: accuracy,
            notes: _noteCtrl.text.isEmpty ? null : _noteCtrl.text,
          );
      if (mounted) {
        setState(() {
          _lastReceipt = receipt;
          _noteCtrl.clear();
        });
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
      if (mounted) setState(() => _sendingSos = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(employeeProfileProvider).asData?.value;
    final upcoming = ref.watch(upcomingTripProvider).asData?.value;
    final sosEscalation = profile?.settings.sosEscalationSeconds ?? 120;

    return Scaffold(
      appBar: AppBar(title: const Text('Safety & Emergency SOS')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 680),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Material(
                    color: ColorTokens.dangerSoft,
                    shape: RoundedRectangleBorder(
                      borderRadius: const BorderRadius.all(Radius.circular(20)),
                      side: const BorderSide(color: ColorTokens.dangerBorder, width: 1.2),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 44,
                                height: 44,
                                decoration: const BoxDecoration(
                                  color: ColorTokens.danger,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.sos_rounded,
                                  color: Colors.white,
                                  size: 24,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      '24x7 Transport SOS Escalation',
                                      style: TypographyTokens.sectionTitle,
                                    ),
                                    Text(
                                      'Control desk SLA: ${sosEscalation}s response target',
                                      style: TypographyTokens.bodyMuted.copyWith(
                                        color: ColorTokens.dangerPressed,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          if (upcoming != null)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Text(
                                'Linked active trip: ${upcoming.tripCode} (${upcoming.vehicleRegistrationNo ?? 'Cab'})',
                                style: TypographyTokens.label.copyWith(
                                  color: ColorTokens.inkPrimary,
                                ),
                              ),
                            ),
                          SwitchListTile.adaptive(
                            contentPadding: EdgeInsets.zero,
                            value: _includeCurrentGps,
                            onChanged: (v) => setState(() => _includeCurrentGps = v),
                            title: const Text(
                              'Attach one-time current GPS',
                              style: TypographyTokens.cardTitle,
                            ),
                            subtitle: const Text(
                              'Requested only on tap; SOS still dispatches immediately if GPS is off.',
                              style: TypographyTokens.bodyMuted,
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _noteCtrl,
                            maxLines: 2,
                            decoration: const InputDecoration(
                              labelText: 'Emergency Detail (Optional)',
                              hintText: 'e.g. Route deviation or medical help needed',
                            ),
                          ),
                          const SizedBox(height: 16),
                          PrimaryButton(
                            label: 'Trigger Emergency SOS',
                            icon: Icons.warning_amber_rounded,
                            isDanger: true,
                            isLoading: _sendingSos,
                            onPressed: _confirmAndSendSos,
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (_lastReceipt != null) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: ColorTokens.surface,
                        borderRadius: const BorderRadius.all(Radius.circular(16)),
                        border: Border.all(color: ColorTokens.dangerBorder),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.security_rounded, color: ColorTokens.danger),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'SOS Logged · ${_lastReceipt!.severity}',
                                  style: TypographyTokens.cardTitle,
                                ),
                                Text(
                                  'Alert status: ${_lastReceipt!.status} · ${SolFormatters.timeHm(_lastReceipt!.createdAt)}',
                                  style: TypographyTokens.bodyMuted,
                                ),
                              ],
                            ),
                          ),
                          StatusBadge.fromStatus(_lastReceipt!.status),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
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
                        const Text('24x7 Transport Helpline', style: TypographyTokens.cardTitle),
                        const SizedBox(height: 4),
                        const Text(
                          'Direct voice line to duty safety supervisor and fleet desk.',
                          style: TypographyTokens.bodyMuted,
                        ),
                        const SizedBox(height: 12),
                        SecondaryButton(
                          label: 'Call Desk (${AppConfig.transportDeskPhone})',
                          icon: Icons.call_rounded,
                          fullWidth: true,
                          onPressed: () =>
                              launchPhoneDialer(context, AppConfig.transportDeskPhone),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (profile != null)
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: ColorTokens.surface,
                        borderRadius: const BorderRadius.all(Radius.circular(16)),
                        border: Border.all(color: ColorTokens.borderSubtle),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.contact_emergency_outlined,
                            color: ColorTokens.inkSecondary,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Registered Emergency Contact',
                                  style: TypographyTokens.cardTitle,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  profile.emergencyContactName != null
                                      ? '${profile.emergencyContactName} (${profile.emergencyContactPhone ?? ''})'
                                      : 'Not configured yet (update in Profile)',
                                  style: TypographyTokens.bodyMuted,
                                ),
                              ],
                            ),
                          ),
                          if (profile.emergencyContactPhone != null)
                            IconButton(
                              tooltip: 'Call emergency contact',
                              onPressed: () => launchPhoneDialer(
                                context,
                                profile.emergencyContactPhone!,
                              ),
                              icon: const Icon(Icons.call_outlined),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
