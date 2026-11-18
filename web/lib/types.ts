export type UserRole =
  | "PLATFORM_SUPER_ADMIN"
  | "ORG_ADMIN"
  | "DUTY_APPROVER"
  | "TRANSPORT_MANAGER"
  | "VENDOR_SUPERVISOR"
  | "DRIVER"
  | "EMPLOYEE"
  | "AUDITOR";

export type TripDirection = "LOGIN" | "LOGOUT";

export type TripStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "ASSIGNED"
  | "DRIVER_ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "ABORTED";

export type BookingStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "DISPATCHED"
  | "CANCELLED"
  | "EXPIRED";

export type BookingRecurrenceType = "ONE_DAY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
export type BookingTimePreference = "PICKUP_AT" | "ARRIVE_BY";

export type VehicleType =
  | "SEDAN"
  | "SUV"
  | "TEMPO_TRAVELLER"
  | "EV_SEDAN"
  | "SHUTTLE_BUS";

export type VehicleAvailabilityStatus =
  | "AVAILABLE"
  | "ON_TRIP"
  | "MAINTENANCE"
  | "INACTIVE";

export type DriverAvailabilityStatus =
  | "OFF_DUTY"
  | "AVAILABLE"
  | "ON_TRIP"
  | "SUSPENDED";

export interface DevSessionIdentity {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
  role: UserRole;
  label: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta: {
    requestId: string;
    serverTime: string;
    pagination?: PaginationMeta;
  };
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
}

export interface ShiftItem {
  id: string;
  organizationId: string;
  officeId: string;
  name: string;
  code: string;
  direction: TripDirection;
  shiftTimeLocal: string;
  daysOfWeek: string;
  isActive: boolean;
}

export interface OfficeItem {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  isActive: boolean;
}

export interface VendorItem {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  contactName: string;
  contactPhone: string;
  billingBaseTripPaise: number;
  billingRatePerKmPaise: number;
  isActive: boolean;
}

export interface TripSummaryItem {
  id: string;
  tripCode: string;
  travelDate: string;
  direction: TripDirection;
  status: TripStatus;
  currentStopSequence: number | null;
  plannedStartAt: string;
  actualStartAt: string | null;
  completedAt: string | null;
  officeId: string;
  officeName: string;
  shiftId: string;
  shiftName: string;
  shiftTimeLocal: string;
  driverId: string | null;
  driverCode: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vehicleId: string | null;
  vehicleRegistrationNo: string | null;
  vehicleModelName: string | null;
  seatingCapacity: number | null;
  passengerCount: number;
  createdAt: string;
}

export interface SafetyAlertSummary {
  id: string;
  organizationId: string;
  tripId: string | null;
  alertType: string;
  severity: string;
  status: string;
  title: string | null;
  description: string | null;
  createdAt: string;
}

export interface OverviewData {
  kpis: {
    totalEmployees: number;
    activeDrivers: number;
    availableVehicles: number;
    assignedVehicles: number;
    activeTrips: number;
    completedTrips: number;
    cancelledTrips: number;
    noShowPassengers: number;
    delayedPickups: number;
    pendingApprovals: number;
    approvedAwaitingDispatch: number;
    activeEmergencies: number;
  };
  upcomingShifts: ShiftItem[];
  recentTrips: TripSummaryItem[];
  openAlerts: SafetyAlertSummary[];
}

export interface TripStopDetail {
  id: string;
  tripId: string;
  sequenceNo: number;
  stopType: string;
  locationName: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  scheduledArrivalAt: string;
  actualArrivalAt: string | null;
  completedAt: string | null;
  status: string;
}

export interface TripPassengerAssignment {
  assignmentId: string;
  tripStopId: string;
  bookingId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeePhone: string;
  department: string;
  status: string;
  scheduledPickupAt: string;
  driverArrivedAt: string | null;
  boardedAt: string | null;
  noShowAt: string | null;
  arrivalDelaySeconds: number | null;
  passengerWaitSeconds: number | null;
  runningLateEtaMinutes: number | null;
}

export interface TripEventItem {
  id: string;
  eventType: string;
  actorRole: string | null;
  occurredAtClient: string;
  serverReceivedAt: string;
  payloadJson: Record<string, unknown> | null;
}

export interface TripDetailData {
  trip: TripSummaryItem & {
    organizationId: string;
    abortedAt: string | null;
    abortReason: string | null;
  };
  stops: TripStopDetail[];
  assignments: TripPassengerAssignment[];
  events: TripEventItem[];
  noShows: Array<{
    id: string;
    employeeId: string;
    reasonCode: string;
    waitDurationSeconds: number;
    markedAt: string;
  }>;
}

export interface ApprovalQueueItem {
  bookingId: string;
  seriesId?: string | null;
  travelDate: string;
  direction: TripDirection;
  timePreference?: BookingTimePreference;
  requestedTimeLocal?: string | null;
  timezone?: string | null;
  requestedPickupAt?: string | null;
  scheduledPickupAt: string;
  isArriveByInfeasible?: boolean;
  feasibilityNote?: string | null;
  status: BookingStatus;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeePhone: string;
  department: string;
  shiftId: string;
  shiftName: string;
  shiftTimeLocal: string;
  officeId: string;
  officeName: string;
  officeLatitude?: number;
  officeLongitude?: number;
  pickupLocationId: string;
  pickupLocationName: string;
  pickupAddress: string;
  corridorTag: string | null;
  localityId?: string | null;
  normalizedLocality?: string | null;
  latitude: number;
  longitude: number;
}

export interface BookingListItem {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  shiftId: string;
  shiftName: string;
  shiftTimeLocal: string;
  officeId: string;
  officeName: string;
  pickupLocationId: string;
  pickupLocationName: string;
  pickupAddress: string;
  corridorTag: string | null;
  latitude: number;
  longitude: number;
  travelDate: string;
  direction: TripDirection;
  scheduledPickupAt: string;
  status: BookingStatus;
  notes: string | null;
  createdAt: string;
}

export interface EmployeeItem {
  id: string;
  organizationId: string;
  employeeCode: string;
  department: string;
  officeId: string;
  officeName: string;
  defaultShiftId: string | null;
  transportEligible: boolean;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  fullName: string;
  email: string;
  phone: string;
  createdAt: string;
}

export interface EmployeeLocationItem {
  id: string;
  employeeId: string;
  locationName: string;
  address: string;
  corridorTag: string | null;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  isDefault: boolean;
  isVerified: boolean;
}

export interface EmployeeHistoricalTripItem {
  assignmentId: string;
  tripId: string;
  tripCode: string;
  travelDate: string;
  direction: TripDirection;
  tripStatus: TripStatus;
  passengerStatus: string;
  scheduledPickupAt: string;
  boardedAt: string | null;
  noShowAt: string | null;
  arrivalDelaySeconds: number | null;
  passengerWaitSeconds: number | null;
}

export interface EmployeeDetailData extends EmployeeItem {
  userId: string;
  locations: EmployeeLocationItem[];
  tripHistory: EmployeeHistoricalTripItem[];
}

export interface DriverItem {
  id: string;
  organizationId: string;
  vendorId: string;
  vendorName: string;
  assignedVehicleId: string | null;
  vehicleRegistrationNo: string | null;
  baseLocalityId?: string | null;
  baseLocalityName?: string | null;
  baseLatitude?: number | null;
  baseLongitude?: number | null;
  driverCode: string;
  licenseNo: string;
  licenseExpiresAt: string | null;
  availabilityStatus: DriverAvailabilityStatus;
  isSuspended: boolean;
  fullName: string;
  phone: string;
  email: string;
}

export interface VehicleItem {
  id: string;
  organizationId: string;
  vendorId: string;
  vendorName: string;
  registrationNo: string;
  modelName: string;
  vehicleType: VehicleType;
  seatingCapacity: number;
  availabilityStatus: VehicleAvailabilityStatus;
  insuranceExpiresAt: string | null;
  permitExpiresAt: string | null;
  fitnessExpiresAt: string | null;
  isActive: boolean;
}

export interface OrganizationSettings {
  id: string;
  organizationId: string;
  defaultGeofenceRadiusM: number;
  noShowWaitSeconds: number;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  requireBoardingOtp: boolean;
  requireDeboardingOtp: boolean;
  gpsStaleThresholdSeconds: number;
  gpsRetentionDays: number;
  gpsPingIntervalSeconds: number;
  nearbyLocalityRadiusM?: number;
  maxRouteDetourRatio?: number;
  pickupWindowToleranceMinutes?: number;
  driverTurnaroundBufferMinutes?: number;
  arriveBySafetyBufferMinutes?: number;
  allowSameDayBooking?: boolean;
  currencyCode: string;
}

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  countryCode: string;
  timezone: string;
  settings: OrganizationSettings | null;
}

export interface AuditLogItem {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  createdAt: string;
}

export type FleetHealthStatus =
  | "LIVE"
  | "DELAYED"
  | "STALE"
  | "NO_SIGNAL"
  | "EMERGENCY";

export interface FleetLiveTelemetry {
  sampleId?: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  recordedAt: string;
  serverReceivedAt: string;
  ageSeconds: number;
  isStale: boolean;
  etaMinutes: number | null;
}

export interface FleetLiveStopNode {
  id: string;
  sequenceNo: number;
  stopType: string;
  locationName: string;
  address?: string;
  latitude: number;
  longitude: number;
  status: string;
  scheduledArrivalAt: string | null;
  actualArrivalAt: string | null;
}

export interface FleetLiveVehicle {
  id: string;
  tripCode: string;
  travelDate: string;
  direction: TripDirection;
  status: TripStatus;
  currentStopSequence: number;
  plannedStartAt: string | null;
  actualStartAt: string | null;
  officeId: string;
  officeName: string;
  officeLat: number;
  officeLng: number;
  shiftId: string;
  shiftName: string;
  shiftTimeLocal: string;
  driverId: string | null;
  driverCode: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vehicleId: string | null;
  vehicleRegistrationNo: string | null;
  vehicleModelName: string | null;
  seatingCapacity: number | null;
  health: FleetHealthStatus;
  staleThresholdSeconds: number;
  totalStops: number;
  completedStops: number;
  passengerCount: number;
  boardedCount: number;
  noShowCount: number;
  maxArrivalDelaySeconds: number | null;
  openAlertCount: number;
  openAlerts: Array<{
    id: string;
    alertType: string;
    severity: string;
    status: string;
    notes: string | null;
    createdAt: string;
  }>;
  nextStop: FleetLiveStopNode | null;
  stops: FleetLiveStopNode[];
  gpsTelemetry: FleetLiveTelemetry | null;
}

export interface FleetLiveResponse {
  summary: {
    totalActive: number;
    liveCount: number;
    delayedCount: number;
    staleCount: number;
    noSignalCount: number;
    emergencyCount: number;
    staleThresholdSeconds: number;
  };
  filterOptions: {
    offices: Array<{
      id: string;
      name: string;
      code: string;
      latitude: number;
      longitude: number;
    }>;
    shifts: Array<{
      id: string;
      name: string;
      shiftTimeLocal: string;
      direction: TripDirection;
    }>;
  };
  items: FleetLiveVehicle[];
  serverTime: string;
}

export interface TripBreadcrumbsResponse {
  tripId: string;
  tripCode: string;
  tripStatus: string;
  latest: FleetLiveTelemetry | null;
  points: Array<{
    id: string;
    clientPingId: string;
    latitude: number;
    longitude: number;
    accuracyM: number | null;
    speedMps: number | null;
    headingDeg: number | null;
    recordedAt: string;
    serverReceivedAt: string;
  }>;
}

export type SafetyAlertType =
  | "SOS"
  | "ROUTE_DEVIATION"
  | "LONG_STOPPAGE"
  | "SAFE_REACH_OVERDUE";
export type SafetyAlertSeverity = "MEDIUM" | "HIGH" | "CRITICAL";
export type SafetyAlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export interface AdminSafetyAlertItem {
  id: string;
  organizationId: string;
  tripId: string | null;
  tripCode: string | null;
  vehicleRegistrationNo: string | null;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  employeePhone: string | null;
  driverId: string | null;
  driverCode: string | null;
  driverName: string | null;
  driverPhone: string | null;
  alertType: SafetyAlertType;
  severity: SafetyAlertSeverity;
  status: SafetyAlertStatus;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  notes: string | null;
  acknowledgedBy: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NoShowAppealStatus = "NONE" | "APPEALED" | "OVERTURNED" | "UPHELD";

export interface AdminNoShowRecordItem {
  id: string;
  tripId: string;
  tripCode: string;
  travelDate: string;
  tripStopId: string;
  stopLocationName: string;
  passengerAssignmentId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  driverId: string;
  driverCode: string;
  reasonCode: string;
  driverNotes: string | null;
  waitedSeconds: number;
  distanceFromStopM: number | null;
  geofenceVerified: boolean;
  syncStatus: string;
  appealStatus: NoShowAppealStatus;
  appealNote: string | null;
  appealResolutionNote: string | null;
  markedAt: string;
}

export type ReportType =
  | "daily-operations"
  | "monthly-summary"
  | "attendance"
  | "no-shows"
  | "driver-punctuality"
  | "vehicle-utilization"
  | "vendor-performance"
  | "shift-delays"
  | "cost-per-employee"
  | "trip-history";

export interface ReportsAnalyticsBundle {
  periodStart: string;
  periodEnd: string;
  overview: {
    totalTrips: number;
    completedTrips: number;
    activeTrips: number;
    cancelledTrips: number;
    abortedTrips: number;
    completionRatePct: number;
    scheduledRiders: number;
    boardedRiders: number;
    noShowRiders: number;
    cancelledRiders: number;
    otpVerifiedCount: number;
    otpCompliancePct: number;
    evaluatedArrivalsCount: number;
    onTimePickups: number;
    delayedPickups: number;
    onTimePct: number;
    avgArrivalDelaySeconds: number;
    p95ArrivalDelaySeconds: number;
    avgWaitSeconds: number;
    totalDistanceKm: number;
    estimatedTotalCostPaise: number;
    avgCostPerBoardedRidePaise: number;
  };
  dailySeries: Array<{
    date: string;
    totalTrips: number;
    completedTrips: number;
    boarded: number;
    noShow: number;
    cancelled: number;
    otpCompliancePct: number;
    avgArrivalDelaySeconds: number;
    avgWaitSeconds: number;
    distanceKm: number;
    estimatedCostPaise: number;
  }>;
  monthlySeries: Array<{
    month: string;
    totalTrips: number;
    completedTrips: number;
    boarded: number;
    noShow: number;
    cancelled: number;
    onTimePct: number;
    avgArrivalDelaySeconds: number;
    estimatedCostPaise: number;
  }>;
  shiftDelayPatterns: Array<{
    shiftId: string;
    shiftCode: string;
    shiftName: string;
    shiftTimeLocal: string;
    direction: TripDirection;
    totalTrips: number;
    evaluatedStops: number;
    onTimeStops: number;
    delayedStops: number;
    onTimePct: number;
    avgArrivalDelaySeconds: number;
    avgWaitSeconds: number;
  }>;
  driverPunctuality: Array<{
    driverId: string;
    driverCode: string;
    driverName: string;
    totalTrips: number;
    completedTrips: number;
    evaluatedStops: number;
    onTimeStops: number;
    delayedStops: number;
    onTimePct: number;
    avgArrivalDelaySeconds: number;
    maxArrivalDelaySeconds: number;
    avgWaitSeconds: number;
  }>;
  vendorPerformance: Array<{
    vendorId: string;
    vendorCode: string;
    vendorName: string;
    totalTrips: number;
    completedTrips: number;
    cancelledOrAbortedTrips: number;
    boardedRiders: number;
    noShowRiders: number;
    noShowRatePct: number;
    avgArrivalDelaySeconds: number;
    delayedPickups: number;
    safetyAlertsCount: number;
    totalDistanceKm: number;
    estimatedCostPaise: number;
  }>;
  vehicleUtilization: Array<{
    vehicleId: string;
    registrationNo: string;
    modelName: string;
    vehicleType: string;
    seatingCapacity: number;
    availabilityStatus: string;
    tripsDispatched: number;
    tripsCompleted: number;
    boardedRiders: number;
    maxSeatCapacityAcrossTrips: number;
    seatUtilizationPct: number;
    totalDistanceKm: number;
  }>;
  noShowBreakdown: {
    totalNoShows: number;
    geofenceVerifiedCount: number;
    geofenceVerifiedPct: number;
    avgWaitedSeconds: number;
    byReason: Array<{ reasonCode: string; count: number }>;
    byAppealStatus: Array<{ appealStatus: string; count: number }>;
    repeatOffenders: Array<{
      employeeId: string;
      employeeCode: string;
      employeeName: string;
      noShowCount: number;
      overturnedCount: number;
    }>;
  };
  employeeAttendanceCost: Array<{
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    department: string;
    scheduledRides: number;
    boardedRides: number;
    noShowRides: number;
    cancelledRides: number;
    otpVerifiedRides: number;
    attributedCostPaise: number;
    costPerBoardedRidePaise: number;
  }>;
  delayPredictions: Array<{
    shiftId: string;
    shiftCode: string;
    shiftName: string;
    shiftTimeLocal: string;
    riskLevel: "LOW" | "MODERATE" | "HIGH";
    riskScore: number;
    historicalAvgDelaySeconds: number;
    lateStopRatePct: number;
    rationale: string;
  }>;
  tripHistoryRows: Array<{
    tripId: string;
    tripCode: string;
    travelDate: string;
    shiftName: string;
    direction: string;
    status: string;
    vendorName: string;
    driverName: string;
    vehicleRegistrationNo: string;
    boardedCount: number;
    noShowCount: number;
    avgDelaySeconds: number;
    distanceKm: number;
    estimatedCostPaise: number;
  }>;
}

export interface AssistantQueryResponse {
  intent: string;
  guardedReadOnly: boolean;
  mode: string;
  periodStart: string;
  periodEnd: string;
  answer: string;
  highlights: string[];
  rows: Array<Record<string, unknown>>;
}

export type InvoiceStatus = "DRAFT" | "ISSUED" | "RECONCILED" | "DISPUTED";

export interface BillingSummaryData {
  invoiceCount: number;
  totalInvoicedPaise: number;
  byStatus: Record<InvoiceStatus, { count: number; totalPaise: number }>;
  completedTripsInRange: number;
  unbilledCompletedTrips: number;
  vendors: VendorItem[];
}

export interface VendorInvoiceItem {
  id: string;
  organizationId: string;
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  billingBaseTripPaise: number;
  billingRatePerKmPaise: number;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  totalTrips: number;
  totalDistanceKm: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: string;
  status: InvoiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  tripId: string;
  tripCode: string;
  travelDate: string;
  direction: string;
  shiftName: string;
  driverName: string | null;
  vehicleRegistrationNo: string | null;
  boardedCount: number;
  noShowCount: number;
  delayedStopsCount: number;
  distanceKm: number;
  distanceSource: "GPS_TRACE" | "STOP_CORRIDOR_ESTIMATE";
  baseTripPaise: number;
  ratePerKmPaise: number;
  baseFeePaise: number;
  distanceFeePaise: number;
  lineSubtotalPaise: number;
  disputeFlags: string[];
}

export interface InvoicePreviewResponse {
  vendor: VendorItem;
  periodStart: string;
  periodEnd: string;
  totals: {
    totalTrips: number;
    totalDistanceKm: number;
    subtotalPaise: number;
    taxPaise: number;
    totalPaise: number;
    gstBps: number;
  };
  cancelledOrAbortedCount: number;
  inFlightCount: number;
  lineItems: InvoiceLineItem[];
  overlappingInvoices: Array<{
    id: string;
    invoiceNumber: string;
    periodStart: string;
    periodEnd: string;
    status: InvoiceStatus;
  }>;
}

export interface InvoiceDetailResponse {
  invoice: VendorInvoiceItem & {
    contactName: string;
    contactPhone: string;
  };
  inferredGstBps: number;
  lineItems: InvoiceLineItem[];
  cancelledOrAbortedCount: number;
  inFlightCount: number;
  auditHistory: Array<{
    id: string;
    action: string;
    actorRole: string;
    reason: string | null;
    beforeJson: Record<string, unknown> | null;
    afterJson: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export interface VrptwClusterRecommendation {
  clusterId: string;
  travelDate: string;
  shiftId: string;
  shiftName: string;
  shiftCode: string;
  shiftTimeLocal: string;
  officeId: string;
  officeName: string;
  direction: TripDirection;
  plannedStartAt: string;
  recommendedVehicle: {
    id: string;
    registrationNo: string;
    modelName: string;
    vehicleType: string;
    seatingCapacity: number;
  } | null;
  recommendedDriver: {
    id: string;
    driverCode: string;
    fullName: string;
    assignedVehicleId: string | null;
  } | null;
  seatCount: number;
  vehicleCapacity: number;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  maxDetourRatio: number;
  warnings: string[];
  stops: Array<{
    sequenceNo: number;
    bookingId: string;
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    department: string;
    pickupLocationName: string;
    address: string;
    corridorTag: string | null;
    latitude: number;
    longitude: number;
    scheduledArrivalAt: string;
    legDistanceKm: number;
    legDurationMinutes: number;
  }>;
}

export interface VrptwRecommendationsResponse {
  evaluation: {
    engine: string;
    orToolsSidecarActive: boolean;
    methodology: string;
    totalApprovedBookingsEvaluated: number;
    recommendedClustersCount: number;
    totalEstimatedDistanceKm: number;
    unassignedBookingsCount: number;
  };
  clusters: VrptwClusterRecommendation[];
}

export interface CanonicalLocalityItem {
  id: string;
  organizationId: string;
  canonicalName: string;
  normalizedSlug: string;
  aliases: string[];
  centerLatitude: number;
  centerLongitude: number;
  proximityRadiusM: number;
  isActive: boolean;
}

export interface AutoAllocationStop {
  sequenceNo: number;
  bookingId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  pickupLocationName: string;
  address: string;
  localityId: string | null;
  localityName: string | null;
  latitude: number;
  longitude: number;
  timePreference: BookingTimePreference;
  requestedTimeLocal: string | null;
  isArriveByInfeasible: boolean;
  scheduledArrivalAt: string;
  legDistanceKm: number;
  legDurationMinutes: number;
}

export interface AutoAllocationProposal {
  clusterId: string;
  travelDate: string;
  direction: TripDirection;
  shiftId: string;
  shiftName: string;
  shiftCode: string;
  officeId: string;
  officeName: string;
  primaryLocalityId: string | null;
  primaryLocalityName: string;
  localityNames: string[];
  localityMatchSummary: string;
  seatCount: number;
  plannedStartAt: string;
  plannedEndAt: string;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  maxDetourRatio: number;
  suggestedVehicle: {
    id: string;
    registrationNo: string;
    modelName: string;
    vehicleType: VehicleType | string;
    effectiveCapacity: number;
  };
  suggestedDriver: {
    id: string;
    driverCode: string;
    fullName: string;
    baseLocalityId: string | null;
    baseLocalityName: string | null;
  };
  rationale: {
    localityMatchType:
      | "EXACT_LOCALITY"
      | "NEARBY_LOCALITY"
      | "CROSS_ZONE_FALLBACK"
      | "UNSPECIFIED";
    deadheadKm: number | null;
    intervalCheckPassed: boolean;
    turnaroundBufferMinutes: number;
    groupingReason: string;
    selectionReason: string;
    warnings: string[];
  };
  stops: AutoAllocationStop[];
}

export interface UnallocatedGroupItem {
  clusterId: string;
  travelDate: string;
  direction: TripDirection;
  officeId: string;
  officeName: string;
  shiftId: string;
  shiftName: string;
  primaryLocalityId: string | null;
  primaryLocalityName: string;
  seatCount: number;
  plannedStartAt: string;
  plannedEndAt: string;
  reasonCode: string;
  explanation: string;
  suggestedAction: string;
  bookings: Array<{
    bookingId: string;
    employeeCode: string;
    employeeName: string;
    pickupLocationName: string;
    localityName: string | null;
    scheduledPickupAt: string;
  }>;
}

export interface SpareSeatSuggestionItem {
  tripId: string;
  tripCode: string;
  driverName: string | null;
  vehicleRegistrationNo: string | null;
  vehicleType: string | null;
  currentPassengers: number;
  effectiveCapacity: number;
  spareSeats: number;
  travelDate: string;
  direction: TripDirection;
  candidateBookingIds: string[];
  candidateEmployees: string[];
  estimatedDistanceMeters: number;
  reason: string;
}

export interface AutoAllocationResponse {
  runId: string | null;
  generatedAt: string;
  engineVersion: string;
  configSnapshot: {
    nearbyLocalityRadiusM: number;
    maxRouteDetourRatio: number;
    pickupWindowToleranceMinutes: number;
    driverTurnaroundBufferMinutes: number;
    arriveBySafetyBufferMinutes: number;
  };
  summary: {
    totalConfirmedBookings: number;
    localityGroupsCount: number;
    proposedTripsCount: number;
    allocatedBookingsCount: number;
    unallocatedGroupsCount: number;
    unallocatedBookingsCount: number;
    recommendedSedans: number;
    recommendedSuvs: number;
    recommendedOtherVehicles: number;
    spareSeatSuggestionsCount: number;
  };
  proposals: AutoAllocationProposal[];
  unallocatedGroups: UnallocatedGroupItem[];
  spareSeatSuggestions: SpareSeatSuggestionItem[];
  conflictingBookings: Array<{
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    travelDate: string;
    direction: TripDirection;
    bookingIds: string[];
    reason: string;
  }>;
}

export type AdminCommuteBucket =
  | "NEEDS_ATTENTION"
  | "PENDING_APPROVAL"
  | "READY_TO_DISPATCH"
  | "DISPATCHED"
  | "EXPIRED"
  | "ALL";

export interface OperatorCommuteCardItem {
  commuteKey: string;
  commuteName: string;
  direction: TripDirection;
  localityId: string | null;
  localityName: string;
  officeId: string;
  officeName: string;
  shiftId: string;
  shiftName: string;
  shiftTimeLocal: string;
  timePreference: BookingTimePreference;
  requestedTimeLocal: string;
  timezone: string;
  recurrenceSummary: string;
  selectedDaysOfWeek: string | null;
  startDate: string;
  endDate: string;
  scheduledDatesCount: number;
  employeeCount: number;
  employeePreview: string[];
  counts: {
    pendingApproval: number;
    approved: number;
    dispatched: number;
    rejected: number;
    cancelled: number;
    expired: number;
    infeasibleCount: number;
    unallocatedApprovedCount: number;
    activeTripsCount: number;
    completedTripsCount: number;
  };
  attentionCount: number;
  statusBadge:
    | "NEEDS_ATTENTION"
    | "PENDING_APPROVAL"
    | "READY_TO_DISPATCH"
    | "ALLOCATED"
    | "COMPLETED"
    | "EXPIRED";
}

export interface OperatorCommuteDetailData {
  commute: {
    commuteKey: string;
    commuteName: string;
    direction: TripDirection;
    localityId: string | null;
    localityName: string;
    officeId: string;
    officeName: string;
    shiftId: string;
    shiftName: string;
    shiftTimeLocal: string;
    timePreference: BookingTimePreference;
    requestedTimeLocal: string;
    timezone: string;
    recurrenceSummary: string;
    selectedDaysOfWeek: string | null;
    startDate: string;
    endDate: string;
    scheduledDatesCount: number;
    employeeCount: number;
    counts: {
      pendingApproval: number;
      approved: number;
      dispatched: number;
      rejected: number;
      cancelled: number;
      expired: number;
      infeasibleCount: number;
      unallocatedApprovedCount: number;
    };
  };
  employees: Array<{
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    department: string;
    phone: string | null;
    pickupLocationId: string;
    pickupLocationName: string;
    pickupAddress: string;
    localityName: string;
    seriesId: string | null;
    recurrenceType: string;
    startDate: string | null;
    endDate: string | null;
    selectedDaysOfWeek: string | null;
    counts: {
      pendingApproval: number;
      approved: number;
      dispatched: number;
      rejected: number;
      cancelled: number;
      expired: number;
      infeasible: number;
    };
  }>;
  vehicleRequirements: {
    peakDatePassengers: number;
    recommendedSedans: number;
    recommendedSuvs: number;
    maxSedanSeats: number;
    maxSuvSeats: number;
  };
  driverSuggestions: Array<{
    driverId: string;
    driverCode: string;
    fullName: string;
    availabilityStatus: string;
    baseLocalityId: string | null;
    baseLocalityName: string;
    isLocalityMatch: boolean;
    vehicleId: string | null;
    vehicleRegistrationNo: string | null;
    vehicleModelName: string | null;
    vehicleType: string | null;
    effectiveCapacity: number | null;
  }>;
  dates: Array<{
    travelDate: string;
    dayOfWeek: string;
    dateStatus:
      | "PENDING_APPROVAL"
      | "NEEDS_ALLOCATION"
      | "CONFLICT"
      | "DISPATCHED"
      | "IN_PROGRESS"
      | "COMPLETED"
      | "CANCELLED"
      | "EXPIRED";
    bookings: Array<{
      bookingId: string;
      seriesId: string | null;
      employeeId: string;
      employeeCode: string;
      employeeName: string;
      pickupLocationName: string;
      status: BookingStatus;
      timePreference: BookingTimePreference;
      requestedTimeLocal: string | null;
      scheduledPickupAt: string;
      isArriveByInfeasible: boolean;
      feasibilityNote: string | null;
      assignmentStatus: string | null;
      tripId: string | null;
      tripCode: string | null;
    }>;
    trips: Array<{
      tripId: string;
      tripCode: string;
      status: TripStatus;
      plannedStartAt: string | null;
      driverId: string | null;
      driverName: string | null;
      driverCode: string | null;
      vehicleId: string | null;
      vehicleRegistrationNo: string | null;
      vehicleType: string | null;
      effectiveCapacity: number | null;
      passengerCount: number;
    }>;
  }>;
  auditHistory: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorRole: string;
    reason: string | null;
    createdAt: string;
  }>;
}





