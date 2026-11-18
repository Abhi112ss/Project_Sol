DateTime? _parseDateTime(Object? value) {
  if (value == null) return null;
  if (value is DateTime) return value.toLocal();
  if (value is String && value.isNotEmpty) {
    return DateTime.tryParse(value)?.toLocal();
  }
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
  if (raw is Map) {
    return raw.map((k, v) => MapEntry(k.toString(), v));
  }
  return const {};
}

class OfficeSummary {
  const OfficeSummary({
    required this.id,
    required this.code,
    required this.name,
    required this.address,
    this.latitude,
    this.longitude,
  });

  final String id;
  final String code;
  final String name;
  final String address;
  final double? latitude;
  final double? longitude;

  factory OfficeSummary.fromJson(Map<String, dynamic> json) {
    return OfficeSummary(
      id: (json['id'] ?? '').toString(),
      code: (json['code'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      address: (json['address'] ?? '').toString(),
      latitude: _parseDouble(json['latitude']),
      longitude: _parseDouble(json['longitude']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'code': code,
        'name': name,
        'address': address,
        'latitude': latitude,
        'longitude': longitude,
      };
}

class ShiftSummary {
  const ShiftSummary({
    required this.id,
    required this.code,
    required this.name,
    required this.direction,
    required this.shiftTimeLocal,
  });

  final String id;
  final String code;
  final String name;
  final String direction;
  final String shiftTimeLocal;

  factory ShiftSummary.fromJson(Map<String, dynamic> json) {
    return ShiftSummary(
      id: (json['id'] ?? '').toString(),
      code: (json['code'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      direction: (json['direction'] ?? 'LOGIN').toString(),
      shiftTimeLocal: (json['shiftTimeLocal'] ?? '09:00').toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'code': code,
        'name': name,
        'direction': direction,
        'shiftTimeLocal': shiftTimeLocal,
      };
}

class OrgSettingsPolicy {
  const OrgSettingsPolicy({
    this.bookingCutoffMinutes = 60,
    this.cancellationCutoffMinutes = 45,
    this.requireBoardingOtp = true,
    this.gpsStaleThresholdSeconds = 60,
    this.gpsPingIntervalSeconds = 10,
    this.sosEscalationSeconds = 120,
    this.noShowWaitSeconds = 180,
    this.arriveBySafetyBufferMinutes = 10,
    this.allowSameDayBooking = false,
  });

  final int bookingCutoffMinutes;
  final int cancellationCutoffMinutes;
  final bool requireBoardingOtp;
  final int gpsStaleThresholdSeconds;
  final int gpsPingIntervalSeconds;
  final int sosEscalationSeconds;
  final int noShowWaitSeconds;
  final int arriveBySafetyBufferMinutes;
  final bool allowSameDayBooking;

  factory OrgSettingsPolicy.fromJson(Map<String, dynamic> json) {
    return OrgSettingsPolicy(
      bookingCutoffMinutes: _parseInt(json['bookingCutoffMinutes']) ?? 60,
      cancellationCutoffMinutes: _parseInt(json['cancellationCutoffMinutes']) ?? 45,
      requireBoardingOtp: json['requireBoardingOtp'] as bool? ?? true,
      gpsStaleThresholdSeconds: _parseInt(json['gpsStaleThresholdSeconds']) ?? 60,
      gpsPingIntervalSeconds: _parseInt(json['gpsPingIntervalSeconds']) ?? 10,
      sosEscalationSeconds: _parseInt(json['sosEscalationSeconds']) ?? 120,
      noShowWaitSeconds: _parseInt(json['noShowWaitSeconds']) ?? 180,
      arriveBySafetyBufferMinutes: _parseInt(json['arriveBySafetyBufferMinutes']) ?? 10,
      allowSameDayBooking: json['allowSameDayBooking'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'bookingCutoffMinutes': bookingCutoffMinutes,
        'cancellationCutoffMinutes': cancellationCutoffMinutes,
        'requireBoardingOtp': requireBoardingOtp,
        'gpsStaleThresholdSeconds': gpsStaleThresholdSeconds,
        'gpsPingIntervalSeconds': gpsPingIntervalSeconds,
        'sosEscalationSeconds': sosEscalationSeconds,
        'noShowWaitSeconds': noShowWaitSeconds,
        'arriveBySafetyBufferMinutes': arriveBySafetyBufferMinutes,
        'allowSameDayBooking': allowSameDayBooking,
      };
}

class SavedLocation {
  const SavedLocation({
    required this.id,
    required this.locationName,
    required this.address,
    this.corridorTag,
    required this.latitude,
    required this.longitude,
    required this.geofenceRadiusM,
    required this.isDefault,
    required this.verified,
  });

  final String id;
  final String locationName;
  final String address;
  final String? corridorTag;
  final double latitude;
  final double longitude;
  final int geofenceRadiusM;
  final bool isDefault;
  final bool verified;

  factory SavedLocation.fromJson(Map<String, dynamic> json) {
    return SavedLocation(
      id: (json['id'] ?? '').toString(),
      locationName: (json['locationName'] ?? '').toString(),
      address: (json['address'] ?? '').toString(),
      corridorTag: json['corridorTag']?.toString(),
      latitude: _parseDouble(json['latitude']) ?? 17.44,
      longitude: _parseDouble(json['longitude']) ?? 78.37,
      geofenceRadiusM: _parseInt(json['geofenceRadiusM']) ?? 150,
      isDefault: json['isDefault'] as bool? ?? false,
      verified: json['verified'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'locationName': locationName,
        'address': address,
        'corridorTag': corridorTag,
        'latitude': latitude,
        'longitude': longitude,
        'geofenceRadiusM': geofenceRadiusM,
        'isDefault': isDefault,
        'verified': verified,
      };
}

class EmployeeProfileData {
  const EmployeeProfileData({
    required this.employeeId,
    required this.employeeCode,
    required this.department,
    required this.transportEligible,
    required this.fullName,
    required this.email,
    required this.phone,
    this.emergencyContactName,
    this.emergencyContactPhone,
    this.organizationName,
    this.office,
    this.defaultShift,
    required this.settings,
    required this.availableOffices,
    required this.availableShifts,
    required this.savedLocationsCount,
  });

  final String employeeId;
  final String employeeCode;
  final String department;
  final bool transportEligible;
  final String fullName;
  final String email;
  final String phone;
  final String? emergencyContactName;
  final String? emergencyContactPhone;
  final String? organizationName;
  final OfficeSummary? office;
  final ShiftSummary? defaultShift;
  final OrgSettingsPolicy settings;
  final List<OfficeSummary> availableOffices;
  final List<ShiftSummary> availableShifts;
  final int savedLocationsCount;

  factory EmployeeProfileData.fromJson(Map<String, dynamic> json) {
    final emp = _asMap(json['employee']);
    final user = _asMap(json['user']);
    final org = _asMap(json['organization']);
    final officeMap = _asMap(json['office']);
    final shiftMap = _asMap(json['defaultShift']);
    final settingsMap = _asMap(json['settings']);

    final rawOffices = json['availableOffices'] as List<dynamic>? ?? const [];
    final rawShifts = json['availableShifts'] as List<dynamic>? ?? const [];

    return EmployeeProfileData(
      employeeId: (emp['id'] ?? '').toString(),
      employeeCode: (emp['employeeCode'] ?? '').toString(),
      department: (emp['department'] ?? '').toString(),
      transportEligible: emp['transportEligible'] as bool? ?? true,
      fullName: (user['fullName'] ?? 'Commuter').toString(),
      email: (user['email'] ?? '').toString(),
      phone: (user['phone'] ?? '').toString(),
      emergencyContactName: emp['emergencyContactName']?.toString(),
      emergencyContactPhone: emp['emergencyContactPhone']?.toString(),
      organizationName: org['name']?.toString(),
      office: officeMap.isEmpty ? null : OfficeSummary.fromJson(officeMap),
      defaultShift: shiftMap.isEmpty ? null : ShiftSummary.fromJson(shiftMap),
      settings: settingsMap.isEmpty
          ? const OrgSettingsPolicy()
          : OrgSettingsPolicy.fromJson(settingsMap),
      availableOffices:
          rawOffices.map((e) => OfficeSummary.fromJson(_asMap(e))).toList(),
      availableShifts:
          rawShifts.map((e) => ShiftSummary.fromJson(_asMap(e))).toList(),
      savedLocationsCount: _parseInt(json['savedLocationsCount']) ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'employee': {
          'id': employeeId,
          'employeeCode': employeeCode,
          'department': department,
          'transportEligible': transportEligible,
          'emergencyContactName': emergencyContactName,
          'emergencyContactPhone': emergencyContactPhone,
        },
        'user': {
          'fullName': fullName,
          'email': email,
          'phone': phone,
        },
        'organization': {
          'name': organizationName,
        },
        'office': office?.toJson(),
        'defaultShift': defaultShift?.toJson(),
        'settings': settings.toJson(),
        'availableOffices': availableOffices.map((o) => o.toJson()).toList(),
        'availableShifts': availableShifts.map((s) => s.toJson()).toList(),
        'savedLocationsCount': savedLocationsCount,
      };
}

class EmployeeBooking {
  const EmployeeBooking({
    required this.id,
    this.seriesId,
    required this.travelDate,
    required this.direction,
    this.timePreference = 'PICKUP_AT',
    this.requestedTimeLocal,
    this.timezone = 'Asia/Kolkata',
    this.requestedPickupAt,
    required this.status,
    required this.scheduledPickupAt,
    this.isArriveByInfeasible = false,
    this.feasibilityNote,
    required this.shiftId,
    required this.shiftName,
    required this.shiftTimeLocal,
    required this.officeId,
    required this.officeName,
    required this.pickupLocationId,
    required this.pickupLocationName,
    required this.pickupAddress,
    this.corridorTag,
    this.latitude,
    this.longitude,
    this.notes,
    this.cancellationReason,
    this.tripId,
    this.tripCode,
    this.tripStatus,
    this.passengerStatus,
  });

  final String id;
  final String? seriesId;
  final String travelDate;
  final String direction;
  final String timePreference;
  final String? requestedTimeLocal;
  final String timezone;
  final DateTime? requestedPickupAt;
  final String status;
  final DateTime scheduledPickupAt;
  final bool isArriveByInfeasible;
  final String? feasibilityNote;
  final String shiftId;
  final String shiftName;
  final String shiftTimeLocal;
  final String officeId;
  final String officeName;
  final String pickupLocationId;
  final String pickupLocationName;
  final String pickupAddress;
  final String? corridorTag;
  final double? latitude;
  final double? longitude;
  final String? notes;
  final String? cancellationReason;
  final String? tripId;
  final String? tripCode;
  final String? tripStatus;
  final String? passengerStatus;

  bool get canCancel {
    final normalized = status.toUpperCase();
    return normalized == 'PENDING_APPROVAL' ||
        normalized == 'APPROVED' ||
        normalized == 'DISPATCHED';
  }

  factory EmployeeBooking.fromJson(Map<String, dynamic> json) {
    return EmployeeBooking(
      id: (json['id'] ?? '').toString(),
      seriesId: json['seriesId']?.toString(),
      travelDate: (json['travelDate'] ?? '').toString(),
      direction: (json['direction'] ?? 'LOGIN').toString(),
      timePreference: (json['timePreference'] ?? 'PICKUP_AT').toString(),
      requestedTimeLocal: json['requestedTimeLocal']?.toString(),
      timezone: (json['timezone'] ?? 'Asia/Kolkata').toString(),
      requestedPickupAt: _parseDateTime(json['requestedPickupAt']),
      status: (json['status'] ?? 'PENDING_APPROVAL').toString(),
      scheduledPickupAt:
          _parseDateTime(json['scheduledPickupAt']) ?? DateTime.now(),
      isArriveByInfeasible: json['isArriveByInfeasible'] as bool? ?? false,
      feasibilityNote: json['feasibilityNote']?.toString(),
      shiftId: (json['shiftId'] ?? '').toString(),
      shiftName: (json['shiftName'] ?? 'Shift').toString(),
      shiftTimeLocal: (json['shiftTimeLocal'] ?? '09:00').toString(),
      officeId: (json['officeId'] ?? '').toString(),
      officeName: (json['officeName'] ?? 'Campus Office').toString(),
      pickupLocationId: (json['pickupLocationId'] ?? '').toString(),
      pickupLocationName:
          (json['pickupLocationName'] ?? 'Saved Pickup').toString(),
      pickupAddress: (json['pickupAddress'] ?? '').toString(),
      corridorTag: json['corridorTag']?.toString(),
      latitude: _parseDouble(json['latitude']),
      longitude: _parseDouble(json['longitude']),
      notes: json['notes']?.toString(),
      cancellationReason: json['cancellationReason']?.toString(),
      tripId: json['tripId']?.toString(),
      tripCode: json['tripCode']?.toString(),
      tripStatus: json['tripStatus']?.toString(),
      passengerStatus: json['passengerStatus']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'seriesId': seriesId,
        'travelDate': travelDate,
        'direction': direction,
        'timePreference': timePreference,
        'requestedTimeLocal': requestedTimeLocal,
        'timezone': timezone,
        'requestedPickupAt': requestedPickupAt?.toUtc().toIso8601String(),
        'status': status,
        'scheduledPickupAt': scheduledPickupAt.toUtc().toIso8601String(),
        'isArriveByInfeasible': isArriveByInfeasible,
        'feasibilityNote': feasibilityNote,
        'shiftId': shiftId,
        'shiftName': shiftName,
        'shiftTimeLocal': shiftTimeLocal,
        'officeId': officeId,
        'officeName': officeName,
        'pickupLocationId': pickupLocationId,
        'pickupLocationName': pickupLocationName,
        'pickupAddress': pickupAddress,
        'corridorTag': corridorTag,
        'latitude': latitude,
        'longitude': longitude,
        'notes': notes,
        'cancellationReason': cancellationReason,
        'tripId': tripId,
        'tripCode': tripCode,
        'tripStatus': tripStatus,
        'passengerStatus': passengerStatus,
      };
}

class TripStopView {
  const TripStopView({
    required this.id,
    required this.sequenceNo,
    required this.stopType,
    required this.locationName,
    required this.address,
    this.latitude,
    this.longitude,
    this.scheduledArrivalAt,
    this.actualArrivalAt,
    this.completedAt,
    required this.status,
    required this.isYourStop,
    required this.passengerCountAtStop,
  });

  final String id;
  final int sequenceNo;
  final String stopType;
  final String locationName;
  final String address;
  final double? latitude;
  final double? longitude;
  final DateTime? scheduledArrivalAt;
  final DateTime? actualArrivalAt;
  final DateTime? completedAt;
  final String status;
  final bool isYourStop;
  final int passengerCountAtStop;

  factory TripStopView.fromJson(Map<String, dynamic> json) {
    return TripStopView(
      id: (json['id'] ?? '').toString(),
      sequenceNo: _parseInt(json['sequenceNo']) ?? 1,
      stopType: (json['stopType'] ?? 'PICKUP').toString(),
      locationName: (json['locationName'] ?? '').toString(),
      address: (json['address'] ?? '').toString(),
      latitude: _parseDouble(json['latitude']),
      longitude: _parseDouble(json['longitude']),
      scheduledArrivalAt: _parseDateTime(json['scheduledArrivalAt']),
      actualArrivalAt: _parseDateTime(json['actualArrivalAt']),
      completedAt: _parseDateTime(json['completedAt']),
      status: (json['status'] ?? 'PENDING').toString(),
      isYourStop: json['isYourStop'] as bool? ?? false,
      passengerCountAtStop: _parseInt(json['passengerCountAtStop']) ?? 1,
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
        'scheduledArrivalAt':
            scheduledArrivalAt?.toUtc().toIso8601String(),
        'actualArrivalAt': actualArrivalAt?.toUtc().toIso8601String(),
        'completedAt': completedAt?.toUtc().toIso8601String(),
        'status': status,
        'isYourStop': isYourStop,
        'passengerCountAtStop': passengerCountAtStop,
      };
}

class GpsTelemetry {
  const GpsTelemetry({
    required this.latitude,
    required this.longitude,
    this.accuracyM,
    this.speedMps,
    this.headingDeg,
    required this.recordedAt,
    this.serverReceivedAt,
    required this.ageSeconds,
    required this.isStale,
    this.etaMinutes,
  });

  final double latitude;
  final double longitude;
  final double? accuracyM;
  final double? speedMps;
  final double? headingDeg;
  final DateTime recordedAt;
  final DateTime? serverReceivedAt;
  final int ageSeconds;
  final bool isStale;
  final int? etaMinutes;

  factory GpsTelemetry.fromJson(Map<String, dynamic> json) {
    return GpsTelemetry(
      latitude: _parseDouble(json['latitude']) ?? 0,
      longitude: _parseDouble(json['longitude']) ?? 0,
      accuracyM: _parseDouble(json['accuracyM']),
      speedMps: _parseDouble(json['speedMps']),
      headingDeg: _parseDouble(json['headingDeg']),
      recordedAt: _parseDateTime(json['recordedAt']) ?? DateTime.now(),
      serverReceivedAt: _parseDateTime(json['serverReceivedAt']),
      ageSeconds: _parseInt(json['ageSeconds']) ?? 0,
      isStale: json['isStale'] as bool? ?? false,
      etaMinutes: _parseInt(json['etaMinutes']),
    );
  }

  Map<String, dynamic> toJson() => {
        'latitude': latitude,
        'longitude': longitude,
        'accuracyM': accuracyM,
        'speedMps': speedMps,
        'headingDeg': headingDeg,
        'recordedAt': recordedAt.toUtc().toIso8601String(),
        'serverReceivedAt': serverReceivedAt?.toUtc().toIso8601String(),
        'ageSeconds': ageSeconds,
        'isStale': isStale,
        'etaMinutes': etaMinutes,
      };
}

class UpcomingTripDetail {
  const UpcomingTripDetail({
    required this.tripId,
    required this.tripCode,
    required this.travelDate,
    required this.direction,
    required this.tripStatus,
    required this.currentStopSequence,
    this.plannedStartAt,
    this.actualStartAt,
    this.completedAt,
    required this.officeName,
    required this.shiftName,
    required this.shiftTimeLocal,
    this.driverId,
    this.driverName,
    this.driverPhone,
    this.vehicleRegistrationNo,
    this.vehicleModelName,
    required this.assignmentId,
    required this.bookingId,
    required this.passengerStatus,
    required this.scheduledPickupAt,
    this.runningLateEtaMinutes,
    this.arrivalDelaySeconds,
    this.safeReachConfirmedAt,
    this.yourStopSequence,
    this.boardingOtp,
    required this.passengersTotal,
    required this.stops,
    this.gpsTelemetry,
    required this.settings,
  });

  final String tripId;
  final String tripCode;
  final String travelDate;
  final String direction;
  final String tripStatus;
  final int currentStopSequence;
  final DateTime? plannedStartAt;
  final DateTime? actualStartAt;
  final DateTime? completedAt;
  final String officeName;
  final String shiftName;
  final String shiftTimeLocal;
  final String? driverId;
  final String? driverName;
  final String? driverPhone;
  final String? vehicleRegistrationNo;
  final String? vehicleModelName;
  final String assignmentId;
  final String bookingId;
  final String passengerStatus;
  final DateTime scheduledPickupAt;
  final int? runningLateEtaMinutes;
  final int? arrivalDelaySeconds;
  final DateTime? safeReachConfirmedAt;
  final int? yourStopSequence;
  final String? boardingOtp;
  final int passengersTotal;
  final List<TripStopView> stops;
  final GpsTelemetry? gpsTelemetry;
  final OrgSettingsPolicy settings;

  TripStopView? get yourStop {
    for (final stop in stops) {
      if (stop.isYourStop) return stop;
    }
    return null;
  }

  TripStopView? get officeStop {
    for (final stop in stops) {
      if (stop.stopType.toUpperCase() == 'OFFICE') return stop;
    }
    return null;
  }

  UpcomingTripDetail copyWithGps(GpsTelemetry? nextGps) {
    return UpcomingTripDetail(
      tripId: tripId,
      tripCode: tripCode,
      travelDate: travelDate,
      direction: direction,
      tripStatus: tripStatus,
      currentStopSequence: currentStopSequence,
      plannedStartAt: plannedStartAt,
      actualStartAt: actualStartAt,
      completedAt: completedAt,
      officeName: officeName,
      shiftName: shiftName,
      shiftTimeLocal: shiftTimeLocal,
      driverId: driverId,
      driverName: driverName,
      driverPhone: driverPhone,
      vehicleRegistrationNo: vehicleRegistrationNo,
      vehicleModelName: vehicleModelName,
      assignmentId: assignmentId,
      bookingId: bookingId,
      passengerStatus: passengerStatus,
      scheduledPickupAt: scheduledPickupAt,
      runningLateEtaMinutes: runningLateEtaMinutes,
      arrivalDelaySeconds: arrivalDelaySeconds,
      safeReachConfirmedAt: safeReachConfirmedAt,
      yourStopSequence: yourStopSequence,
      boardingOtp: boardingOtp,
      passengersTotal: passengersTotal,
      stops: stops,
      gpsTelemetry: nextGps,
      settings: settings,
    );
  }

  factory UpcomingTripDetail.fromJson(Map<String, dynamic> json) {
    final trip = _asMap(json['trip']);
    final pa = _asMap(json['yourAssignment']);
    final gpsMap = _asMap(json['gpsTelemetry']);
    final settingsMap = _asMap(json['settings']);
    final rawStops = json['stops'] as List<dynamic>? ?? const [];

    return UpcomingTripDetail(
      tripId: (trip['id'] ?? '').toString(),
      tripCode: (trip['tripCode'] ?? '').toString(),
      travelDate: (trip['travelDate'] ?? '').toString(),
      direction: (trip['direction'] ?? 'LOGIN').toString(),
      tripStatus: (trip['status'] ?? 'ASSIGNED').toString(),
      currentStopSequence: _parseInt(trip['currentStopSequence']) ?? 1,
      plannedStartAt: _parseDateTime(trip['plannedStartAt']),
      actualStartAt: _parseDateTime(trip['actualStartAt']),
      completedAt: _parseDateTime(trip['completedAt']),
      officeName: (trip['officeName'] ?? 'Campus').toString(),
      shiftName: (trip['shiftName'] ?? 'Shift').toString(),
      shiftTimeLocal: (trip['shiftTimeLocal'] ?? '09:00').toString(),
      driverId: trip['driverId']?.toString(),
      driverName: trip['driverName']?.toString(),
      driverPhone: trip['driverPhone']?.toString(),
      vehicleRegistrationNo: trip['vehicleRegistrationNo']?.toString(),
      vehicleModelName: trip['vehicleModelName']?.toString(),
      assignmentId: (pa['id'] ?? '').toString(),
      bookingId: (pa['bookingId'] ?? '').toString(),
      passengerStatus: (pa['status'] ?? 'SCHEDULED').toString(),
      scheduledPickupAt:
          _parseDateTime(pa['scheduledPickupAt']) ?? DateTime.now(),
      runningLateEtaMinutes: _parseInt(pa['runningLateEtaMinutes']),
      arrivalDelaySeconds: _parseInt(pa['arrivalDelaySeconds']),
      safeReachConfirmedAt: _parseDateTime(pa['safeReachConfirmedAt']),
      yourStopSequence: _parseInt(json['yourStopSequence']),
      boardingOtp: json['boardingOtp']?.toString(),
      passengersTotal: _parseInt(json['passengersTotal']) ?? 1,
      stops: rawStops.map((e) => TripStopView.fromJson(_asMap(e))).toList(),
      gpsTelemetry:
          gpsMap.isEmpty ? null : GpsTelemetry.fromJson(gpsMap),
      settings: settingsMap.isEmpty
          ? const OrgSettingsPolicy()
          : OrgSettingsPolicy.fromJson(settingsMap),
    );
  }

  Map<String, dynamic> toJson() => {
        'trip': {
          'id': tripId,
          'tripCode': tripCode,
          'travelDate': travelDate,
          'direction': direction,
          'status': tripStatus,
          'currentStopSequence': currentStopSequence,
          'plannedStartAt': plannedStartAt?.toUtc().toIso8601String(),
          'actualStartAt': actualStartAt?.toUtc().toIso8601String(),
          'completedAt': completedAt?.toUtc().toIso8601String(),
          'officeName': officeName,
          'shiftName': shiftName,
          'shiftTimeLocal': shiftTimeLocal,
          'driverId': driverId,
          'driverName': driverName,
          'driverPhone': driverPhone,
          'vehicleRegistrationNo': vehicleRegistrationNo,
          'vehicleModelName': vehicleModelName,
        },
        'yourAssignment': {
          'id': assignmentId,
          'bookingId': bookingId,
          'status': passengerStatus,
          'scheduledPickupAt': scheduledPickupAt.toUtc().toIso8601String(),
          'runningLateEtaMinutes': runningLateEtaMinutes,
          'arrivalDelaySeconds': arrivalDelaySeconds,
          'safeReachConfirmedAt':
              safeReachConfirmedAt?.toUtc().toIso8601String(),
        },
        'yourStopSequence': yourStopSequence,
        'boardingOtp': boardingOtp,
        'passengersTotal': passengersTotal,
        'stops': stops.map((s) => s.toJson()).toList(),
        'gpsTelemetry': gpsTelemetry?.toJson(),
        'settings': settings.toJson(),
      };
}

class EmployeeTripSummary {
  const EmployeeTripSummary({
    required this.assignmentId,
    required this.tripId,
    required this.tripCode,
    required this.travelDate,
    required this.direction,
    required this.tripStatus,
    required this.passengerStatus,
    required this.scheduledPickupAt,
    required this.shiftName,
    required this.shiftTimeLocal,
    required this.officeName,
    required this.stopSequence,
    required this.pickupLocationName,
    required this.pickupAddress,
    this.driverName,
    this.driverPhone,
    this.vehicleRegistrationNo,
    this.vehicleModelName,
    this.runningLateEtaMinutes,
    this.safeReachConfirmedAt,
  });

  final String assignmentId;
  final String tripId;
  final String tripCode;
  final String travelDate;
  final String direction;
  final String tripStatus;
  final String passengerStatus;
  final DateTime scheduledPickupAt;
  final String shiftName;
  final String shiftTimeLocal;
  final String officeName;
  final int stopSequence;
  final String pickupLocationName;
  final String pickupAddress;
  final String? driverName;
  final String? driverPhone;
  final String? vehicleRegistrationNo;
  final String? vehicleModelName;
  final int? runningLateEtaMinutes;
  final DateTime? safeReachConfirmedAt;

  factory EmployeeTripSummary.fromJson(Map<String, dynamic> json) {
    return EmployeeTripSummary(
      assignmentId: (json['assignmentId'] ?? '').toString(),
      tripId: (json['tripId'] ?? '').toString(),
      tripCode: (json['tripCode'] ?? '').toString(),
      travelDate: (json['travelDate'] ?? '').toString(),
      direction: (json['direction'] ?? 'LOGIN').toString(),
      tripStatus: (json['tripStatus'] ?? 'ASSIGNED').toString(),
      passengerStatus: (json['passengerStatus'] ?? 'SCHEDULED').toString(),
      scheduledPickupAt:
          _parseDateTime(json['scheduledPickupAt']) ?? DateTime.now(),
      shiftName: (json['shiftName'] ?? '').toString(),
      shiftTimeLocal: (json['shiftTimeLocal'] ?? '09:00').toString(),
      officeName: (json['officeName'] ?? '').toString(),
      stopSequence: _parseInt(json['stopSequence']) ?? 1,
      pickupLocationName: (json['pickupLocationName'] ?? '').toString(),
      pickupAddress: (json['pickupAddress'] ?? '').toString(),
      driverName: json['driverName']?.toString(),
      driverPhone: json['driverPhone']?.toString(),
      vehicleRegistrationNo: json['vehicleRegistrationNo']?.toString(),
      vehicleModelName: json['vehicleModelName']?.toString(),
      runningLateEtaMinutes: _parseInt(json['runningLateEtaMinutes']),
      safeReachConfirmedAt: _parseDateTime(json['safeReachConfirmedAt']),
    );
  }

  Map<String, dynamic> toJson() => {
        'assignmentId': assignmentId,
        'tripId': tripId,
        'tripCode': tripCode,
        'travelDate': travelDate,
        'direction': direction,
        'tripStatus': tripStatus,
        'passengerStatus': passengerStatus,
        'scheduledPickupAt': scheduledPickupAt.toUtc().toIso8601String(),
        'shiftName': shiftName,
        'shiftTimeLocal': shiftTimeLocal,
        'officeName': officeName,
        'stopSequence': stopSequence,
        'pickupLocationName': pickupLocationName,
        'pickupAddress': pickupAddress,
        'driverName': driverName,
        'driverPhone': driverPhone,
        'vehicleRegistrationNo': vehicleRegistrationNo,
        'vehicleModelName': vehicleModelName,
        'runningLateEtaMinutes': runningLateEtaMinutes,
        'safeReachConfirmedAt':
            safeReachConfirmedAt?.toUtc().toIso8601String(),
      };
}

class EmployeeNotificationItem {
  const EmployeeNotificationItem({
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

  EmployeeNotificationItem copyWith({DateTime? readAt}) {
    return EmployeeNotificationItem(
      id: id,
      category: category,
      title: title,
      body: body,
      readAt: readAt ?? this.readAt,
      createdAt: createdAt,
      unreadCount: unreadCount,
    );
  }

  factory EmployeeNotificationItem.fromJson(Map<String, dynamic> json) {
    return EmployeeNotificationItem(
      id: (json['id'] ?? '').toString(),
      category: (json['category'] ?? 'GENERAL').toString(),
      title: (json['title'] ?? '').toString(),
      body: (json['body'] ?? '').toString(),
      readAt: _parseDateTime(json['readAt']),
      createdAt: _parseDateTime(json['createdAt']) ?? DateTime.now(),
      unreadCount: _parseInt(json['unreadCount']) ?? 0,
    );
  }
}

class SafetyAlertReceipt {
  const SafetyAlertReceipt({
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

  factory SafetyAlertReceipt.fromJson(Map<String, dynamic> json) {
    return SafetyAlertReceipt(
      id: (json['id'] ?? '').toString(),
      alertType: (json['alertType'] ?? 'SOS').toString(),
      severity: (json['severity'] ?? 'CRITICAL').toString(),
      status: (json['status'] ?? 'OPEN').toString(),
      notes: json['notes']?.toString(),
      createdAt: _parseDateTime(json['createdAt']) ?? DateTime.now(),
    );
  }
}

class SeriesOccurrencePreview {
  const SeriesOccurrencePreview({
    required this.travelDate,
    required this.dayOfWeek,
    required this.requestedPickupAt,
    required this.scheduledPickupAt,
    required this.estimatedArrivalAt,
    required this.estimatedTravelMinutes,
    required this.isArriveByInfeasible,
    this.feasibilityNote,
    required this.passesCutoff,
    this.cutoffNote,
    required this.hasConflict,
    this.conflictingSeriesId,
  });

  final String travelDate;
  final String dayOfWeek;
  final DateTime requestedPickupAt;
  final DateTime scheduledPickupAt;
  final DateTime estimatedArrivalAt;
  final int estimatedTravelMinutes;
  final bool isArriveByInfeasible;
  final String? feasibilityNote;
  final bool passesCutoff;
  final String? cutoffNote;
  final bool hasConflict;
  final String? conflictingSeriesId;

  factory SeriesOccurrencePreview.fromJson(Map<String, dynamic> json) {
    return SeriesOccurrencePreview(
      travelDate: (json['travelDate'] ?? '').toString(),
      dayOfWeek: (json['dayOfWeek'] ?? 'MON').toString(),
      requestedPickupAt: _parseDateTime(json['requestedPickupAt']) ?? DateTime.now(),
      scheduledPickupAt: _parseDateTime(json['scheduledPickupAt']) ?? DateTime.now(),
      estimatedArrivalAt: _parseDateTime(json['estimatedArrivalAt']) ?? DateTime.now(),
      estimatedTravelMinutes: _parseInt(json['estimatedTravelMinutes']) ?? 25,
      isArriveByInfeasible: json['isArriveByInfeasible'] as bool? ?? false,
      feasibilityNote: json['feasibilityNote']?.toString(),
      passesCutoff: json['passesCutoff'] as bool? ?? true,
      cutoffNote: json['cutoffNote']?.toString(),
      hasConflict: json['hasConflict'] as bool? ?? false,
      conflictingSeriesId: json['conflictingSeriesId']?.toString(),
    );
  }
}

class SeriesPreviewData {
  const SeriesPreviewData({
    required this.recurrenceType,
    required this.startDate,
    required this.endDate,
    required this.selectedDaysOfWeek,
    required this.direction,
    required this.timePreference,
    required this.requestedTimeLocal,
    required this.timezone,
    required this.totalDatesCount,
    required this.validDatesCount,
    required this.conflictingDatesCount,
    required this.infeasibleDatesCount,
    required this.occurrences,
  });

  final String recurrenceType;
  final String startDate;
  final String endDate;
  final List<String> selectedDaysOfWeek;
  final String direction;
  final String timePreference;
  final String requestedTimeLocal;
  final String timezone;
  final int totalDatesCount;
  final int validDatesCount;
  final int conflictingDatesCount;
  final int infeasibleDatesCount;
  final List<SeriesOccurrencePreview> occurrences;

  factory SeriesPreviewData.fromJson(Map<String, dynamic> json) {
    final daysRaw = json['selectedDaysOfWeek'];
    final occRaw = json['occurrences'];
    return SeriesPreviewData(
      recurrenceType: (json['recurrenceType'] ?? 'ONE_DAY').toString(),
      startDate: (json['startDate'] ?? '').toString(),
      endDate: (json['endDate'] ?? '').toString(),
      selectedDaysOfWeek: daysRaw is List ? daysRaw.map((e) => e.toString()).toList() : const [],
      direction: (json['direction'] ?? 'LOGIN').toString(),
      timePreference: (json['timePreference'] ?? 'PICKUP_AT').toString(),
      requestedTimeLocal: (json['requestedTimeLocal'] ?? '09:00').toString(),
      timezone: (json['timezone'] ?? 'Asia/Kolkata').toString(),
      totalDatesCount: _parseInt(json['totalDatesCount']) ?? 0,
      validDatesCount: _parseInt(json['validDatesCount']) ?? 0,
      conflictingDatesCount: _parseInt(json['conflictingDatesCount']) ?? 0,
      infeasibleDatesCount: _parseInt(json['infeasibleDatesCount']) ?? 0,
      occurrences: occRaw is List
          ? occRaw
              .whereType<Map>()
              .map((m) => SeriesOccurrencePreview.fromJson(Map<String, dynamic>.from(m)))
              .toList()
          : const [],
    );
  }
}

class BookingSeriesSummary {
  const BookingSeriesSummary({
    required this.id,
    required this.direction,
    required this.timePreference,
    required this.requestedTimeLocal,
    required this.timezone,
    required this.recurrenceType,
    required this.startDate,
    required this.endDate,
    required this.selectedDaysOfWeek,
    required this.status,
    required this.pickupLocationName,
    required this.officeName,
    required this.totalCount,
    required this.activeCount,
    required this.dispatchedCount,
    required this.expiredCount,
    required this.cancelledCount,
  });

  final String id;
  final String direction;
  final String timePreference;
  final String requestedTimeLocal;
  final String timezone;
  final String recurrenceType;
  final String startDate;
  final String endDate;
  final String selectedDaysOfWeek;
  final String status;
  final String pickupLocationName;
  final String officeName;
  final int totalCount;
  final int activeCount;
  final int dispatchedCount;
  final int expiredCount;
  final int cancelledCount;

  bool get isActive => status.toUpperCase() == 'ACTIVE';
  bool get isExpired => status.toUpperCase() == 'EXPIRED';

  factory BookingSeriesSummary.fromJson(Map<String, dynamic> json) {
    final counts = _asMap(json['counts']);
    final pending = _parseInt(counts['pendingApproval']) ?? 0;
    final approved = _parseInt(counts['approved']) ?? 0;
    final dispatched = _parseInt(counts['dispatched']) ?? 0;
    return BookingSeriesSummary(
      id: (json['id'] ?? '').toString(),
      direction: (json['direction'] ?? 'LOGIN').toString(),
      timePreference: (json['timePreference'] ?? 'PICKUP_AT').toString(),
      requestedTimeLocal: (json['requestedTimeLocal'] ?? '09:00').toString(),
      timezone: (json['timezone'] ?? 'Asia/Kolkata').toString(),
      recurrenceType: (json['recurrenceType'] ?? 'WEEKLY').toString(),
      startDate: (json['startDate'] ?? '').toString(),
      endDate: (json['endDate'] ?? '').toString(),
      selectedDaysOfWeek: (json['selectedDaysOfWeek'] ?? 'MON,TUE,WED,THU,FRI').toString(),
      status: (json['status'] ?? 'ACTIVE').toString(),
      pickupLocationName: (json['pickupLocationName'] ?? 'Saved Pickup').toString(),
      officeName: (json['officeName'] ?? 'Campus Office').toString(),
      totalCount: _parseInt(counts['total']) ?? 0,
      activeCount: pending + approved + dispatched,
      dispatchedCount: dispatched,
      expiredCount: _parseInt(counts['expired']) ?? 0,
      cancelledCount: _parseInt(counts['cancelled']) ?? 0,
    );
  }
}

