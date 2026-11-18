import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/config/app_config.dart';
import '../../core/models/employee_models.dart';
import '../../core/state/employee_providers.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _showAddLocationSheet(BuildContext context, WidgetRef ref) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _AddLocationSheet(),
    );
  }

  Future<void> _showEditEmergencyDialog(
    BuildContext context,
    WidgetRef ref,
    EmployeeProfileData profile,
  ) async {
    final nameCtrl = TextEditingController(text: profile.emergencyContactName ?? '');
    final phoneCtrl = TextEditingController(text: profile.emergencyContactPhone ?? '');

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Update Emergency Contact'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              decoration: const InputDecoration(labelText: 'Contact Name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone Number'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (saved == true) {
      await ref.read(employeeProfileProvider.notifier).updateEmergencyContact(
            name: nameCtrl.text.trim(),
            phone: phoneCtrl.text.trim(),
          );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Emergency contact updated.')),
        );
      }
    }
    nameCtrl.dispose();
    phoneCtrl.dispose();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(employeeProfileProvider);
    final locationsAsync = ref.watch(savedLocationsProvider);
    final permissionsAsync = ref.watch(permissionSnapshotProvider);
    final activePersona = ref.watch(activePersonaProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile & Pickup Pins')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(employeeProfileProvider);
          ref.invalidate(savedLocationsProvider);
          ref.invalidate(permissionSnapshotProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 680),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    profileAsync.when(
                      loading: () => const LoadingState(cardCount: 1, cardHeight: 130),
                      error: (err, _) => ErrorState(
                        title: 'Failed to load profile',
                        message: err.toString(),
                        onRetry: () => ref.invalidate(employeeProfileProvider),
                      ),
                      data: (profile) => Container(
                        padding: const EdgeInsets.all(16),
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
                                CircleAvatar(
                                  radius: 24,
                                  backgroundColor: ColorTokens.primarySoft,
                                  child: Text(
                                    profile.fullName.isNotEmpty
                                        ? profile.fullName[0].toUpperCase()
                                        : 'E',
                                    style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w700,
                                      color: ColorTokens.primaryPressed,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(profile.fullName, style: TypographyTokens.sectionTitle),
                                      Text(
                                        '${profile.employeeCode} · ${profile.department}',
                                        style: TypographyTokens.bodyMuted,
                                      ),
                                    ],
                                  ),
                                ),
                                StatusBadge(
                                  label: profile.transportEligible ? 'Eligible' : 'Paused',
                                  tone: profile.transportEligible
                                      ? StatusTone.success
                                      : StatusTone.danger,
                                ),
                              ],
                            ),
                            const SizedBox(height: 14),
                            const Divider(height: 1),
                            const SizedBox(height: 12),
                            Text(
                              'Office: ${profile.office?.name ?? 'N/A'} · Default Shift: ${profile.defaultShift?.shiftTimeLocal ?? '09:00'}',
                              style: TypographyTokens.bodyMuted,
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    'Emergency: ${profile.emergencyContactName ?? 'Not set'} ${profile.emergencyContactPhone != null ? '(${profile.emergencyContactPhone})' : ''}',
                                    style: TypographyTokens.bodyMuted,
                                  ),
                                ),
                                TextButton(
                                  onPressed: () =>
                                      _showEditEmergencyDialog(context, ref, profile),
                                  child: const Text('Edit'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        const Expanded(
                          child: Text('Saved Pickup Pins', style: TypographyTokens.cardTitle),
                        ),
                        const SizedBox(width: 8),
                        TextButton.icon(
                          onPressed: () => _showAddLocationSheet(context, ref),
                          icon: const Icon(Icons.add_location_alt_outlined, size: 18),
                          label: const Text('Add Pin'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    locationsAsync.when(
                      loading: () => const LoadingState(cardCount: 2, cardHeight: 90),
                      error: (err, _) => ErrorState(
                        title: 'Could not load pickup pins',
                        message: err.toString(),
                        onRetry: () => ref.invalidate(savedLocationsProvider),
                      ),
                      data: (items) => Column(
                        children: [
                          for (var i = 0; i < items.length; i++) ...[
                            Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: ColorTokens.surface,
                                borderRadius: const BorderRadius.all(Radius.circular(14)),
                                border: Border.all(
                                  color: items[i].isDefault
                                      ? ColorTokens.primaryBorder
                                      : ColorTokens.borderSubtle,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    items[i].isDefault
                                        ? Icons.home_rounded
                                        : Icons.place_outlined,
                                    color: items[i].isDefault
                                        ? ColorTokens.primary
                                        : ColorTokens.inkSecondary,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          items[i].locationName,
                                          style: TypographyTokens.cardTitle.copyWith(fontSize: 14.5),
                                        ),
                                        Text(items[i].address, style: TypographyTokens.bodyMuted),
                                        Text(
                                          '${items[i].latitude.toStringAsFixed(4)}, ${items[i].longitude.toStringAsFixed(4)} · ${items[i].geofenceRadiusM}m radius',
                                          style: TypographyTokens.label.copyWith(
                                            fontSize: 11.5,
                                            fontFeatures: TypographyTokens.tabularFeatures,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (items[i].isDefault)
                                    const StatusBadge(label: 'Default', tone: StatusTone.info)
                                  else
                                    TextButton(
                                      onPressed: () => ref
                                          .read(savedLocationsProvider.notifier)
                                          .setDefault(items[i].id),
                                      child: const Text('Set Default'),
                                    ),
                                ],
                              ),
                            ),
                            if (i < items.length - 1) const SizedBox(height: 10),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    const Text('Permissions & Privacy', style: TypographyTokens.cardTitle),
                    const SizedBox(height: 8),
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
                          permissionsAsync.when(
                            loading: () => const Text('Checking device permissions...'),
                            error: (_, _) => const Text('Permissions unavailable on host target.'),
                            data: (snap) => Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    const Expanded(
                                      child: Text(
                                        'Ride & Dispatch Notifications',
                                        style: TypographyTokens.body,
                                      ),
                                    ),
                                    StatusBadge(
                                      label: snap.notificationsGranted ? 'Granted' : 'Not Granted',
                                      tone: snap.notificationsGranted
                                          ? StatusTone.success
                                          : StatusTone.warning,
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    const Expanded(
                                      child: Text(
                                        'Foreground Pickup / SOS GPS',
                                        style: TypographyTokens.body,
                                      ),
                                    ),
                                    StatusBadge(
                                      label: snap.foregroundLocationGranted
                                          ? 'When In Use'
                                          : 'On Demand Only',
                                      tone: snap.foregroundLocationGranted
                                          ? StatusTone.success
                                          : StatusTone.neutral,
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                const Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        'Background Employee Tracking',
                                        style: TypographyTokens.body,
                                      ),
                                    ),
                                    StatusBadge(label: 'Never Requested', tone: StatusTone.success),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          SecondaryButton(
                            label: 'Open System Permission Settings',
                            icon: Icons.settings_outlined,
                            fullWidth: true,
                            onPressed: () =>
                                ref.read(permissionCoordinatorProvider).openSystemSettings(),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    const Text('Dev Account Switcher', style: TypographyTokens.cardTitle),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: ColorTokens.surfaceElevated,
                        borderRadius: const BorderRadius.all(Radius.circular(16)),
                        border: Border.all(color: ColorTokens.borderSubtle),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Phase 3 Dev Identity (Header Bypass). Switch active seeded commuter:',
                            style: TypographyTokens.bodyMuted,
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final persona in AppConfig.devPersonas)
                                ChoiceChip(
                                  label: Text(persona.name),
                                  selected: persona.userId == activePersona.userId,
                                  onSelected: (_) {
                                    HarborMotion.hapticSelection();
                                    ref
                                        .read(activePersonaProvider.notifier)
                                        .selectPersona(persona);
                                  },
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    ServerEndpointCard(
                      currentUrl: ref.watch(apiBaseUrlProvider),
                      onConfigurePressed: () async {
                        final choice = await showServerEndpointDialog(
                          context,
                          currentUrl: ref.read(apiBaseUrlProvider),
                          defaultUrl: AppConfig.defaultApiBaseUrl,
                        );
                        if (choice == null) return;
                        await ref
                            .read(apiBaseUrlProvider.notifier)
                            .setEndpoint(choice.resetToDefault ? null : choice.url);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Backend switched to ${ref.read(apiBaseUrlProvider)}'),
                            ),
                          );
                        }
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

class _AddLocationSheet extends ConsumerStatefulWidget {
  const _AddLocationSheet();

  @override
  ConsumerState<_AddLocationSheet> createState() => _AddLocationSheetState();
}

class _AddLocationSheetState extends ConsumerState<_AddLocationSheet> {
  final _nameCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _corridorCtrl = TextEditingController(text: 'Madhapur');
  final _latCtrl = TextEditingController(text: '17.4486');
  final _lngCtrl = TextEditingController(text: '78.3908');
  bool _setDefault = false;
  bool _capturingGps = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _addressCtrl.dispose();
    _corridorCtrl.dispose();
    _latCtrl.dispose();
    _lngCtrl.dispose();
    super.dispose();
  }

  Future<void> _captureCurrentLocation() async {
    setState(() {
      _capturingGps = true;
      _error = null;
    });
    try {
      final coord =
          await ref.read(permissionSnapshotProvider.notifier).requestLocationPin();
      if (coord == null) {
        if (mounted) {
          setState(
            () => _error = 'Location permission or device GPS unavailable. Enter coordinates manually.',
          );
        }
      } else {
        _latCtrl.text = coord.latitude.toStringAsFixed(6);
        _lngCtrl.text = coord.longitude.toStringAsFixed(6);
      }
    } finally {
      if (mounted) setState(() => _capturingGps = false);
    }
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    final address = _addressCtrl.text.trim();
    final lat = double.tryParse(_latCtrl.text.trim());
    final lng = double.tryParse(_lngCtrl.text.trim());

    if (name.length < 2 || address.length < 4 || lat == null || lng == null) {
      setState(() => _error = 'Enter a valid label, address, latitude, and longitude.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await ref.read(savedLocationsProvider.notifier).addLocation(
            locationName: name,
            address: address,
            corridorTag: _corridorCtrl.text.trim(),
            latitude: lat,
            longitude: lng,
            isDefault: _setDefault,
          );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Pickup location saved cleanly.')),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + bottomInset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Add Saved Pickup Pin', style: TypographyTokens.sectionTitle),
            const SizedBox(height: 12),
            SecondaryButton(
              label: _capturingGps ? 'Reading GPS...' : 'Use Current Foreground GPS',
              icon: Icons.my_location_rounded,
              isLoading: _capturingGps,
              fullWidth: true,
              onPressed: _captureCurrentLocation,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _nameCtrl,
              decoration: const InputDecoration(
                labelText: 'Location Label',
                hintText: 'e.g. Home Gate - Madhapur',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _addressCtrl,
              decoration: const InputDecoration(
                labelText: 'Full Address',
                hintText: 'Street / Apartment / Metro Gate',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _corridorCtrl,
              decoration: const InputDecoration(labelText: 'Corridor Tag (Optional)'),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _latCtrl,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                      signed: true,
                    ),
                    decoration: const InputDecoration(labelText: 'Latitude'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _lngCtrl,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                      signed: true,
                    ),
                    decoration: const InputDecoration(labelText: 'Longitude'),
                  ),
                ),
              ],
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _setDefault,
              onChanged: (v) => setState(() => _setDefault = v ?? false),
              title: const Text('Set as default pickup pin', style: TypographyTokens.body),
            ),
            if (_error != null) ...[
              Text(
                _error!,
                style: TypographyTokens.body.copyWith(color: ColorTokens.dangerPressed),
              ),
              const SizedBox(height: 8),
            ],
            const SizedBox(height: 8),
            PrimaryButton(
              label: 'Save Pickup Location',
              icon: Icons.check_rounded,
              isLoading: _saving,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}
