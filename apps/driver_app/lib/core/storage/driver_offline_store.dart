import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../models/driver_models.dart';

/// Persistent offline store preserving trip manifests and driver execution
/// events (`clientEventId` queued in strict chronological order) when cellular
/// drops on routes or basements.
abstract class DriverOfflineStore {
  Future<void> saveManifest(DriverTripManifest manifest);

  Future<DriverTripManifest?> readManifest(String tripId);

  Future<void> enqueueEvent(QueuedDriverEvent event);

  Future<List<QueuedDriverEvent>> listPendingEvents({String? tripId});

  Future<void> markEventsSynced(List<String> clientEventIds);

  Future<void> markEventError(String clientEventId, String error);

  Future<DateTime?> getLastSyncedAt();

  Future<void> setLastSyncedAt(DateTime ts);

  Future<void> enqueueGpsSample(GpsSampleRecord sample);

  Future<List<GpsSampleRecord>> listPendingGpsSamples({String? tripId, int limit = 50});

  Future<int> countPendingGpsSamples({String? tripId});

  Future<void> markGpsSamplesSynced(List<String> sampleIds, DateTime acknowledgedAt);

  Future<void> markGpsSampleRetry(String sampleId, String error);

  Future<void> pruneOldSyncedGpsSamples({Duration age = const Duration(hours: 24)});
}

class InMemoryDriverOfflineStore implements DriverOfflineStore {
  final Map<String, DriverTripManifest> _manifests = {};
  final List<QueuedDriverEvent> _events = [];
  final List<GpsSampleRecord> _gpsSamples = [];
  DateTime? _lastSyncedAt;

  @override
  Future<void> saveManifest(DriverTripManifest manifest) async {
    _manifests[manifest.tripId] = manifest;
  }

  @override
  Future<DriverTripManifest?> readManifest(String tripId) async => _manifests[tripId];

  @override
  Future<void> enqueueEvent(QueuedDriverEvent event) async {
    if (_events.any((e) => e.clientEventId == event.clientEventId)) return;
    _events.add(event);
  }

  @override
  Future<List<QueuedDriverEvent>> listPendingEvents({String? tripId}) async {
    final filtered = _events.where((e) {
      if (e.syncStatus == 'SYNCED') return false;
      if (tripId != null && e.tripId != tripId) return false;
      return true;
    }).toList();
    filtered.sort((a, b) => a.occurredAtClient.compareTo(b.occurredAtClient));
    return filtered;
  }

  @override
  Future<void> markEventsSynced(List<String> clientEventIds) async {
    for (var i = 0; i < _events.length; i++) {
      if (clientEventIds.contains(_events[i].clientEventId)) {
        final e = _events[i];
        _events[i] = QueuedDriverEvent(
          clientEventId: e.clientEventId,
          tripId: e.tripId,
          eventType: e.eventType,
          stopId: e.stopId,
          assignmentId: e.assignmentId,
          occurredAtClient: e.occurredAtClient,
          latitude: e.latitude,
          longitude: e.longitude,
          accuracyM: e.accuracyM,
          otpCode: e.otpCode,
          reasonCode: e.reasonCode,
          notes: e.notes,
          syncStatus: 'SYNCED',
        );
      }
    }
  }

  @override
  Future<void> markEventError(String clientEventId, String error) async {
    for (var i = 0; i < _events.length; i++) {
      if (_events[i].clientEventId == clientEventId) {
        final e = _events[i];
        _events[i] = QueuedDriverEvent(
          clientEventId: e.clientEventId,
          tripId: e.tripId,
          eventType: e.eventType,
          stopId: e.stopId,
          assignmentId: e.assignmentId,
          occurredAtClient: e.occurredAtClient,
          latitude: e.latitude,
          longitude: e.longitude,
          accuracyM: e.accuracyM,
          otpCode: e.otpCode,
          reasonCode: e.reasonCode,
          notes: e.notes,
          syncStatus: 'ERROR',
          errorMessage: error,
        );
      }
    }
  }

  @override
  Future<DateTime?> getLastSyncedAt() async => _lastSyncedAt;

  @override
  Future<void> setLastSyncedAt(DateTime ts) async {
    _lastSyncedAt = ts;
  }

  @override
  Future<void> enqueueGpsSample(GpsSampleRecord sample) async {
    if (_gpsSamples.any((s) => s.sampleId == sample.sampleId)) return;
    _gpsSamples.add(sample);
  }

  @override
  Future<List<GpsSampleRecord>> listPendingGpsSamples({String? tripId, int limit = 50}) async {
    final rows = _gpsSamples.where((s) {
      if (s.syncStatus == 'SYNCED') return false;
      if (tripId != null && s.tripId != tripId) return false;
      return true;
    }).toList();
    rows.sort((a, b) {
      final t = a.capturedAt.compareTo(b.capturedAt);
      if (t != 0) return t;
      return a.sequenceNo.compareTo(b.sequenceNo);
    });
    if (rows.length > limit) return rows.sublist(0, limit);
    return rows;
  }

  @override
  Future<int> countPendingGpsSamples({String? tripId}) async {
    return _gpsSamples.where((s) {
      if (s.syncStatus == 'SYNCED') return false;
      if (tripId != null && s.tripId != tripId) return false;
      return true;
    }).length;
  }

  @override
  Future<void> markGpsSamplesSynced(List<String> sampleIds, DateTime acknowledgedAt) async {
    for (var i = 0; i < _gpsSamples.length; i += 1) {
      final s = _gpsSamples[i];
      if (sampleIds.contains(s.sampleId)) {
        _gpsSamples[i] = GpsSampleRecord(
          sampleId: s.sampleId,
          tripId: s.tripId,
          driverId: s.driverId,
          sequenceNo: s.sequenceNo,
          latitude: s.latitude,
          longitude: s.longitude,
          accuracyM: s.accuracyM,
          speedMps: s.speedMps,
          headingDeg: s.headingDeg,
          altitudeM: s.altitudeM,
          capturedAt: s.capturedAt,
          createdAt: s.createdAt,
          syncStatus: 'SYNCED',
          retryCount: s.retryCount,
          lastAttemptAt: acknowledgedAt,
          serverAcknowledgedAt: acknowledgedAt,
        );
      }
    }
  }

  @override
  Future<void> markGpsSampleRetry(String sampleId, String error) async {
    final now = DateTime.now().toUtc();
    for (var i = 0; i < _gpsSamples.length; i += 1) {
      final s = _gpsSamples[i];
      if (s.sampleId == sampleId) {
        _gpsSamples[i] = GpsSampleRecord(
          sampleId: s.sampleId,
          tripId: s.tripId,
          driverId: s.driverId,
          sequenceNo: s.sequenceNo,
          latitude: s.latitude,
          longitude: s.longitude,
          accuracyM: s.accuracyM,
          speedMps: s.speedMps,
          headingDeg: s.headingDeg,
          altitudeM: s.altitudeM,
          capturedAt: s.capturedAt,
          createdAt: s.createdAt,
          syncStatus: 'PENDING',
          retryCount: s.retryCount + 1,
          lastAttemptAt: now,
          errorMessage: error,
        );
      }
    }
  }

  @override
  Future<void> pruneOldSyncedGpsSamples({Duration age = const Duration(hours: 24)}) async {
    final cutoff = DateTime.now().toUtc().subtract(age);
    _gpsSamples.removeWhere((s) => s.syncStatus == 'SYNCED' && s.capturedAt.isBefore(cutoff));
  }
}

/// SQLite-backed Drift offline queue with safe automatic fallback to
/// [InMemoryDriverOfflineStore] if platform paths or FFI libraries are absent.
class DriftDriverOfflineStore extends GeneratedDatabase implements DriverOfflineStore {
  DriftDriverOfflineStore._(super.executor);

  factory DriftDriverOfflineStore.openPersistent() {
    final executor = LazyDatabase(() async {
      final dir = await getApplicationDocumentsDirectory();
      final dbDir = Directory(p.join(dir.path, 'sol_driver_db'));
      if (!dbDir.existsSync()) {
        await dbDir.create(recursive: true);
      }
      final file = File(p.join(dbDir.path, 'driver_offline.sqlite'));
      return NativeDatabase.createInBackground(file);
    });
    return DriftDriverOfflineStore._(executor);
  }

  final InMemoryDriverOfflineStore _fallback = InMemoryDriverOfflineStore();
  bool _initialized = false;
  bool _useFallback = false;
  DateTime? _lastSyncedAt;

  @override
  int get schemaVersion => 1;

  @override
  Iterable<TableInfo<Table, dynamic>> get allTables => const [];

  Future<void> _ensureReady() async {
    if (_initialized || _useFallback) return;
    try {
      await customStatement('''
        CREATE TABLE IF NOT EXISTS cached_manifests (
          trip_id TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );
      ''');
      await customStatement('''
        CREATE TABLE IF NOT EXISTS queued_driver_events (
          client_event_id TEXT PRIMARY KEY,
          trip_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          stop_id TEXT,
          assignment_id TEXT,
          occurred_at_ms INTEGER NOT NULL,
          latitude REAL,
          longitude REAL,
          accuracy_m REAL,
          otp_code TEXT,
          reason_code TEXT,
          notes TEXT,
          sync_status TEXT NOT NULL DEFAULT 'PENDING',
          error_message TEXT
        );
      ''');
      await customStatement('''
        CREATE TABLE IF NOT EXISTS queued_gps_samples (
          sample_id TEXT PRIMARY KEY,
          trip_id TEXT NOT NULL,
          driver_id TEXT NOT NULL,
          sequence_no INTEGER NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          accuracy_m REAL,
          speed_mps REAL,
          heading_deg REAL,
          altitude_m REAL,
          captured_at_ms INTEGER NOT NULL,
          created_at_ms INTEGER NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'PENDING',
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_attempt_at_ms INTEGER,
          server_acknowledged_at_ms INTEGER,
          error_message TEXT
        );
      ''');
      _initialized = true;
    } catch (_) {
      _useFallback = true;
    }
  }

  @override
  Future<void> saveManifest(DriverTripManifest manifest) async {
    await _ensureReady();
    if (_useFallback) return _fallback.saveManifest(manifest);

    try {
      await customInsert(
        '''
        INSERT INTO cached_manifests (trip_id, payload_json, updated_at_ms)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(trip_id) DO UPDATE SET
          payload_json = excluded.payload_json,
          updated_at_ms = excluded.updated_at_ms
        ''',
        variables: [
          Variable.withString(manifest.tripId),
          Variable.withString(jsonEncode(manifest.toJson())),
          Variable.withInt(DateTime.now().millisecondsSinceEpoch),
        ],
      );
    } catch (_) {
      await _fallback.saveManifest(manifest);
    }
  }

  @override
  Future<DriverTripManifest?> readManifest(String tripId) async {
    await _ensureReady();
    if (_useFallback) return _fallback.readManifest(tripId);

    try {
      final rows = await customSelect(
        'SELECT payload_json FROM cached_manifests WHERE trip_id = ?1 LIMIT 1',
        variables: [Variable.withString(tripId)],
      ).get();
      if (rows.isEmpty) return null;
      final decoded = jsonDecode(rows.first.read<String>('payload_json'));
      if (decoded is Map<String, dynamic>) {
        return DriverTripManifest.fromJson(decoded);
      }
      return null;
    } catch (_) {
      return _fallback.readManifest(tripId);
    }
  }

  @override
  Future<void> enqueueEvent(QueuedDriverEvent event) async {
    await _ensureReady();
    if (_useFallback) return _fallback.enqueueEvent(event);

    try {
      await customInsert(
        '''
        INSERT OR IGNORE INTO queued_driver_events (
          client_event_id, trip_id, event_type, stop_id, assignment_id,
          occurred_at_ms, latitude, longitude, accuracy_m, otp_code, reason_code, notes, sync_status
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        ''',
        variables: [
          Variable.withString(event.clientEventId),
          Variable.withString(event.tripId),
          Variable.withString(event.eventType),
          event.stopId != null ? Variable.withString(event.stopId!) : const Variable(null),
          event.assignmentId != null ? Variable.withString(event.assignmentId!) : const Variable(null),
          Variable.withInt(event.occurredAtClient.millisecondsSinceEpoch),
          event.latitude != null ? Variable.withReal(event.latitude!) : const Variable(null),
          event.longitude != null ? Variable.withReal(event.longitude!) : const Variable(null),
          event.accuracyM != null ? Variable.withReal(event.accuracyM!) : const Variable(null),
          event.otpCode != null ? Variable.withString(event.otpCode!) : const Variable(null),
          event.reasonCode != null ? Variable.withString(event.reasonCode!) : const Variable(null),
          event.notes != null ? Variable.withString(event.notes!) : const Variable(null),
          Variable.withString(event.syncStatus),
        ],
      );
    } catch (_) {
      await _fallback.enqueueEvent(event);
    }
  }

  @override
  Future<List<QueuedDriverEvent>> listPendingEvents({String? tripId}) async {
    await _ensureReady();
    if (_useFallback) return _fallback.listPendingEvents(tripId: tripId);

    try {
      final query = tripId != null
          ? 'SELECT * FROM queued_driver_events WHERE sync_status != ?1 AND trip_id = ?2 ORDER BY occurred_at_ms ASC'
          : 'SELECT * FROM queued_driver_events WHERE sync_status != ?1 ORDER BY occurred_at_ms ASC';
      final vars = <Variable<Object>>[
        Variable.withString('SYNCED'),
        if (tripId != null) Variable.withString(tripId),
      ];
      final rows = await customSelect(query, variables: vars).get();
      return rows.map((r) {
        return QueuedDriverEvent(
          clientEventId: r.read<String>('client_event_id'),
          tripId: r.read<String>('trip_id'),
          eventType: r.read<String>('event_type'),
          stopId: r.readNullable<String>('stop_id'),
          assignmentId: r.readNullable<String>('assignment_id'),
          occurredAtClient: DateTime.fromMillisecondsSinceEpoch(r.read<int>('occurred_at_ms')),
          latitude: r.readNullable<double>('latitude'),
          longitude: r.readNullable<double>('longitude'),
          accuracyM: r.readNullable<double>('accuracy_m'),
          otpCode: r.readNullable<String>('otp_code'),
          reasonCode: r.readNullable<String>('reason_code'),
          notes: r.readNullable<String>('notes'),
          syncStatus: r.read<String>('sync_status'),
          errorMessage: r.readNullable<String>('error_message'),
        );
      }).toList();
    } catch (_) {
      return _fallback.listPendingEvents(tripId: tripId);
    }
  }

  @override
  Future<void> markEventsSynced(List<String> clientEventIds) async {
    await _ensureReady();
    if (_useFallback) return _fallback.markEventsSynced(clientEventIds);

    for (final id in clientEventIds) {
      await customUpdate(
        'UPDATE queued_driver_events SET sync_status = ?1, error_message = NULL WHERE client_event_id = ?2',
        variables: [Variable.withString('SYNCED'), Variable.withString(id)],
      );
    }
  }

  @override
  Future<void> markEventError(String clientEventId, String error) async {
    await _ensureReady();
    if (_useFallback) return _fallback.markEventError(clientEventId, error);

    await customUpdate(
      'UPDATE queued_driver_events SET sync_status = ?1, error_message = ?2 WHERE client_event_id = ?3',
      variables: [
        Variable.withString('ERROR'),
        Variable.withString(error),
        Variable.withString(clientEventId),
      ],
    );
  }

  @override
  Future<DateTime?> getLastSyncedAt() async => _lastSyncedAt;

  @override
  Future<void> setLastSyncedAt(DateTime ts) async {
    _lastSyncedAt = ts;
  }

  @override
  Future<void> enqueueGpsSample(GpsSampleRecord sample) async {
    await _ensureReady();
    if (_useFallback) return _fallback.enqueueGpsSample(sample);

    try {
      await customInsert(
        '''
        INSERT OR IGNORE INTO queued_gps_samples (
          sample_id, trip_id, driver_id, sequence_no, latitude, longitude,
          accuracy_m, speed_mps, heading_deg, altitude_m,
          captured_at_ms, created_at_ms, sync_status, retry_count
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ''',
        variables: [
          Variable.withString(sample.sampleId),
          Variable.withString(sample.tripId),
          Variable.withString(sample.driverId),
          Variable.withInt(sample.sequenceNo),
          Variable.withReal(sample.latitude),
          Variable.withReal(sample.longitude),
          sample.accuracyM != null ? Variable.withReal(sample.accuracyM!) : const Variable(null),
          sample.speedMps != null ? Variable.withReal(sample.speedMps!) : const Variable(null),
          sample.headingDeg != null ? Variable.withReal(sample.headingDeg!) : const Variable(null),
          sample.altitudeM != null ? Variable.withReal(sample.altitudeM!) : const Variable(null),
          Variable.withInt(sample.capturedAt.millisecondsSinceEpoch),
          Variable.withInt(sample.createdAt.millisecondsSinceEpoch),
          Variable.withString(sample.syncStatus),
          Variable.withInt(sample.retryCount),
        ],
      );
    } catch (_) {
      await _fallback.enqueueGpsSample(sample);
    }
  }

  @override
  Future<List<GpsSampleRecord>> listPendingGpsSamples({String? tripId, int limit = 50}) async {
    await _ensureReady();
    if (_useFallback) return _fallback.listPendingGpsSamples(tripId: tripId, limit: limit);

    try {
      final query = tripId != null
          ? 'SELECT * FROM queued_gps_samples WHERE sync_status != ?1 AND trip_id = ?2 ORDER BY captured_at_ms ASC, sequence_no ASC LIMIT ?3'
          : 'SELECT * FROM queued_gps_samples WHERE sync_status != ?1 ORDER BY captured_at_ms ASC, sequence_no ASC LIMIT ?2';
      final vars = <Variable<Object>>[
        Variable.withString('SYNCED'),
        if (tripId != null) Variable.withString(tripId),
        Variable.withInt(limit),
      ];
      final rows = await customSelect(query, variables: vars).get();
      return rows.map((r) {
        final lastAtt = r.readNullable<int>('last_attempt_at_ms');
        final srvAck = r.readNullable<int>('server_acknowledged_at_ms');
        return GpsSampleRecord(
          sampleId: r.read<String>('sample_id'),
          tripId: r.read<String>('trip_id'),
          driverId: r.read<String>('driver_id'),
          sequenceNo: r.read<int>('sequence_no'),
          latitude: r.read<double>('latitude'),
          longitude: r.read<double>('longitude'),
          accuracyM: r.readNullable<double>('accuracy_m'),
          speedMps: r.readNullable<double>('speed_mps'),
          headingDeg: r.readNullable<double>('heading_deg'),
          altitudeM: r.readNullable<double>('altitude_m'),
          capturedAt: DateTime.fromMillisecondsSinceEpoch(r.read<int>('captured_at_ms'), isUtc: true),
          createdAt: DateTime.fromMillisecondsSinceEpoch(r.read<int>('created_at_ms'), isUtc: true),
          syncStatus: r.read<String>('sync_status'),
          retryCount: r.read<int>('retry_count'),
          lastAttemptAt:
              lastAtt != null ? DateTime.fromMillisecondsSinceEpoch(lastAtt, isUtc: true) : null,
          serverAcknowledgedAt:
              srvAck != null ? DateTime.fromMillisecondsSinceEpoch(srvAck, isUtc: true) : null,
          errorMessage: r.readNullable<String>('error_message'),
        );
      }).toList();
    } catch (_) {
      return _fallback.listPendingGpsSamples(tripId: tripId, limit: limit);
    }
  }

  @override
  Future<int> countPendingGpsSamples({String? tripId}) async {
    await _ensureReady();
    if (_useFallback) return _fallback.countPendingGpsSamples(tripId: tripId);

    try {
      final query = tripId != null
          ? 'SELECT COUNT(*) AS cnt FROM queued_gps_samples WHERE sync_status != ?1 AND trip_id = ?2'
          : 'SELECT COUNT(*) AS cnt FROM queued_gps_samples WHERE sync_status != ?1';
      final vars = <Variable<Object>>[
        Variable.withString('SYNCED'),
        if (tripId != null) Variable.withString(tripId),
      ];
      final rows = await customSelect(query, variables: vars).get();
      if (rows.isEmpty) return 0;
      return rows.first.read<int>('cnt');
    } catch (_) {
      return _fallback.countPendingGpsSamples(tripId: tripId);
    }
  }

  @override
  Future<void> markGpsSamplesSynced(List<String> sampleIds, DateTime acknowledgedAt) async {
    await _ensureReady();
    if (_useFallback) return _fallback.markGpsSamplesSynced(sampleIds, acknowledgedAt);

    final ackMs = acknowledgedAt.millisecondsSinceEpoch;
    try {
      for (final id in sampleIds) {
        await customUpdate(
          'UPDATE queued_gps_samples SET sync_status = ?1, server_acknowledged_at_ms = ?2, last_attempt_at_ms = ?2, error_message = NULL WHERE sample_id = ?3',
          variables: [
            Variable.withString('SYNCED'),
            Variable.withInt(ackMs),
            Variable.withString(id),
          ],
        );
      }
    } catch (_) {
      await _fallback.markGpsSamplesSynced(sampleIds, acknowledgedAt);
    }
  }

  @override
  Future<void> markGpsSampleRetry(String sampleId, String error) async {
    await _ensureReady();
    if (_useFallback) return _fallback.markGpsSampleRetry(sampleId, error);

    final nowMs = DateTime.now().millisecondsSinceEpoch;
    try {
      await customUpdate(
        'UPDATE queued_gps_samples SET retry_count = retry_count + 1, last_attempt_at_ms = ?1, error_message = ?2 WHERE sample_id = ?3',
        variables: [
          Variable.withInt(nowMs),
          Variable.withString(error),
          Variable.withString(sampleId),
        ],
      );
    } catch (_) {
      await _fallback.markGpsSampleRetry(sampleId, error);
    }
  }

  @override
  Future<void> pruneOldSyncedGpsSamples({Duration age = const Duration(hours: 24)}) async {
    await _ensureReady();
    if (_useFallback) return _fallback.pruneOldSyncedGpsSamples(age: age);

    final cutoffMs = DateTime.now().toUtc().subtract(age).millisecondsSinceEpoch;
    try {
      await customUpdate(
        'DELETE FROM queued_gps_samples WHERE sync_status = ?1 AND captured_at_ms < ?2',
        variables: [Variable.withString('SYNCED'), Variable.withInt(cutoffMs)],
      );
    } catch (_) {
      await _fallback.pruneOldSyncedGpsSamples(age: age);
    }
  }
}
