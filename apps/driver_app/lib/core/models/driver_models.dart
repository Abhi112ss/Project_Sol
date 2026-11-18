DateTime? _parseDt(Object? value) {
  if (value == null) return null;
  if (value is DateTime) return value.toLocal();
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value)?.toLocal();
  return null;
}

double? _parseDouble(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}

int? _parseInt(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

Map<String, dynamic> _asMap(Object? raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) return raw.map((k, v) => MapEntry(k.toString(), v));
  return const {};
}

bool isPassengerPending(String status) {
  final n = status.toUpperCase();
  return n == 'SCHEDULED' || n == 'EN_ROUTE' || n == 'ARRIVED';
}

class DriverProfileData {
  const DriverProfileData({
    required this.driverId,
    required this.driverCode,
    required this.licenseNo,
    required this.availabilityStatus,
    required this.isSuspended,
    required this.fullName,
    required this.phone,
    this.vehicleRegistrationNo,
    this.vehicleModelName,
    this.vehicleType,
    this.seatingCapacity,
    this.vendorName,
    this.noShowWaitSeconds = 180,
    this.requireBoardingOtp = true,
    this.gpsStaleThresholdSeconds = 60,
  });

  final String driverId;
  final String driverCode;
  final String licenseNo;
  final String availabilityStatus;
  final bool isSuspended;
  final String fullName;
  final String phone;
  final String? vehicleRegistrationNo;
  final String? vehicleModelName;
  final String? vehicleType;
  final int? seatingCapacity;
  final String? vendorName;
  final int noShowWaitSeconds;
  final bool requireBoardingOtp;
  final int gpsStaleThresholdSeconds;

  factory DriverProfileData.fromJson(Map<String, dynamic> json) {
    final drv = _asMap(json['driver']);
    final user = _asMap(json['user']);
    final veh = _asMap(json['assignedVehicle']);
    final vendor = _asMap(json['vendor']);
    final settings = _asMap(json['settings']);

    return DriverProfileData(
      driverId: (drv['id'] ?? '').toString(),
      driverCode: (drv['driverCode'] ?? '').toString(),
      licenseNo: (drv['licenseNo'] ?? '').toString(),
      availabilityStatus: (drv['availabilityStatus'] ?? 'AVAILABLE').toString(),
      isSuspended: drv['isSuspended'] as bool? ?? false,
      fullName: (user['fullName'] ?? 'Driver').toString(),
      phone: (user['phone'] ?? '').toString(),
      vehicleRegistrationNo: veh['registrationNo']?.toString(),
      vehicleModelName: veh['modelName']?.toString(),
      vehicleType: veh['vehicleType']?.toString(),
      seatingCapacity: _parseInt(veh['seatingCapacity']),
      vendorName: vendor['name']?.toString(),
      noShowWaitSeconds: _parseInt(settings['noShowWaitSeconds']) ?? 180,
      requireBoardingOtp: settings['requireBoardingOtp'] as bool? ?? true,
      gpsStaleThresholdSeconds: _parseInt(settings['gpsStaleThresholdSeconds']) ?? 60,
    );
  }
}

class DriverTripSummary {
  const DriverTripSummary({
    required this.id,
    required this.tripCode,
    required this.travelDate,
    required this.direction,
    required this.status,
    required this.currentStopSequence,
    this.plannedStartAt,
    this.actualStartAt,
    this.completedAt,
    required this.officeName,
    required this.shiftName,
    required this.shiftTimeLocal,
    this.vehicleRegistrationNo,
    this.vehicleModelName,
    required this.stopsCount,
    required this.passengersCount,
    required this.pendingPassengersCount,
    this.commuteId,
    this.commuteName,
    this.localityName,
  });

  final String id;
  final String tripCode;
  final String travelDate;
  final String direction;
  final String status;
  final int currentStopSequence;
  final DateTime? plannedStartAt;
  final DateTime? actualStartAt;
  final DateTime? completedAt;
  final String officeName;
  final String shiftName;
  final String shiftTimeLocal;
  final String? vehicleRegistrationNo;
  final String? vehicleModelName;
  final int stopsCount;
  final int passengersCount;
  final int pendingPassengersCount;
  final String? commuteId;
  final String? commuteName;
  final String? localityName;

  bool get isActiveOrAssigned {
    final s = status.toUpperCase();
    return s == 'ASSIGNED' || s == 'DRIVER_ACCEPTED' || s == 'IN_PROGRESS';
  }

  factory DriverTripSummary.fromJson(Map<String, dynamic> json) {
    return DriverTripSummary(
      id: (json['id'] ?? '').toString(),
      tripCode: (json['tripCode'] ?? '').toString(),
      travelDate: (json['travelDate'] ?? '').toString(),
      direction: (json['direction'] ?? 'LOGIN').toString(),
      status: (json['status'] ?? 'ASSIGNED').toString(),
      currentStopSequence: _parseInt(json['currentStopSequence']) ?? 1,
      plannedStartAt: _parseDt(json['plannedStartAt']),
      actualStartAt: _parseDt(json['actualStartAt']),
      completedAt: _parseDt(json['completedAt']),
      officeName: (json['officeName'] ?? 'Campus').toString(),
      shiftName: (json['shiftName'] ?? 'Shift').toString(),
      shiftTimeLocal: (json['shiftTimeLocal'] ?? '09:00').toString(),
      vehicleRegistrationNo: json['vehicleRegistrationNo']?.toString(),
      vehicleModelName: json['vehicleModelName']?.toString(),
      stopsCount: _parseInt(json['stopsCount']) ?? 0,
      passengersCount: _parseInt(json['passengersCount']) ?? 0,
      pendingPassengersCount: _parseInt(json['pendingPassengersCount']) ?? 0,
      commuteId: json['commuteId']?.toString(),
      commuteName: json['commuteName']?.toString(),
      localityName: json['localityName']?.toString(),
    );
  }
}

class DriverStopPassenger {
  const DriverStopPassenger({
    required this.id,
    required this.bookingId,
    required this.employeeId,
    required this.employeeCode,
    required this.department,
    required this.fullName,
    required this.phone,
    required this.status,
    this.scheduledPickupAt,
    this.driverArrivedAt,
    this.boardedAt,
    this.noShowAt,
    this.arrivalDelaySeconds,
    this.passengerWaitSeconds,
    this.runningLateEtaMinutes,
    this.otpRequired = true,
  });

  final String id;
  final String bookingId;
  final String employeeId;
  final String employeeCode;
  final String department;
  final String fullName;
  final String phone;
  final String status;
  final DateTime? scheduledPickupAt;
  final DateTime? driverArrivedAt;
  final DateTime? boardedAt;
  final DateTime? noShowAt;
  final int? arrivalDelaySeconds;
  final int? passengerWaitSeconds;
  final int? runningLateEtaMinutes;
  final bool otpRequired;

  DriverStopPassenger copyWith({
    String? status,
    DateTime? driverArrivedAt,
    DateTime? boardedAt,
    DateTime? noShowAt,
    int? passengerWaitSeconds,
  }) {
    return DriverStopPassenger(
      id: id,
      bookingId: bookingId,
      employeeId: employeeId,
      employeeCode: employeeCode,
      department: department,
      fullName: fullName,
      phone: phone,
      status: status ?? this.status,
      scheduledPickupAt: scheduledPickupAt,
      driverArrivedAt: driverArrivedAt ?? this.driverArrivedAt,
      boardedAt: boardedAt ?? this.boardedAt,
      noShowAt: noShowAt ?? this.noShowAt,
      arrivalDelaySeconds: arrivalDelaySeconds,
      passengerWaitSeconds: passengerWaitSeconds ?? this.passengerWaitSeconds,
      runningLateEtaMinutes: runningLateEtaMinutes,
      otpRequired: otpRequired,
    );
  }

  factory DriverStopPassenger.fromJson(Map<String, dynamic> json) {
    return DriverStopPassenger(
      id: (json['id'] ?? '').toString(),
      bookingId: (json['bookingId'] ?? '').toString(),
      employeeId: (json['employeeId'] ?? '').toString(),
      employeeCode: (json['employeeCode'] ?? '').toString(),
      department: (json['department'] ?? '').toString(),
      fullName: (json['fullName'] ?? '').toString(),
      phone: (json['phone'] ?? '').toString(),
      status: (json['status'] ?? 'SCHEDULED').toString(),
      scheduledPickupAt: _parseDt(json['scheduledPickupAt']),
      driverArrivedAt: _parseDt(json['driverArrivedAt']),
      boardedAt: _parseDt(json['boardedAt']),
      noShowAt: _parseDt(json['noShowAt']),
      arrivalDelaySeconds: _parseInt(json['arrivalDelaySeconds']),
      passengerWaitSeconds: _parseInt(json['passengerWaitSeconds']),
      runningLateEtaMinutes: _parseInt(json['runningLateEtaMinutes']),
      otpRequired: json['otpRequired'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'bookingId': bookingId,
        'employeeId': employeeId,
        'employeeCode': employeeCode,
        'department': department,
        'fullName': fullName,
        'phone': phone,
        'status': status,
        'scheduledPickupAt': scheduledPickupAt?.toUtc().toIso8601String(),
        'driverArrivedAt': driverArrivedAt?.toUtc().toIso8601String(),
        'boardedAt': boardedAt?.toUtc().toIso8601String(),
        'noShowAt': noShowAt?.toUtc().toIso8601String(),
        'arrivalDelaySeconds': arrivalDelaySeconds,
        'passengerWaitSeconds': passengerWaitSeconds,
        'runningLateEtaMinutes': runningLateEtaMinutes,
        'otpRequired': otpRequired,
      };
}

class DriverTripStop {
  const DriverTripStop({
    required this.id,
    required this.sequenceNo,
    required this.stopType,
    required this.locationName,
    required this.address,
    required this.latitude,
    required this.longitude,
    required this.geofenceRadiusM,
    required this.status,
    this.scheduledArrivalAt,
    this.actualArrivalAt,
    this.completedAt,
    required this.navigationUrl,
    required this.passengers,
  });

  final String id;
  final int sequenceNo;
  final String stopType;
  final String locationName;
  final String address;
  final double latitude;
  final double longitude;
  final int geofenceRadiusM;
  final String status;
  final DateTime? scheduledArrivalAt;
  final DateTime? actualArrivalAt;
  final DateTime? completedAt;
  final String navigationUrl;
  final List<DriverStopPassenger> passengers;

  bool get isOffice => stopType.toUpperCase() == 'OFFICE';

  DriverTripStop copyWith({
    String? status,
    DateTime? actualArrivalAt,
    DateTime? completedAt,
    List<DriverStopPassenger>? passengers,
  }) {
    return DriverTripStop(
      id: id,
      sequenceNo: sequenceNo,
      stopType: stopType,
      locationName: locationName,
      address: address,
      latitude: latitude,
      longitude: longitude,
      geofenceRadiusM: geofenceRadiusM,
      status: status ?? this.status,
      scheduledArrivalAt: scheduledArrivalAt,
      actualArrivalAt: actualArrivalAt ?? this.actualArrivalAt,
      completedAt: completedAt ?? this.completedAt,
      navigationUrl: navigationUrl,
      passengers: passengers ?? this.passengers,
    );
  }

  factory DriverTripStop.fromJson(Map<String, dynamic> json) {
    final rawPassengers = json['passengers'] as List<dynamic>? ?? const [];
    final lat = _parseDouble(json['latitude']) ?? 17.4486;
    final lng = _parseDouble(json['longitude']) ?? 78.3908;
    return DriverTripStop(
      id: (json['id'] ?? '').toString(),
      sequenceNo: _parseInt(json['sequenceNo']) ?? 1,
      stopType: (json['stopType'] ?? 'PICKUP').toString(),
      locationName: (json['locationName'] ?? '').toString(),
      address: (json['address'] ?? '').toString(),
      latitude: lat,
      longitude: lng,
      geofenceRadiusM: _parseInt(json['geofenceRadiusM']) ?? 150,
      status: (json['status'] ?? 'PENDING').toString(),
      scheduledArrivalAt: _parseDt(json['scheduledArrivalAt']),
      actualArrivalAt: _parseDt(json['actualArrivalAt']),
      completedAt: _parseDt(json['completedAt']),
      navigationUrl: (json['navigationUrl'] ??
              'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving&dir_action=navigate')
          .toString(),
      passengers: rawPassengers.map((e) => DriverStopPassenger.fromJson(_asMap(e))).toList(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'sequenceNo': sequenceNo,
        'stopType': stopType,
        'locationName': locationName,
        'address': address,
        'latitude': latitude,
        'longitude': longitude,
        'geofenceRadiusM': geofenceRadiusM,
        'status': status,
        'scheduledArrivalAt': scheduledArrivalAt?.toUtc().toIso8601String(),
        'actualArrivalAt': actualArrivalAt?.toUtc().toIso8601String(),
        'completedAt': completedAt?.toUtc().toIso8601String(),
        'navigationUrl': navigationUrl,
        'passengers': passengers.map((p) => p.toJson()).toList(),
      };
}

class QueuedDriverEvent {
  const QueuedDriverEvent({
    required this.clientEventId,
    required this.tripId,
    required this.eventType,
    this.stopId,
    this.assignmentId,
    required this.occurredAtClient,
    this.latitude,
    this.longitude,
    this.accuracyM,
    this.otpCode,
    this.reasonCode,
    this.notes,
    this.syncStatus = 'PENDING',
    this.errorMessage,
  });

  final String clientEventId;
  final String tripId;
  final String eventType;
  final String? stopId;
  final String? assignmentId;
  final DateTime occurredAtClient;
  final double? latitude;
  final double? longitude;
  final double? accuracyM;
  final String? otpCode;
  final String? reasonCode;
  final String? notes;
  final String syncStatus;
  final String? errorMessage;

  Map<String, dynamic> toApiPayload() => {
        'clientEventId': clientEventId,
        'eventType': eventType,
        'stopId': ?stopId,
        'assignmentId': ?assignmentId,
        'occurredAtClient': occurredAtClient.toUtc().toIso8601String(),
        'latitude': ?latitude,
        'longitude': ?longitude,
        'accuracyM': ?accuracyM,
        'otpCode': ?otpCode,
        'reasonCode': ?reasonCode,
        'notes': ?notes,
      };
}

class DriverTripManifest {
  const DriverTripManifest({
    required this.tripId,
    required this.tripCode,
    required this.travelDate,
    required this.direction,
    required this.status,
    required this.currentStopSequence,
    this.plannedStartAt,
    this.actualStartAt,
    this.completedAt,
    required this.officeName,
    required this.officeAddress,
    required this.shiftName,
    required this.shiftTimeLocal,
    this.vehicleRegistrationNo,
    this.vehicleModelName,
    required this.stops,
    this.noShowWaitSeconds = 180,
    this.requireBoardingOtp = true,
  });

  final String tripId;
  final String tripCode;
  final String travelDate;
  final String direction;
  final String status;
  final int currentStopSequence;
  final DateTime? plannedStartAt;
  final DateTime? actualStartAt;
  final DateTime? completedAt;
  final String officeName;
  final String officeAddress;
  final String shiftName;
  final String shiftTimeLocal;
  final String? vehicleRegistrationNo;
  final String? vehicleModelName;
  final List<DriverTripStop> stops;
  final int noShowWaitSeconds;
  final bool requireBoardingOtp;

  DriverTripStop? get nextPendingStop {
    final sorted = [...stops]..sort((a, b) => a.sequenceNo.compareTo(b.sequenceNo));
    for (final s in sorted) {
      if (!s.isOffice &&
          s.status != 'COMPLETED' &&
          s.status != 'SKIPPED' &&
          s.passengers.any((p) => isPassengerPending(p.status))) {
        return s;
      }
    }
    for (final s in sorted) {
      if (s.isOffice && s.status != 'COMPLETED' && s.status != 'SKIPPED') {
        return s;
      }
    }
    return null;
  }

  bool get allPickupsResolved => stops
      .where((s) => !s.isOffice)
      .expand((s) => s.passengers)
      .every((p) => !isPassengerPending(p.status));

  DriverTripManifest copyWith({
    String? status,
    int? currentStopSequence,
    DateTime? actualStartAt,
    DateTime? completedAt,
    List<DriverTripStop>? stops,
  }) {
    return DriverTripManifest(
      tripId: tripId,
      tripCode: tripCode,
      travelDate: travelDate,
      direction: direction,
      status: status ?? this.status,
      currentStopSequence: currentStopSequence ?? this.currentStopSequence,
      plannedStartAt: plannedStartAt,
      actualStartAt: actualStartAt ?? this.actualStartAt,
      completedAt: completedAt ?? this.completedAt,
      officeName: officeName,
      officeAddress: officeAddress,
      shiftName: shiftName,
      shiftTimeLocal: shiftTimeLocal,
      vehicleRegistrationNo: vehicleRegistrationNo,
      vehicleModelName: vehicleModelName,
      stops: stops ?? this.stops,
      noShowWaitSeconds: noShowWaitSeconds,
      requireBoardingOtp: requireBoardingOtp,
    );
  }

  /// Applies queued offline events sequentially on top of cached server manifest
  /// so the driver sees instant continuous state progression even without signal.
  DriverTripManifest applyQueuedEvent(QueuedDriverEvent evt) {
    final ts = evt.occurredAtClient;
    switch (evt.eventType) {
      case 'TRIP_ACCEPT':
        return copyWith(status: 'DRIVER_ACCEPTED');
      case 'TRIP_START':
        final updatedStops = stops.map((s) {
          return s.copyWith(
            passengers: s.passengers
                .map((p) => p.status == 'SCHEDULED' ? p.copyWith(status: 'EN_ROUTE') : p)
                .toList(),
          );
        }).toList();
        return copyWith(status: 'IN_PROGRESS', actualStartAt: actualStartAt ?? ts, stops: updatedStops);
      case 'STOP_ARRIVE':
        final updatedStops = stops.map((s) {
          if (s.id != evt.stopId) return s;
          return s.copyWith(
            status: 'ARRIVED',
            actualArrivalAt: s.actualArrivalAt ?? ts,
            passengers: s.passengers
                .map(
                  (p) => (p.status == 'SCHEDULED' || p.status == 'EN_ROUTE')
                      ? p.copyWith(status: 'ARRIVED', driverArrivedAt: p.driverArrivedAt ?? ts)
                      : p,
                )
                .toList(),
          );
        }).toList();
        return copyWith(stops: updatedStops);
      case 'PASSENGER_PICKUP':
      case 'PASSENGER_NO_SHOW':
        final targetStatus = evt.eventType == 'PASSENGER_PICKUP' ? 'BOARDED' : 'NO_SHOW';
        final updatedStops = stops.map((s) {
          if (s.id != evt.stopId) return s;
          final nextPassengers = s.passengers.map((p) {
            if (p.id != evt.assignmentId) return p;
            return p.copyWith(
              status: targetStatus,
              boardedAt: targetStatus == 'BOARDED' ? ts : p.boardedAt,
              noShowAt: targetStatus == 'NO_SHOW' ? ts : p.noShowAt,
            );
          }).toList();
          final stopDone = nextPassengers.every((p) => !isPassengerPending(p.status));
          return s.copyWith(
            passengers: nextPassengers,
            status: stopDone ? 'COMPLETED' : s.status,
            completedAt: stopDone ? ts : s.completedAt,
          );
        }).toList();
        final intermediate = copyWith(stops: updatedStops);
        final nxt = intermediate.nextPendingStop;
        return intermediate.copyWith(currentStopSequence: nxt?.sequenceNo ?? currentStopSequence);
      case 'TRIP_COMPLETE':
        return copyWith(status: 'COMPLETED', completedAt: ts);
      default:
        return this;
    }
  }

  factory DriverTripManifest.fromJson(Map<String, dynamic> json) {
    final trip = _asMap(json['trip']);
    final settings = _asMap(json['settings']);
    final rawStops = json['stops'] as List<dynamic>? ?? const [];

    return DriverTripManifest(
      tripId: (trip['id'] ?? '').toString(),
      tripCode: (trip['tripCode'] ?? '').toString(),
      travelDate: (trip['travelDate'] ?? '').toString(),
      direction: (trip['direction'] ?? 'LOGIN').toString(),
      status: (trip['status'] ?? 'ASSIGNED').toString(),
      currentStopSequence: _parseInt(trip['currentStopSequence']) ?? 1,
      plannedStartAt: _parseDt(trip['plannedStartAt']),
      actualStartAt: _parseDt(trip['actualStartAt']),
      completedAt: _parseDt(trip['completedAt']),
      officeName: (trip['officeName'] ?? 'Campus').toString(),
      officeAddress: (trip['officeAddress'] ?? '').toString(),
      shiftName: (trip['shiftName'] ?? 'Shift').toString(),
      shiftTimeLocal: (trip['shiftTimeLocal'] ?? '09:00').toString(),
      vehicleRegistrationNo: trip['vehicleRegistrationNo']?.toString(),
      vehicleModelName: trip['vehicleModelName']?.toString(),
      stops: rawStops.map((e) => DriverTripStop.fromJson(_asMap(e))).toList(),
      noShowWaitSeconds: _parseInt(settings['noShowWaitSeconds']) ?? 180,
      requireBoardingOtp: settings['requireBoardingOtp'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'trip': {
          'id': tripId,
          'tripCode': tripCode,
          'travelDate': travelDate,
          'direction': direction,
          'status': status,
          'currentStopSequence': currentStopSequence,
          'plannedStartAt': plannedStartAt?.toUtc().toIso8601String(),
          'actualStartAt': actualStartAt?.toUtc().toIso8601String(),
          'completedAt': completedAt?.toUtc().toIso8601String(),
          'officeName': officeName,
          'officeAddress': officeAddress,
          'shiftName': shiftName,
          'shiftTimeLocal': shiftTimeLocal,
          'vehicleRegistrationNo': vehicleRegistrationNo,
          'vehicleModelName': vehicleModelName,
        },
        'stops': stops.map((s) => s.toJson()).toList(),
        'settings': {
          'noShowWaitSeconds': noShowWaitSeconds,
          'requireBoardingOtp': requireBoardingOtp,
        },
      };
}

class GpsSampleRecord {
  const GpsSampleRecord({
    required this.sampleId,
    required this.tripId,
    required this.driverId,
    required this.sequenceNo,
    required this.latitude,
    required this.longitude,
    this.accuracyM,
    this.speedMps,
    this.headingDeg,
    this.altitudeM,
    required this.capturedAt,
    required this.createdAt,
    this.syncStatus = 'PENDING',
    this.retryCount = 0,
    this.lastAttemptAt,
    this.serverAcknowledgedAt,
    this.errorMessage,
  });

  final String sampleId;
  final String tripId;
  final String driverId;
  final int sequenceNo;
  final double latitude;
  final double longitude;
  final double? accuracyM;
  final double? speedMps;
  final double? headingDeg;
  final double? altitudeM;
  final DateTime capturedAt;
  final DateTime createdAt;
  final String syncStatus;
  final int retryCount;
  final DateTime? lastAttemptAt;
  final DateTime? serverAcknowledgedAt;
  final String? errorMessage;

  Map<String, dynamic> toApiPayload() => {
        'clientPingId': sampleId,
        'latitude': latitude,
        'longitude': longitude,
        if (accuracyM != null) 'accuracyM': accuracyM,
        if (speedMps != null) 'speedMps': speedMps,
        if (headingDeg != null) 'headingDeg': headingDeg,
        if (altitudeM != null) 'altitudeM': altitudeM,
        'sequenceNo': sequenceNo,
        'recordedAt': capturedAt.toUtc().toIso8601String(),
      };
}

enum DriverGpsHealth {
  idle,
  live,
  lowAccuracy,
  gpsDisabled,
  permissionRevoked,
}

class DriverTelemetryStatus {
  const DriverTelemetryStatus({
    this.activeTripId,
    this.health = DriverGpsHealth.idle,
    this.pendingSampleCount = 0,
    this.syncedSampleCount = 0,
    this.lastLatitude,
    this.lastLongitude,
    this.lastAccuracyM,
    this.lastCapturedAt,
    this.lastUploadedAt,
    this.lastError,
  });

  final String? activeTripId;
  final DriverGpsHealth health;
  final int pendingSampleCount;
  final int syncedSampleCount;
  final double? lastLatitude;
  final double? lastLongitude;
  final double? lastAccuracyM;
  final DateTime? lastCapturedAt;
  final DateTime? lastUploadedAt;
  final String? lastError;

  DriverTelemetryStatus copyWith({
    String? activeTripId,
    bool clearActiveTrip = false,
    DriverGpsHealth? health,
    int? pendingSampleCount,
    int? syncedSampleCount,
    double? lastLatitude,
    double? lastLongitude,
    double? lastAccuracyM,
    DateTime? lastCapturedAt,
    DateTime? lastUploadedAt,
    String? lastError,
    bool clearError = false,
  }) {
    return DriverTelemetryStatus(
      activeTripId: clearActiveTrip ? null : (activeTripId ?? this.activeTripId),
      health: health ?? this.health,
      pendingSampleCount: pendingSampleCount ?? this.pendingSampleCount,
      syncedSampleCount: syncedSampleCount ?? this.syncedSampleCount,
      lastLatitude: lastLatitude ?? this.lastLatitude,
      lastLongitude: lastLongitude ?? this.lastLongitude,
      lastAccuracyM: lastAccuracyM ?? this.lastAccuracyM,
      lastCapturedAt: lastCapturedAt ?? this.lastCapturedAt,
      lastUploadedAt: lastUploadedAt ?? this.lastUploadedAt,
      lastError: clearError ? null : (lastError ?? this.lastError),
    );
  }
}

class DriverNotificationItem {
  const DriverNotificationItem({
    required this.id,
    required this.category,
    required this.title,
    required this.body,
    this.readAt,
    required this.createdAt,
    this.unreadCount = 0,
  });

  final String id;
  final String category;
  final String title;
  final String body;
  final DateTime? readAt;
  final DateTime createdAt;
  final int unreadCount;

  bool get isRead => readAt != null;

  DriverNotificationItem copyWith({DateTime? readAt}) {
    return DriverNotificationItem(
      id: id,
      category: category,
      title: title,
      body: body,
      readAt: readAt ?? this.readAt,
      createdAt: createdAt,
      unreadCount: unreadCount,
    );
  }

  factory DriverNotificationItem.fromJson(Map<String, dynamic> json) {
    return DriverNotificationItem(
      id: (json['id'] ?? '').toString(),
      category: (json['category'] ?? 'GENERAL').toString(),
      title: (json['title'] ?? '').toString(),
      body: (json['body'] ?? '').toString(),
      readAt: _parseDt(json['readAt']),
      createdAt: _parseDt(json['createdAt']) ?? DateTime.now(),
      unreadCount: _parseInt(json['unreadCount']) ?? 0,
    );
  }
}

class DriverSosReceipt {
  const DriverSosReceipt({
    required this.id,
    required this.alertType,
    required this.severity,
    required this.status,
    this.notes,
    required this.createdAt,
  });

  final String id;
  final String alertType;
  final String severity;
  final String status;
  final String? notes;
  final DateTime createdAt;

  factory DriverSosReceipt.fromJson(Map<String, dynamic> json) {
    return DriverSosReceipt(
      id: (json['id'] ?? '').toString(),
      alertType: (json['alertType'] ?? 'SOS').toString(),
      severity: (json['severity'] ?? 'CRITICAL').toString(),
      status: (json['status'] ?? 'OPEN').toString(),
      notes: json['notes']?.toString(),
      createdAt: _parseDt(json['createdAt']) ?? DateTime.now(),
    );
  }
}

class DriverCommuteCard {
  const DriverCommuteCard({
    required this.commuteId,
    required this.commuteName,
    required this.direction,
    required this.officeName,
    required this.shiftName,
    required this.shiftTimeLocal,
    required this.localityName,
    required this.timePreferenceSummary,
    required this.startDate,
    required this.endDate,
    required this.scheduledTripsCount,
    required this.totalAssignedTripsCount,
    required this.completedTripsCount,
    required this.hasInProgressTrip,
    required this.nextTripId,
    required this.nextTripCode,
    required this.nextTripDate,
    required this.nextTripStatus,
    this.nextTripStartAt,
    required this.nextTripStopsCount,
    required this.nextTripPassengersCount,
  });

  final String commuteId;
  final String commuteName;
  final String direction;
  final String officeName;
  final String shiftName;
  final String shiftTimeLocal;
  final String localityName;
  final String timePreferenceSummary;
  final String startDate;
  final String endDate;
  final int scheduledTripsCount;
  final int totalAssignedTripsCount;
  final int completedTripsCount;
  final bool hasInProgressTrip;
  final String nextTripId;
  final String nextTripCode;
  final String nextTripDate;
  final String nextTripStatus;
  final DateTime? nextTripStartAt;
  final int nextTripStopsCount;
  final int nextTripPassengersCount;

  factory DriverCommuteCard.fromJson(Map<String, dynamic> json) {
    return DriverCommuteCard(
      commuteId: (json['commuteId'] ?? '').toString(),
      commuteName: (json['commuteName'] ?? '').toString(),
      direction: (json['direction'] ?? 'LOGIN').toString(),
      officeName: (json['officeName'] ?? 'Campus').toString(),
      shiftName: (json['shiftName'] ?? 'Shift').toString(),
      shiftTimeLocal: (json['shiftTimeLocal'] ?? '09:00').toString(),
      localityName: (json['localityName'] ?? 'Corridor').toString(),
      timePreferenceSummary: (json['timePreferenceSummary'] ?? '').toString(),
      startDate: (json['startDate'] ?? '').toString(),
      endDate: (json['endDate'] ?? '').toString(),
      scheduledTripsCount: _parseInt(json['scheduledTripsCount']) ?? 0,
      totalAssignedTripsCount: _parseInt(json['totalAssignedTripsCount']) ?? 0,
      completedTripsCount: _parseInt(json['completedTripsCount']) ?? 0,
      hasInProgressTrip: json['hasInProgressTrip'] as bool? ?? false,
      nextTripId: (json['nextTripId'] ?? '').toString(),
      nextTripCode: (json['nextTripCode'] ?? '').toString(),
      nextTripDate: (json['nextTripDate'] ?? '').toString(),
      nextTripStatus: (json['nextTripStatus'] ?? 'ASSIGNED').toString(),
      nextTripStartAt: _parseDt(json['nextTripStartAt']),
      nextTripStopsCount: _parseInt(json['nextTripStopsCount']) ?? 0,
      nextTripPassengersCount: _parseInt(json['nextTripPassengersCount']) ?? 0,
    );
  }
}

class DriverCommutesOverviewData {
  const DriverCommutesOverviewData({
    required this.todayDate,
    required this.todayTargets,
    required this.commutes,
  });

  final String todayDate;
  final List<DriverTripSummary> todayTargets;
  final List<DriverCommuteCard> commutes;

  factory DriverCommutesOverviewData.fromJson(Map<String, dynamic> json) {
    final rawTargets = json['todayTargets'] as List<dynamic>? ?? const [];
    final rawCommutes = json['commutes'] as List<dynamic>? ?? const [];
    return DriverCommutesOverviewData(
      todayDate: (json['todayDate'] ?? '').toString(),
      todayTargets: rawTargets
          .whereType<Map>()
          .map((e) => DriverTripSummary.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      commutes: rawCommutes
          .whereType<Map>()
          .map((e) => DriverCommuteCard.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class DriverCalendarCommuteMeta {
  const DriverCalendarCommuteMeta({
    required this.commuteId,
    required this.commuteName,
    required this.direction,
    required this.officeName,
    required this.shiftName,
    required this.shiftTimeLocal,
    required this.localityName,
    required this.timePreferenceSummary,
    required this.startDate,
    required this.endDate,
    required this.totalAssignedTripsCount,
  });

  final String commuteId;
  final String commuteName;
  final String direction;
  final String officeName;
  final String shiftName;
  final String shiftTimeLocal;
  final String localityName;
  final String timePreferenceSummary;
  final String startDate;
  final String endDate;
  final int totalAssignedTripsCount;

  factory DriverCalendarCommuteMeta.fromJson(Map<String, dynamic> json) {
    return DriverCalendarCommuteMeta(
      commuteId: (json['commuteId'] ?? '').toString(),
      commuteName: (json['commuteName'] ?? '').toString(),
      direction: (json['direction'] ?? 'LOGIN').toString(),
      officeName: (json['officeName'] ?? 'Campus').toString(),
      shiftName: (json['shiftName'] ?? 'Shift').toString(),
      shiftTimeLocal: (json['shiftTimeLocal'] ?? '09:00').toString(),
      localityName: (json['localityName'] ?? 'Corridor').toString(),
      timePreferenceSummary: (json['timePreferenceSummary'] ?? '').toString(),
      startDate: (json['startDate'] ?? '').toString(),
      endDate: (json['endDate'] ?? '').toString(),
      totalAssignedTripsCount: _parseInt(json['totalAssignedTripsCount']) ?? 0,
    );
  }
}

class DriverCalendarScheduledDate {
  const DriverCalendarScheduledDate({
    required this.date,
    required this.tripCount,
    required this.statuses,
    required this.primaryTripId,
    required this.primaryTripCode,
    this.plannedStartAt,
    required this.plannedStartTimeLocal,
    required this.passengerCount,
    required this.stopsCount,
  });

  final String date;
  final int tripCount;
  final List<String> statuses;
  final String primaryTripId;
  final String primaryTripCode;
  final DateTime? plannedStartAt;
  final String plannedStartTimeLocal;
  final int passengerCount;
  final int stopsCount;

  factory DriverCalendarScheduledDate.fromJson(Map<String, dynamic> json) {
    final rawStatuses = json['statuses'] as List<dynamic>? ?? const [];
    return DriverCalendarScheduledDate(
      date: (json['date'] ?? '').toString(),
      tripCount: _parseInt(json['tripCount']) ?? 0,
      statuses: rawStatuses.map((e) => e.toString()).toList(),
      primaryTripId: (json['primaryTripId'] ?? '').toString(),
      primaryTripCode: (json['primaryTripCode'] ?? '').toString(),
      plannedStartAt: _parseDt(json['plannedStartAt']),
      plannedStartTimeLocal: (json['plannedStartTimeLocal'] ?? '').toString(),
      passengerCount: _parseInt(json['passengerCount']) ?? 0,
      stopsCount: _parseInt(json['stopsCount']) ?? 0,
    );
  }
}

class DriverCommuteCalendarData {
  const DriverCommuteCalendarData({
    required this.commute,
    required this.month,
    required this.todayDate,
    required this.activeMonths,
    required this.scheduledDates,
  });

  final DriverCalendarCommuteMeta commute;
  final String month;
  final String todayDate;
  final List<String> activeMonths;
  final List<DriverCalendarScheduledDate> scheduledDates;

  Map<String, DriverCalendarScheduledDate> get byDate => {
        for (final item in scheduledDates) item.date: item,
      };

  factory DriverCommuteCalendarData.fromJson(Map<String, dynamic> json) {
    final rawMonths = json['activeMonths'] as List<dynamic>? ?? const [];
    final rawDates = json['scheduledDates'] as List<dynamic>? ?? const [];
    return DriverCommuteCalendarData(
      commute: DriverCalendarCommuteMeta.fromJson(_asMap(json['commute'])),
      month: (json['month'] ?? '').toString(),
      todayDate: (json['todayDate'] ?? '').toString(),
      activeMonths: rawMonths.map((e) => e.toString()).toList(),
      scheduledDates: rawDates
          .whereType<Map>()
          .map((e) => DriverCalendarScheduledDate.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class DriverCommuteDateManifestData {
  const DriverCommuteDateManifestData({
    required this.date,
    required this.commuteId,
    required this.trips,
  });

  final String date;
  final String commuteId;
  final List<DriverTripManifest> trips;

  factory DriverCommuteDateManifestData.fromJson(Map<String, dynamic> json) {
    final rawTrips = json['trips'] as List<dynamic>? ?? const [];
    return DriverCommuteDateManifestData(
      date: (json['date'] ?? '').toString(),
      commuteId: (json['commuteId'] ?? '').toString(),
      trips: rawTrips
          .whereType<Map>()
          .map((e) => DriverTripManifest.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

