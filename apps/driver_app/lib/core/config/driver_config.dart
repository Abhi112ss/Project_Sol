import 'dart:io';

import 'package:etms_core/etms_core.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

abstract final class DriverConfig {
  static const String _envApiUrl = String.fromEnvironment('API_BASE_URL');
  static String? _runtimeApiUrl;

  static String get defaultApiBaseUrl {
    if (_envApiUrl.isNotEmpty) return _envApiUrl;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3001/api/v1';
    }
    return 'http://127.0.0.1:3001/api/v1';
  }

  static String get apiBaseUrl =>
      (_runtimeApiUrl != null && _runtimeApiUrl!.isNotEmpty)
          ? _runtimeApiUrl!
          : defaultApiBaseUrl;

  static Future<File?> _overrideFile() async {
    if (kIsWeb) return null;
    try {
      final dir = await getApplicationDocumentsDirectory();
      return File(p.join(dir.path, 'sol_driver_server_url.txt'));
    } catch (_) {
      return null;
    }
  }

  static Future<void> loadRuntimeApiUrl() async {
    final file = await _overrideFile();
    if (file == null || !file.existsSync()) return;
    try {
      final raw = await file.readAsString();
      _runtimeApiUrl = normalizeSolApiBaseUrl(raw);
    } catch (_) {
      // Non-fatal fallback to compile-time default.
    }
  }

  static Future<void> setRuntimeApiBaseUrl(String? rawUrl) async {
    final normalized = rawUrl == null ? null : normalizeSolApiBaseUrl(rawUrl);
    _runtimeApiUrl = normalized;
    final file = await _overrideFile();
    if (file == null) return;
    try {
      if (normalized == null) {
        if (file.existsSync()) await file.delete();
      } else {
        await file.writeAsString(normalized);
      }
    } catch (_) {
      // Memory override still applies for current session.
    }
  }

  static Uri buildWebSocketUri() => buildSolWebSocketUri(apiBaseUrl);

  static const String organizationId = '11111111-1111-4111-8111-111111111101';
  static const String defaultDriverUserId = '55555555-5555-4555-8555-555555555511';
  static const String defaultDriverId = '77777777-7777-4777-8777-777777777701';
  static const String transportDeskPhone = '+91-40-6600-9100';
}

