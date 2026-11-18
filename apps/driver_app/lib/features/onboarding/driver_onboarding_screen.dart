import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/config/driver_config.dart';
import '../../core/state/driver_providers.dart';

class DriverOnboardingScreen extends ConsumerStatefulWidget {
  const DriverOnboardingScreen({super.key});

  @override
  ConsumerState<DriverOnboardingScreen> createState() => _DriverOnboardingScreenState();
}

class _DriverOnboardingScreenState extends ConsumerState<DriverOnboardingScreen> {
  bool _requesting = false;

  Future<void> _enableAlertsAndEnter() async {
    setState(() => _requesting = true);
    try {
      await ref.read(driverPermissionCoordinatorProvider).requestNotifications();
      ref.invalidate(driverPermissionSnapshotProvider);
      ref.read(driverOnboardingStateProvider).complete();
    } finally {
      if (mounted) setState(() => _requesting = false);
    }
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
                        Icons.local_taxi_rounded,
                        color: ColorTokens.primary,
                        size: 24,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text('Driver Duty & Dispatch Console', style: TypographyTokens.displayTitle),
                    const SizedBox(height: 8),
                    const Text(
                      'Execute assigned shift routes cleanly with Google Maps turn-by-turn launch and automatic offline queueing.',
                      style: TypographyTokens.bodyMuted,
                    ),
                    const SizedBox(height: 18),
                    const _DriverRationaleTile(
                      icon: Icons.notifications_active_outlined,
                      iconColor: ColorTokens.primary,
                      iconBg: ColorTokens.primarySoft,
                      title: 'Duty & Commuter Alerts',
                      badge: 'Recommended now',
                      description:
                          'Receive instant alerts when trips are dispatched or when commuters mark Running Late or Cannot Board.',
                    ),
                    const SizedBox(height: 12),
                    const _DriverRationaleTile(
                      icon: Icons.gps_fixed_rounded,
                      iconColor: ColorTokens.success,
                      iconBg: ColorTokens.successSoft,
                      title: 'Active-Trip GPS Only',
                      badge: 'Starts only on Start Trip',
                      description:
                          'Location foreground service starts ONLY when you tap Start Trip and automatically turns off when your trip finishes.',
                    ),
                    const SizedBox(height: 20),
                    PrimaryButton(
                      label: 'Enable Duty Alerts & Enter Console',
                      icon: Icons.check_circle_outline_rounded,
                      isLoading: _requesting,
                      onPressed: _enableAlertsAndEnter,
                    ),
                    const SizedBox(height: 12),
                    SecondaryButton(
                      label: 'Continue Without Alerts',
                      fullWidth: true,
                      onPressed: _requesting
                          ? null
                          : () => ref.read(driverOnboardingStateProvider).complete(),
                    ),
                    const SizedBox(height: 10),
                    Center(
                      child: TextButton.icon(
                        onPressed: () async {
                          final choice = await showServerEndpointDialog(
                            context,
                            currentUrl: ref.read(driverApiBaseUrlProvider),
                            defaultUrl: DriverConfig.defaultApiBaseUrl,
                          );
                          if (choice == null) return;
                          await ref
                              .read(driverApiBaseUrlProvider.notifier)
                              .setEndpoint(choice.resetToDefault ? null : choice.url);
                        },
                        icon: const Icon(Icons.dns_outlined, size: 16),
                        label: Text(
                          'Server: ${Uri.tryParse(ref.watch(driverApiBaseUrlProvider))?.authority ?? 'Configure'}',
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

class _DriverRationaleTile extends StatelessWidget {
  const _DriverRationaleTile({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    required this.badge,
    required this.description,
  });

  final IconData icon;
  final Color iconColor;
  final Color iconBg;
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
        border: Border.all(color: ColorTokens.borderSubtle),
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
                Text(badge, style: TypographyTokens.label.copyWith(color: iconColor)),
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

