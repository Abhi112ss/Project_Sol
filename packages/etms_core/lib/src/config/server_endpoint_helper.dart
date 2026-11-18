import 'package:material_ui/material_ui.dart';

import '../theme/color_tokens.dart';
import '../theme/typography_tokens.dart';
import '../widgets/buttons.dart';

/// Validates and normalizes a user-entered SolTransit backend API URL.
/// Accepts bare hosts like `192.168.31.210:3001` or full `/api/v1` URLs and
/// returns `null` when invalid or empty.
String? normalizeSolApiBaseUrl(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;

  final withScheme =
      trimmed.contains('://') ? trimmed : 'http://$trimmed';
  final parsed = Uri.tryParse(withScheme);
  if (parsed == null ||
      (parsed.scheme != 'http' && parsed.scheme != 'https') ||
      parsed.host.trim().isEmpty) {
    return null;
  }

  var path = parsed.path;
  while (path.endsWith('/')) {
    path = path.substring(0, path.length - 1);
  }
  if (!path.endsWith('/api/v1')) {
    path = '$path/api/v1';
  }

  return Uri(
    scheme: parsed.scheme,
    host: parsed.host,
    port: parsed.hasPort ? parsed.port : null,
    path: path,
  ).toString();
}

/// Derives the Socket.IO Engine.IO v4 WebSocket URI matching an HTTP API base URL.
Uri buildSolWebSocketUri(String httpApiUrl) {
  final httpUri = Uri.parse(httpApiUrl);
  final wsScheme = httpUri.scheme == 'https' ? 'wss' : 'ws';
  return Uri(
    scheme: wsScheme,
    host: httpUri.host,
    port: httpUri.hasPort ? httpUri.port : null,
    path: '/socket.io/',
    queryParameters: const {'EIO': '4', 'transport': 'websocket'},
  );
}

class ServerEndpointChoice {
  const ServerEndpointChoice._({this.url, this.resetToDefault = false});

  const ServerEndpointChoice.setUrl(String url) : this._(url: url);

  const ServerEndpointChoice.reset() : this._(resetToDefault: true);

  final String? url;
  final bool resetToDefault;
}

class ServerPreset {
  const ServerPreset({required this.label, required this.url});

  final String label;
  final String url;
}

/// Opens a Harbor Pilot modal dialog allowing testers on physical phones,
/// USB `adb reverse`, or Android emulators to point to any SolTransit backend.
Future<ServerEndpointChoice?> showServerEndpointDialog(
  BuildContext context, {
  required String currentUrl,
  required String defaultUrl,
  List<ServerPreset> presets = const [
    ServerPreset(label: 'USB ADB (127.0.0.1)', url: 'http://127.0.0.1:3001/api/v1'),
    ServerPreset(label: 'Emulator (10.0.2.2)', url: 'http://10.0.2.2:3001/api/v1'),
  ],
}) {
  return showDialog<ServerEndpointChoice>(
    context: context,
    builder: (_) => _ServerEndpointDialog(
      currentUrl: currentUrl,
      defaultUrl: defaultUrl,
      presets: presets,
    ),
  );
}

class _ServerEndpointDialog extends StatefulWidget {
  const _ServerEndpointDialog({
    required this.currentUrl,
    required this.defaultUrl,
    required this.presets,
  });

  final String currentUrl;
  final String defaultUrl;
  final List<ServerPreset> presets;

  @override
  State<_ServerEndpointDialog> createState() => _ServerEndpointDialogState();
}

class _ServerEndpointDialogState extends State<_ServerEndpointDialog> {
  late final TextEditingController _ctrl = TextEditingController(text: widget.currentUrl);
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _apply() {
    final normalized = normalizeSolApiBaseUrl(_ctrl.text);
    if (normalized == null) {
      setState(() => _error = 'Enter a valid host or IPv4 address (e.g. 192.168.1.10:3001).');
      return;
    }
    Navigator.of(context).pop(ServerEndpointChoice.setUrl(normalized));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Backend Server Endpoint'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Point this app to your host backend PC (Wi-Fi LAN IP or USB adb reverse).',
              style: TypographyTokens.bodyMuted,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _ctrl,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'API Base URL',
                hintText: 'http://192.168.x.x:3001/api/v1',
              ),
              onSubmitted: (_) => _apply(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TypographyTokens.bodyMuted.copyWith(color: ColorTokens.dangerPressed),
              ),
            ],
            const SizedBox(height: 12),
            const Text('Quick Presets', style: TypographyTokens.label),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                ActionChip(
                  label: Text('Build Default (${Uri.tryParse(widget.defaultUrl)?.host ?? 'default'})'),
                  onPressed: () {
                    setState(() {
                      _ctrl.text = widget.defaultUrl;
                      _error = null;
                    });
                  },
                ),
                for (final preset in widget.presets)
                  ActionChip(
                    label: Text(preset.label),
                    onPressed: () {
                      setState(() {
                        _ctrl.text = preset.url;
                        _error = null;
                      });
                    },
                  ),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(const ServerEndpointChoice.reset()),
          child: const Text('Reset Default'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _apply,
          child: const Text('Apply'),
        ),
      ],
    );
  }
}

/// Shared card showing the active SolTransit backend endpoint with one-tap editing.
class ServerEndpointCard extends StatelessWidget {
  const ServerEndpointCard({
    super.key,
    required this.currentUrl,
    required this.onConfigurePressed,
  });

  final String currentUrl;
  final VoidCallback onConfigurePressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ColorTokens.surface,
        borderRadius: const BorderRadius.all(Radius.circular(16)),
        border: Border.all(color: ColorTokens.borderSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Backend Server Endpoint', style: TypographyTokens.cardTitle),
          const SizedBox(height: 4),
          const Text(
            'Switch between Wi-Fi LAN IP, USB adb reverse (127.0.0.1), or emulator without rebuilding.',
            style: TypographyTokens.bodyMuted,
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: ColorTokens.surfaceElevated,
              borderRadius: const BorderRadius.all(Radius.circular(10)),
              border: Border.all(color: ColorTokens.borderSubtle),
            ),
            child: Text(
              currentUrl,
              style: TypographyTokens.telemetryTabular.copyWith(fontSize: 13),
            ),
          ),
          const SizedBox(height: 12),
          SecondaryButton(
            label: 'Change Server Endpoint',
            icon: Icons.dns_outlined,
            fullWidth: true,
            onPressed: onConfigurePressed,
          ),
        ],
      ),
    );
  }
}

