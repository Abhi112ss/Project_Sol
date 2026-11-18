import 'dart:math';

import 'package:dio/dio.dart';

import '../config/driver_config.dart';
import '../models/driver_models.dart';

class DriverApiException implements Exception {
  const DriverApiException({
    required this.code,
    required this.message,
    this.statusCode,
    this.details,
  });

  final String code;
  final String message;
  final int? statusCode;
  final Map<String, dynamic>? details;

  bool get isNetworkFailure => code == 'NETWORK_UNREACHABLE';

  @override
  String toString() => '$code: $message';
}

abstract class DriverApi {
  Future<DriverProfileData> fetchProfile();

  Future<List<DriverTripSummary>> fetchTrips();

  Future<DriverCommutesOverviewData> fetchCommutesOverview();

  Future<DriverCommuteCalendarData> fetchCommuteCalendar(
    String commuteId, {
    String? month,
  });

  Future<DriverCommuteDateManifestData> fetchCommuteDateManifest(
    String commuteId,
    String date,
  );

  Future<DriverTripManifest> fetchManifest(String tripId);

  Future<void> acceptTrip(String tripId);

  Future<DriverTripManifest> startTrip(String tripId);

  Future<Map<String, dynamic>> arriveAtStop(
    String tripId,
    String stopId, {
    double? latitude,
    double? longitude,
    double? accuracyM,
    DateTime? occurredAtClient,
    String? clientEventId,
  });

  Future<void> pickupPassenger(
    String tripId,
    String stopId,
    String assignmentId, {
    String? otpCode,
    double? latitude,
    double? longitude,
    double? accuracyM,
    DateTime? occurredAtClient,
    String? clientEventId,
  });

  Future<void> markNoShow(
    String tripId,
    String stopId,
    String assignmentId, {
    required String reasonCode,
    String? notes,
    required double latitude,
    required double longitude,
    double? accuracyM,
    DateTime? occurredAtClient,
    String? clientEventId,
  });

  Future<void> completeTrip(
    String tripId, {
    double? latitude,
    double? longitude,
    DateTime? occurredAtClient,
    String? clientEventId,
  });

  Future<DriverTripManifest> syncEventsBatch(String tripId, List<QueuedDriverEvent> events);

  Future<void> uploadTripLocation(String tripId, GpsSampleRecord sample);

  Future<void> uploadTripLocationBatch(String tripId, List<GpsSampleRecord> samples);
  Future<List<DriverNotificationItem>> fetchNotifications();
  Future<void> markNotificationRead(String notificationId);
  Future<int> markAllNotificationsRead();
  Future<void> registerDeviceToken({
    required String token,
    String platform = 'ANDROID',
  });
  Future<DriverSosReceipt> triggerSos({
    String? tripId,
    double? latitude,
    double? longitude,
    double? accuracyM,
    String? notes,
  });
}

class HttpDriverApi implements DriverApi {
  HttpDriverApi({Dio? dio}) : _dio = dio ?? _createDefaultDio();

  static Dio _createDefaultDio() {
    final client = Dio(
      BaseOptions(
        baseUrl: DriverConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 7),
        receiveTimeout: const Duration(seconds: 12),
        headers: const {'Content-Type': 'application/json'},
      ),
    );
    client.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          options.baseUrl = DriverConfig.apiBaseUrl;
          handler.next(options);
        },
      ),
    );
    return client;
  }

  final Dio _dio;
  final Random _rng = Random.secure();

  String newUuidV4() {
    final bytes = List<int>.generate(16, (_) => _rng.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }

  Options _headers({bool idempotent = false}) {
    return Options(
      headers: {
        'X-Dev-User-Id': DriverConfig.defaultDriverUserId,
        'X-Dev-Org-Id': DriverConfig.organizationId,
        'X-Dev-Role': 'DRIVER',
        if (idempotent) 'X-Idempotency-Key': newUuidV4(),
      },
    );
  }

  DriverApiException _mapError(Object err) {
    if (err is DioException) {
      final data = err.response?.data;
      if (data is Map && data['error'] is Map) {
        final errorMap = data['error'] as Map;
        final rawDetails = errorMap['details'];
        return DriverApiException(
          code: (errorMap['code'] ?? 'HTTP_ERROR').toString(),
          message: (errorMap['message'] ?? 'Request failed.').toString(),
          statusCode: err.response?.statusCode,
          details: rawDetails is Map ? Map<String, dynamic>.from(rawDetails) : null,
        );
      }
      if (err.type == DioExceptionType.connectionError ||
          err.type == DioExceptionType.connectionTimeout ||
          err.type == DioExceptionType.receiveTimeout ||
          err.type == DioExceptionType.sendTimeout ||
          err.type == DioExceptionType.unknown) {
        return const DriverApiException(
          code: 'NETWORK_UNREACHABLE',
          message: 'No cellular connection. Action safely queued locally.',
        );
      }
      return DriverApiException(
        code: 'HTTP_${err.response?.statusCode ?? 500}',
        message: err.message ?? 'Unexpected network error.',
        statusCode: err.response?.statusCode,
      );
    }
    return DriverApiException(code: 'UNEXPECTED_ERROR', message: err.toString());
  }

  T _unwrap<T>(Response<dynamic> res) {
    final body = res.data;
    if (body is Map<String, dynamic> && body.containsKey('data')) {
      return body['data'] as T;
    }
    return body as T;
  }

  @override
  Future<DriverProfileData> fetchProfile() async {
    try {
      final res = await _dio.get<dynamic>('/driver/profile', options: _headers());
      return DriverProfileData.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<List<DriverTripSummary>> fetchTrips() async {
    try {
      final res = await _dio.get<dynamic>('/driver/trips', options: _headers());
      final list = _unwrap<List<dynamic>>(res);
      return list
          .whereType<Map>()
          .map((m) => DriverTripSummary.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<DriverTripManifest> fetchManifest(String tripId) async {
    try {
      final res = await _dio.get<dynamic>('/driver/trips/$tripId', options: _headers());
      return DriverTripManifest.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> acceptTrip(String tripId) async {
    try {
      await _dio.post<dynamic>(
        '/driver/trips/$tripId/accept',
        options: _headers(idempotent: true),
        data: const <String, dynamic>{},
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<DriverTripManifest> startTrip(String tripId) async {
    try {
      await _dio.post<dynamic>(
        '/driver/trips/$tripId/start',
        options: _headers(idempotent: true),
        data: const <String, dynamic>{},
      );
      return await fetchManifest(tripId);
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<Map<String, dynamic>> arriveAtStop(
    String tripId,
    String stopId, {
    double? latitude,
    double? longitude,
    double? accuracyM,
    DateTime? occurredAtClient,
    String? clientEventId,
  }) async {
    try {
      final res = await _dio.post<dynamic>(
        '/driver/trips/$tripId/stops/$stopId/arrive',
        options: _headers(idempotent: true),
        data: {
          'latitude': ?latitude,
          'longitude': ?longitude,
          'accuracyM': ?accuracyM,
          if (occurredAtClient != null)
            'occurredAtClient': occurredAtClient.toUtc().toIso8601String(),
          'clientEventId': ?clientEventId,
        },
      );
      return _unwrap<Map<String, dynamic>>(res);
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> pickupPassenger(
    String tripId,
    String stopId,
    String assignmentId, {
    String? otpCode,
    double? latitude,
    double? longitude,
    double? accuracyM,
    DateTime? occurredAtClient,
    String? clientEventId,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/driver/trips/$tripId/stops/$stopId/passengers/$assignmentId/pickup',
        options: _headers(idempotent: true),
        data: {
          if (otpCode != null && otpCode.isNotEmpty) 'otpCode': otpCode,
          'latitude': ?latitude,
          'longitude': ?longitude,
          'accuracyM': ?accuracyM,
          if (occurredAtClient != null)
            'occurredAtClient': occurredAtClient.toUtc().toIso8601String(),
          'clientEventId': ?clientEventId,
        },
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> markNoShow(
    String tripId,
    String stopId,
    String assignmentId, {
    required String reasonCode,
    String? notes,
    required double latitude,
    required double longitude,
    double? accuracyM,
    DateTime? occurredAtClient,
    String? clientEventId,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/driver/trips/$tripId/stops/$stopId/passengers/$assignmentId/no-show',
        options: _headers(idempotent: true),
        data: {
          'reasonCode': reasonCode,
          if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
          'latitude': latitude,
          'longitude': longitude,
          'accuracyM': ?accuracyM,
          if (occurredAtClient != null)
            'occurredAtClient': occurredAtClient.toUtc().toIso8601String(),
          'clientEventId': ?clientEventId,
        },
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> completeTrip(
    String tripId, {
    double? latitude,
    double? longitude,
    DateTime? occurredAtClient,
    String? clientEventId,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/driver/trips/$tripId/complete',
        options: _headers(idempotent: true),
        data: {
          'latitude': ?latitude,
          'longitude': ?longitude,
          if (occurredAtClient != null)
            'occurredAtClient': occurredAtClient.toUtc().toIso8601String(),
          'clientEventId': ?clientEventId,
        },
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<DriverTripManifest> syncEventsBatch(
    String tripId,
    List<QueuedDriverEvent> events,
  ) async {
    try {
      final res = await _dio.post<dynamic>(
        '/driver/trips/$tripId/events',
        options: _headers(idempotent: true),
        data: {'events': events.map((e) => e.toApiPayload()).toList()},
      );
      final data = _unwrap<Map<String, dynamic>>(res);
      return DriverTripManifest.fromJson(
        Map<String, dynamic>.from(data['manifest'] as Map),
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> uploadTripLocation(String tripId, GpsSampleRecord sample) async {
    try {
      await _dio.post<dynamic>(
        '/driver/trips/$tripId/location',
        options: _headers(),
        data: sample.toApiPayload(),
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> uploadTripLocationBatch(String tripId, List<GpsSampleRecord> samples) async {
    try {
      await _dio.post<dynamic>(
        '/driver/trips/$tripId/locations/batch',
        options: _headers(),
        data: {'samples': samples.map((s) => s.toApiPayload()).toList()},
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<List<DriverNotificationItem>> fetchNotifications() async {
    try {
      final res = await _dio.get<dynamic>(
        '/driver/notifications',
        queryParameters: const {'limit': 50},
        options: _headers(),
      );
      final data = _unwrap<Map<String, dynamic>>(res);
      final items = data['items'] as List<dynamic>? ?? const [];
      return items
          .whereType<Map>()
          .map((m) => DriverNotificationItem.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> markNotificationRead(String notificationId) async {
    try {
      await _dio.patch<dynamic>(
        '/driver/notifications/$notificationId/read',
        options: _headers(),
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<int> markAllNotificationsRead() async {
    try {
      final res = await _dio.post<dynamic>(
        '/driver/notifications/mark-all-read',
        options: _headers(),
        data: const <String, dynamic>{},
      );
      final data = _unwrap<Map<String, dynamic>>(res);
      return (data['markedCount'] as num?)?.toInt() ?? 0;
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> registerDeviceToken({
    required String token,
    String platform = 'ANDROID',
  }) async {
    try {
      await _dio.post<dynamic>(
        '/driver/notifications/device-token',
        options: _headers(),
        data: {
          'token': token,
          'platform': platform,
        },
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<DriverSosReceipt> triggerSos({
    String? tripId,
    double? latitude,
    double? longitude,
    double? accuracyM,
    String? notes,
  }) async {
    try {
      final res = await _dio.post<dynamic>(
        '/driver/safety/sos',
        options: _headers(idempotent: true),
        data: {
          'tripId': ?tripId,
          'latitude': ?latitude,
          'longitude': ?longitude,
          'accuracyM': ?accuracyM,
          'notes': ?notes,
        },
      );
      return DriverSosReceipt.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<DriverCommutesOverviewData> fetchCommutesOverview() async {
    try {
      final res = await _dio.get<dynamic>(
        '/driver/commutes/overview',
        options: _headers(),
      );
      return DriverCommutesOverviewData.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<DriverCommuteCalendarData> fetchCommuteCalendar(
    String commuteId, {
    String? month,
  }) async {
    try {
      final res = await _dio.get<dynamic>(
        '/driver/commutes/${Uri.encodeComponent(commuteId)}/calendar',
        queryParameters: {
          if (month != null && month.isNotEmpty) 'month': month,
        },
        options: _headers(),
      );
      return DriverCommuteCalendarData.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<DriverCommuteDateManifestData> fetchCommuteDateManifest(
    String commuteId,
    String date,
  ) async {
    try {
      final res = await _dio.get<dynamic>(
        '/driver/commutes/${Uri.encodeComponent(commuteId)}/dates/${Uri.encodeComponent(date)}',
        options: _headers(),
      );
      return DriverCommuteDateManifestData.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }
}
