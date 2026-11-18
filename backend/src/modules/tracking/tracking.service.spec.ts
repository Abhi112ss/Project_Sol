import { describe, expect, it } from 'vitest';
import {
  estimateConservativeEtaMinutes,
  gpsBatchInputSchema,
  gpsSampleInputSchema,
} from './tracking.schemas.js';

describe('Phase 5 Tracking Schemas & ETA Estimator', () => {
  it('accepts valid Hyderabad WGS84 telemetry pings and rejects Null Island (0, 0)', () => {
    const valid = gpsSampleInputSchema.safeParse({
      latitude: 17.4401,
      longitude: 78.3489,
      accuracyM: 12.5,
      speedMps: 8.4,
      headingDeg: 132,
      altitudeM: 540,
      sequenceNo: 1,
      recordedAt: new Date().toISOString(),
    });
    expect(valid.success).toBe(true);

    const nullIsland = gpsSampleInputSchema.safeParse({
      latitude: 0,
      longitude: 0,
      accuracyM: 10,
    });
    expect(nullIsland.success).toBe(false);
  });

  it('rejects out-of-range latitude/longitude, excessive future clock drift, and oversized batch', () => {
    expect(
      gpsSampleInputSchema.safeParse({
        latitude: 95,
        longitude: 78.3,
      }).success,
    ).toBe(false);

    const tenMinFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect(
      gpsSampleInputSchema.safeParse({
        latitude: 17.44,
        longitude: 78.35,
        recordedAt: tenMinFuture,
      }).success,
    ).toBe(false);

    const emptyBatch = gpsBatchInputSchema.safeParse({ samples: [] });
    expect(emptyBatch.success).toBe(false);

    const oversized = gpsBatchInputSchema.safeParse({
      samples: Array.from({ length: 101 }, () => ({
        latitude: 17.44,
        longitude: 78.35,
      })),
    });
    expect(oversized.success).toBe(false);
  });

  it('computes conservative bounded urban ETA minutes safely without paid directions API', () => {
    expect(estimateConservativeEtaMinutes(null, 8)).toBeNull();
    expect(estimateConservativeEtaMinutes(200_000, 8)).toBeNull();
    expect(estimateConservativeEtaMinutes(50, 8)).toBe(1);
    // ~4 km at ~25 km/h with 1.25 winding factor -> ~12 min
    const eta = estimateConservativeEtaMinutes(4000, 7);
    expect(eta).toBeGreaterThanOrEqual(8);
    expect(eta).toBeLessThanOrEqual(18);
  });
});

