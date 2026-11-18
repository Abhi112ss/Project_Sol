import { describe, expect, it } from 'vitest';
import {
  evaluateLongStoppage,
  evaluateRouteDeviation,
  pointToSegmentDistanceMeters,
} from './safety.detectors.js';

describe('Phase 6 Safety Anomaly Detectors', () => {
  it('computes orthogonal corridor distance accurately across Hyderabad segments', () => {
    // Straight corridor along Miyapur -> Kukatpally -> Gachibowli
    const stops = [
      { latitude: 17.4968, longitude: 78.3614, status: 'ACTIVE', geofenceRadiusM: 150 },
      { latitude: 17.4849, longitude: 78.4138, status: 'PENDING', geofenceRadiusM: 150 },
      { latitude: 17.4401, longitude: 78.3489, status: 'PENDING', geofenceRadiusM: 250 },
    ];

    const onCorridor = evaluateRouteDeviation({
      latitude: 17.4908,
      longitude: 78.3876,
      speedMps: 9.5,
      routeStops: stops,
    });
    expect(onCorridor.isDeviated).toBe(false);
    expect(onCorridor.minDistanceMeters).toBeLessThan(300);

    // Detour > 3km east toward Secunderabad while moving
    const offCorridor = evaluateRouteDeviation({
      latitude: 17.4450,
      longitude: 78.4850,
      speedMps: 11.0,
      routeStops: stops,
    });
    expect(offCorridor.isDeviated).toBe(true);
    expect(offCorridor.minDistanceMeters).toBeGreaterThan(5000);

    expect(
      pointToSegmentDistanceMeters(17.4908, 78.3876, 17.4968, 78.3614, 17.4849, 78.4138),
    ).toBeLessThan(200);
  });

  it('ignores stationary wait inside planned pickup stop geofence and flags mid-route stoppages > 5 min', () => {
    const stops = [
      { latitude: 17.4968, longitude: 78.3614, status: 'ARRIVED', geofenceRadiusM: 150 },
      { latitude: 17.4401, longitude: 78.3489, status: 'PENDING', geofenceRadiusM: 250 },
    ];
    const now = Date.now();
    const samples = [
      { latitude: 17.49685, longitude: 78.36142, speedMps: 0.2, recordedAt: new Date(now - 360_000) },
      { latitude: 17.49682, longitude: 78.36141, speedMps: 0.1, recordedAt: new Date(now - 180_000) },
      { latitude: 17.49681, longitude: 78.36140, speedMps: 0.0, recordedAt: new Date(now) },
    ];

    // Waiting right at pickup stop -> not an unscheduled stoppage
    const insideStop = evaluateLongStoppage({
      latitude: 17.49681,
      longitude: 78.36140,
      routeStops: stops,
      recentSamples: samples,
    });
    expect(insideStop.isStopped).toBe(false);

    // Mid-corridor stationary for 6 minutes far away from stops
    const midCorridor = evaluateLongStoppage({
      latitude: 17.4680,
      longitude: 78.3820,
      routeStops: stops,
      recentSamples: [
        { latitude: 17.46801, longitude: 78.38201, speedMps: 0.3, recordedAt: new Date(now - 360_000) },
        { latitude: 17.46802, longitude: 78.38202, speedMps: 0.1, recordedAt: new Date(now - 120_000) },
        { latitude: 17.46800, longitude: 78.38200, speedMps: 0.0, recordedAt: new Date(now) },
      ],
    });
    expect(midCorridor.isStopped).toBe(true);
    expect(midCorridor.durationSeconds).toBeGreaterThanOrEqual(300);
  });
});

