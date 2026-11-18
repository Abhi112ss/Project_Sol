import 'dart:math';

import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../models/employee_models.dart';

class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.statusCode,
  });

  final String code;
  final String message;
  final int? statusCode;

  @override
  String toString() => '$code: $message';
}

abstract class EmployeeApi {
  Future<EmployeeProfileData> fetchProfile(String userId);

  Future<EmployeeProfileData> updateProfile(
    String userId, {
    String? defaultShiftId,
    String? emergencyContactName,
    String? emergencyContactPhone,
  });

  Future<List<SavedLocation>> fetchLocations(String userId);

  Future<SavedLocation> addLocation(
    String userId, {
    required String locationName,
    required String address,
    String? corridorTag,
    required double latitude,
    required double longitude,
    int geofenceRadiusM = 150,
    bool isDefault = false,
  });

  Future<SavedLocation> updateLocation(
    String userId,
    String locationId, {
    bool? isDefault,
    String? locationName,
    String? corridorTag,
  });

  Future<List<EmployeeBooking>> fetchBookings(String userId);

  Future<EmployeeBooking> createBooking(
    String userId, {
    required String shiftId,
    required String officeId,
    required String pickupLocationId,
    required String travelDate,
    required String direction,
    required DateTime scheduledPickupAt,
    String timePreference = 'PICKUP_AT',
    String? requestedTimeLocal,
    String timezone = 'Asia/Kolkata',
    String? notes,
  });

  Future<SeriesPreviewData> previewBookingSeries(
    String userId, {
    String? officeId,
    required String shiftId,
    required String pickupLocationId,
    required String direction,
    required String timePreference,
    required String requestedTimeLocal,
    String timezone = 'Asia/Kolkata',
    required String recurrenceType,
    required String startDate,
    String? endDate,
    List<String>? selectedDaysOfWeek,
  });

  Future<BookingSeriesSummary> createBookingSeries(
    String userId, {
    String? officeId,
    required String shiftId,
    required String pickupLocationId,
    required String direction,
    required String timePreference,
    required String requestedTimeLocal,
    String timezone = 'Asia/Kolkata',
    required String recurrenceType,
    required String startDate,
    String? endDate,
    List<String>? selectedDaysOfWeek,
    bool skipConflictingDates = false,
    String? notes,
  });

  Future<List<BookingSeriesSummary>> fetchBookingSeries(String userId);

  Future<void> skipSeriesDates(
    String userId,
    String seriesId, {
    required List<String> dates,
    String reason = 'Employee skipped date',
  });

  Future<void> extendBookingSeries(
    String userId,
    String seriesId, {
    required String newEndDate,
  });

  Future<void> cancelBookingSeries(
    String userId,
    String seriesId, {
    required String reason,
  });

  Future<({EmployeeBooking booking, Map<String, dynamic>? impactedTripAlert})>
      updateBookingOccurrence(
    String userId,
    String bookingId, {
    String? pickupLocationId,
    String? timePreference,
    String? requestedTimeLocal,
    String? timezone,
    required String reason,
  });

  Future<EmployeeBooking> cancelBooking(
    String userId,
    String bookingId, {
    required String reason,
  });

  Future<UpcomingTripDetail?> fetchUpcomingTrip(String userId);

  Future<List<EmployeeTripSummary>> fetchTrips(String userId);

  Future<UpcomingTripDetail> fetchTripDetail(String userId, String tripId);

  Future<GpsTelemetry?> fetchTripLiveTelemetry(String userId, String tripId) async => null;

  Future<void> reportRunningLate(
    String userId,
    String tripId, {
    required int etaMinutes,
    String? note,
  });

  Future<void> confirmSafeReach(String userId, String tripId);

  Future<List<EmployeeNotificationItem>> fetchNotifications(String userId);

  Future<void> markNotificationRead(String userId, String notificationId);
  Future<int> markAllNotificationsRead(String userId);
  Future<void> registerDeviceToken(
    String userId, {
    required String token,
    String platform = 'ANDROID',
  });
  Future<void> appealNoShow(
    String userId,
    String tripId, {
    required String appealNote,
  });

  Future<SafetyAlertReceipt> triggerSos(
    String userId, {
    String? tripId,
    double? latitude,
    double? longitude,
    double? accuracyM,
    String? notes,
  });
}

class HttpEmployeeApi implements EmployeeApi {
  HttpEmployeeApi({Dio? dio})
      : _dio = dio ?? _createDefaultDio();

  static Dio _createDefaultDio() {
    final client = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 8),
        receiveTimeout: const Duration(seconds: 12),
        headers: const {'Content-Type': 'application/json'},
      ),
    );
    client.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          options.baseUrl = AppConfig.apiBaseUrl;
          handler.next(options);
        },
      ),
    );
    return client;
  }

  final Dio _dio;
  final Random _rng = Random.secure();

  String _uuidV4() {
    final bytes = List<int>.generate(16, (_) => _rng.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }

  Options _headers(String userId, {bool idempotent = false}) {
    return Options(
      headers: {
        'X-Dev-User-Id': userId,
        'X-Dev-Org-Id': AppConfig.organizationId,
        'X-Dev-Role': 'EMPLOYEE',
        if (idempotent) 'X-Idempotency-Key': _uuidV4(),
      },
    );
  }

  ApiException _mapError(Object err) {
    if (err is DioException) {
      final data = err.response?.data;
      if (data is Map && data['error'] is Map) {
        final errorMap = data['error'] as Map;
        return ApiException(
          code: (errorMap['code'] ?? 'HTTP_ERROR').toString(),
          message: (errorMap['message'] ?? 'Request failed.').toString(),
          statusCode: err.response?.statusCode,
        );
      }
      if (err.type == DioExceptionType.connectionError ||
          err.type == DioExceptionType.connectionTimeout) {
        return const ApiException(
          code: 'NETWORK_UNREACHABLE',
          message: 'Unable to reach SolTransit transport desk. Check connection and try again.',
        );
      }
      return ApiException(
        code: 'HTTP_${err.response?.statusCode ?? 500}',
        message: err.message ?? 'Unexpected network error.',
        statusCode: err.response?.statusCode,
      );
    }
    return ApiException(code: 'UNEXPECTED_ERROR', message: err.toString());
  }

  T _unwrap<T>(Response<dynamic> response) {
    final body = response.data;
    if (body is Map<String, dynamic> && body.containsKey('data')) {
      return body['data'] as T;
    }
    return body as T;
  }

  @override
  Future<EmployeeProfileData> fetchProfile(String userId) async {
    try {
      final res = await _dio.get<dynamic>('/employee/profile', options: _headers(userId));
      return EmployeeProfileData.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<EmployeeProfileData> updateProfile(
    String userId, {
    String? defaultShiftId,
    String? emergencyContactName,
    String? emergencyContactPhone,
  }) async {
    try {
      final res = await _dio.patch<dynamic>(
        '/employee/profile',
        options: _headers(userId),
        data: {
          'defaultShiftId': ?defaultShiftId,
          'emergencyContactName': ?emergencyContactName,
          'emergencyContactPhone': ?emergencyContactPhone,
        },
      );
      return EmployeeProfileData.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<List<SavedLocation>> fetchLocations(String userId) async {
    try {
      final res = await _dio.get<dynamic>('/employee/locations', options: _headers(userId));
      final list = _unwrap<List<dynamic>>(res);
      return list
          .whereType<Map>()
          .map((m) => SavedLocation.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<SavedLocation> addLocation(
    String userId, {
    required String locationName,
    required String address,
    String? corridorTag,
    required double latitude,
    required double longitude,
    int geofenceRadiusM = 150,
    bool isDefault = false,
  }) async {
    try {
      final res = await _dio.post<dynamic>(
        '/employee/locations',
        options: _headers(userId, idempotent: true),
        data: {
          'locationName': locationName,
          'address': address,
          if (corridorTag != null && corridorTag.trim().isNotEmpty) 'corridorTag': corridorTag,
          'latitude': latitude,
          'longitude': longitude,
          'geofenceRadiusM': geofenceRadiusM,
          'isDefault': isDefault,
        },
      );
      return SavedLocation.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<SavedLocation> updateLocation(
    String userId,
    String locationId, {
    bool? isDefault,
    String? locationName,
    String? corridorTag,
  }) async {
    try {
      final res = await _dio.patch<dynamic>(
        '/employee/locations/$locationId',
        options: _headers(userId),
        data: {
          'isDefault': ?isDefault,
          'locationName': ?locationName,
          'corridorTag': ?corridorTag,
        },
      );
      return SavedLocation.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<List<EmployeeBooking>> fetchBookings(String userId) async {
    try {
      final res = await _dio.get<dynamic>('/employee/bookings', options: _headers(userId));
      final list = _unwrap<List<dynamic>>(res);
      return list
          .whereType<Map>()
          .map((m) => EmployeeBooking.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<EmployeeBooking> createBooking(
    String userId, {
    required String shiftId,
    required String officeId,
    required String pickupLocationId,
    required String travelDate,
    required String direction,
    required DateTime scheduledPickupAt,
    String timePreference = 'PICKUP_AT',
    String? requestedTimeLocal,
    String timezone = 'Asia/Kolkata',
    String? notes,
  }) async {
    try {
      final res = await _dio.post<dynamic>(
        '/employee/bookings',
        options: _headers(userId, idempotent: true),
        data: {
          'shiftId': shiftId,
          'officeId': officeId,
          'pickupLocationId': pickupLocationId,
          'travelDate': travelDate,
          'direction': direction,
          'timePreference': timePreference,
          'requestedTimeLocal': ?requestedTimeLocal,
          'timezone': timezone,
          'scheduledPickupAt': scheduledPickupAt.toUtc().toIso8601String(),
          if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
        },
      );
      return EmployeeBooking.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<SeriesPreviewData> previewBookingSeries(
    String userId, {
    String? officeId,
    required String shiftId,
    required String pickupLocationId,
    required String direction,
    required String timePreference,
    required String requestedTimeLocal,
    String timezone = 'Asia/Kolkata',
    required String recurrenceType,
    required String startDate,
    String? endDate,
    List<String>? selectedDaysOfWeek,
  }) async {
    try {
      final res = await _dio.post<dynamic>(
        '/employee/bookings/series/preview',
        options: _headers(userId),
        data: {
          'officeId': ?officeId,
          'shiftId': shiftId,
          'pickupLocationId': pickupLocationId,
          'direction': direction,
          'timePreference': timePreference,
          'requestedTimeLocal': requestedTimeLocal,
          'timezone': timezone,
          'recurrenceType': recurrenceType,
          'startDate': startDate,
          'endDate': ?endDate,
          'selectedDaysOfWeek': ?selectedDaysOfWeek,
        },
      );
      return SeriesPreviewData.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<BookingSeriesSummary> createBookingSeries(
    String userId, {
    String? officeId,
    required String shiftId,
    required String pickupLocationId,
    required String direction,
    required String timePreference,
    required String requestedTimeLocal,
    String timezone = 'Asia/Kolkata',
    required String recurrenceType,
    required String startDate,
    String? endDate,
    List<String>? selectedDaysOfWeek,
    bool skipConflictingDates = false,
    String? notes,
  }) async {
    try {
      final res = await _dio.post<dynamic>(
        '/employee/bookings/series',
        options: _headers(userId, idempotent: true),
        data: {
          'officeId': ?officeId,
          'shiftId': shiftId,
          'pickupLocationId': pickupLocationId,
          'direction': direction,
          'timePreference': timePreference,
          'requestedTimeLocal': requestedTimeLocal,
          'timezone': timezone,
          'recurrenceType': recurrenceType,
          'startDate': startDate,
          'endDate': ?endDate,
          'selectedDaysOfWeek': ?selectedDaysOfWeek,
          'skipConflictingDates': skipConflictingDates,
          if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
        },
      );
      final data = _unwrap<Map<String, dynamic>>(res);
      final seriesMap = Map<String, dynamic>.from(data['series'] as Map);
      return BookingSeriesSummary.fromJson(seriesMap);
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<List<BookingSeriesSummary>> fetchBookingSeries(String userId) async {
    try {
      final res = await _dio.get<dynamic>(
        '/employee/bookings/series',
        options: _headers(userId),
      );
      final list = _unwrap<List<dynamic>>(res);
      return list
          .whereType<Map>()
          .map((e) => BookingSeriesSummary.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> skipSeriesDates(
    String userId,
    String seriesId, {
    required List<String> dates,
    String reason = 'Employee skipped date',
  }) async {
    try {
      await _dio.post<dynamic>(
        '/employee/bookings/series/$seriesId/skip-dates',
        options: _headers(userId, idempotent: true),
        data: {'dates': dates, 'reason': reason},
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> extendBookingSeries(
    String userId,
    String seriesId, {
    required String newEndDate,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/employee/bookings/series/$seriesId/extend',
        options: _headers(userId, idempotent: true),
        data: {'newEndDate': newEndDate},
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> cancelBookingSeries(
    String userId,
    String seriesId, {
    required String reason,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/employee/bookings/series/$seriesId/cancel',
        options: _headers(userId, idempotent: true),
        data: {'reason': reason},
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<({EmployeeBooking booking, Map<String, dynamic>? impactedTripAlert})>
      updateBookingOccurrence(
    String userId,
    String bookingId, {
    String? pickupLocationId,
    String? timePreference,
    String? requestedTimeLocal,
    String? timezone,
    required String reason,
  }) async {
    try {
      final res = await _dio.patch<dynamic>(
        '/employee/bookings/$bookingId',
        options: _headers(userId, idempotent: true),
        data: {
          'pickupLocationId': ?pickupLocationId,
          'timePreference': ?timePreference,
          'requestedTimeLocal': ?requestedTimeLocal,
          'timezone': ?timezone,
          'reason': reason,
        },
      );
      final data = _unwrap<Map<String, dynamic>>(res);
      return (
        booking: EmployeeBooking.fromJson(Map<String, dynamic>.from(data['booking'] as Map)),
        impactedTripAlert: data['impactedTripAlert'] is Map
            ? Map<String, dynamic>.from(data['impactedTripAlert'] as Map)
            : null,
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<EmployeeBooking> cancelBooking(
    String userId,
    String bookingId, {
    required String reason,
  }) async {
    try {
      final res = await _dio.post<dynamic>(
        '/employee/bookings/$bookingId/cancel',
        options: _headers(userId, idempotent: true),
        data: {'reason': reason.trim()},
      );
      return EmployeeBooking.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<UpcomingTripDetail?> fetchUpcomingTrip(String userId) async {
    try {
      final res = await _dio.get<dynamic>('/employee/trips/upcoming', options: _headers(userId));
      final raw = _unwrap<Object?>(res);
      if (raw == null) return null;
      return UpcomingTripDetail.fromJson(Map<String, dynamic>.from(raw as Map));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<List<EmployeeTripSummary>> fetchTrips(String userId) async {
    try {
      final res = await _dio.get<dynamic>('/employee/trips', options: _headers(userId));
      final list = _unwrap<List<dynamic>>(res);
      return list
          .whereType<Map>()
          .map((m) => EmployeeTripSummary.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<UpcomingTripDetail> fetchTripDetail(String userId, String tripId) async {
    try {
      final res = await _dio.get<dynamic>('/employee/trips/$tripId', options: _headers(userId));
      return UpcomingTripDetail.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<GpsTelemetry?> fetchTripLiveTelemetry(String userId, String tripId) async {
    try {
      final res = await _dio.get<dynamic>('/employee/trips/$tripId/live', options: _headers(userId));
      final data = _unwrap<Map<String, dynamic>>(res);
      final raw = data['gpsTelemetry'];
      if (raw is Map) {
        return GpsTelemetry.fromJson(Map<String, dynamic>.from(raw));
      }
      return null;
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> reportRunningLate(
    String userId,
    String tripId, {
    required int etaMinutes,
    String? note,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/employee/trips/$tripId/running-late',
        options: _headers(userId, idempotent: true),
        data: {
          'etaMinutes': etaMinutes,
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        },
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> confirmSafeReach(String userId, String tripId) async {
    try {
      await _dio.post<dynamic>(
        '/employee/trips/$tripId/safe-reach',
        options: _headers(userId, idempotent: true),
        data: const <String, dynamic>{},
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<List<EmployeeNotificationItem>> fetchNotifications(String userId) async {
    try {
      final res = await _dio.get<dynamic>(
        '/employee/notifications?limit=50',
        options: _headers(userId),
      );
      final list = _unwrap<List<dynamic>>(res);
      return list
          .whereType<Map>()
          .map((m) => EmployeeNotificationItem.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<int> markAllNotificationsRead(String userId) async {
    try {
      final res = await _dio.post<dynamic>(
        '/employee/notifications/mark-all-read',
        options: _headers(userId),
        data: const <String, dynamic>{},
      );
      final data = _unwrap<Map<String, dynamic>>(res);
      return (data['markedCount'] as num?)?.toInt() ?? 0;
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> registerDeviceToken(
    String userId, {
    required String token,
    String platform = 'ANDROID',
  }) async {
    try {
      await _dio.post<dynamic>(
        '/employee/notifications/device-token',
        options: _headers(userId),
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
  Future<void> appealNoShow(
    String userId,
    String tripId, {
    required String appealNote,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/employee/trips/$tripId/appeal-no-show',
        options: _headers(userId, idempotent: true),
        data: {'appealNote': appealNote},
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<void> markNotificationRead(String userId, String notificationId) async {
    try {
      await _dio.patch<dynamic>(
        '/employee/notifications/$notificationId/read',
        options: _headers(userId),
      );
    } catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<SafetyAlertReceipt> triggerSos(
    String userId, {
    String? tripId,
    double? latitude,
    double? longitude,
    double? accuracyM,
    String? notes,
  }) async {
    try {
      final res = await _dio.post<dynamic>(
        '/employee/safety/sos',
        options: _headers(userId, idempotent: true),
        data: {
          'tripId': ?tripId,
          'latitude': ?latitude,
          'longitude': ?longitude,
          'accuracyM': ?accuracyM,
          if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
        },
      );
      return SafetyAlertReceipt.fromJson(_unwrap<Map<String, dynamic>>(res));
    } catch (e) {
      throw _mapError(e);
    }
  }
}
