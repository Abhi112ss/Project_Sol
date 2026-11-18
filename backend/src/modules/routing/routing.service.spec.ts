import { RoutingService } from './routing.module.js';
import { solveVrptwRecommendations } from './vrptw.solver.js';

describe('RoutingService & VRPTW Solver', () => {
  const service = new RoutingService();

  it('returns the lowest-sequence pending stop with Google Maps navigation URL', () => {
    const next = service.selectNextStop([
      { id: 'stop-1', sequenceNo: 1, latitude: 17.4849, longitude: 78.4138, isPending: false },
      { id: 'stop-3', sequenceNo: 3, latitude: 17.4375, longitude: 78.4483, isPending: true },
      { id: 'stop-2', sequenceNo: 2, latitude: 17.4968, longitude: 78.3614, isPending: true },
    ]);

    expect(next?.id).toBe('stop-2');
    expect(next?.navigationUrl).toContain('destination=17.4968,78.3614');
  });

  it('returns null when no pending stops remain', () => {
    const next = service.selectNextStop([
      { id: 'stop-1', sequenceNo: 1, latitude: 17.4849, longitude: 78.4138, isPending: false },
    ]);
    expect(next).toBeNull();
  });

  it('clusters approved bookings respecting vehicle seating capacity and outer-to-office ordering', () => {
    const res = solveVrptwRecommendations({
      vehicles: [
        {
          id: 'veh-1',
          registrationNo: 'TS 07 UA 4821',
          modelName: 'Maruti Dzire',
          vehicleType: 'SEDAN',
          seatingCapacity: 2,
        },
        {
          id: 'veh-2',
          registrationNo: 'TS 07 UB 9001',
          modelName: 'Toyota Etios',
          vehicleType: 'SEDAN',
          seatingCapacity: 4,
        },
      ],
      drivers: [
        {
          id: 'drv-1',
          driverCode: 'DRV-1',
          fullName: 'Ramesh Kumar',
          assignedVehicleId: 'veh-1',
        },
        {
          id: 'drv-2',
          driverCode: 'DRV-2',
          fullName: 'Suresh Babu',
          assignedVehicleId: 'veh-2',
        },
      ],
      bookings: [
        {
          bookingId: 'b-1',
          employeeId: 'e-1',
          employeeCode: 'EMP-001',
          employeeName: 'Aarav Patel',
          department: 'Platform Engineering',
          officeId: 'off-1',
          officeName: 'Gachibowli Campus',
          officeLatitude: 17.4401,
          officeLongitude: 78.3489,
          shiftId: 'shf-1',
          shiftName: 'Morning Login S1',
          shiftCode: 'S1-LOGIN-0900',
          shiftTimeLocal: '09:00',
          travelDate: '2026-11-17',
          direction: 'LOGIN',
          scheduledPickupAt: '2026-11-17T08:00:00.000Z',
          pickupLocationName: 'Kukatpally',
          address: 'KPHB Phase 3',
          corridorTag: 'KPHB',
          latitude: 17.4933,
          longitude: 78.3914,
        },
        {
          bookingId: 'b-2',
          employeeId: 'e-2',
          employeeCode: 'EMP-002',
          employeeName: 'Priya Nair',
          department: 'Product Design',
          officeId: 'off-1',
          officeName: 'Gachibowli Campus',
          officeLatitude: 17.4401,
          officeLongitude: 78.3489,
          shiftId: 'shf-1',
          shiftName: 'Morning Login S1',
          shiftCode: 'S1-LOGIN-0900',
          shiftTimeLocal: '09:00',
          travelDate: '2026-11-17',
          direction: 'LOGIN',
          scheduledPickupAt: '2026-11-17T08:05:00.000Z',
          pickupLocationName: 'Miyapur',
          address: 'Miyapur Cross',
          corridorTag: 'MIYAPUR',
          latitude: 17.4968,
          longitude: 78.3614,
        },
        {
          bookingId: 'b-3',
          employeeId: 'e-3',
          employeeCode: 'EMP-003',
          employeeName: 'Kiran Varma',
          department: 'Analytics',
          officeId: 'off-1',
          officeName: 'Gachibowli Campus',
          officeLatitude: 17.4401,
          officeLongitude: 78.3489,
          shiftId: 'shf-1',
          shiftName: 'Morning Login S1',
          shiftCode: 'S1-LOGIN-0900',
          shiftTimeLocal: '09:00',
          travelDate: '2026-11-17',
          direction: 'LOGIN',
          scheduledPickupAt: '2026-11-17T08:15:00.000Z',
          pickupLocationName: 'Ameerpet',
          address: 'Ameerpet Metro',
          corridorTag: 'AMEERPET',
          latitude: 17.4375,
          longitude: 78.4483,
        },
      ],
    });

    expect(res.evaluation.engine).toBe('TS_CAPACITATED_VRPTW_2OPT');
    expect(res.evaluation.totalApprovedBookingsEvaluated).toBe(3);
    expect(res.clusters.length).toBeGreaterThanOrEqual(1);
    const totalStops = res.clusters.reduce((s, c) => s + c.stops.length, 0);
    expect(totalStops).toBe(3);
    for (const c of res.clusters) {
      expect(c.seatCount).toBeLessThanOrEqual(c.vehicleCapacity);
      expect(c.stops[0]?.sequenceNo).toBe(1);
      expect(c.estimatedDistanceKm).toBeGreaterThan(0);
    }
  });
});
