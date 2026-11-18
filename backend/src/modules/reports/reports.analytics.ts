import {
  computeTripDistanceKm,
  escapeCsvField,
  type GeoCoord,
  roundDistanceKm,
} from '../billing/billing.calculator.js';
import type { ReportType } from './reports.schemas.js';

export interface AnalyticsTripRow {
  tripId: string;
  tripCode: string;
  travelDate: string;
  direction: 'LOGIN' | 'LOGOUT';
  status: string;
  officeId: string;
  officeName: string;
  shiftId: string;
  shiftName: string;
  shiftCode: string;
  shiftTimeLocal: string;
  vendorId: string | null;
  vendorName: string | null;
  driverId: string | null;
  driverCode: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehicleRegistrationNo: string | null;
  vehicleType: string | null;
  seatingCapacity: number | null;
  billingBaseTripPaise: number;
  billingRatePerKmPaise: number;
}

export interface AnalyticsAssignmentRow {
  assignmentId: string;
  tripId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  status: string;
  arrivalDelaySeconds: number | null;
  passengerWaitSeconds: number | null;
  runningLateEtaMinutes: number | null;
  otpVerified: boolean;
}

export interface AnalyticsNoShowRow {
  noShowId: string;
  tripId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  reasonCode: string;
  appealStatus: string;
  geofenceVerified: boolean;
  waitedSeconds: number;
  travelDate: string;
}

export interface AnalyticsSafetyAlertRow {
  alertId: string;
  tripId: string | null;
  vendorId: string | null;
  alertType: string;
  severity: string;
  status: string;
  notes: string | null;
  triggeredAt: string;
}

export interface AnalyticsDatasetInput {
  periodStart: string;
  periodEnd: string;
  trips: AnalyticsTripRow[];
  assignments: AnalyticsAssignmentRow[];
  stopsByTrip: Map<string, GeoCoord[]>;
  gpsByTrip: Map<string, GeoCoord[]>;
  noShows: AnalyticsNoShowRow[];
  safetyAlerts: AnalyticsSafetyAlertRow[];
  vendorsCatalog: Array<{
    id: string;
    name: string;
    code: string;
    billingBaseTripPaise: number;
    billingRatePerKmPaise: number;
  }>;
  vehiclesCatalog: Array<{
    id: string;
    registrationNo: string;
    modelName: string;
    vehicleType: string;
    seatingCapacity: number;
    availabilityStatus: string;
    isActive: boolean;
  }>;
  driversCatalog: Array<{
    id: string;
    driverCode: string;
    fullName: string;
    isSuspended: boolean;
    availabilityStatus: string;
  }>;
}

export type DelayRiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

export interface PredictiveDelayAdvisory {
  shiftId: string;
  shiftCode: string;
  shiftName: string;
  shiftTimeLocal: string;
  riskLevel: DelayRiskLevel;
  riskScore: number;
  historicalAvgDelaySeconds: number;
  lateStopRatePct: number;
  rationale: string;
}

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
    direction: 'LOGIN' | 'LOGOUT';
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
  delayPredictions: PredictiveDelayAdvisory[];
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

function pct(num: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.round((num / denom) * 1000) / 10;
}

function avgInt(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx];
}

export function aggregateAnalytics(input: AnalyticsDatasetInput): ReportsAnalyticsBundle {
  const tripById = new Map(input.trips.map((t) => [t.tripId, t]));
  const assignmentsByTrip = new Map<string, AnalyticsAssignmentRow[]>();
  for (const a of input.assignments) {
    const list = assignmentsByTrip.get(a.tripId) ?? [];
    list.push(a);
    assignmentsByTrip.set(a.tripId, list);
  }

  const tripCostById = new Map<string, { distanceKm: number; costPaise: number }>();
  for (const trip of input.trips) {
    const dist = computeTripDistanceKm(
      input.gpsByTrip.get(trip.tripId) ?? [],
      input.stopsByTrip.get(trip.tripId) ?? [],
    );
    const isBillable = trip.status === 'COMPLETED';
    const costPaise = isBillable
      ? trip.billingBaseTripPaise + Math.round(dist.distanceKm * trip.billingRatePerKmPaise)
      : 0;
    tripCostById.set(trip.tripId, { distanceKm: dist.distanceKm, costPaise });
  }

  // Overview KPIs
  const totalTrips = input.trips.length;
  const completedTrips = input.trips.filter((t) => t.status === 'COMPLETED').length;
  const cancelledTrips = input.trips.filter((t) => t.status === 'CANCELLED').length;
  const abortedTrips = input.trips.filter((t) => t.status === 'ABORTED').length;
  const activeTrips = input.trips.filter(
    (t) =>
      t.status === 'ASSIGNED' || t.status === 'DRIVER_ACCEPTED' || t.status === 'IN_PROGRESS',
  ).length;

  const scheduledRiders = input.assignments.length;
  const boardedRiders = input.assignments.filter(
    (a) => a.status === 'BOARDED' || a.status === 'DROPPED',
  ).length;
  const noShowRiders = input.assignments.filter((a) => a.status === 'NO_SHOW').length;
  const cancelledRiders = input.assignments.filter((a) => a.status === 'CANCELLED').length;
  const otpVerifiedCount = input.assignments.filter((a) => a.otpVerified).length;

  const evaluatedArrivals = input.assignments
    .map((a) => a.arrivalDelaySeconds)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const onTimePickups = evaluatedArrivals.filter((v) => v <= 120).length;
  const delayedPickups = evaluatedArrivals.filter((v) => v > 120).length;
  const waitSamples = input.assignments
    .map((a) => a.passengerWaitSeconds)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  let totalDistanceKm = 0;
  let estimatedTotalCostPaise = 0;
  for (const c of tripCostById.values()) {
    totalDistanceKm += c.distanceKm;
    estimatedTotalCostPaise += c.costPaise;
  }
  totalDistanceKm = roundDistanceKm(totalDistanceKm);

  // Daily & Monthly time series
  const dailyMap = new Map<
    string,
    {
      trips: AnalyticsTripRow[];
      assignments: AnalyticsAssignmentRow[];
    }
  >();
  for (const trip of input.trips) {
    const entry = dailyMap.get(trip.travelDate) ?? { trips: [], assignments: [] };
    entry.trips.push(trip);
    dailyMap.set(trip.travelDate, entry);
  }
  for (const a of input.assignments) {
    const trip = tripById.get(a.tripId);
    if (!trip) continue;
    const entry = dailyMap.get(trip.travelDate);
    if (entry) entry.assignments.push(a);
  }

  const dailySeries = [...dailyMap.entries()]
    .sort(([d1], [d2]) => d1.localeCompare(d2))
    .map(([date, bucket]) => {
      const delays = bucket.assignments
        .map((a) => a.arrivalDelaySeconds)
        .filter((v): v is number => v !== null);
      const waits = bucket.assignments
        .map((a) => a.passengerWaitSeconds)
        .filter((v): v is number => v !== null);
      const boarded = bucket.assignments.filter(
        (a) => a.status === 'BOARDED' || a.status === 'DROPPED',
      ).length;
      const otpOk = bucket.assignments.filter((a) => a.otpVerified).length;
      const distKm = roundDistanceKm(
        bucket.trips.reduce((s, t) => s + (tripCostById.get(t.tripId)?.distanceKm ?? 0), 0),
      );
      const costPaise = bucket.trips.reduce(
        (s, t) => s + (tripCostById.get(t.tripId)?.costPaise ?? 0),
        0,
      );

      return {
        date,
        totalTrips: bucket.trips.length,
        completedTrips: bucket.trips.filter((t) => t.status === 'COMPLETED').length,
        boarded,
        noShow: bucket.assignments.filter((a) => a.status === 'NO_SHOW').length,
        cancelled: bucket.assignments.filter((a) => a.status === 'CANCELLED').length,
        otpCompliancePct: pct(otpOk, boarded),
        avgArrivalDelaySeconds: avgInt(delays),
        avgWaitSeconds: avgInt(waits),
        distanceKm: distKm,
        estimatedCostPaise: costPaise,
      };
    });

  const monthlyMap = new Map<
    string,
    {
      totalTrips: number;
      completedTrips: number;
      boarded: number;
      noShow: number;
      cancelled: number;
      onTimeStops: number;
      evalStops: number;
      delays: number[];
      costPaise: number;
    }
  >();
  for (const day of dailySeries) {
    const month = day.date.slice(0, 7);
    const prev = monthlyMap.get(month) ?? {
      totalTrips: 0,
      completedTrips: 0,
      boarded: 0,
      noShow: 0,
      cancelled: 0,
      onTimeStops: 0,
      evalStops: 0,
      delays: [],
      costPaise: 0,
    };
    const dayBucket = dailyMap.get(day.date);
    const dayDelays =
      dayBucket?.assignments
        .map((a) => a.arrivalDelaySeconds)
        .filter((v): v is number => v !== null) ?? [];
    prev.totalTrips += day.totalTrips;
    prev.completedTrips += day.completedTrips;
    prev.boarded += day.boarded;
    prev.noShow += day.noShow;
    prev.cancelled += day.cancelled;
    prev.evalStops += dayDelays.length;
    prev.onTimeStops += dayDelays.filter((v) => v <= 120).length;
    prev.delays.push(...dayDelays);
    prev.costPaise += day.estimatedCostPaise;
    monthlyMap.set(month, prev);
  }

  const monthlySeries = [...monthlyMap.entries()]
    .sort(([m1], [m2]) => m1.localeCompare(m2))
    .map(([month, m]) => ({
      month,
      totalTrips: m.totalTrips,
      completedTrips: m.completedTrips,
      boarded: m.boarded,
      noShow: m.noShow,
      cancelled: m.cancelled,
      onTimePct: pct(m.onTimeStops, m.evalStops),
      avgArrivalDelaySeconds: avgInt(m.delays),
      estimatedCostPaise: m.costPaise,
    }));

  // Shift delay patterns & predictive advisories
  const shiftMap = new Map<
    string,
    {
      meta: Pick<AnalyticsTripRow, 'shiftId' | 'shiftCode' | 'shiftName' | 'shiftTimeLocal' | 'direction'>;
      totalTrips: number;
      delays: number[];
      waits: number[];
      runningLateCount: number;
    }
  >();
  for (const t of input.trips) {
    const item = shiftMap.get(t.shiftId) ?? {
      meta: {
        shiftId: t.shiftId,
        shiftCode: t.shiftCode,
        shiftName: t.shiftName,
        shiftTimeLocal: t.shiftTimeLocal,
        direction: t.direction,
      },
      totalTrips: 0,
      delays: [],
      waits: [],
      runningLateCount: 0,
    };
    item.totalTrips += 1;
    for (const a of assignmentsByTrip.get(t.tripId) ?? []) {
      if (a.arrivalDelaySeconds !== null) item.delays.push(a.arrivalDelaySeconds);
      if (a.passengerWaitSeconds !== null) item.waits.push(a.passengerWaitSeconds);
      if ((a.runningLateEtaMinutes ?? 0) > 0) item.runningLateCount += 1;
    }
    shiftMap.set(t.shiftId, item);
  }

  const shiftDelayPatterns = [...shiftMap.values()]
    .sort((a, b) => a.meta.shiftTimeLocal.localeCompare(b.meta.shiftTimeLocal))
    .map((s) => {
      const onTimeStops = s.delays.filter((d) => d <= 120).length;
      const delayedStops = s.delays.filter((d) => d > 120).length;
      return {
        ...s.meta,
        totalTrips: s.totalTrips,
        evaluatedStops: s.delays.length,
        onTimeStops,
        delayedStops,
        onTimePct: pct(onTimeStops, s.delays.length),
        avgArrivalDelaySeconds: avgInt(s.delays),
        avgWaitSeconds: avgInt(s.waits),
      };
    });

  const delayPredictions: PredictiveDelayAdvisory[] = [...shiftMap.values()]
    .map((s) => {
      const avgDelay = avgInt(s.delays);
      const lateRatePct = pct(
        s.delays.filter((d) => d > 120).length,
        s.delays.length,
      );
      const alertPressure = Math.min(25, s.runningLateCount * 8);
      const riskScore = Math.min(
        100,
        Math.round((Math.max(0, avgDelay) / 6) * 0.55 + lateRatePct * 0.45 + alertPressure),
      );
      const riskLevel: DelayRiskLevel =
        riskScore >= 55 || avgDelay >= 240
          ? 'HIGH'
          : riskScore >= 25 || avgDelay >= 90
            ? 'MODERATE'
            : 'LOW';

      const rationale =
        s.delays.length === 0
          ? 'No historical stop arrival samples recorded yet in this window.'
          : `${lateRatePct}% of evaluated pickups exceeded +120s (avg +${avgDelay}s${
              s.runningLateCount > 0 ? `, ${s.runningLateCount} passenger late notice(s)` : ''
            }).`;

      return {
        shiftId: s.meta.shiftId,
        shiftCode: s.meta.shiftCode,
        shiftName: s.meta.shiftName,
        shiftTimeLocal: s.meta.shiftTimeLocal,
        riskLevel,
        riskScore,
        historicalAvgDelaySeconds: avgDelay,
        lateStopRatePct: lateRatePct,
        rationale,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);

  // Driver punctuality
  const driverStats = new Map<
    string,
    {
      driverId: string;
      driverCode: string;
      driverName: string;
      totalTrips: number;
      completedTrips: number;
      delays: number[];
      waits: number[];
    }
  >();
  for (const d of input.driversCatalog) {
    driverStats.set(d.id, {
      driverId: d.id,
      driverCode: d.driverCode,
      driverName: d.fullName,
      totalTrips: 0,
      completedTrips: 0,
      delays: [],
      waits: [],
    });
  }
  for (const t of input.trips) {
    if (!t.driverId) continue;
    const entry = driverStats.get(t.driverId) ?? {
      driverId: t.driverId,
      driverCode: t.driverCode ?? 'DRV',
      driverName: t.driverName ?? 'Assigned Driver',
      totalTrips: 0,
      completedTrips: 0,
      delays: [],
      waits: [],
    };
    entry.totalTrips += 1;
    if (t.status === 'COMPLETED') entry.completedTrips += 1;
    for (const a of assignmentsByTrip.get(t.tripId) ?? []) {
      if (a.arrivalDelaySeconds !== null) entry.delays.push(a.arrivalDelaySeconds);
      if (a.passengerWaitSeconds !== null) entry.waits.push(a.passengerWaitSeconds);
    }
    driverStats.set(t.driverId, entry);
  }
  const driverPunctuality = [...driverStats.values()]
    .map((d) => {
      const onTimeStops = d.delays.filter((v) => v <= 120).length;
      const delayedStops = d.delays.filter((v) => v > 120).length;
      return {
        driverId: d.driverId,
        driverCode: d.driverCode,
        driverName: d.driverName,
        totalTrips: d.totalTrips,
        completedTrips: d.completedTrips,
        evaluatedStops: d.delays.length,
        onTimeStops,
        delayedStops,
        onTimePct: pct(onTimeStops, d.delays.length),
        avgArrivalDelaySeconds: avgInt(d.delays),
        maxArrivalDelaySeconds: d.delays.length > 0 ? Math.max(...d.delays) : 0,
        avgWaitSeconds: avgInt(d.waits),
      };
    })
    .sort((a, b) => b.totalTrips - a.totalTrips || a.avgArrivalDelaySeconds - b.avgArrivalDelaySeconds);

  // Vendor performance
  const vendorStats = new Map<
    string,
    {
      vendorId: string;
      vendorCode: string;
      vendorName: string;
      totalTrips: number;
      completedTrips: number;
      cancelledOrAbortedTrips: number;
      boardedRiders: number;
      noShowRiders: number;
      delays: number[];
      safetyAlertsCount: number;
      totalDistanceKm: number;
      estimatedCostPaise: number;
    }
  >();
  for (const v of input.vendorsCatalog) {
    vendorStats.set(v.id, {
      vendorId: v.id,
      vendorCode: v.code,
      vendorName: v.name,
      totalTrips: 0,
      completedTrips: 0,
      cancelledOrAbortedTrips: 0,
      boardedRiders: 0,
      noShowRiders: 0,
      delays: [],
      safetyAlertsCount: 0,
      totalDistanceKm: 0,
      estimatedCostPaise: 0,
    });
  }
  for (const t of input.trips) {
    if (!t.vendorId) continue;
    const entry = vendorStats.get(t.vendorId);
    if (!entry) continue;
    entry.totalTrips += 1;
    if (t.status === 'COMPLETED') entry.completedTrips += 1;
    if (t.status === 'CANCELLED' || t.status === 'ABORTED') entry.cancelledOrAbortedTrips += 1;
    const cost = tripCostById.get(t.tripId);
    entry.totalDistanceKm = roundDistanceKm(entry.totalDistanceKm + (cost?.distanceKm ?? 0));
    entry.estimatedCostPaise += cost?.costPaise ?? 0;
    for (const a of assignmentsByTrip.get(t.tripId) ?? []) {
      if (a.status === 'BOARDED' || a.status === 'DROPPED') entry.boardedRiders += 1;
      if (a.status === 'NO_SHOW') entry.noShowRiders += 1;
      if (a.arrivalDelaySeconds !== null) entry.delays.push(a.arrivalDelaySeconds);
    }
  }
  for (const s of input.safetyAlerts) {
    const trip = s.tripId ? tripById.get(s.tripId) : undefined;
    const vId = s.vendorId ?? trip?.vendorId ?? null;
    if (vId && vendorStats.has(vId)) {
      vendorStats.get(vId)!.safetyAlertsCount += 1;
    }
  }
  const vendorPerformance = [...vendorStats.values()]
    .map((v) => ({
      vendorId: v.vendorId,
      vendorCode: v.vendorCode,
      vendorName: v.vendorName,
      totalTrips: v.totalTrips,
      completedTrips: v.completedTrips,
      cancelledOrAbortedTrips: v.cancelledOrAbortedTrips,
      boardedRiders: v.boardedRiders,
      noShowRiders: v.noShowRiders,
      noShowRatePct: pct(v.noShowRiders, v.boardedRiders + v.noShowRiders),
      avgArrivalDelaySeconds: avgInt(v.delays),
      delayedPickups: v.delays.filter((d) => d > 120).length,
      safetyAlertsCount: v.safetyAlertsCount,
      totalDistanceKm: v.totalDistanceKm,
      estimatedCostPaise: v.estimatedCostPaise,
    }))
    .sort((a, b) => b.totalTrips - a.totalTrips);

  // Vehicle utilization
  const vehStats = new Map<
    string,
    {
      vehicleId: string;
      registrationNo: string;
      modelName: string;
      vehicleType: string;
      seatingCapacity: number;
      availabilityStatus: string;
      tripsDispatched: number;
      tripsCompleted: number;
      boardedRiders: number;
      totalDistanceKm: number;
    }
  >();
  for (const v of input.vehiclesCatalog) {
    vehStats.set(v.id, {
      vehicleId: v.id,
      registrationNo: v.registrationNo,
      modelName: v.modelName,
      vehicleType: v.vehicleType,
      seatingCapacity: v.seatingCapacity,
      availabilityStatus: v.availabilityStatus,
      tripsDispatched: 0,
      tripsCompleted: 0,
      boardedRiders: 0,
      totalDistanceKm: 0,
    });
  }
  for (const t of input.trips) {
    if (!t.vehicleId) continue;
    const entry = vehStats.get(t.vehicleId);
    if (!entry) continue;
    entry.tripsDispatched += 1;
    if (t.status === 'COMPLETED') entry.tripsCompleted += 1;
    entry.totalDistanceKm = roundDistanceKm(
      entry.totalDistanceKm + (tripCostById.get(t.tripId)?.distanceKm ?? 0),
    );
    entry.boardedRiders += (assignmentsByTrip.get(t.tripId) ?? []).filter(
      (a) => a.status === 'BOARDED' || a.status === 'DROPPED',
    ).length;
  }
  const vehicleUtilization = [...vehStats.values()].map((v) => {
    const maxSeats = v.tripsDispatched * v.seatingCapacity;
    return {
      ...v,
      maxSeatCapacityAcrossTrips: maxSeats,
      seatUtilizationPct: pct(v.boardedRiders, maxSeats),
    };
  });

  // No-Show breakdown
  const reasonMap = new Map<string, number>();
  const appealMap = new Map<string, number>();
  const empNoShows = new Map<
    string,
    { employeeId: string; employeeCode: string; employeeName: string; count: number; overturned: number }
  >();
  for (const ns of input.noShows) {
    reasonMap.set(ns.reasonCode, (reasonMap.get(ns.reasonCode) ?? 0) + 1);
    appealMap.set(ns.appealStatus, (appealMap.get(ns.appealStatus) ?? 0) + 1);
    const emp = empNoShows.get(ns.employeeId) ?? {
      employeeId: ns.employeeId,
      employeeCode: ns.employeeCode,
      employeeName: ns.employeeName,
      count: 0,
      overturned: 0,
    };
    emp.count += 1;
    if (ns.appealStatus === 'OVERTURNED') emp.overturned += 1;
    empNoShows.set(ns.employeeId, emp);
  }

  const noShowBreakdown = {
    totalNoShows: input.noShows.length,
    geofenceVerifiedCount: input.noShows.filter((n) => n.geofenceVerified).length,
    geofenceVerifiedPct: pct(
      input.noShows.filter((n) => n.geofenceVerified).length,
      input.noShows.length,
    ),
    avgWaitedSeconds: avgInt(input.noShows.map((n) => n.waitedSeconds)),
    byReason: [...reasonMap.entries()].map(([reasonCode, count]) => ({ reasonCode, count })),
    byAppealStatus: [...appealMap.entries()].map(([appealStatus, count]) => ({
      appealStatus,
      count,
    })),
    repeatOffenders: [...empNoShows.values()]
      .sort((a, b) => b.count - a.count)
      .map((e) => ({
        employeeId: e.employeeId,
        employeeCode: e.employeeCode,
        employeeName: e.employeeName,
        noShowCount: e.count,
        overturnedCount: e.overturned,
      })),
  };

  // Cost per employee & attendance
  const empStats = new Map<
    string,
    {
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
    }
  >();
  for (const [tripId, tripAssignments] of assignmentsByTrip.entries()) {
    const trip = tripById.get(tripId);
    const tripCost = tripCostById.get(tripId)?.costPaise ?? 0;
    const boardedOnTrip = tripAssignments.filter(
      (a) => a.status === 'BOARDED' || a.status === 'DROPPED',
    );
    const costDenom = boardedOnTrip.length > 0 ? boardedOnTrip.length : tripAssignments.length;
    const perRiderSharePaise =
      trip?.status === 'COMPLETED' && costDenom > 0 ? Math.round(tripCost / costDenom) : 0;

    for (const a of tripAssignments) {
      const entry = empStats.get(a.employeeId) ?? {
        employeeId: a.employeeId,
        employeeCode: a.employeeCode,
        employeeName: a.employeeName,
        department: a.department,
        scheduledRides: 0,
        boardedRides: 0,
        noShowRides: 0,
        cancelledRides: 0,
        otpVerifiedRides: 0,
        attributedCostPaise: 0,
      };
      entry.scheduledRides += 1;
      const isBoarded = a.status === 'BOARDED' || a.status === 'DROPPED';
      if (isBoarded) {
        entry.boardedRides += 1;
        entry.attributedCostPaise += perRiderSharePaise;
      } else if (a.status === 'NO_SHOW') {
        entry.noShowRides += 1;
      } else if (a.status === 'CANCELLED') {
        entry.cancelledRides += 1;
      }
      if (a.otpVerified) entry.otpVerifiedRides += 1;
      empStats.set(a.employeeId, entry);
    }
  }

  const employeeAttendanceCost = [...empStats.values()]
    .map((e) => ({
      ...e,
      costPerBoardedRidePaise:
        e.boardedRides > 0 ? Math.round(e.attributedCostPaise / e.boardedRides) : 0,
    }))
    .sort((a, b) => b.attributedCostPaise - a.attributedCostPaise || b.scheduledRides - a.scheduledRides);

  const tripHistoryRows = input.trips.map((t) => {
    const assign = assignmentsByTrip.get(t.tripId) ?? [];
    const delays = assign
      .map((a) => a.arrivalDelaySeconds)
      .filter((v): v is number => v !== null);
    const c = tripCostById.get(t.tripId);
    return {
      tripId: t.tripId,
      tripCode: t.tripCode,
      travelDate: t.travelDate,
      shiftName: t.shiftName,
      direction: t.direction,
      status: t.status,
      vendorName: t.vendorName ?? 'Unassigned',
      driverName: t.driverName ?? 'Unassigned',
      vehicleRegistrationNo: t.vehicleRegistrationNo ?? 'Unassigned',
      boardedCount: assign.filter((a) => a.status === 'BOARDED' || a.status === 'DROPPED').length,
      noShowCount: assign.filter((a) => a.status === 'NO_SHOW').length,
      avgDelaySeconds: avgInt(delays),
      distanceKm: c?.distanceKm ?? 0,
      estimatedCostPaise: c?.costPaise ?? 0,
    };
  });

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    overview: {
      totalTrips,
      completedTrips,
      activeTrips,
      cancelledTrips,
      abortedTrips,
      completionRatePct: pct(completedTrips, totalTrips),
      scheduledRiders,
      boardedRiders,
      noShowRiders,
      cancelledRiders,
      otpVerifiedCount,
      otpCompliancePct: pct(otpVerifiedCount, boardedRiders),
      evaluatedArrivalsCount: evaluatedArrivals.length,
      onTimePickups,
      delayedPickups,
      onTimePct: pct(onTimePickups, evaluatedArrivals.length),
      avgArrivalDelaySeconds: avgInt(evaluatedArrivals),
      p95ArrivalDelaySeconds: percentile95(evaluatedArrivals),
      avgWaitSeconds: avgInt(waitSamples),
      totalDistanceKm,
      estimatedTotalCostPaise,
      avgCostPerBoardedRidePaise:
        boardedRiders > 0 ? Math.round(estimatedTotalCostPaise / boardedRiders) : 0,
    },
    dailySeries,
    monthlySeries,
    shiftDelayPatterns,
    driverPunctuality,
    vendorPerformance,
    vehicleUtilization,
    noShowBreakdown,
    employeeAttendanceCost,
    delayPredictions,
    tripHistoryRows,
  };
}

export interface TypedReportResult {
  reportType: ReportType;
  title: string;
  periodStart: string;
  periodEnd: string;
  columns: string[];
  rows: Array<Record<string, string | number | boolean>>;
  csv: string;
}

function toCsv(columns: string[], rows: Array<Record<string, string | number | boolean>>): string {
  const lines = [
    columns.map((c) => escapeCsvField(c)).join(','),
    ...rows.map((r) => columns.map((c) => escapeCsvField(r[c] ?? '')).join(',')),
  ];
  return lines.join('\r\n');
}

export function buildTypedReport(
  reportType: ReportType,
  bundle: ReportsAnalyticsBundle,
): TypedReportResult {
  let title = '';
  let columns: string[] = [];
  let rows: Array<Record<string, string | number | boolean>> = [];

  switch (reportType) {
    case 'daily-operations':
      title = 'Daily Transportation Report';
      columns = [
        'date',
        'totalTrips',
        'completedTrips',
        'boarded',
        'noShow',
        'cancelled',
        'otpCompliancePct',
        'avgArrivalDelaySeconds',
        'avgWaitSeconds',
        'distanceKm',
        'estimatedCostInr',
      ];
      rows = bundle.dailySeries.map((d) => ({
        date: d.date,
        totalTrips: d.totalTrips,
        completedTrips: d.completedTrips,
        boarded: d.boarded,
        noShow: d.noShow,
        cancelled: d.cancelled,
        otpCompliancePct: d.otpCompliancePct,
        avgArrivalDelaySeconds: d.avgArrivalDelaySeconds,
        avgWaitSeconds: d.avgWaitSeconds,
        distanceKm: d.distanceKm,
        estimatedCostInr: (d.estimatedCostPaise / 100).toFixed(2),
      }));
      break;
    case 'monthly-summary':
      title = 'Monthly Transportation Summary';
      columns = [
        'month',
        'totalTrips',
        'completedTrips',
        'boarded',
        'noShow',
        'cancelled',
        'onTimePct',
        'avgArrivalDelaySeconds',
        'estimatedCostInr',
      ];
      rows = bundle.monthlySeries.map((m) => ({
        month: m.month,
        totalTrips: m.totalTrips,
        completedTrips: m.completedTrips,
        boarded: m.boarded,
        noShow: m.noShow,
        cancelled: m.cancelled,
        onTimePct: m.onTimePct,
        avgArrivalDelaySeconds: m.avgArrivalDelaySeconds,
        estimatedCostInr: (m.estimatedCostPaise / 100).toFixed(2),
      }));
      break;
    case 'attendance':
    case 'cost-per-employee':
      title =
        reportType === 'attendance'
          ? 'Employee Attendance Records'
          : 'Cost Per Employee Breakdown';
      columns = [
        'employeeCode',
        'employeeName',
        'department',
        'scheduledRides',
        'boardedRides',
        'noShowRides',
        'cancelledRides',
        'otpVerifiedRides',
        'attributedCostInr',
        'costPerBoardedRideInr',
      ];
      rows = bundle.employeeAttendanceCost.map((e) => ({
        employeeCode: e.employeeCode,
        employeeName: e.employeeName,
        department: e.department,
        scheduledRides: e.scheduledRides,
        boardedRides: e.boardedRides,
        noShowRides: e.noShowRides,
        cancelledRides: e.cancelledRides,
        otpVerifiedRides: e.otpVerifiedRides,
        attributedCostInr: (e.attributedCostPaise / 100).toFixed(2),
        costPerBoardedRideInr: (e.costPerBoardedRidePaise / 100).toFixed(2),
      }));
      break;
    case 'no-shows':
      title = 'No-Show Audit & Repeat Offenders Report';
      columns = ['employeeCode', 'employeeName', 'noShowCount', 'overturnedCount'];
      rows = bundle.noShowBreakdown.repeatOffenders.map((n) => ({
        employeeCode: n.employeeCode,
        employeeName: n.employeeName,
        noShowCount: n.noShowCount,
        overturnedCount: n.overturnedCount,
      }));
      break;
    case 'driver-punctuality':
      title = 'Driver Punctuality & Wait Time Report';
      columns = [
        'driverCode',
        'driverName',
        'totalTrips',
        'completedTrips',
        'evaluatedStops',
        'onTimePct',
        'avgArrivalDelaySeconds',
        'maxArrivalDelaySeconds',
        'avgWaitSeconds',
      ];
      rows = bundle.driverPunctuality.map((d) => ({
        driverCode: d.driverCode,
        driverName: d.driverName,
        totalTrips: d.totalTrips,
        completedTrips: d.completedTrips,
        evaluatedStops: d.evaluatedStops,
        onTimePct: d.onTimePct,
        avgArrivalDelaySeconds: d.avgArrivalDelaySeconds,
        maxArrivalDelaySeconds: d.maxArrivalDelaySeconds,
        avgWaitSeconds: d.avgWaitSeconds,
      }));
      break;
    case 'vehicle-utilization':
      title = 'Vehicle Seat Utilization Report';
      columns = [
        'registrationNo',
        'modelName',
        'vehicleType',
        'seatingCapacity',
        'tripsDispatched',
        'tripsCompleted',
        'boardedRiders',
        'seatUtilizationPct',
        'totalDistanceKm',
      ];
      rows = bundle.vehicleUtilization.map((v) => ({
        registrationNo: v.registrationNo,
        modelName: v.modelName,
        vehicleType: v.vehicleType,
        seatingCapacity: v.seatingCapacity,
        tripsDispatched: v.tripsDispatched,
        tripsCompleted: v.tripsCompleted,
        boardedRiders: v.boardedRiders,
        seatUtilizationPct: v.seatUtilizationPct,
        totalDistanceKm: v.totalDistanceKm,
      }));
      break;
    case 'vendor-performance':
      title = 'Vendor SLA & Cost Performance Report';
      columns = [
        'vendorCode',
        'vendorName',
        'totalTrips',
        'completedTrips',
        'cancelledOrAbortedTrips',
        'noShowRatePct',
        'avgArrivalDelaySeconds',
        'delayedPickups',
        'safetyAlertsCount',
        'totalDistanceKm',
        'estimatedCostInr',
      ];
      rows = bundle.vendorPerformance.map((v) => ({
        vendorCode: v.vendorCode,
        vendorName: v.vendorName,
        totalTrips: v.totalTrips,
        completedTrips: v.completedTrips,
        cancelledOrAbortedTrips: v.cancelledOrAbortedTrips,
        noShowRatePct: v.noShowRatePct,
        avgArrivalDelaySeconds: v.avgArrivalDelaySeconds,
        delayedPickups: v.delayedPickups,
        safetyAlertsCount: v.safetyAlertsCount,
        totalDistanceKm: v.totalDistanceKm,
        estimatedCostInr: (v.estimatedCostPaise / 100).toFixed(2),
      }));
      break;
    case 'shift-delays':
      title = 'Shift-Level Delay Decomposition Report';
      columns = [
        'shiftCode',
        'shiftName',
        'shiftTimeLocal',
        'direction',
        'totalTrips',
        'evaluatedStops',
        'onTimePct',
        'avgArrivalDelaySeconds',
        'avgWaitSeconds',
      ];
      rows = bundle.shiftDelayPatterns.map((s) => ({
        shiftCode: s.shiftCode,
        shiftName: s.shiftName,
        shiftTimeLocal: s.shiftTimeLocal,
        direction: s.direction,
        totalTrips: s.totalTrips,
        evaluatedStops: s.evaluatedStops,
        onTimePct: s.onTimePct,
        avgArrivalDelaySeconds: s.avgArrivalDelaySeconds,
        avgWaitSeconds: s.avgWaitSeconds,
      }));
      break;
    case 'trip-history':
      title = 'Trip History & Cost Attribution Ledger';
      columns = [
        'tripCode',
        'travelDate',
        'shiftName',
        'direction',
        'status',
        'vendorName',
        'driverName',
        'vehicleRegistrationNo',
        'boardedCount',
        'noShowCount',
        'avgDelaySeconds',
        'distanceKm',
        'estimatedCostInr',
      ];
      rows = bundle.tripHistoryRows.map((t) => ({
        tripCode: t.tripCode,
        travelDate: t.travelDate,
        shiftName: t.shiftName,
        direction: t.direction,
        status: t.status,
        vendorName: t.vendorName,
        driverName: t.driverName,
        vehicleRegistrationNo: t.vehicleRegistrationNo,
        boardedCount: t.boardedCount,
        noShowCount: t.noShowCount,
        avgDelaySeconds: t.avgDelaySeconds,
        distanceKm: t.distanceKm,
        estimatedCostInr: (t.estimatedCostPaise / 100).toFixed(2),
      }));
      break;
  }

  return {
    reportType,
    title,
    periodStart: bundle.periodStart,
    periodEnd: bundle.periodEnd,
    columns,
    rows,
    csv: toCsv(columns, rows),
  };
}

export type AssistantIntent =
  | 'MUTATION_BLOCKED'
  | 'DELAYED_DRIVERS'
  | 'REPEATED_NOSHOWS'
  | 'AVAILABLE_VEHICLES'
  | 'VENDOR_DELAY_RANKING'
  | 'SHIFT_DELAY_CAUSE'
  | 'SAFETY_OVERVIEW'
  | 'BILLING_OVERVIEW'
  | 'GENERAL_OVERVIEW';

const MUTATION_GUARD_REGEX =
  /\b(drop\s+table|truncate|delete\s+from|insert\s+into|update\s+\w+\s+set|alter\s+table|cancel\s+(all\s+|this\s+)?(trip|booking|trips|bookings)|approve\s+(all\s+|this\s+)?booking|reject\s+booking|overturn\s+no[\s-]?show|suspend\s+driver|create\s+invoice|modify\s+dispatch|mark\s+reconciled|reconcile\s+invoice)\b/i;

export function classifyAssistantQuestion(question: string): {
  intent: AssistantIntent;
  blocked: boolean;
  reason?: string;
} {
  const q = question.trim();
  if (MUTATION_GUARD_REGEX.test(q)) {
    return {
      intent: 'MUTATION_BLOCKED',
      blocked: true,
      reason:
        'AI Operational Assistant is strictly read-only. State changes (cancelling trips, approving bookings, suspending drivers, reconciling invoices, or overturning no-shows) must be reviewed and executed by an authorized operator in the workbench.',
    };
  }

  const lower = q.toLowerCase();
  if (/(driver|cab).*delay|delayed driver|late driver/.test(lower)) {
    return { intent: 'DELAYED_DRIVERS', blocked: false };
  }
  if (/no[\s-]?show|repeated no/.test(lower)) {
    return { intent: 'REPEATED_NOSHOWS', blocked: false };
  }
  if (/vehicle.*avail|available vehicle|free cab|how many cab|fleet avail/.test(lower)) {
    return { intent: 'AVAILABLE_VEHICLES', blocked: false };
  }
  if (/vendor.*(late|delay|freq|sla|worst|highest)/.test(lower)) {
    return { intent: 'VENDOR_DELAY_RANKING', blocked: false };
  }
  if (/why.*shift|shift.*delay|9\s*am|morning.*delay|delay pattern|cause.*delay/.test(lower)) {
    return { intent: 'SHIFT_DELAY_CAUSE', blocked: false };
  }
  if (/sos|safety|alert|deviation|stoppage/.test(lower)) {
    return { intent: 'SAFETY_OVERVIEW', blocked: false };
  }
  if (/invoice|billing|spend|cost|rupee|paise/.test(lower)) {
    return { intent: 'BILLING_OVERVIEW', blocked: false };
  }
  return { intent: 'GENERAL_OVERVIEW', blocked: false };
}
