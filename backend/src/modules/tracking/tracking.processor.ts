import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { and, asc, eq, lt } from 'drizzle-orm';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { gpsLocations, organizationSettings, trips, tripStops } from '../../infrastructure/database/schema/index.js';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { haversineDistanceMeters } from '../../infrastructure/shared/maps.util.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SafetyService } from '../safety/safety.service.js';
import { estimateConservativeEtaMinutes } from './tracking.schemas.js';

export interface LocationProcessJobData {
  organizationId: string;
  tripId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  speedMps: number | null;
  recordedAt: string;
  ttlSeconds: number;
}

@Processor(QUEUE_NAMES.LOCATION_PROCESSING)
export class LocationProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(LocationProcessingProcessor.name);

  constructor(
    private readonly dbService: DatabaseService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
    private readonly safety: SafetyService,
  ) {
    super();
  }

  async process(job: Job<LocationProcessJobData | { organizationId: string }>): Promise<unknown> {
    if (job.name === 'purge-retention') {
      const { organizationId } = job.data as { organizationId: string };
      return this.pruneOrganizationHistory(organizationId);
    }

    const payload = job.data as LocationProcessJobData;
    const [[trip], stops] = await Promise.all([
      this.dbService.db
        .select({ tripCode: trips.tripCode })
        .from(trips)
        .where(and(eq(trips.id, payload.tripId), eq(trips.organizationId, payload.organizationId)))
        .limit(1),
      this.dbService.db
        .select()
        .from(tripStops)
        .where(and(eq(tripStops.tripId, payload.tripId), eq(tripStops.organizationId, payload.organizationId)))
        .orderBy(asc(tripStops.sequenceNo)),
    ]);

    const nextStop = stops.find((s) => s.status !== 'COMPLETED' && s.status !== 'SKIPPED');
    if (!nextStop) {
      return { tripId: payload.tripId, etaMinutes: null, distanceM: null };
    }

    const distanceM = Math.round(
      haversineDistanceMeters(
        payload.latitude,
        payload.longitude,
        nextStop.latitude,
        nextStop.longitude,
      ),
    );
    const etaMinutes = estimateConservativeEtaMinutes(distanceM, payload.speedMps);

    await this.redis.updateLiveTripEtaIfSameOrOlder(
      payload.tripId,
      payload.recordedAt,
      etaMinutes,
      distanceM,
      payload.ttlSeconds,
    );

    if (
      trip &&
      nextStop.stopType !== 'OFFICE' &&
      (distanceM <= 800 || (etaMinutes != null && etaMinutes <= 3))
    ) {
      await this.notifications.triggerCabApproachingReminder({
        organizationId: payload.organizationId,
        tripId: payload.tripId,
        stopId: nextStop.id,
        tripCode: trip.tripCode,
        stopLocationName: nextStop.locationName,
        distanceM,
        etaMinutes,
      });
    }

    await this.safety.evaluateTelemetryAnomalies({
      organizationId: payload.organizationId,
      tripId: payload.tripId,
      driverId: payload.driverId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speedMps: payload.speedMps,
      recordedAt: payload.recordedAt,
    });

    return { tripId: payload.tripId, distanceM, etaMinutes };
  }

  async pruneOrganizationHistory(organizationId: string): Promise<{ deletedCount: number }> {
    const [setting] = await this.dbService.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, organizationId))
      .limit(1);

    const retentionDays = setting?.gpsRetentionDays ?? 90;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const deleted = await this.dbService.db
      .delete(gpsLocations)
      .where(and(eq(gpsLocations.organizationId, organizationId), lt(gpsLocations.recordedAt, cutoff)))
      .returning({ id: gpsLocations.id });

    this.logger.debug(
      `Pruned ${deleted.length} gps_locations older than ${retentionDays}d for org ${organizationId}`,
    );
    return { deletedCount: deleted.length };
  }
}

