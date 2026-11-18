import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/config/app_config.dart';
import '../../core/state/employee_providers.dart';

/// Just-in-time progressive permission rationale screen compliant with
/// `MOBILE_PERMISSIONS.md`: never fires multiple OS permission popups at launch
/// and never requests background location in the Employee App.
class PermissionOnboardingScreen extends ConsumerStatefulWidget {
  const PermissionOnboardingScreen({super.key});

  @override
  ConsumerState<PermissionOnboardingScreen> createState() =>
      _PermissionOnboardingScreenState();
}

class _PermissionOnboardingScreenState
    extends ConsumerState<PermissionOnboardingScreen> {
  bool _requesting = false;

  Future<void> _enableAlertsAndContinue() async {
    setState(() => _requesting = true);
    try {
      await ref.read(permissionSnapshotProvider.notifier).requestNotifications();
      ref.read(onboardingStateProvider).complete();
    } finally {
      if (mounted) setState(() => _requesting = false);
    }
  }

  void _skipForNow() {
    ref.read(onboardingStateProvider).complete();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorTokens.canvas,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: HarborEnterTransition(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: ColorTokens.primarySoft,
                        borderRadius: const BorderRadius.all(Radius.circular(14)),
                        border: Border.all(color: ColorTokens.primaryBorder),
                      ),
                      child: const Icon(
                        Icons.directions_car_filled_rounded,
                        color: ColorTokens.primary,
                        size: 24,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Calm, transparent office commutes.',
                      style: TypographyTokens.displayTitle,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'SolTransit Employee keeps your shift pickups, boarding OTP, and campus arrivals clear without constant background tracking.',
                      style: TypographyTokens.bodyMuted,
                    ),
                    const SizedBox(height: 18),
                    const _PermissionRationaleCard(
                      icon: Icons.notifications_active_outlined,
                      iconBg: ColorTokens.primarySoft,
                      iconColor: ColorTokens.primary,
                      title: 'Trip & Arrival Alerts',
                      badge: 'Recommended now',
                      description:
                          'Get instant alerts when your cab is dispatched, arriving at your pickup pin, or modified by dispatch.',
                    ),
                    const SizedBox(height: 12),
                    const _PermissionRationaleCard(
                      icon: Icons.my_location_outlined,
                      iconBg: ColorTokens.successSoft,
                      iconColor: ColorTokens.success,
                      title: 'Just-in-Time Pickup & SOS Location',
                      badge: 'Requested only when needed',
                      description:
                          'We only ask for your foreground location if you drop a new home pickup pin or trigger an emergency SOS. Background tracking is disabled.',
                    ),
                    const SizedBox(height: 20),
                    PrimaryButton(
                      label: 'Enable Ride Alerts & Continue',
                      icon: Icons.notifications_none_rounded,
                      isLoading: _requesting,
                      onPressed: _enableAlertsAndContinue,
                    ),
                    const SizedBox(height: 12),
                    SecondaryButton(
                      label: 'Continue Without Alerts',
                      fullWidth: true,
                      onPressed: _requesting ? null : _skipForNow,
                    ),
                    const SizedBox(height: 10),
                    Center(
                      child: TextButton.icon(
                        onPressed: () async {
                          final choice = await showServerEndpointDialog(
                            context,
                            currentUrl: ref.read(apiBaseUrlProvider),
                            defaultUrl: AppConfig.defaultApiBaseUrl,
                          );
                          if (choice == null) return;
                          await ref
                              .read(apiBaseUrlProvider.notifier)
                              .setEndpoint(choice.resetToDefault ? null : choice.url);
                        },
                        icon: const Icon(Icons.dns_outlined, size: 16),
                        label: Text(
                          'Server: ${Uri.tryParse(ref.watch(apiBaseUrlProvider))?.authority ?? 'Configure'}',
                          style: TypographyTokens.bodyMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PermissionRationaleCard extends StatelessWidget {
  const _PermissionRationaleCard({
    required this.icon,
    required this.iconBg,
    required this.iconColor,
    required this.title,
    required this.badge,
    required this.description,
  });

  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final String title;
  final String badge;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ColorTokens.surface,
        borderRadius: const BorderRadius.all(Radius.circular(16)),
        border: Border.all(color: ColorTokens.borderSubtle, width: 1),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: iconBg,
              borderRadius: const BorderRadius.all(Radius.circular(12)),
            ),
            child: Icon(icon, size: 22, color: iconColor),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TypographyTokens.cardTitle),
                const SizedBox(height: 4),
                Text(
                  badge,
                  style: TypographyTokens.label.copyWith(color: iconColor),
                ),
                const SizedBox(height: 6),
                Text(description, style: TypographyTokens.bodyMuted),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
