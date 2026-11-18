import { haversineDistanceMeters } from '../../infrastructure/shared/maps.util.js';
import { normalizeLocalitySlug } from '../localities/localities.utils.js';
import {
  estimateRoadKm,
  estimateRoadTravelMinutes,
  STOP_DWELL_MINUTES,
  twoOptOptimizeStops,
  type VrptwBookingCandidate,
} from '../routing/vrptw.solver.js';
import { resolveEffectiveVehicleCapacity } from '../vehicles/vehicles.module.js';

export interface AllocationPolicyConfig {
  nearbyLocalityRadiusM: number;
  maxRouteDetourRatio: number;
  pickupWindowToleranceMinutes: number;
  driverTurnaroundBufferMinutes: number;
  arriveBySafetyBufferMinutes: number;
}

export const DEFAULT_ALLOCATION_POLICY: AllocationPolicyConfig = {
  nearbyLocalityRadiusM: 4000,
  maxRouteDetourRatio: 1.75,
  pickupWindowToleranceMinutes: 15,
  driverTurnaroundBufferMinutes: 20,
  arriveBySafetyBufferMinutes: 10,
};

export interface AllocationBookingCandidate {
  bookingId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  officeId: string;
  officeName: string;
  officeLatitude: number;
  officeLongitude: number;
  shiftId: string;
  shiftName: string;
  shiftCode: string;
  shiftTimeLocal: string;
  travelDate: string;
  direction: 'LOGIN' | 'LOGOUT';
  timePreference: 'PICKUP_AT' | 'ARRIVE_BY';
  requestedTimeLocal: string | null;
  timezone: string;
  requestedPickupAt: string | null;
  scheduledPickupAt: string;
  isArriveByInfeasible: boolean;
  feasibilityNote: string | null;
  pickupLocationId: string;
  pickupLocationName: string;
  address: string;
  corridorTag: string | null;
  localityId: string | null;
  normalizedLocality: string | null;
  latitude: number;
  longitude: number;
}

export interface AllocationVehicleCandidate {
  id: string;
  vendorId: string;
  registrationNo: string;
  modelName: string;
  vehicleType: string;
  seatingCapacity: number;
  availabilityStatus: string;
  isActive: boolean;
}

export interface AllocationDriverCandidate {
  id: string;
  vendorId: string;
  driverCode: string;
  fullName: string;
  assignedVehicleId: string | null;
  baseLocalityId: string | null;
  baseLocalityName: string | null;
  baseLatitude: number | null;
  baseLongitude: number | null;
  availabilityStatus: string;
  isSuspended: boolean;
}

export interface AllocationExistingTrip {
  tripId: string;
  tripCode: string;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehicleRegistrationNo: string | null;
  vehicleType: string | null;
  seatingCapacity: number | null;
  passengerCount: number;
  status: string;
  travelDate: string;
  direction: 'LOGIN' | 'LOGOUT';
  officeId: string;
  officeName: string;
  shiftId: string;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  primaryLocalityId: string | null;
  primaryLocalityName: string | null;
  stopCoords: Array<{ latitude: number; longitude: number }>;
}

export interface AllocationProposedStop {
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
  timePreference: 'PICKUP_AT' | 'ARRIVE_BY';
  requestedTimeLocal: string | null;
  isArriveByInfeasible: boolean;
  scheduledArrivalAt: string;
  legDistanceKm: number;
  legDurationMinutes: number;
}

export interface AllocationProposal {
  clusterId: string;
  travelDate: string;
  direction: 'LOGIN' | 'LOGOUT';
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
    vehicleType: string;
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
    localityMatchType: 'EXACT_LOCALITY' | 'NEARBY_LOCALITY' | 'CROSS_ZONE_FALLBACK' | 'UNSPECIFIED';
    deadheadKm: number | null;
    intervalCheckPassed: boolean;
    turnaroundBufferMinutes: number;
    groupingReason: string;
    selectionReason: string;
    warnings: string[];
  };
  stops: AllocationProposedStop[];
}

export interface UnallocatedGroup {
  clusterId: string;
  travelDate: string;
  direction: 'LOGIN' | 'LOGOUT';
  officeId: string;
  officeName: string;
  shiftId: string;
  shiftName: string;
  primaryLocalityId: string | null;
  primaryLocalityName: string;
  seatCount: number;
  plannedStartAt: string;
  plannedEndAt: string;
  reasonCode:
    | 'NO_AVAILABLE_DRIVER_IN_WINDOW'
    | 'NO_VEHICLE_FITTING_CAPACITY'
    | 'NO_AVAILABLE_DRIVER_OR_VEHICLE';
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

export interface SpareSeatSuggestion {
  tripId: string;
  tripCode: string;
  driverName: string | null;
  vehicleRegistrationNo: string | null;
  vehicleType: string | null;
  currentPassengers: number;
  effectiveCapacity: number;
  spareSeats: number;
  travelDate: string;
  direction: 'LOGIN' | 'LOGOUT';
  candidateBookingIds: string[];
  candidateEmployees: string[];
  estimatedDistanceMeters: number;
  reason: string;
}

export interface AllocationSolveResult {
  engineVersion: 'LOCALITY_INTERVAL_V1';
  configSnapshot: AllocationPolicyConfig;
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
  proposals: AllocationProposal[];
  unallocatedGroups: UnallocatedGroup[];
  spareSeatSuggestions: SpareSeatSuggestion[];
}

interface InternalCluster {
  clusterId: string;
  travelDate: string;
  direction: 'LOGIN' | 'LOGOUT';
  officeId: string;
  officeName: string;
  officeLatitude: number;
  officeLongitude: number;
  shiftId: string;
  shiftName: string;
  shiftCode: string;
  primaryLocalityKey: string;
  primaryLocalityId: string | null;
  primaryLocalityName: string;
  localityNames: string[];
  groupingReason: string;
  bookings: AllocationBookingCandidate[];
}

interface BusyInterval {
  driverId: string | null;
  vehicleId: string | null;
  startMs: number;
  endMs: number;
  tripCode: string;
}

const NON_TERMINAL_TRIP_STATUSES = new Set([
  'CREATED',
  'ASSIGNED',
  'DRIVER_ACCEPTED',
  'IN_PROGRESS',
]);

export function intervalsOverlapWithBuffer(
  startAMs: number,
  endAMs: number,
  startBMs: number,
  endBMs: number,
  bufferMinutes: number,
): boolean {
  const bufMs = Math.max(0, bufferMinutes) * 60_000;
  return startAMs < endBMs + bufMs && startBMs < endAMs + bufMs;
}

function resolveLocalityIdentity(b: AllocationBookingCandidate): {
  key: string;
  localityId: string | null;
  label: string;
} {
  if (b.localityId) {
    return {
      key: `id:${b.localityId}`,
      localityId: b.localityId,
      label: b.normalizedLocality || b.corridorTag || b.pickupLocationName,
    };
  }
  const slug = normalizeLocalitySlug(b.normalizedLocality || b.corridorTag);
  if (slug) {
    return {
      key: `slug:${slug}`,
      localityId: null,
      label: b.normalizedLocality || b.corridorTag || slug,
    };
  }
  return {
    key: `geo:${b.latitude.toFixed(2)},${b.longitude.toFixed(2)}`,
    localityId: null,
    label: b.pickupLocationName,
  };
}

function getEffectivePickupMs(b: AllocationBookingCandidate): number {
  return new Date(b.scheduledPickupAt).getTime();
}

function getTargetArriveByMs(b: AllocationBookingCandidate): number {
  return new Date(b.requestedPickupAt ?? b.scheduledPickupAt).getTime();
}

function toVrptwCandidate(b: AllocationBookingCandidate): VrptwBookingCandidate {
  return {
    bookingId: b.bookingId,
    employeeId: b.employeeId,
    employeeCode: b.employeeCode,
    employeeName: b.employeeName,
    department: b.department,
    officeId: b.officeId,
    officeName: b.officeName,
    officeLatitude: b.officeLatitude,
    officeLongitude: b.officeLongitude,
    shiftId: b.shiftId,
    shiftName: b.shiftName,
    shiftCode: b.shiftCode,
    shiftTimeLocal: b.shiftTimeLocal,
    travelDate: b.travelDate,
    direction: b.direction,
    scheduledPickupAt: b.scheduledPickupAt,
    pickupLocationName: b.pickupLocationName,
    address: b.address,
    corridorTag: b.corridorTag,
    latitude: b.latitude,
    longitude: b.longitude,
  };
}

function computeStopsMaxDetourRatio(
  stops: AllocationBookingCandidate[],
  officeLat: number,
  officeLng: number,
  direction: 'LOGIN' | 'LOGOUT',
): number {
  if (stops.length <= 1) return 1;
  let maxRatio = 1;

  for (let i = 0; i < stops.length; i++) {
    const rider = stops[i];
    const directKm = Math.max(
      0.5,
      estimateRoadKm(rider.latitude, rider.longitude, officeLat, officeLng),
    );
    let sharedKm = 0;
    if (direction === 'LOGIN') {
      for (let j = i + 1; j < stops.length; j++) {
        sharedKm += estimateRoadKm(
          stops[j - 1].latitude,
          stops[j - 1].longitude,
          stops[j].latitude,
          stops[j].longitude,
        );
      }
      const last = stops[stops.length - 1];
      sharedKm += estimateRoadKm(last.latitude, last.longitude, officeLat, officeLng);
    } else {
      sharedKm += estimateRoadKm(officeLat, officeLng, stops[0].latitude, stops[0].longitude);
      for (let j = 1; j <= i; j++) {
        sharedKm += estimateRoadKm(
          stops[j - 1].latitude,
          stops[j - 1].longitude,
          stops[j].latitude,
          stops[j].longitude,
        );
      }
    }
    const ratio = Math.round((sharedKm / directKm) * 100) / 100;
    if (ratio > maxRatio) maxRatio = ratio;
  }

  return maxRatio;
}

function buildRouteTimingPlan(
  items: AllocationBookingCandidate[],
  policy: AllocationPolicyConfig,
) {
  const first = items[0];
  const byBookingId = new Map(items.map((b) => [b.bookingId, b]));
  const vrptwOrdered = twoOptOptimizeStops(
    items.map(toVrptwCandidate),
    first.officeLatitude,
    first.officeLongitude,
    first.direction,
  );
  const ordered = vrptwOrdered
    .map((v) => byBookingId.get(v.bookingId))
    .filter((v): v is AllocationBookingCandidate => Boolean(v));

  let totalKm = 0;
  let totalRouteMinutes = 0;
  const legKmList: number[] = [];
  const legMinList: number[] = [];
  const cumMinAtStop: number[] = [];

  if (first.direction === 'LOGOUT') {
    for (let i = 0; i < ordered.length; i++) {
      const prevLat = i === 0 ? first.officeLatitude : ordered[i - 1].latitude;
      const prevLng = i === 0 ? first.officeLongitude : ordered[i - 1].longitude;
      const km = estimateRoadKm(prevLat, prevLng, ordered[i].latitude, ordered[i].longitude);
      const mins = estimateRoadTravelMinutes(km);
      totalKm += km;
      totalRouteMinutes += mins;
      cumMinAtStop.push(totalRouteMinutes);
      if (i < ordered.length - 1) totalRouteMinutes += STOP_DWELL_MINUTES;
      legKmList.push(km);
      legMinList.push(mins);
    }
  } else {
    for (let i = 0; i < ordered.length; i++) {
      if (i === 0) {
        legKmList.push(0);
        legMinList.push(0);
        cumMinAtStop.push(0);
      } else {
        const km = estimateRoadKm(
          ordered[i - 1].latitude,
          ordered[i - 1].longitude,
          ordered[i].latitude,
          ordered[i].longitude,
        );
        const mins = estimateRoadTravelMinutes(km);
        totalKm += km;
        totalRouteMinutes += STOP_DWELL_MINUTES + mins;
        cumMinAtStop.push(totalRouteMinutes);
        legKmList.push(km);
        legMinList.push(mins);
      }
    }
    const last = ordered[ordered.length - 1];
    const finalLegKm = estimateRoadKm(
      last.latitude,
      last.longitude,
      first.officeLatitude,
      first.officeLongitude,
    );
    totalKm += finalLegKm;
    totalRouteMinutes += estimateRoadTravelMinutes(finalLegKm);
  }

  const safetyMs = policy.arriveBySafetyBufferMinutes * 60_000;
  const arriveByEntries = ordered
    .map((b, idx) => ({ b, idx }))
    .filter((entry) => entry.b.timePreference === 'ARRIVE_BY');

  let plannedStartMs = Math.min(...ordered.map(getEffectivePickupMs));
  if (arriveByEntries.length > 0) {
    if (first.direction === 'LOGIN') {
      const earliestOfficeDeadlineMs = Math.min(
        ...arriveByEntries.map((e) => getTargetArriveByMs(e.b) - safetyMs),
      );
      const backwardStartMs = earliestOfficeDeadlineMs - totalRouteMinutes * 60_000;
      plannedStartMs = backwardStartMs;
    } else {
      const maxDepartures = arriveByEntries.map(
        (e) => getTargetArriveByMs(e.b) - safetyMs - cumMinAtStop[e.idx] * 60_000,
      );
      plannedStartMs = Math.min(plannedStartMs, ...maxDepartures);
    }
  }

  const plannedEndMs = plannedStartMs + Math.max(15, totalRouteMinutes) * 60_000;
  const stops: AllocationProposedStop[] = ordered.map((b, idx) => {
    const loc = resolveLocalityIdentity(b);
    return {
      sequenceNo: idx + 1,
      bookingId: b.bookingId,
      employeeId: b.employeeId,
      employeeCode: b.employeeCode,
      employeeName: b.employeeName,
      department: b.department,
      pickupLocationName: b.pickupLocationName,
      address: b.address,
      localityId: loc.localityId,
      localityName: loc.label,
      latitude: b.latitude,
      longitude: b.longitude,
      timePreference: b.timePreference,
      requestedTimeLocal: b.requestedTimeLocal,
      isArriveByInfeasible: b.isArriveByInfeasible,
      scheduledArrivalAt: new Date(plannedStartMs + cumMinAtStop[idx] * 60_000).toISOString(),
      legDistanceKm: legKmList[idx],
      legDurationMinutes: legMinList[idx],
    };
  });

  const maxDetourRatio = computeStopsMaxDetourRatio(
    ordered,
    first.officeLatitude,
    first.officeLongitude,
    first.direction,
  );

  return {
    ordered,
    stops,
    plannedStartAt: new Date(plannedStartMs).toISOString(),
    plannedEndAt: new Date(plannedEndMs).toISOString(),
    plannedStartMs,
    plannedEndMs,
    estimatedDistanceKm: Math.round(totalKm * 100) / 100,
    estimatedDurationMinutes: Math.max(15, totalRouteMinutes),
    maxDetourRatio,
  };
}

function clusterCentroid(bookings: AllocationBookingCandidate[]): { lat: number; lng: number } {
  const n = Math.max(1, bookings.length);
  return {
    lat: bookings.reduce((s, b) => s + b.latitude, 0) / n,
    lng: bookings.reduce((s, b) => s + b.longitude, 0) / n,
  };
}

function minStopPairwiseDistanceMeters(
  a: AllocationBookingCandidate[],
  b: AllocationBookingCandidate[],
): number {
  let minDist = Number.POSITIVE_INFINITY;
  for (const s1 of a) {
    for (const s2 of b) {
      const dist = haversineDistanceMeters(s1.latitude, s1.longitude, s2.latitude, s2.longitude);
      if (dist < minDist) minDist = dist;
    }
  }
  return minDist;
}

function countIntervalFreeSuvs(
  vehicles: AllocationVehicleCandidate[],
  busyIntervals: BusyInterval[],
  approxStartMs: number,
  approxEndMs: number,
  bufferMinutes: number,
): number {
  return vehicles.filter((v) => {
    if (!v.isActive || v.availabilityStatus === 'MAINTENANCE') return false;
    if (resolveEffectiveVehicleCapacity(v.vehicleType, v.seatingCapacity) < 5) return false;
    return !busyIntervals.some(
      (b) =>
        b.vehicleId === v.id &&
        intervalsOverlapWithBuffer(approxStartMs, approxEndMs, b.startMs, b.endMs, bufferMinutes),
    );
  }).length;
}

function hasIntervalFreeSuv(
  vehicles: AllocationVehicleCandidate[],
  busyIntervals: BusyInterval[],
  approxStartMs: number,
  approxEndMs: number,
  bufferMinutes: number,
): boolean {
  return countIntervalFreeSuvs(vehicles, busyIntervals, approxStartMs, approxEndMs, bufferMinutes) > 0;
}

function splitTimeCompatibleBuckets(
  items: AllocationBookingCandidate[],
  toleranceMinutes: number,
): AllocationBookingCandidate[][] {
  const sorted = [...items].sort((a, b) => getEffectivePickupMs(a) - getEffectivePickupMs(b));
  const groups: AllocationBookingCandidate[][] = [];
  const tolMs = Math.max(5, toleranceMinutes) * 60_000;

  for (const b of sorted) {
    const t = getEffectivePickupMs(b);
    const matching = groups.find((g) => {
      const minT = Math.min(...g.map(getEffectivePickupMs));
      const maxT = Math.max(...g.map(getEffectivePickupMs));
      return Math.max(maxT, t) - Math.min(minT, t) <= tolMs;
    });
    if (matching) {
      matching.push(b);
    } else {
      groups.push([b]);
    }
  }

  return groups;
}

function chooseChunkSize(remainingCount: number, hasSuvAvailable: boolean): number {
  if (remainingCount >= 5 && hasSuvAvailable) {
    return Math.min(remainingCount, 6);
  }
  return Math.min(remainingCount, 4);
}

function buildExistingBusyIntervals(
  existingTrips: AllocationExistingTrip[],
): BusyInterval[] {
  const busy: BusyInterval[] = [];
  for (const t of existingTrips) {
    if (!NON_TERMINAL_TRIP_STATUSES.has(t.status)) continue;
    const startMs = t.plannedStartAt
      ? new Date(t.plannedStartAt).getTime()
      : new Date(`${t.travelDate}T08:00:00Z`).getTime();
    const endMs = t.plannedEndAt ? new Date(t.plannedEndAt).getTime() : startMs + 60 * 60_000;
    busy.push({
      driverId: t.driverId,
      vehicleId: t.vehicleId,
      startMs,
      endMs: Math.max(endMs, startMs + 15 * 60_000),
      tripCode: t.tripCode,
    });
  }
  return busy;
}

function computeDeadheadKm(
  driver: AllocationDriverCandidate,
  routePlan: ReturnType<typeof buildRouteTimingPlan>,
): number | null {
  if (driver.baseLatitude == null || driver.baseLongitude == null) return null;
  const firstStop = routePlan.ordered[0];
  if (!firstStop) return null;
  const targetLat = firstStop.direction === 'LOGOUT' ? firstStop.officeLatitude : firstStop.latitude;
  const targetLng =
    firstStop.direction === 'LOGOUT' ? firstStop.officeLongitude : firstStop.longitude;
  return estimateRoadKm(driver.baseLatitude, driver.baseLongitude, targetLat, targetLng);
}

function evaluateSpareSeatSuggestions(
  bookings: AllocationBookingCandidate[],
  existingTrips: AllocationExistingTrip[],
  policy: AllocationPolicyConfig,
): SpareSeatSuggestion[] {
  const suggestions: SpareSeatSuggestion[] = [];
  const tolMs = Math.max(5, policy.pickupWindowToleranceMinutes) * 60_000;

  for (const trip of existingTrips) {
    if (!['CREATED', 'ASSIGNED', 'DRIVER_ACCEPTED'].includes(trip.status)) continue;
    if (!trip.vehicleType || trip.seatingCapacity == null) continue;
    const effectiveCap = resolveEffectiveVehicleCapacity(trip.vehicleType, trip.seatingCapacity);
    const spareSeats = effectiveCap - trip.passengerCount;
    if (spareSeats <= 0) continue;

    const tripStartMs = trip.plannedStartAt ? new Date(trip.plannedStartAt).getTime() : null;
    const matched = bookings.filter((b) => {
      if (
        b.travelDate !== trip.travelDate ||
        b.direction !== trip.direction ||
        b.officeId !== trip.officeId
      ) {
        return false;
      }
      if (tripStartMs != null && Math.abs(getEffectivePickupMs(b) - tripStartMs) > tolMs) {
        return false;
      }
      if (trip.primaryLocalityId && b.localityId === trip.primaryLocalityId) {
        return true;
      }
      if (trip.stopCoords.length === 0) return false;
      const minDist = Math.min(
        ...trip.stopCoords.map((c) =>
          haversineDistanceMeters(b.latitude, b.longitude, c.latitude, c.longitude),
        ),
      );
      return minDist <= policy.nearbyLocalityRadiusM;
    });

    if (matched.length === 0) continue;
    const capped = matched.slice(0, spareSeats);
    const minDistM =
      trip.stopCoords.length > 0
        ? Math.round(
            Math.min(
              ...capped.flatMap((b) =>
                trip.stopCoords.map((c) =>
                  haversineDistanceMeters(b.latitude, b.longitude, c.latitude, c.longitude),
                ),
              ),
            ),
          )
        : 0;

    suggestions.push({
      tripId: trip.tripId,
      tripCode: trip.tripCode,
      driverName: trip.driverName,
      vehicleRegistrationNo: trip.vehicleRegistrationNo,
      vehicleType: trip.vehicleType,
      currentPassengers: trip.passengerCount,
      effectiveCapacity: effectiveCap,
      spareSeats,
      travelDate: trip.travelDate,
      direction: trip.direction,
      candidateBookingIds: capped.map((b) => b.bookingId),
      candidateEmployees: capped.map((b) => `${b.employeeName} (${b.pickupLocationName})`),
      estimatedDistanceMeters: minDistM,
      reason: `${spareSeats} spare seat(s) available on unstarted ${trip.tripCode}; ${capped.length} compatible passenger(s) within ${minDistM}m.`,
    });
  }

  return suggestions;
}

export function solveLocalityIntervalAllocation(input: {
  bookings: AllocationBookingCandidate[];
  drivers: AllocationDriverCandidate[];
  vehicles: AllocationVehicleCandidate[];
  existingTrips: AllocationExistingTrip[];
  policy?: Partial<AllocationPolicyConfig>;
}): AllocationSolveResult {
  const policy: AllocationPolicyConfig = {
    ...DEFAULT_ALLOCATION_POLICY,
    ...input.policy,
  };
  const busyIntervals = buildExistingBusyIntervals(input.existingTrips);
  const spareSeatSuggestions = evaluateSpareSeatSuggestions(
    input.bookings,
    input.existingTrips,
    policy,
  );

  // Stage 1: Exact canonical locality buckets, split cleanly by time window
  const bucketMap = new Map<string, AllocationBookingCandidate[]>();
  for (const b of input.bookings) {
    const loc = resolveLocalityIdentity(b);
    const key = `${b.travelDate}::${b.direction}::${b.officeId}::${loc.key}`;
    const list = bucketMap.get(key) ?? [];
    list.push(b);
    bucketMap.set(key, list);
  }

  const fullClusters: InternalCluster[] = [];
  const leftoverBuckets: Array<{
    travelDate: string;
    direction: 'LOGIN' | 'LOGOUT';
    officeId: string;
    shiftId: string;
    localityKey: string;
    localityId: string | null;
    localityLabel: string;
    bookings: AllocationBookingCandidate[];
  }> = [];

  let clusterSeq = 1;
  for (const [, rawBucket] of bucketMap.entries()) {
    const timeSlices = splitTimeCompatibleBuckets(rawBucket, policy.pickupWindowToleranceMinutes);
    for (const slice of timeSlices) {
      const sorted = [...slice].sort(
        (a, b) =>
          a.latitude - b.latitude ||
          a.longitude - b.longitude ||
          getEffectivePickupMs(a) - getEffectivePickupMs(b),
      );
      const firstLoc = resolveLocalityIdentity(sorted[0]);
      const sliceStartMs = Math.min(...sorted.map(getEffectivePickupMs));
      let remainingSliceSuvs = countIntervalFreeSuvs(
        input.vehicles,
        busyIntervals,
        sliceStartMs,
        sliceStartMs + 60 * 60_000,
        policy.driverTurnaroundBufferMinutes,
      );
      const maxFit = remainingSliceSuvs > 0 && sorted.length >= 5 ? 6 : 4;

      if (sorted.length >= 4) {
        let cursor = 0;
        while (cursor < sorted.length) {
          const remaining = sorted.length - cursor;
          if (remaining < 4 && cursor > 0) {
            leftoverBuckets.push({
              travelDate: sorted[0].travelDate,
              direction: sorted[0].direction,
              officeId: sorted[0].officeId,
              shiftId: sorted[0].shiftId,
              localityKey: firstLoc.key,
              localityId: firstLoc.localityId,
              localityLabel: firstLoc.label,
              bookings: sorted.slice(cursor),
            });
            break;
          }
          const size = chooseChunkSize(remaining, remainingSliceSuvs > 0);
          if (size >= 5) remainingSliceSuvs = Math.max(0, remainingSliceSuvs - 1);
          const sliceItems = sorted.slice(cursor, cursor + size);
          fullClusters.push({
            clusterId: `GRP-${String(clusterSeq++).padStart(3, '0')}`,
            travelDate: sliceItems[0].travelDate,
            direction: sliceItems[0].direction,
            officeId: sliceItems[0].officeId,
            officeName: sliceItems[0].officeName,
            officeLatitude: sliceItems[0].officeLatitude,
            officeLongitude: sliceItems[0].officeLongitude,
            shiftId: sliceItems[0].shiftId,
            shiftName: sliceItems[0].shiftName,
            shiftCode: sliceItems[0].shiftCode,
            primaryLocalityKey: firstLoc.key,
            primaryLocalityId: firstLoc.localityId,
            primaryLocalityName: firstLoc.label,
            localityNames: [firstLoc.label],
            groupingReason: `Exact locality match: ${firstLoc.label} (${sliceItems.length} passenger(s), capacity <= ${maxFit}).`,
            bookings: sliceItems,
          });
          cursor += size;
        }
      } else {
        leftoverBuckets.push({
          travelDate: sorted[0].travelDate,
          direction: sorted[0].direction,
          officeId: sorted[0].officeId,
          shiftId: sorted[0].shiftId,
          localityKey: firstLoc.key,
          localityId: firstLoc.localityId,
          localityLabel: firstLoc.label,
          bookings: sorted,
        });
      }
    }
  }

  // Stage 2: Controlled nearby-locality merges ONLY when radius + detour + time window + capacity permit
  const consumedLeftover = new Set<number>();
  const tolMs = Math.max(5, policy.pickupWindowToleranceMinutes) * 60_000;

  for (let i = 0; i < leftoverBuckets.length; i++) {
    if (consumedLeftover.has(i)) continue;
    const base = leftoverBuckets[i];
    let combined = [...base.bookings];
    const locNames = [base.localityLabel];
    const mergeNotes: string[] = [];

    for (let j = i + 1; j < leftoverBuckets.length; j++) {
      if (consumedLeftover.has(j)) continue;
      const cand = leftoverBuckets[j];
      if (
        cand.travelDate !== base.travelDate ||
        cand.direction !== base.direction ||
        cand.officeId !== base.officeId
      ) {
        continue;
      }

      const baseStartMs = Math.min(...combined.map(getEffectivePickupMs));
      const suvFreeForMerge = hasIntervalFreeSuv(
        input.vehicles,
        busyIntervals,
        baseStartMs,
        baseStartMs + 60 * 60_000,
        policy.driverTurnaroundBufferMinutes,
      );
      const maxMergeCap =
        suvFreeForMerge && combined.length + cand.bookings.length >= 5 ? 6 : 4;
      if (combined.length + cand.bookings.length > maxMergeCap) continue;

      const allTimes = [...combined, ...cand.bookings].map(getEffectivePickupMs);
      if (Math.max(...allTimes) - Math.min(...allTimes) > tolMs) continue;

      const centroidBase = clusterCentroid(combined);
      const centroidCand = clusterCentroid(cand.bookings);
      const centroidDistM = haversineDistanceMeters(
        centroidBase.lat,
        centroidBase.lng,
        centroidCand.lat,
        centroidCand.lng,
      );
      const minPairDistM = minStopPairwiseDistanceMeters(combined, cand.bookings);
      if (
        centroidDistM > policy.nearbyLocalityRadiusM &&
        minPairDistM > policy.nearbyLocalityRadiusM
      ) {
        continue;
      }

      const mergedTest = [...combined, ...cand.bookings];
      const testPlan = buildRouteTimingPlan(mergedTest, policy);
      if (testPlan.maxDetourRatio > policy.maxRouteDetourRatio) continue;

      combined = mergedTest;
      if (!locNames.includes(cand.localityLabel)) locNames.push(cand.localityLabel);
      mergeNotes.push(
        `${base.localityLabel} + ${cand.localityLabel} (${(Math.min(centroidDistM, minPairDistM) / 1000).toFixed(1)} km apart, detour ${testPlan.maxDetourRatio}x <= ${policy.maxRouteDetourRatio}x)`,
      );
      consumedLeftover.add(j);
    }

    consumedLeftover.add(i);
    fullClusters.push({
      clusterId: `GRP-${String(clusterSeq++).padStart(3, '0')}`,
      travelDate: combined[0].travelDate,
      direction: combined[0].direction,
      officeId: combined[0].officeId,
      officeName: combined[0].officeName,
      officeLatitude: combined[0].officeLatitude,
      officeLongitude: combined[0].officeLongitude,
      shiftId: combined[0].shiftId,
      shiftName: combined[0].shiftName,
      shiftCode: combined[0].shiftCode,
      primaryLocalityKey: base.localityKey,
      primaryLocalityId: base.localityId,
      primaryLocalityName: locNames.join(' + '),
      localityNames: locNames,
      groupingReason:
        mergeNotes.length > 0
          ? `Nearby compatible locality merge: ${mergeNotes.join('; ')}.`
          : `Exact locality group: ${base.localityLabel} (${combined.length} passenger(s)).`,
      bookings: combined,
    });
  }

  // Stage 3: Score & allocate interval-available drivers & vehicles per cluster
  const proposals: AllocationProposal[] = [];
  const unallocatedGroups: UnallocatedGroup[] = [];
  const assignedCountByDriver = new Map<string, number>();

  for (const t of input.existingTrips) {
    if (t.driverId && NON_TERMINAL_TRIP_STATUSES.has(t.status)) {
      assignedCountByDriver.set(t.driverId, (assignedCountByDriver.get(t.driverId) ?? 0) + 1);
    }
  }

  // Deterministic ordering by start time then largest seatCount first so scarce SUVs pack big groups
  const plannedClusters = fullClusters
    .map((cluster) => ({
      cluster,
      routePlan: buildRouteTimingPlan(cluster.bookings, policy),
    }))
    .sort(
      (a, b) =>
        a.routePlan.plannedStartMs - b.routePlan.plannedStartMs ||
        b.cluster.bookings.length - a.cluster.bookings.length,
    );

  const eligibleFleetVehicles = input.vehicles.filter(
    (v) => v.isActive && v.availabilityStatus !== 'MAINTENANCE',
  );
  const eligibleDrivers = input.drivers.filter(
    (d) =>
      !d.isSuspended &&
      d.availabilityStatus !== 'OFF_DUTY' &&
      d.availabilityStatus !== 'MAINTENANCE',
  );

  for (const { cluster, routePlan } of plannedClusters) {
    const freeVehicles = eligibleFleetVehicles.filter((v) => {
      const cap = resolveEffectiveVehicleCapacity(v.vehicleType, v.seatingCapacity);
      if (cap < cluster.bookings.length) return false;
      return !busyIntervals.some(
        (b) =>
          b.vehicleId === v.id &&
          intervalsOverlapWithBuffer(
            routePlan.plannedStartMs,
            routePlan.plannedEndMs,
            b.startMs,
            b.endMs,
            policy.driverTurnaroundBufferMinutes,
          ),
      );
    });

    const freeDrivers = eligibleDrivers.filter(
      (d) =>
        !busyIntervals.some(
          (b) =>
            b.driverId === d.id &&
            intervalsOverlapWithBuffer(
              routePlan.plannedStartMs,
              routePlan.plannedEndMs,
              b.startMs,
              b.endMs,
              policy.driverTurnaroundBufferMinutes,
            ),
        ),
    );

    if (freeVehicles.length === 0 || freeDrivers.length === 0) {
      const reasonCode =
        freeVehicles.length === 0 && freeDrivers.length === 0
          ? 'NO_AVAILABLE_DRIVER_OR_VEHICLE'
          : freeVehicles.length === 0
            ? 'NO_VEHICLE_FITTING_CAPACITY'
            : 'NO_AVAILABLE_DRIVER_IN_WINDOW';

      const explanation =
        freeVehicles.length === 0
          ? `No interval-available active vehicle has passenger capacity >= ${cluster.bookings.length} for ${routePlan.plannedStartAt}..${routePlan.plannedEndAt} (±${policy.driverTurnaroundBufferMinutes} min buffer).`
          : `No active non-suspended driver is interval-free for ${routePlan.plannedStartAt}..${routePlan.plannedEndAt} (±${policy.driverTurnaroundBufferMinutes} min buffer).`;

      unallocatedGroups.push({
        clusterId: cluster.clusterId,
        travelDate: cluster.travelDate,
        direction: cluster.direction,
        officeId: cluster.officeId,
        officeName: cluster.officeName,
        shiftId: cluster.shiftId,
        shiftName: cluster.shiftName,
        primaryLocalityId: cluster.primaryLocalityId,
        primaryLocalityName: cluster.primaryLocalityName,
        seatCount: cluster.bookings.length,
        plannedStartAt: routePlan.plannedStartAt,
        plannedEndAt: routePlan.plannedEndAt,
        reasonCode,
        explanation,
        suggestedAction:
          cluster.bookings.length > 4
            ? 'Assign an available 6-seat SUV or split group manually into two 4-seat Sedans.'
            : 'Assign an off-peak / backup vendor driver or shift departure window manually.',
        bookings: routePlan.stops.map((s) => ({
          bookingId: s.bookingId,
          employeeCode: s.employeeCode,
          employeeName: s.employeeName,
          pickupLocationName: s.pickupLocationName,
          localityName: s.localityName,
          scheduledPickupAt: s.scheduledArrivalAt,
        })),
      });
      continue;
    }

    let bestPair: {
      driver: AllocationDriverCandidate;
      vehicle: AllocationVehicleCandidate;
      effectiveCap: number;
      score: number;
      deadheadKm: number | null;
      matchType: 'EXACT_LOCALITY' | 'NEARBY_LOCALITY' | 'CROSS_ZONE_FALLBACK' | 'UNSPECIFIED';
      selectionReason: string;
    } | null = null;

    const clusterSlug = normalizeLocalitySlug(cluster.primaryLocalityName);
    for (const driver of freeDrivers) {
      const driverSlug = normalizeLocalitySlug(driver.baseLocalityName);
      const exactLocalityMatch =
        (cluster.primaryLocalityId != null &&
          driver.baseLocalityId != null &&
          driver.baseLocalityId === cluster.primaryLocalityId) ||
        (clusterSlug.length > 0 && driverSlug.length > 0 && driverSlug === clusterSlug);

      const deadheadKm = computeDeadheadKm(driver, routePlan);
      const nearbyMatch =
        !exactLocalityMatch &&
        deadheadKm != null &&
        deadheadKm * 1000 <= policy.nearbyLocalityRadiusM;

      const matchType:
        | 'EXACT_LOCALITY'
        | 'NEARBY_LOCALITY'
        | 'CROSS_ZONE_FALLBACK'
        | 'UNSPECIFIED' = exactLocalityMatch
        ? 'EXACT_LOCALITY'
        : nearbyMatch
          ? 'NEARBY_LOCALITY'
          : driver.baseLocalityName || driver.baseLatitude != null
            ? 'CROSS_ZONE_FALLBACK'
            : 'UNSPECIFIED';

      const baseScore =
        (exactLocalityMatch ? 1000 : nearbyMatch ? 400 : 0) -
        (deadheadKm ?? 15) * 12 -
        (assignedCountByDriver.get(driver.id) ?? 0) * 25;

      for (const vehicle of freeVehicles) {
        const effectiveCap = resolveEffectiveVehicleCapacity(
          vehicle.vehicleType,
          vehicle.seatingCapacity,
        );
        const wastePenalty = (effectiveCap - cluster.bookings.length) * 45;
        const pairedBonus = driver.assignedVehicleId === vehicle.id ? 260 : 0;
        const totalScore = baseScore + pairedBonus - wastePenalty;

        const localityReasonPart = exactLocalityMatch
          ? `Exact base locality match (${driver.baseLocalityName ?? cluster.primaryLocalityName})`
          : nearbyMatch && deadheadKm != null
            ? `Nearby base zone (${driver.baseLocalityName ?? 'zone'}, ~${deadheadKm} km deadhead)`
            : driver.baseLocalityName
              ? `Cross-zone fallback (${driver.baseLocalityName}${deadheadKm != null ? `, ~${deadheadKm} km deadhead` : ''})`
              : 'Driver has no base locality configured (scored as neutral fallback)';

        const selectionReason = `${localityReasonPart}; ${vehicle.vehicleType} (${cluster.bookings.length}/${effectiveCap} seats); interval free with >= ${policy.driverTurnaroundBufferMinutes} min buffer.`;

        if (!bestPair || totalScore > bestPair.score) {
          bestPair = {
            driver,
            vehicle,
            effectiveCap,
            score: totalScore,
            deadheadKm,
            matchType,
            selectionReason,
          };
        }
      }
    }

    if (!bestPair) continue;

    busyIntervals.push({
      driverId: bestPair.driver.id,
      vehicleId: bestPair.vehicle.id,
      startMs: routePlan.plannedStartMs,
      endMs: routePlan.plannedEndMs,
      tripCode: cluster.clusterId,
    });
    assignedCountByDriver.set(
      bestPair.driver.id,
      (assignedCountByDriver.get(bestPair.driver.id) ?? 0) + 1,
    );

    const warnings: string[] = [];
    if (routePlan.stops.some((s) => s.isArriveByInfeasible)) {
      warnings.push(
        'At least one ARRIVE_BY request was flagged infeasible for its original lead time.',
      );
    }
    if (bestPair.matchType === 'CROSS_ZONE_FALLBACK') {
      warnings.push(
        `Driver base (${bestPair.driver.baseLocalityName ?? 'unspecified'}) is outside ${cluster.primaryLocalityName}; verify deadhead cost.`,
      );
    }

    proposals.push({
      clusterId: cluster.clusterId,
      travelDate: cluster.travelDate,
      direction: cluster.direction,
      shiftId: cluster.shiftId,
      shiftName: cluster.shiftName,
      shiftCode: cluster.shiftCode,
      officeId: cluster.officeId,
      officeName: cluster.officeName,
      primaryLocalityId: cluster.primaryLocalityId,
      primaryLocalityName: cluster.primaryLocalityName,
      localityNames: cluster.localityNames,
      localityMatchSummary: cluster.localityNames.join(' + '),
      seatCount: cluster.bookings.length,
      plannedStartAt: routePlan.plannedStartAt,
      plannedEndAt: routePlan.plannedEndAt,
      estimatedDistanceKm: routePlan.estimatedDistanceKm,
      estimatedDurationMinutes: routePlan.estimatedDurationMinutes,
      maxDetourRatio: routePlan.maxDetourRatio,
      suggestedVehicle: {
        id: bestPair.vehicle.id,
        registrationNo: bestPair.vehicle.registrationNo,
        modelName: bestPair.vehicle.modelName,
        vehicleType: bestPair.vehicle.vehicleType,
        effectiveCapacity: bestPair.effectiveCap,
      },
      suggestedDriver: {
        id: bestPair.driver.id,
        driverCode: bestPair.driver.driverCode,
        fullName: bestPair.driver.fullName,
        baseLocalityId: bestPair.driver.baseLocalityId,
        baseLocalityName: bestPair.driver.baseLocalityName,
      },
      rationale: {
        localityMatchType: bestPair.matchType,
        deadheadKm: bestPair.deadheadKm,
        intervalCheckPassed: true,
        turnaroundBufferMinutes: policy.driverTurnaroundBufferMinutes,
        groupingReason: cluster.groupingReason,
        selectionReason: bestPair.selectionReason,
        warnings,
      },
      stops: routePlan.stops,
    });
  }

  const allocatedCount = proposals.reduce((sum, p) => sum + p.seatCount, 0);
  const unallocatedBookingsCount = unallocatedGroups.reduce((sum, u) => sum + u.seatCount, 0);
  const recommendedSedans = proposals.filter((p) =>
    ['SEDAN', 'EV_SEDAN'].includes(p.suggestedVehicle.vehicleType),
  ).length;
  const recommendedSuvs = proposals.filter(
    (p) => p.suggestedVehicle.vehicleType === 'SUV',
  ).length;
  const recommendedOtherVehicles = proposals.length - recommendedSedans - recommendedSuvs;

  return {
    engineVersion: 'LOCALITY_INTERVAL_V1',
    configSnapshot: policy,
    summary: {
      totalConfirmedBookings: input.bookings.length,
      localityGroupsCount: fullClusters.length,
      proposedTripsCount: proposals.length,
      allocatedBookingsCount: allocatedCount,
      unallocatedGroupsCount: unallocatedGroups.length,
      unallocatedBookingsCount,
      recommendedSedans,
      recommendedSuvs,
      recommendedOtherVehicles,
      spareSeatSuggestionsCount: spareSeatSuggestions.length,
    },
    proposals,
    unallocatedGroups,
    spareSeatSuggestions,
  };
}
