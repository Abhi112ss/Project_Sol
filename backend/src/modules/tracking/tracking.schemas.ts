import { z } from 'zod';

const MAX_FUTURE_DRIFT_MS = 5 * 60 * 1000;
const MAX_PAST_DRIFT_MS = 7 * 24 * 60 * 60 * 1000;

export const gpsSampleInputSchema = z
  .object({
    clientPingId: z.string().uuid().optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(5000).nullable().optional(),
    speedMps: z.number().min(0).max(85).nullable().optional(),
    headingDeg: z.number().min(0).max(360).nullable().optional(),
    altitudeM: z.number().min(-500).max(15000).nullable().optional(),
    sequenceNo: z.number().int().min(0).nullable().optional(),
    recordedAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((val) => !(Math.abs(val.latitude) < 0.0001 && Math.abs(val.longitude) < 0.0001), {
    message: 'Invalid Null Island (0, 0) coordinate rejected.',
  })
  .refine(
    (val) => {
      if (!val.recordedAt) return true;
      const ms = new Date(val.recordedAt).getTime();
      if (!Number.isFinite(ms)) return false;
      const now = Date.now();
      return ms <= now + MAX_FUTURE_DRIFT_MS && ms >= now - MAX_PAST_DRIFT_MS;
    },
    { message: 'recordedAt timestamp is outside allowable client drift window.' },
  );

export type GpsSampleInputDto = z.infer<typeof gpsSampleInputSchema>;

export const gpsBatchInputSchema = z.object({
  samples: z.array(gpsSampleInputSchema).min(1).max(100),
});

export type GpsBatchInputDto = z.infer<typeof gpsBatchInputSchema>;

export const FLEET_HEALTH_FILTERS = [
  'LIVE',
  'DELAYED',
  'STALE',
  'NO_SIGNAL',
  'EMERGENCY',
] as const;

export const adminFleetLiveQuerySchema = z.object({
  status: z.enum(['ALL_ACTIVE', 'IN_PROGRESS', 'DRIVER_ACCEPTED', 'ASSIGNED']).default('ALL_ACTIVE'),
  officeId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  health: z.enum(FLEET_HEALTH_FILTERS).optional(),
  search: z.string().trim().max(120).optional(),
});

export type AdminFleetLiveQuery = z.infer<typeof adminFleetLiveQuerySchema>;

export const uuidParamSchema = z.string().uuid();

/**
 * Estimates conservative urban ETA (in integer minutes) from Haversine meters
 * without calling paid routing APIs (₹0 cost policy). Applies 1.25 road-winding
 * multiplier over a bounded urban city speed envelope.
 */
export function estimateConservativeEtaMinutes(
  straightLineMeters: number | null | undefined,
  speedMps: number | null | undefined,
): number | null {
  if (straightLineMeters == null || !Number.isFinite(straightLineMeters) || straightLineMeters < 0) {
    return null;
  }
  if (straightLineMeters > 150_000) return null;
  if (straightLineMeters <= 80) return 1;

  const effectiveSpeedMps =
    speedMps != null && Number.isFinite(speedMps) && speedMps >= 3 && speedMps <= 25
      ? (speedMps + 6.94) / 2
      : 6.94; // ~25 km/h conservative Hyderabad city speed
  const roadMeters = straightLineMeters * 1.25;
  const minutes = Math.ceil(roadMeters / (effectiveSpeedMps * 60));
  return Math.max(1, Math.min(240, minutes));
}

