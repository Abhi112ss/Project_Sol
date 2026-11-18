import { describe, expect, it } from 'vitest';
import {
  intervalsOverlapWithBuffer,
  solveLocalityIntervalAllocation,
  type AllocationBookingCandidate,
  type AllocationDriverCandidate,
  type AllocationExistingTrip,
  type AllocationVehicleCandidate,
} from './allocation.engine.js';

function makeBooking(
  overrides: Partial<AllocationBookingCandidate> & { bookingId: string; employeeCode: string },
): AllocationBookingCandidate {
  return {
    employeeId: `emp-${overrides.employeeCode}`,
    employeeName: `Employee ${overrides.employeeCode}`,
    department: 'Engineering',
    officeId: 'office-gachibowli',
    officeName: 'Gachibowli Tech Park',
    officeLatitude: 17.4401,
    officeLongitude: 78.3489,
    shiftId: 'shift-0900',
    shiftName: 'Morning 09:00',
    shiftCode: 'MORN-09',
    shiftTimeLocal: '09:00',
    travelDate: '2026-11-25',
    direction: 'LOGIN',
    timePreference: 'PICKUP_AT',
    requestedTimeLocal: '08:00',
    timezone: 'Asia/Kolkata',
    requestedPickupAt: '2026-11-25T02:30:00.000Z',
    scheduledPickupAt: '2026-11-25T02:30:00.000Z',
    isArriveByInfeasible: false,
    feasibilityNote: null,
    pickupLocationId: `loc-${overrides.employeeCode}`,
    pickupLocationName: 'Pickup Pin',
    address: 'Hyderabad',
    corridorTag: 'Kukatpally',
    localityId: 'loc-kukatpally',
    normalizedLocality: 'Kukatpally',
    latitude: 17.4849,
    longitude: 78.4138,
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<AllocationVehicleCandidate>): AllocationVehicleCandidate {
  return {
    id: 'veh-sedan-1',
    vendorId: 'vendor-1',
    registrationNo: 'TS07UA1001',
    modelName: 'Dzire',
    vehicleType: 'SEDAN',
    seatingCapacity: 4,
    availabilityStatus: 'AVAILABLE',
    isActive: true,
    ...overrides,
  };
}

function makeDriver(overrides: Partial<AllocationDriverCandidate>): AllocationDriverCandidate {
  return {
    id: 'drv-1',
    vendorId: 'vendor-1',
    driverCode: 'DRV-1',
    fullName: 'Driver One',
    assignedVehicleId: 'veh-sedan-1',
    baseLocalityId: 'loc-kukatpally',
    baseLocalityName: 'Kukatpally',
    baseLatitude: 17.4849,
    baseLongitude: 78.4138,
    availabilityStatus: 'AVAILABLE',
    isSuspended: false,
    ...overrides,
  };
}

describe('solveLocalityIntervalAllocation', () => {
  it('enforces Sedan <= 4 and SUV <= 6 capacity excluding the driver', () => {
    const fiveKukatpally = Array.from({ length: 5 }, (_, idx) =>
      makeBooking({
        bookingId: `b-${idx + 1}`,
        employeeCode: `E-${idx + 1}`,
        latitude: 17.4849 + idx * 0.001,
        longitude: 78.4138 + idx * 0.001,
      }),
    );

    // Only Sedans available -> splits strictly <= 4 per trip (4 + 1)
    const sedanOnlyResult = solveLocalityIntervalAllocation({
      bookings: fiveKukatpally,
      vehicles: [
        makeVehicle({ id: 'veh-s1', registrationNo: 'SEDAN-1', seatingCapacity: 4 }),
        makeVehicle({ id: 'veh-s2', registrationNo: 'SEDAN-2', seatingCapacity: 4 }),
      ],
      drivers: [
        makeDriver({ id: 'drv-s1', assignedVehicleId: 'veh-s1' }),
        makeDriver({ id: 'drv-s2', assignedVehicleId: 'veh-s2' }),
      ],
      existingTrips: [],
    });

    expect(sedanOnlyResult.proposals).toHaveLength(2);
    expect(sedanOnlyResult.proposals.every((p) => p.seatCount <= 4)).toBe(true);
    expect(sedanOnlyResult.summary.allocatedBookingsCount).toBe(5);

    // 7 passengers with 1 SUV (cap 6) + 1 Sedan (cap 4) -> packs 6 in SUV and 1 in Sedan
    const sevenRiders = [
      ...fiveKukatpally,
      makeBooking({ bookingId: 'b-6', employeeCode: 'E-6', latitude: 17.487, longitude: 78.416 }),
      makeBooking({ bookingId: 'b-7', employeeCode: 'E-7', latitude: 17.488, longitude: 78.417 }),
    ];

    const mixedResult = solveLocalityIntervalAllocation({
      bookings: sevenRiders,
      vehicles: [
        makeVehicle({
          id: 'veh-suv',
          registrationNo: 'SUV-1',
          modelName: 'Innova Hycross',
          vehicleType: 'SUV',
          seatingCapacity: 6,
        }),
        makeVehicle({ id: 'veh-s1', registrationNo: 'SEDAN-1', seatingCapacity: 4 }),
      ],
      drivers: [
        makeDriver({ id: 'drv-suv', assignedVehicleId: 'veh-suv' }),
        makeDriver({ id: 'drv-s1', assignedVehicleId: 'veh-s1' }),
      ],
      existingTrips: [],
    });

    expect(mixedResult.proposals).toHaveLength(2);
    const suvProp = mixedResult.proposals.find((p) => p.suggestedVehicle.vehicleType === 'SUV');
    const sedanProp = mixedResult.proposals.find((p) => p.suggestedVehicle.vehicleType === 'SEDAN');
    expect(suvProp?.seatCount).toBe(6);
    expect(sedanProp?.seatCount).toBe(1);
  });

  it('never mixes Chinthal and Hayathnagar across Hyderabad and matches Chinthal driver first', () => {
    const chinthalA = makeBooking({
      bookingId: 'b-chin-1',
      employeeCode: 'CH1',
      corridorTag: 'Chintal',
      localityId: 'loc-chinthal',
      normalizedLocality: 'Chinthal',
      latitude: 17.5015,
      longitude: 78.4586,
    });
    const hayathnagarA = makeBooking({
      bookingId: 'b-hay-1',
      employeeCode: 'HY1',
      corridorTag: 'Hayathnagar',
      localityId: 'loc-hayathnagar',
      normalizedLocality: 'Hayathnagar',
      latitude: 17.3292,
      longitude: 78.6003,
    });

    const result = solveLocalityIntervalAllocation({
      bookings: [chinthalA, hayathnagarA],
      vehicles: [
        makeVehicle({ id: 'veh-chin', registrationNo: 'TS-CHIN-1' }),
        makeVehicle({ id: 'veh-hay', registrationNo: 'TS-HAY-1' }),
      ],
      drivers: [
        makeDriver({
          id: 'drv-chin',
          driverCode: 'DRV-CHIN',
          fullName: 'Suresh Chinthal',
          assignedVehicleId: 'veh-chin',
          baseLocalityId: 'loc-chinthal',
          baseLocalityName: 'Chinthal',
          baseLatitude: 17.5015,
          baseLongitude: 78.4586,
        }),
        makeDriver({
          id: 'drv-hay',
          driverCode: 'DRV-HAY',
          fullName: 'Mahesh Hayathnagar',
          assignedVehicleId: 'veh-hay',
          baseLocalityId: 'loc-hayathnagar',
          baseLocalityName: 'Hayathnagar',
          baseLatitude: 17.3292,
          baseLongitude: 78.6003,
        }),
      ],
      existingTrips: [],
    });

    expect(result.proposals).toHaveLength(2);
    const chinProp = result.proposals.find((p) => p.primaryLocalityName === 'Chinthal');
    const hayProp = result.proposals.find((p) => p.primaryLocalityName === 'Hayathnagar');
    expect(chinProp?.suggestedDriver.id).toBe('drv-chin');
    expect(chinProp?.rationale.localityMatchType).toBe('EXACT_LOCALITY');
    expect(hayProp?.suggestedDriver.id).toBe('drv-hay');
    expect(hayProp?.rationale.localityMatchType).toBe('EXACT_LOCALITY');
  });

  it('merges nearby localities only when distance and route detour ratio allow', () => {
    const locA = makeBooking({
      bookingId: 'b-a1',
      employeeCode: 'A1',
      localityId: 'loc-a',
      normalizedLocality: 'KPHB Phase 1',
      latitude: 17.4849,
      longitude: 78.4138,
    });
    const locB = makeBooking({
      bookingId: 'b-b1',
      employeeCode: 'B1',
      localityId: 'loc-b',
      normalizedLocality: 'KPHB Phase 5',
      latitude: 17.4932, // ~1.2km away towards JNTU
      longitude: 78.4045,
    });

    const result = solveLocalityIntervalAllocation({
      bookings: [locA, locB],
      vehicles: [makeVehicle({ id: 'veh-1' })],
      drivers: [makeDriver({ id: 'drv-1', assignedVehicleId: 'veh-1' })],
      existingTrips: [],
      policy: { nearbyLocalityRadiusM: 4000, maxRouteDetourRatio: 1.75 },
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].seatCount).toBe(2);
    expect(result.proposals[0].rationale.groupingReason).toContain('Nearby compatible locality merge');
  });

  it('allows same driver on non-overlapping morning + evening trips while blocking overlapping trips', () => {
    const morningBooking = makeBooking({
      bookingId: 'b-am',
      employeeCode: 'AM1',
      direction: 'LOGIN',
      scheduledPickupAt: '2026-11-25T02:30:00.000Z', // 08:00 IST
      requestedPickupAt: '2026-11-25T02:30:00.000Z',
    });
    const eveningBooking = makeBooking({
      bookingId: 'b-pm',
      employeeCode: 'PM1',
      direction: 'LOGOUT',
      requestedTimeLocal: '18:30',
      scheduledPickupAt: '2026-11-25T13:00:00.000Z', // 18:30 IST
      requestedPickupAt: '2026-11-25T13:00:00.000Z',
    });

    const singleDriver = [makeDriver({ id: 'drv-solo', assignedVehicleId: 'veh-solo' })];
    const singleVehicle = [makeVehicle({ id: 'veh-solo' })];

    const nonOverlap = solveLocalityIntervalAllocation({
      bookings: [morningBooking, eveningBooking],
      drivers: singleDriver,
      vehicles: singleVehicle,
      existingTrips: [],
    });

    expect(nonOverlap.proposals).toHaveLength(2);
    expect(nonOverlap.proposals[0].suggestedDriver.id).toBe('drv-solo');
    expect(nonOverlap.proposals[1].suggestedDriver.id).toBe('drv-solo');
    expect(nonOverlap.unallocatedGroups).toHaveLength(0);

    // Overlapping second group at 08:15 IST in nearby Hayathnagar cannot double-book drv-solo
    const overlappingBooking = makeBooking({
      bookingId: 'b-am-overlap',
      employeeCode: 'AM2',
      localityId: 'loc-hayathnagar',
      normalizedLocality: 'Hayathnagar',
      latitude: 17.3292,
      longitude: 78.6003,
      scheduledPickupAt: '2026-11-25T02:45:00.000Z',
      requestedPickupAt: '2026-11-25T02:45:00.000Z',
    });

    const conflictRun = solveLocalityIntervalAllocation({
      bookings: [morningBooking, overlappingBooking],
      drivers: singleDriver,
      vehicles: singleVehicle,
      existingTrips: [],
    });

    expect(conflictRun.proposals).toHaveLength(1);
    expect(conflictRun.unallocatedGroups).toHaveLength(1);
    expect(conflictRun.unallocatedGroups[0].reasonCode).toBe('NO_AVAILABLE_DRIVER_OR_VEHICLE');
  });

  it('surfaces spare seat suggestions on unstarted existing trips without auto-mutating them', () => {
    const newBooking = makeBooking({
      bookingId: 'b-spare',
      employeeCode: 'SP1',
      latitude: 17.4855,
      longitude: 78.4142,
    });
    const existingTrip: AllocationExistingTrip = {
      tripId: 'trip-existing-1',
      tripCode: 'TRP-EXISTING-1',
      driverId: 'drv-1',
      driverName: 'Ramesh',
      vehicleId: 'veh-1',
      vehicleRegistrationNo: 'TS07UA4821',
      vehicleType: 'SEDAN',
      seatingCapacity: 4,
      passengerCount: 2,
      status: 'ASSIGNED',
      travelDate: '2026-11-25',
      direction: 'LOGIN',
      officeId: 'office-gachibowli',
      officeName: 'Gachibowli Tech Park',
      shiftId: 'shift-0900',
      plannedStartAt: '2026-11-25T02:30:00.000Z',
      plannedEndAt: '2026-11-25T03:20:00.000Z',
      primaryLocalityId: 'loc-kukatpally',
      primaryLocalityName: 'Kukatpally',
      stopCoords: [{ latitude: 17.4849, longitude: 78.4138 }],
    };

    const result = solveLocalityIntervalAllocation({
      bookings: [newBooking],
      drivers: [],
      vehicles: [],
      existingTrips: [existingTrip],
    });

    expect(result.spareSeatSuggestions).toHaveLength(1);
    expect(result.spareSeatSuggestions[0].spareSeats).toBe(2);
    expect(result.spareSeatSuggestions[0].candidateBookingIds).toEqual(['b-spare']);
  });

  it('respects turnaround buffer on boundary timestamps', () => {
    const s1 = new Date('2026-11-25T08:00:00Z').getTime();
    const e1 = new Date('2026-11-25T09:00:00Z').getTime();
    // Starts 10 mins after e1 -> overlaps with 20-min buffer
    const s2 = new Date('2026-11-25T09:10:00Z').getTime();
    const e2 = new Date('2026-11-25T10:00:00Z').getTime();
    expect(intervalsOverlapWithBuffer(s1, e1, s2, e2, 20)).toBe(true);
    // Starts 25 mins after e1 -> fits cleanly
    const s3 = new Date('2026-11-25T09:25:00Z').getTime();
    const e3 = new Date('2026-11-25T10:15:00Z').getTime();
    expect(intervalsOverlapWithBuffer(s1, e1, s3, e3, 20)).toBe(false);
  });

  it('plans backward pickup windows for ARRIVE_BY bookings and flags cross-zone fallbacks when exact driver absent', () => {
    const arriveByBooking = makeBooking({
      bookingId: 'b-arr-1',
      employeeCode: 'AR1',
      localityId: 'loc-chinthal',
      normalizedLocality: 'Chinthal',
      latitude: 17.5015,
      longitude: 78.4586,
      timePreference: 'ARRIVE_BY',
      requestedTimeLocal: '09:00',
      requestedPickupAt: '2026-11-25T03:30:00.000Z', // target office arrival 09:00 IST
      scheduledPickupAt: '2026-11-25T02:35:00.000Z',
    });

    const farDriver = makeDriver({
      id: 'drv-hay-fallback',
      driverCode: 'DRV-HY-FB',
      fullName: 'Far Driver',
      assignedVehicleId: 'veh-1',
      baseLocalityId: 'loc-hayathnagar',
      baseLocalityName: 'Hayathnagar',
      baseLatitude: 17.3292,
      baseLongitude: 78.6003,
    });

    const res = solveLocalityIntervalAllocation({
      bookings: [arriveByBooking],
      drivers: [farDriver],
      vehicles: [makeVehicle({ id: 'veh-1' })],
      existingTrips: [],
    });

    expect(res.proposals).toHaveLength(1);
    const prop = res.proposals[0];
    expect(new Date(prop.plannedEndAt).getTime()).toBeLessThanOrEqual(
      new Date('2026-11-25T03:30:00.000Z').getTime(),
    );
    expect(prop.rationale.localityMatchType).toBe('CROSS_ZONE_FALLBACK');
    expect(prop.rationale.warnings[0]).toContain('outside Chinthal');
  });
});
