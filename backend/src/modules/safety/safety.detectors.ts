import { haversineDistanceMeters } from '../../infrastructure/shared/maps.util.js';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface CorridorStopPoint extends GeoPoint {
  status: string;
  geofenceRadiusM?: number | null;
}

export interface SpeedSamplePoint extends GeoPoint {
  speedMps?: number | null;
  recordedAt: Date;
}

/**
 * Projects point P orthogonally onto segment A->B using local tangent plane scaling
 * and returns geodesic Haversine distance (meters) from P to the closest segment point.
 */
export function pointToSegmentDistanceMeters(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const metersPerDegLat = 110_574;
  const metersPerDegLng = Math.max(1, 111_320 * cosLat);

  const ax = (aLng - pLng) * metersPerDegLng;
  const ay = (aLat - pLat) * metersPerDegLat;
  const bx = (bLng - pLng) * metersPerDegLng;
  const by = (bLat - pLat) * metersPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-6) {
    return Math.round(haversineDistanceMeters(pLat, pLng, aLat, aLng));
  }

  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  const closestLng = aLng + t * (bLng - aLng);
  const closestLat = aLat + t * (bLat - aLat);
  return Math.round(haversineDistanceMeters(pLat, pLng, closestLat, closestLng));
}

export function evaluateRouteDeviation(input: {
  latitude: number;
  longitude: number;
  speedMps?: number | null;
  routeStops: CorridorStopPoint[];
  thresholdMeters?: number;
  minMovingSpeedMps?: number;
}): { isDeviated: boolean; minDistanceMeters: number } {
  const threshold = input.thresholdMeters ?? 1500;
  const minSpeed = input.minMovingSpeedMps ?? 3.0;

  if (input.routeStops.length === 0) {
    return { isDeviated: false, minDistanceMeters: 0 };
  }

  let minDistanceMeters = Number.POSITIVE_INFINITY;
  if (input.routeStops.length === 1) {
    minDistanceMeters = Math.round(
      haversineDistanceMeters(
        input.latitude,
        input.longitude,
        input.routeStops[0].latitude,
        input.routeStops[0].longitude,
      ),
    );
  } else {
    for (let i = 0; i < input.routeStops.length - 1; i++) {
      const a = input.routeStops[i];
      const b = input.routeStops[i + 1];
      const d = pointToSegmentDistanceMeters(
        input.latitude,
        input.longitude,
        a.latitude,
        a.longitude,
        b.latitude,
        b.longitude,
      );
      if (d < minDistanceMeters) minDistanceMeters = d;
    }
  }

  const moving = input.speedMps == null || input.speedMps >= minSpeed;
  return {
    isDeviated: moving && minDistanceMeters > threshold,
    minDistanceMeters,
  };
}

export function evaluateLongStoppage(input: {
  latitude: number;
  longitude: number;
  routeStops: CorridorStopPoint[];
  recentSamples: SpeedSamplePoint[];
  thresholdSeconds?: number;
  maxDriftMeters?: number;
}): { isStopped: boolean; durationSeconds: number } {
  const thresholdSeconds = input.thresholdSeconds ?? 300;
  const maxDriftMeters = input.maxDriftMeters ?? 45;

  // Never trigger mid-corridor stoppage alarm while parked inside a legitimate pickup stop geofence
  const insidePlannedStop = input.routeStops.some((stop) => {
    const radius = Math.max(150, stop.geofenceRadiusM ?? 150);
    const d = haversineDistanceMeters(
      input.latitude,
      input.longitude,
      stop.latitude,
      stop.longitude,
    );
    return d <= radius + 50;
  });
  if (insidePlannedStop || input.recentSamples.length < 2) {
    return { isStopped: false, durationSeconds: 0 };
  }

  // Sort newest -> oldest
  const ordered = [...input.recentSamples].sort(
    (a, b) => b.recordedAt.getTime() - a.recordedAt.getTime(),
  );
  const latest = ordered[0];
  if (latest.speedMps != null && latest.speedMps >= 1.2) {
    return { isStopped: false, durationSeconds: 0 };
  }

  let oldestStationaryTime = latest.recordedAt.getTime();
  for (let i = 1; i < ordered.length; i++) {
    const sample = ordered[i];
    if (sample.speedMps != null && sample.speedMps >= 1.2) break;
    const dist = haversineDistanceMeters(
      latest.latitude,
      latest.longitude,
      sample.latitude,
      sample.longitude,
    );
    if (dist > maxDriftMeters) break;
    oldestStationaryTime = sample.recordedAt.getTime();
  }

  const durationSeconds = Math.max(
    0,
    Math.floor((latest.recordedAt.getTime() - oldestStationaryTime) / 1000),
  );
  return {
    isStopped: durationSeconds >= thresholdSeconds,
    durationSeconds,
  };
}

