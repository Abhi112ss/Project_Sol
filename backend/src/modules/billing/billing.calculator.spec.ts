import {
  calculateInvoiceTotals,
  calculateTripLineBilling,
  computeTripDistanceKm,
  formatInvoiceStatementCsv,
} from './billing.calculator.js';

describe('billing.calculator', () => {
  it('prefers GPS trace distance when polyline exceeds 200m and falls back to 1.22x stop corridor otherwise', () => {
    const gpsResult = computeTripDistanceKm(
      [
        { latitude: 17.4401, longitude: 78.3489 },
        { latitude: 17.47, longitude: 78.39 },
      ],
      [
        { latitude: 17.4401, longitude: 78.3489 },
        { latitude: 17.45, longitude: 78.36 },
      ],
    );
    expect(gpsResult.distanceSource).toBe('GPS_TRACE');
    expect(gpsResult.distanceKm).toBeGreaterThan(4);

    const stopFallback = computeTripDistanceKm(
      [{ latitude: 17.4401, longitude: 78.3489 }],
      [
        { latitude: 17.4933, longitude: 78.3914 },
        { latitude: 17.4401, longitude: 78.3489 },
      ],
    );
    expect(stopFallback.distanceSource).toBe('STOP_CORRIDOR_ESTIMATE');
    expect(stopFallback.distanceKm).toBeGreaterThan(7);
  });

  it('computes integer paise trip fees, 5% GST invoice totals, and formula-safe CSV statement', () => {
    const line1 = calculateTripLineBilling({
      tripId: 't1',
      tripCode: 'TRP-20261117-A1',
      travelDate: '2026-11-17',
      direction: 'LOGIN',
      shiftName: 'Morning Login S1',
      driverName: 'Ramesh Kumar',
      vehicleRegistrationNo: 'TS 07 UA 4821',
      boardedCount: 2,
      noShowCount: 1,
      delayedStopsCount: 1,
      distanceKm: 10,
      distanceSource: 'GPS_TRACE',
      baseTripPaise: 45000,
      ratePerKmPaise: 1800,
    });
    expect(line1.baseFeePaise).toBe(45000);
    expect(line1.distanceFeePaise).toBe(18000);
    expect(line1.lineSubtotalPaise).toBe(63000);
    expect(line1.disputeFlags).toContain('DELAYED_STOPS_1');

    const totals = calculateInvoiceTotals([line1], 500);
    expect(totals.subtotalPaise).toBe(63000);
    expect(totals.taxPaise).toBe(3150);
    expect(totals.totalPaise).toBe(66150);

    const csv = formatInvoiceStatementCsv({
      invoiceNumber: 'INV-202611-DECCAN-0001',
      vendorName: '=Deccan Fleet, Inc.',
      vendorCode: 'DECCAN-01',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      status: 'DRAFT',
      currency: 'INR',
      totals,
      lineItems: [line1],
    });
    expect(csv).toContain("'=Deccan Fleet, Inc.");
    expect(csv).toContain('TRP-20261117-A1');
    expect(csv).toContain('661.50');
  });
});
