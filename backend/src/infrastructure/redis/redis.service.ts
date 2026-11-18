import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.service.js';

export interface LiveLocationPayload {
  sampleId?: string;
  organizationId?: string;
  driverId: string;
  tripId: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  altitudeM?: number | null;
  sequenceNo?: number | null;
  recordedAt: string;
  serverReceivedAt: string;
  etaMinutes?: number | null;
  distanceToNextStopM?: number | null;
}

export interface LiveLocationSnapshot extends LiveLocationPayload {
  ageSeconds: number;
  isStale: boolean;
}

export const REDIS_KEYS = {
  driverLocation: (driverId: string) => `transport:driver:${driverId}:location`,
  driverActiveTrip: (driverId: string) => `transport:driver:${driverId}:active-trip`,
  tripLive: (tripId: string) => `transport:trip:${tripId}:live`,
  tripCurrentStop: (tripId: string) => `transport:trip:${tripId}:current-stop`,
  employeeCache: (employeeId: string) => `transport:cache:employee:${employeeId}`,
  vehicleCache: (vehicleId: string) => `transport:cache:vehicle:${vehicleId}`,
  idempotency: (orgId: string, key: string) => `transport:idem:${orgId}:${key}`,
} as const;

const LIVE_LOCATION_TTL_SECONDS = 180;
const ACTIVE_TRIP_TTL_SECONDS = 43_200;

// Atomic Redis compare-and-set guarding against older offline pings overwriting fresher telemetry.
const SET_IF_NEWER_LOCATION_LUA = `
local key = KEYS[1]
local nextJson = ARGV[1]
local nextTs = tonumber(ARGV[2])
local nextSeq = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local existing = redis.call('GET', key)
if not existing then
  redis.call('SET', key, nextJson, 'EX', ttl)
  return 1
end
local ok, decoded = pcall(cjson.decode, existing)
if not ok or type(decoded) ~= 'table' or not decoded['recordedAt'] then
  redis.call('SET', key, nextJson, 'EX', ttl)
  return 1
end
local prevTsStr = decoded['recordedAt']
if type(prevTsStr) ~= 'string' then
  redis.call('SET', key, nextJson, 'EX', ttl)
  return 1
end
-- Compare stored numeric epoch if cached, otherwise allow equality fallback via ARGV
local prevEpoch = tonumber(decoded['_recordedAtMs']) or 0
local prevSeq = tonumber(decoded['sequenceNo']) or 0
if nextTs > prevEpoch or (nextTs == prevEpoch and nextSeq > prevSeq) then
  redis.call('SET', key, nextJson, 'EX', ttl)
  return 1
end
return 0
`;

function toLiveSnapshot(
  raw: string | null,
  staleThresholdSeconds: number,
): LiveLocationSnapshot | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as LiveLocationPayload & { _recordedAtMs?: number };
  const recordedMs = parsed._recordedAtMs ?? new Date(parsed.recordedAt).getTime();
  const safeRecordedMs = Number.isFinite(recordedMs)
    ? recordedMs
    : new Date(parsed.serverReceivedAt).getTime();
  const ageSeconds = Math.max(0, Math.floor((Date.now() - safeRecordedMs) / 1000));
  const cleanPayload: LiveLocationPayload = {
    sampleId: parsed.sampleId,
    organizationId: parsed.organizationId,
    driverId: parsed.driverId,
    tripId: parsed.tripId,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    accuracyM: parsed.accuracyM ?? null,
    speedMps: parsed.speedMps ?? null,
    headingDeg: parsed.headingDeg ?? null,
    altitudeM: parsed.altitudeM ?? null,
    sequenceNo: parsed.sequenceNo ?? null,
    recordedAt: parsed.recordedAt,
    serverReceivedAt: parsed.serverReceivedAt,
    etaMinutes: parsed.etaMinutes ?? null,
    distanceToNextStopM: parsed.distanceToNextStopM ?? null,
  };
  return {
    ...cleanPayload,
    ageSeconds,
    isStale: ageSeconds > staleThresholdSeconds,
  };
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(private readonly config: AppConfigService) {
    this.client = new Redis({
      host: this.config.redisHost,
      port: this.config.redisPort,
      password: this.config.redisPassword || undefined,
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async setLiveDriverLocation(payload: LiveLocationPayload): Promise<void> {
    const key = REDIS_KEYS.driverLocation(payload.driverId);
    const enriched = { ...payload, _recordedAtMs: new Date(payload.recordedAt).getTime() };
    await this.client.set(key, JSON.stringify(enriched), 'EX', LIVE_LOCATION_TTL_SECONDS);
  }

  async setLiveLocationIfNewer(
    payload: LiveLocationPayload,
    ttlSeconds = LIVE_LOCATION_TTL_SECONDS,
    staleThresholdSeconds = 60,
  ): Promise<{ updated: boolean; transitionedToLive: boolean }> {
    const recordedMs = new Date(payload.recordedAt).getTime();
    const safeRecordedMs = Number.isFinite(recordedMs) ? recordedMs : Date.now();
    const safeSeq = payload.sequenceNo ?? 0;
    const safeTtl = Math.max(LIVE_LOCATION_TTL_SECONDS, ttlSeconds);
    const serialized = JSON.stringify({
      ...payload,
      _recordedAtMs: safeRecordedMs,
    });

    const tripKey = REDIS_KEYS.tripLive(payload.tripId);
    const driverKey = REDIS_KEYS.driverLocation(payload.driverId);

    const existingTrip = await this.getLiveTripLocation(payload.tripId, staleThresholdSeconds);
    const previousWasMissingOrStale = existingTrip === null || existingTrip.isStale;

    const [tripRes] = await Promise.all([
      this.client.eval(
        SET_IF_NEWER_LOCATION_LUA,
        1,
        tripKey,
        serialized,
        String(safeRecordedMs),
        String(safeSeq),
        String(safeTtl),
      ),
      this.client.eval(
        SET_IF_NEWER_LOCATION_LUA,
        1,
        driverKey,
        serialized,
        String(safeRecordedMs),
        String(safeSeq),
        String(safeTtl),
      ),
      this.setDriverActiveTrip(payload.driverId, payload.tripId),
    ]);

    const updated = Number(tripRes) === 1;
    const ageNow = Math.max(0, Math.floor((Date.now() - safeRecordedMs) / 1000));
    const isFreshNow = ageNow <= staleThresholdSeconds;

    return {
      updated,
      transitionedToLive: updated && isFreshNow && previousWasMissingOrStale,
    };
  }

  async updateLiveTripEtaIfSameOrOlder(
    tripId: string,
    recordedAtIso: string,
    etaMinutes: number | null,
    distanceToNextStopM: number | null,
    ttlSeconds = LIVE_LOCATION_TTL_SECONDS,
  ): Promise<void> {
    const tripKey = REDIS_KEYS.tripLive(tripId);
    const raw = await this.client.get(tripKey);
    if (!raw) return;
    const parsed = JSON.parse(raw) as LiveLocationPayload & { _recordedAtMs?: number };
    const currentMs = parsed._recordedAtMs ?? new Date(parsed.recordedAt).getTime();
    const jobMs = new Date(recordedAtIso).getTime();
    if (Number.isFinite(currentMs) && Number.isFinite(jobMs) && currentMs > jobMs) {
      // Never attach old stop ETA onto a newer GPS coordinate
      return;
    }
    const next = {
      ...parsed,
      etaMinutes,
      distanceToNextStopM,
    };
    await this.client.set(tripKey, JSON.stringify(next), 'EX', Math.max(LIVE_LOCATION_TTL_SECONDS, ttlSeconds));
  }

  async getLiveDriverLocation(
    driverId: string,
    staleThresholdSeconds = 60,
  ): Promise<LiveLocationSnapshot | null> {
    const raw = await this.client.get(REDIS_KEYS.driverLocation(driverId));
    return toLiveSnapshot(raw, staleThresholdSeconds);
  }

  async getLiveTripLocation(
    tripId: string,
    staleThresholdSeconds = 60,
  ): Promise<LiveLocationSnapshot | null> {
    const raw = await this.client.get(REDIS_KEYS.tripLive(tripId));
    return toLiveSnapshot(raw, staleThresholdSeconds);
  }

  async getLiveTripLocationsBatch(
    tripIds: string[],
    staleThresholdSeconds = 60,
  ): Promise<Map<string, LiveLocationSnapshot>> {
    const result = new Map<string, LiveLocationSnapshot>();
    if (tripIds.length === 0) return result;
    const keys = tripIds.map((id) => REDIS_KEYS.tripLive(id));
    const rows = await this.client.mget(...keys);
    for (let i = 0; i < tripIds.length; i += 1) {
      const snap = toLiveSnapshot(rows[i] ?? null, staleThresholdSeconds);
      if (snap) {
        result.set(tripIds[i], snap);
      }
    }
    return result;
  }

  async setDriverActiveTrip(driverId: string, tripId: string): Promise<void> {
    await this.client.set(
      REDIS_KEYS.driverActiveTrip(driverId),
      tripId,
      'EX',
      ACTIVE_TRIP_TTL_SECONDS,
    );
  }

  async clearDriverActiveTrip(driverId: string): Promise<void> {
    await this.client.del(REDIS_KEYS.driverActiveTrip(driverId));
  }

  async clearTripLiveState(tripId: string, driverId?: string | null): Promise<void> {
    const keysToDelete = [REDIS_KEYS.tripLive(tripId)];
    if (driverId) {
      keysToDelete.push(REDIS_KEYS.driverActiveTrip(driverId), REDIS_KEYS.driverLocation(driverId));
    }
    await this.client.del(...keysToDelete);
  }
}

