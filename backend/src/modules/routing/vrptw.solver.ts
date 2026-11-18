import { haversineDistanceMeters } from '../../infrastructure/shared/maps.util.js';

export const URBAN_ROAD_CIRCUITY_FACTOR = 1.22;
export const AVERAGE_URBAN_SPEED_KMH = 26;
export const STOP_DWELL_MINUTES = 2;

export interface VrptwBookingCandidate {
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
  scheduledPickupAt: string;
  pickupLocationName: string;
  address: string;
  corridorTag: string | null;
  latitude: number;
  longitude: number;
}

export interface VrptwVehicleCandidate {
  id: string;
  registrationNo: string;
  modelName: string;
  vehicleType: string;
  seatingCapacity: number;
}

export interface VrptwDriverCandidate {
  id: string;
  driverCode: string;
  fullName: string;
  assignedVehicleId: string | null;
}

export interface VrptwRecommendedStop {
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
  direction: 'LOGIN' | 'LOGOUT';
  plannedStartAt: string;
  recommendedVehicle: VrptwVehicleCandidate | null;
  recommendedDriver: VrptwDriverCandidate | null;
  seatCount: number;
  vehicleCapacity: number;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  maxDetourRatio: number;
  warnings: string[];
  stops: VrptwRecommendedStop[];
}

export interface VrptwSolveResult {
  evaluation: {
    engine: 'TS_CAPACITATED_VRPTW_2OPT';
    orToolsSidecarActive: boolean;
    methodology: string;
    totalApprovedBookingsEvaluated: number;
    recommendedClustersCount: number;
    totalEstimatedDistanceKm: number;
    unassignedBookingsCount: number;
  };
  clusters: VrptwClusterRecommendation[];
}

export function estimateRoadKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const straightMeters = haversineDistanceMeters(lat1, lng1, lat2, lng2);
  return Math.round(((straightMeters * URBAN_ROAD_CIRCUITY_FACTOR) / 1000) * 100) / 100;
}

export function estimateRoadTravelMinutes(roadKm: number): number {
  if (roadKm <= 0.05) return 0;
  return Math.max(2, Math.round((roadKm / AVERAGE_URBAN_SPEED_KMH) * 60));
}

function bearingFromOffice(
  officeLat: number,
  officeLng: number,
  stopLat: number,
  stopLng: number,
): number {
  const dLat = stopLat - officeLat;
  const dLng = (stopLng - officeLng) * Math.cos((officeLat * Math.PI) / 180);
  return Math.atan2(dLat, dLng);
}

function computeRouteKm(
  stops: VrptwBookingCandidate[],
  officeLat: number,
  officeLng: number,
  direction: 'LOGIN' | 'LOGOUT',
): number {
  if (stops.length === 0) return 0;
  let total = 0;
  if (direction === 'LOGOUT') {
    total += estimateRoadKm(officeLat, officeLng, stops[0].latitude, stops[0].longitude);
  }
  for (let i = 1; i < stops.length; i++) {
    total += estimateRoadKm(
      stops[i - 1].latitude,
      stops[i - 1].longitude,
      stops[i].latitude,
      stops[i].longitude,
    );
  }
  if (direction === 'LOGIN') {
    const last = stops[stops.length - 1];
    total += estimateRoadKm(last.latitude, last.longitude, officeLat, officeLng);
  }
  return Math.round(total * 100) / 100;
}

export function twoOptOptimizeStops(
  initialStops: VrptwBookingCandidate[],
  officeLat: number,
  officeLng: number,
  direction: 'LOGIN' | 'LOGOUT',
): VrptwBookingCandidate[] {
  if (initialStops.length <= 2) return [...initialStops];

  let best = [...initialStops];
  let bestCost = computeRouteKm(best, officeLat, officeLng, direction);
  let improved = true;

  for (let iter = 0; iter < 16 && improved; iter++) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const candidateCost = computeRouteKm(candidate, officeLat, officeLng, direction);
        if (candidateCost + 0.01 < bestCost) {
          best = candidate;
          bestCost = candidateCost;
          improved = true;
        }
      }
    }
  }

  return best;
}

function computeClusterMaxDetourRatio(
  orderedStops: VrptwBookingCandidate[],
  officeLat: number,
  officeLng: number,
  direction: 'LOGIN' | 'LOGOUT',
): number {
  if (orderedStops.length <= 1) return 1;
  let maxRatio = 1;

  for (let i = 0; i < orderedStops.length; i++) {
    const rider = orderedStops[i];
    const directKm = Math.max(
      0.5,
      estimateRoadKm(rider.latitude, rider.longitude, officeLat, officeLng),
    );
    let sharedKm = 0;
    if (direction === 'LOGIN') {
      sharedKm = computeRouteKm(orderedStops.slice(i), officeLat, officeLng, 'LOGIN');
    } else {
      sharedKm = computeRouteKm(orderedStops.slice(0, i + 1), officeLat, officeLng, 'LOGOUT');
    }
    const ratio = Math.round((sharedKm / directKm) * 100) / 100;
    if (ratio > maxRatio) maxRatio = ratio;
  }

  return maxRatio;
}

export function solveVrptwRecommendations(input: {
  bookings: VrptwBookingCandidate[];
  vehicles: VrptwVehicleCandidate[];
  drivers: VrptwDriverCandidate[];
}): VrptwSolveResult {
  const grouped = new Map<string, VrptwBookingCandidate[]>();
  for (const b of input.bookings) {
    const key = `${b.travelDate}|${b.shiftId}|${b.officeId}|${b.direction}`;
    const list = grouped.get(key) ?? [];
    list.push(b);
    grouped.set(key, list);
  }

  const usedVehicleIds = new Set<string>();
  const usedDriverIds = new Set<string>();
  const clusters: VrptwClusterRecommendation[] = [];
  let clusterCounter = 1;

  const sortedBatchKeys = [...grouped.keys()].sort();
  for (const batchKey of sortedBatchKeys) {
    const batch = grouped.get(batchKey)!;
    const sample = batch[0];
    const officeLat = sample.officeLatitude;
    const officeLng = sample.officeLongitude;

    // Sort stops by angular corridor sector relative to campus, breaking ties by radial distance
    const sectorSorted = [...batch].sort((a, b) => {
      const angleA = bearingFromOffice(officeLat, officeLng, a.latitude, a.longitude);
      const angleB = bearingFromOffice(officeLat, officeLng, b.latitude, b.longitude);
      const angleDiff = angleA - angleB;
      if (Math.abs(angleDiff) > 0.12) return angleDiff;
      const distA = estimateRoadKm(officeLat, officeLng, a.latitude, a.longitude);
      const distB = estimateRoadKm(officeLat, officeLng, b.latitude, b.longitude);
      return sample.direction === 'LOGIN' ? distB - distA : distA - distB;
    });

    let cursor = 0;
    while (cursor < sectorSorted.length) {
      const remaining = sectorSorted.length - cursor;
      const freeVehicles = input.vehicles.filter((v) => !usedVehicleIds.has(v.id));
      const candidatePool = freeVehicles.length > 0 ? freeVehicles : input.vehicles;
      const pickedVehicle =
        candidatePool.find((v) => v.seatingCapacity >= Math.min(remaining, 4)) ??
        [...candidatePool].sort((a, b) => b.seatingCapacity - a.seatingCapacity)[0] ??
        null;

      const cap = Math.max(1, pickedVehicle?.seatingCapacity ?? 4);
      const slice = sectorSorted.slice(cursor, cursor + cap);
      cursor += slice.length;

      // Initial radial ordering before 2-opt intra-route minimization
      const radiallyOrdered = [...slice].sort((a, b) => {
        const distA = estimateRoadKm(officeLat, officeLng, a.latitude, a.longitude);
        const distB = estimateRoadKm(officeLat, officeLng, b.latitude, b.longitude);
        return sample.direction === 'LOGIN' ? distB - distA : distA - distB;
      });

      const optimized = twoOptOptimizeStops(
        radiallyOrdered,
        officeLat,
        officeLng,
        sample.direction,
      );

      let pickedDriver: VrptwDriverCandidate | null = null;
      const warnings: string[] = [];

      if (pickedVehicle) {
        if (usedVehicleIds.has(pickedVehicle.id)) {
          warnings.push('VEHICLE_POOL_REUSED');
        }
        usedVehicleIds.add(pickedVehicle.id);

        pickedDriver =
          input.drivers.find(
            (d) => d.assignedVehicleId === pickedVehicle.id && !usedDriverIds.has(d.id),
          ) ??
          input.drivers.find((d) => !usedDriverIds.has(d.id)) ??
          input.drivers.find((d) => d.assignedVehicleId === pickedVehicle.id) ??
          input.drivers[0] ??
          null;
      } else {
        pickedDriver =
          input.drivers.find((d) => !usedDriverIds.has(d.id)) ?? input.drivers[0] ?? null;
        warnings.push('NO_ACTIVE_VEHICLE_IN_POOL');
      }

      if (pickedDriver) {
        if (usedDriverIds.has(pickedDriver.id)) {
          warnings.push('DRIVER_POOL_REUSED');
        }
        usedDriverIds.add(pickedDriver.id);
      } else {
        warnings.push('NO_ACTIVE_DRIVER_IN_POOL');
      }

      const earliestPickupMs = Math.min(
        ...optimized.map((b) => new Date(b.scheduledPickupAt).getTime()),
      );
      const plannedStartDate = new Date(earliestPickupMs - 10 * 60_000);

      let cumulativeMinutes = 0;
      const stops: VrptwRecommendedStop[] = optimized.map((stop, idx) => {
        let legKm = 0;
        if (idx === 0) {
          legKm =
            sample.direction === 'LOGOUT'
              ? estimateRoadKm(officeLat, officeLng, stop.latitude, stop.longitude)
              : 0;
        } else {
          const prev = optimized[idx - 1];
          legKm = estimateRoadKm(prev.latitude, prev.longitude, stop.latitude, stop.longitude);
        }
        const legMinutes =
          idx === 0 && sample.direction === 'LOGIN' ? 0 : estimateRoadTravelMinutes(legKm);
        if (idx > 0) {
          cumulativeMinutes += legMinutes + STOP_DWELL_MINUTES;
        } else if (sample.direction === 'LOGOUT') {
          cumulativeMinutes += legMinutes;
        }

        const etaDate = new Date(earliestPickupMs + cumulativeMinutes * 60_000);
        return {
          sequenceNo: idx + 1,
          bookingId: stop.bookingId,
          employeeId: stop.employeeId,
          employeeCode: stop.employeeCode,
          employeeName: stop.employeeName,
          department: stop.department,
          pickupLocationName: stop.pickupLocationName,
          address: stop.address,
          corridorTag: stop.corridorTag,
          latitude: stop.latitude,
          longitude: stop.longitude,
          scheduledArrivalAt: etaDate.toISOString(),
          legDistanceKm: legKm,
          legDurationMinutes: legMinutes,
        };
      });

      const lastStop = optimized[optimized.length - 1];
      const finalOfficeKm =
        sample.direction === 'LOGIN'
          ? estimateRoadKm(lastStop.latitude, lastStop.longitude, officeLat, officeLng)
          : 0;
      const totalEstimatedDistanceKm = computeRouteKm(
        optimized,
        officeLat,
        officeLng,
        sample.direction,
      );
      const totalDurationMinutes =
        cumulativeMinutes +
        (sample.direction === 'LOGIN'
          ? STOP_DWELL_MINUTES + estimateRoadTravelMinutes(finalOfficeKm)
          : STOP_DWELL_MINUTES);

      const maxDetourRatio = computeClusterMaxDetourRatio(
        optimized,
        officeLat,
        officeLng,
        sample.direction,
      );
      if (maxDetourRatio > 2.0) {
        warnings.push('DETOUR_RATIO_EXCEEDS_2X');
      }

      clusters.push({
        clusterId: `VRP-${sample.travelDate.replaceAll('-', '')}-${String(clusterCounter++).padStart(2, '0')}`,
        travelDate: sample.travelDate,
        shiftId: sample.shiftId,
        shiftName: sample.shiftName,
        shiftCode: sample.shiftCode,
        shiftTimeLocal: sample.shiftTimeLocal,
        officeId: sample.officeId,
        officeName: sample.officeName,
        direction: sample.direction,
        plannedStartAt: plannedStartDate.toISOString(),
        recommendedVehicle: pickedVehicle,
        recommendedDriver: pickedDriver,
        seatCount: optimized.length,
        vehicleCapacity: cap,
        estimatedDistanceKm: totalEstimatedDistanceKm,
        estimatedDurationMinutes: totalDurationMinutes,
        maxDetourRatio,
        warnings,
        stops,
      });
    }
  }

  const totalEstimatedDistanceKm =
    Math.round(clusters.reduce((sum, c) => sum + c.estimatedDistanceKm, 0) * 100) / 100;

  return {
    evaluation: {
      engine: 'TS_CAPACITATED_VRPTW_2OPT',
      orToolsSidecarActive: false,
      methodology:
        'Angular corridor clustering + vehicle capacity packing + 2-opt road-time minimization (urban circuity 1.22x, detour bound check). No external routing fees.',
      totalApprovedBookingsEvaluated: input.bookings.length,
      recommendedClustersCount: clusters.length,
      totalEstimatedDistanceKm,
      unassignedBookingsCount: 0,
    },
    clusters,
  };
}
