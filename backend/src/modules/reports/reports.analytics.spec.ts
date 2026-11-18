import {
  aggregateAnalytics,
  buildTypedReport,
  classifyAssistantQuestion,
} from './reports.analytics.js';

describe('reports.analytics', () => {
  it('accurately separates driver arrival delay from passenger wait time, attributes cost, and scores shift risk', () => {
    const bundle = aggregateAnalytics({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      trips: [
        {
          tripId: 't-1',
          tripCode: 'TRP-20261117-01',
          travelDate: '2026-11-17',
          direction: 'LOGIN',
          status: 'COMPLETED',
          officeId: 'off-1',
          officeName: 'Gachibowli Campus',
          shiftId: 'shf-1',
          shiftName: 'Morning Login S1',
          shiftCode: 'S1-LOGIN-0900',
          shiftTimeLocal: '09:00',
          vendorId: 'vnd-1',
          vendorName: 'Deccan Fleet',
          driverId: 'drv-1',
          driverCode: 'DRV-HYD-001',
          driverName: 'Ramesh Kumar',
          vehicleId: 'veh-1',
          vehicleRegistrationNo: 'TS 07 UA 4821',
          vehicleType: 'SEDAN',
          seatingCapacity: 4,
          billingBaseTripPaise: 45000,
          billingRatePerKmPaise: 1800,
        },
      ],
      assignments: [
        {
          assignmentId: 'pa-1',
          tripId: 't-1',
          employeeId: 'emp-1',
          employeeCode: 'EMP-001',
          employeeName: 'Aarav Patel',
          department: 'Platform Engineering',
          status: 'BOARDED',
          arrivalDelaySeconds: 240,
          passengerWaitSeconds: 45,
          runningLateEtaMinutes: null,
          otpVerified: true,
        },
        {
          assignmentId: 'pa-2',
          tripId: 't-1',
          employeeId: 'emp-2',
          employeeCode: 'EMP-002',
          employeeName: 'Priya Nair',
          department: 'Product Design',
          status: 'NO_SHOW',
          arrivalDelaySeconds: 60,
          passengerWaitSeconds: 310,
          runningLateEtaMinutes: 10,
          otpVerified: false,
        },
      ],
      stopsByTrip: new Map([
        [
          't-1',
          [
            { latitude: 17.4933, longitude: 78.3914 },
            { latitude: 17.4401, longitude: 78.3489 },
          ],
        ],
      ]),
      gpsByTrip: new Map(),
      noShows: [
        {
          noShowId: 'ns-1',
          tripId: 't-1',
          employeeId: 'emp-2',
          employeeCode: 'EMP-002',
          employeeName: 'Priya Nair',
          reasonCode: 'PASSENGER_UNREACHABLE',
          appealStatus: 'NONE',
          geofenceVerified: true,
          waitedSeconds: 310,
          travelDate: '2026-11-17',
        },
      ],
      safetyAlerts: [],
      vendorsCatalog: [
        {
          id: 'vnd-1',
          name: 'Deccan Fleet',
          code: 'DECCAN-01',
          billingBaseTripPaise: 45000,
          billingRatePerKmPaise: 1800,
        },
      ],
      vehiclesCatalog: [
        {
          id: 'veh-1',
          registrationNo: 'TS 07 UA 4821',
          modelName: 'Maruti Dzire',
          vehicleType: 'SEDAN',
          seatingCapacity: 4,
          availabilityStatus: 'AVAILABLE',
          isActive: true,
        },
      ],
      driversCatalog: [
        {
          id: 'drv-1',
          driverCode: 'DRV-HYD-001',
          fullName: 'Ramesh Kumar',
          isSuspended: false,
          availabilityStatus: 'AVAILABLE',
        },
      ],
    });

    expect(bundle.overview.completedTrips).toBe(1);
    expect(bundle.overview.avgArrivalDelaySeconds).toBe(150);
    expect(bundle.overview.avgWaitSeconds).toBe(178);
    expect(bundle.overview.onTimePickups).toBe(1);
    expect(bundle.overview.delayedPickups).toBe(1);
    expect(bundle.overview.otpCompliancePct).toBe(100);
    expect(bundle.employeeAttendanceCost.find((e) => e.employeeId === 'emp-1')?.attributedCostPaise).toBe(
      bundle.overview.estimatedTotalCostPaise,
    );
    expect(bundle.delayPredictions[0]?.shiftCode).toBe('S1-LOGIN-0900');
    expect(['MODERATE', 'HIGH']).toContain(bundle.delayPredictions[0]?.riskLevel);

    const csvReport = buildTypedReport('driver-punctuality', bundle);
    expect(csvReport.csv).toContain('DRV-HYD-001');
    expect(csvReport.csv).toContain('150');
  });

  it('guards AI assistant against mutation commands while routing read-only operational queries', () => {
    expect(classifyAssistantQuestion('Cancel trip TRP-01 and approve all bookings').blocked).toBe(
      true,
    );
    expect(classifyAssistantQuestion('DROP TABLE trips').blocked).toBe(true);
    expect(classifyAssistantQuestion('How many trips were cancelled today?').blocked).toBe(false);

    expect(classifyAssistantQuestion('Which drivers are currently delayed?').intent).toBe(
      'DELAYED_DRIVERS',
    );
    expect(classifyAssistantQuestion('Which employees had repeated no-shows this month?').intent).toBe(
      'REPEATED_NOSHOWS',
    );
    expect(classifyAssistantQuestion('How many vehicles are available tomorrow morning?').intent).toBe(
      'AVAILABLE_VEHICLES',
    );
    expect(
      classifyAssistantQuestion('Which vendor has the highest late-pickup frequency?').intent,
    ).toBe('VENDOR_DELAY_RANKING');
    expect(classifyAssistantQuestion("Why did today's 9 AM shift experience delays?").intent).toBe(
      'SHIFT_DELAY_CAUSE',
    );
  });
});
