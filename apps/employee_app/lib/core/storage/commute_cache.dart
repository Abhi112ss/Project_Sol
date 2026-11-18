import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Lightweight persistent JSON cache scoped per persona (`userId`), enabling
/// calm offline schedule viewing without native plugin crashes in widget tests.
class CommuteCacheStore {
  CommuteCacheStore({this.enableDiskPersistence = true});

  final bool enableDiskPersistence;
  final Map<String, Object?> _memory = {};

  Future<File?> _resolveFile(String userId, String key) async {
    if (!enableDiskPersistence) return null;
    try {
      final dir = await getApplicationDocumentsDirectory();
      final cacheDir = Directory(p.join(dir.path, 'sol_employee_cache'));
      if (!cacheDir.existsSync()) {
        await cacheDir.create(recursive: true);
      }
      return File(p.join(cacheDir.path, '${userId}_$key.json'));
    } catch (_) {
      return null;
    }
  }

  Future<void> writeJson(String userId, String key, Object? payload) async {
    final memKey = '${userId}_$key';
    _memory[memKey] = payload;

    final file = await _resolveFile(userId, key);
    if (file == null) return;
    try {
      await file.writeAsString(jsonEncode(payload));
    } catch (_) {
      // Safe non-fatal fallback to memory cache.
    }
  }

  Future<Object?> readJson(String userId, String key) async {
    final memKey = '${userId}_$key';
    if (_memory.containsKey(memKey)) {
      return _memory[memKey];
    }
    final file = await _resolveFile(userId, key);
    if (file == null || !file.existsSync()) return null;
    try {
      final raw = await file.readAsString();
      final decoded = jsonDecode(raw);
      _memory[memKey] = decoded;
      return decoded;
    } catch (_) {
      return null;
    }
  }
}
