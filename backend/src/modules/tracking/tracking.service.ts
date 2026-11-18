import crypto from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { RequestIdentity } from '../../infrastructure/common/current-user.decorator.js';
import { AppConfigService } from '../../infrastructure/config/app-config.service.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  drivers,
  gpsLocations,
  offices,
  organizationSettings,
  passengerAssignments,
  safetyAlerts,
  shifts,
  trips,
  tripStops,
  users,
  vehicles,
} from '../../infrastructure/database/schema/index.js';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import {
  type LiveLocationPayload,
  type LiveLocationSnapshot,
  RedisService,
} from '../../infrastructure/redis/redis.service.js';
import { haversineDistanceMeters } from '../../infrastructure/shared/maps.util.js';
import {
  type IncomingDriverLocationMessage,
  TransportGateway,
  WS_ROOMS,
} from '../../infrastructure/websocket/transport.gateway.js';
import { DriversService } from '../drivers/drivers.module.js';
import { EmployeesService } from '../employees/employees.module.js';
import type { LocationProcessJobData } from './tracking.processor.js';
import {
  type AdminFleetLiveQuery,
  type GpsSampleInputDto,
  estimateConservativeEtaMinutes,
  gpsSampleInputSchema,
} from './tracking.schemas.js';

export type FleetHealthStatus = 'LIVE' | 'DELAYED' | 'STALE' | 'NO_SIGNAL' | 'EMERGENCY';

const POOR_ACCURACY_LIVE_FILTER_M = 500;
const POST_COMPLETE_GRACE_MS = 5 * 60 * 1000;

@Injectable()
export class TrackingService implements OnModuleInit {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly redis: RedisService,
    private readonly gateway: TransportGateway,
    private readonly driversService: DriversService,
    private readonly employeesService: EmployeesService,
    private readonly config: AppConfigService,
    @InjectQueue(QUEUE_NAMES.LOCATION_PROCESSING)
    private readonly locationQueue: Queue<LocationProcessJobData | { organizationId: string }>,
  ) {}

  onModuleInit(): void {
    this.gateway.registerLocationHandler(async (identity, message: IncomingDriverLocationMessage) => {
      if (!message?.tripId || typeof message.tripId !== 'string') {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'tripId required' });
      }
      const parsed = gpsSampleInputSchema.safeParse(message);
      if (!parsed.success) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      await this.ingestDriverLocations(
        {
          organizationId: identity.organizationId,
          userId: identity.userId,
          role: 'DRIVER',
          vendorId: null,
          officeId: null,
        },
        message.tripId,
        [parsed.data],
        { allowCompletedGrace: false },
      );
    });
  }

  async ingestDriverLocation(
    identity: RequestIdentity,
    tripId: string,
    dto: GpsSampleInputDto,
  ) {
    return this.ingestDriverLocations(identity, tripId, [dto], { allowCompletedGrace: false });
  }

  async ingestDriverLocationBatch(
    identity: RequestIdentity,
    tripId: string,
    samples: GpsSampleInputDto[],
  ) {
    return this.ingestDriverLocations(identity, tripId, samples, { allowCompletedGrace: true });
  }

  private async ingestDriverLocations(
    identity: RequestIdentity,
    tripId: string,
    samples: GpsSampleInputDto[],
    options: { allowCompletedGrace: boolean },
  ) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );

    const [trip] = await this.dbService.db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.organizationId, identity.organizationId)))
      .limit(1);

    if (!trip) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Trip ${tripId} not found in active organization.`,
      });
    }

    if (trip.driverId !== driver.id) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_TRIP_DRIVER',
        message: 'Driver is not assigned to execute this trip.',
      });
    }

    const isInProgress = trip.status === 'IN_PROGRESS';
    const isCompletedArchive = options.allowCompletedGrace && trip.status === 'COMPLETED';
    if (!isInProgress && !isCompletedArchive) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot ingest live GPS while trip status is ${trip.status}.`,
      });
    }

    const [orgSetting] = await this.dbService.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, identity.organizationId))
      .limit(1);

    const staleThreshold = orgSetting?.gpsStaleThresholdSeconds ?? 60;
    const ttlSeconds = Math.max(this.config.liveLocationTtlSeconds, staleThreshold * 3);
    const serverReceivedAt = new Date();
    const completedCutoffMs =
      trip.completedAt != null ? trip.completedAt.getTime() + POST_COMPLETE_GRACE_MS : null;

    const normalized = samples
      .map((s) => {
        const recordedAt = s.recordedAt ? new Date(s.recordedAt) : serverReceivedAt;
        return {
          clientPingId: s.clientPingId ?? crypto.randomUUID(),
          latitude: s.latitude,
          longitude: s.longitude,
          accuracyM: s.accuracyM ?? null,
          speedMps: s.speedMps ?? null,
          headingDeg: s.headingDeg ?? null,
          altitudeM: s.altitudeM ?? null,
          sequenceNo: s.sequenceNo ?? null,
          recordedAt,
        };
      })
      .filter((s) => (completedCutoffMs == null ? true : s.recordedAt.getTime() <= completedCutoffMs));

    if (normalized.length === 0) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: 'No samples fell within active trip execution window.',
      });
    }

    normalized.sort((a, b) => {
      const timeDiff = a.recordedAt.getTime() - b.recordedAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0);
    });

    const insertedRows = await this.dbService.db
      .insert(gpsLocations)
      .values(
        normalized.map((s) => ({
          organizationId: identity.organizationId,
          tripId,
          driverId: driver.id,
          clientPingId: s.clientPingId,
          latitude: s.latitude,
          longitude: s.longitude,
          location: { x: s.longitude, y: s.latitude },
          accuracyM: s.accuracyM,
          speedMps: s.speedMps,
          headingDeg: s.headingDeg,
          recordedAt: s.recordedAt,
          serverReceivedAt,
        })),
      )
      .onConflictDoNothing({
        target: [gpsLocations.tripId, gpsLocations.clientPingId],
      })
      .returning({
        id: gpsLocations.id,
        clientPingId: gpsLocations.clientPingId,
      });

    // Pick freshest acceptable accuracy sample for live Redis overlay
    const eligibleLive = normalized.filter(
      (s) => s.accuracyM == null || s.accuracyM <= POOR_ACCURACY_LIVE_FILTER_M,
    );
    const newestSample =
      eligibleLive.length > 0 ? eligibleLive[eligibleLive.length - 1] : null;

    let redisUpdated = false;
    let latestSnapshot: LiveLocationSnapshot | null = null;

    if (isInProgress && newestSample) {
      const nextStop = await this.findNextPendingStop(identity.organizationId, tripId);
      const distanceToNextStopM = nextStop
        ? Math.round(
            haversineDistanceMeters(
              newestSample.latitude,
              newestSample.longitude,
              nextStop.latitude,
              nextStop.longitude,
            ),
          )
        : null;
      const etaMinutes = estimateConservativeEtaMinutes(
        distanceToNextStopM,
        newestSample.speedMps,
      );

      const livePayload: LiveLocationPayload = {
        sampleId: newestSample.clientPingId,
        organizationId: identity.organizationId,
        driverId: driver.id,
        tripId,
        latitude: newestSample.latitude,
        longitude: newestSample.longitude,
        accuracyM: newestSample.accuracyM,
        speedMps: newestSample.speedMps,
        headingDeg: newestSample.headingDeg,
        altitudeM: newestSample.altitudeM,
        sequenceNo: newestSample.sequenceNo,
        recordedAt: newestSample.recordedAt.toISOString(),
        serverReceivedAt: serverReceivedAt.toISOString(),
        etaMinutes,
        distanceToNextStopM,
      };

      const redisOutcome = await this.redis.setLiveLocationIfNewer(
        livePayload,
        ttlSeconds,
        staleThreshold,
      );
      redisUpdated = redisOutcome.updated;
      latestSnapshot = await this.redis.getLiveTripLocation(tripId, staleThreshold);

      if (redisUpdated && latestSnapshot) {
        const eventBody = {
          tripId,
          driverId: driver.id,
          organizationId: identity.organizationId,
          sampleId: latestSnapshot.sampleId ?? null,
          latitude: latestSnapshot.latitude,
          longitude: latestSnapshot.longitude,
          accuracyM: latestSnapshot.accuracyM,
          speedMps: latestSnapshot.speedMps,
          headingDeg: latestSnapshot.headingDeg,
          recordedAt: latestSnapshot.recordedAt,
          serverReceivedAt: latestSnapshot.serverReceivedAt,
          ageSeconds: latestSnapshot.ageSeconds,
          isStale: latestSnapshot.isStale,
          etaMinutes: latestSnapshot.etaMinutes ?? etaMinutes,
          distanceToNextStopM: latestSnapshot.distanceToNextStopM ?? distanceToNextStopM,
        };

        this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'vehicle.location', eventBody);
        this.gateway.emitToRoom(
          WS_ROOMS.orgOps(identity.organizationId),
          'fleet.vehicle.location.updated',
          eventBody,
        );
        this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'vehicle.location', eventBody);
        this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'trip.location.updated', eventBody);

        if (redisOutcome.transitionedToLive) {
          const statusPayload = {
            tripId,
            gpsStatus: 'LIVE',
            recordedAt: latestSnapshot.recordedAt,
            serverTime: serverReceivedAt.toISOString(),
          };
          this.gateway.emitToRoom(
            WS_ROOMS.orgOps(identity.organizationId),
            'trip.gps.status.changed',
            statusPayload,
          );
          this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'trip.gps.status.changed', statusPayload);
        }

        await this.locationQueue.add(
          'compute-telemetry-state',
          {
            organizationId: identity.organizationId,
            tripId,
            driverId: driver.id,
            latitude: newestSample.latitude,
            longitude: newestSample.longitude,
            speedMps: newestSample.speedMps,
            recordedAt: newestSample.recordedAt.toISOString(),
            ttlSeconds,
          },
          { jobId: `loc-${tripId}-${newestSample.clientPingId}` },
        );
      }
    }

    return {
      acceptedCount: normalized.length,
      insertedCount: insertedRows.length,
      duplicatesIgnored: normalized.length - insertedRows.length,
      acknowledgedSampleIds: normalized.map((s) => s.clientPingId),
      redisUpdated,
      serverReceivedAt: serverReceivedAt.toISOString(),
      latest: latestSnapshot,
    };
  }

  private async findNextPendingStop(organizationId: string, tripId: string) {
    const stops = await this.dbService.db
      .select()
      .from(tripStops)
      .where(and(eq(tripStops.tripId, tripId), eq(tripStops.organizationId, organizationId)))
      .orderBy(asc(tripStops.sequenceNo));
    return stops.find((s) => s.status !== 'COMPLETED' && s.status !== 'SKIPPED') ?? null;
  }

  async resolveTripGpsSnapshot(
    organizationId: string,
    tripId: string,
    tripStatus: string,
    staleThresholdSeconds = 60,
  ): Promise<LiveLocationSnapshot | null> {
    const cached = await this.redis.getLiveTripLocation(tripId, staleThresholdSeconds);
    if (cached) return cached;

    if (tripStatus !== 'IN_PROGRESS' && tripStatus !== 'DRIVER_ACCEPTED') {
      return null;
    }

    const [latestRow] = await this.dbService.db
      .select()
      .from(gpsLocations)
      .where(and(eq(gpsLocations.tripId, tripId), eq(gpsLocations.organizationId, organizationId)))
      .orderBy(desc(gpsLocations.recordedAt))
      .limit(1);

    if (!latestRow) return null;

    const ageSeconds = Math.max(
      0,
      Math.floor((Date.now() - latestRow.recordedAt.getTime()) / 1000),
    );
    return {
      sampleId: latestRow.clientPingId,
      organizationId,
      driverId: latestRow.driverId,
      tripId,
      latitude: latestRow.latitude,
      longitude: latestRow.longitude,
      accuracyM: latestRow.accuracyM,
      speedMps: latestRow.speedMps,
      headingDeg: latestRow.headingDeg,
      altitudeM: null,
      sequenceNo: null,
      recordedAt: latestRow.recordedAt.toISOString(),
      serverReceivedAt: latestRow.serverReceivedAt.toISOString(),
      etaMinutes: null,
      distanceToNextStopM: null,
      ageSeconds,
      isStale: ageSeconds > staleThresholdSeconds,
    };
  }

  async getEmployeeLiveTelemetry(identity: RequestIdentity, tripId: string) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    const [myAssignment] = await this.dbService.db
      .select()
      .from(passengerAssignments)
      .where(
        and(
          eq(passengerAssignments.tripId, tripId),
          eq(passengerAssignments.employeeId, emp.id),
          eq(passengerAssignments.organizationId, identity.organizationId),
        ),
      )
      .limit(1);

    if (!myAssignment) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Trip ${tripId} assignment not found for authenticated employee.`,
      });
    }

    const [[trip], [orgSetting], stops] = await Promise.all([
      this.dbService.db
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.organizationId, identity.organizationId)))
        .limit(1),
      this.dbService.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, identity.organizationId))
        .limit(1),
      this.dbService.db
        .select()
        .from(tripStops)
        .where(and(eq(tripStops.tripId, tripId), eq(tripStops.organizationId, identity.organizationId)))
        .orderBy(asc(tripStops.sequenceNo)),
    ]);

    if (!trip) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Trip ${tripId} not found.`,
      });
    }

    const staleThreshold = orgSetting?.gpsStaleThresholdSeconds ?? 60;
    const snapshot = await this.resolveTripGpsSnapshot(
      identity.organizationId,
      tripId,
      trip.status,
      staleThreshold,
    );

    // Privacy boundary: compute ETA strictly against the caller's stop or office stop — never leak co-passenger stop coords
    const targetStop =
      stops.find((s) => s.id === myAssignment.tripStopId && s.status !== 'COMPLETED') ??
      stops.find((s) => s.stopType === 'OFFICE' && s.status !== 'COMPLETED') ??
      null;

    const etaMinutes =
      snapshot && !snapshot.isStale && targetStop
        ? estimateConservativeEtaMinutes(
            haversineDistanceMeters(
              snapshot.latitude,
              snapshot.longitude,
              targetStop.latitude,
              targetStop.longitude,
            ),
            snapshot.speedMps,
          )
        : null;

    const connectionStatus =
      trip.status !== 'IN_PROGRESS'
        ? trip.status
        : snapshot === null
          ? 'NO_SIGNAL'
          : snapshot.isStale
            ? 'STALE'
            : 'LIVE';

    return {
      tripId: trip.id,
      tripCode: trip.tripCode,
      tripStatus: trip.status,
      currentStopSequence: trip.currentStopSequence,
      connectionStatus,
      staleThresholdSeconds: staleThreshold,
      gpsTelemetry: snapshot
        ? {
            latitude: snapshot.latitude,
            longitude: snapshot.longitude,
            accuracyM: snapshot.accuracyM,
            speedMps: snapshot.speedMps,
            headingDeg: snapshot.headingDeg,
            recordedAt: snapshot.recordedAt,
            serverReceivedAt: snapshot.serverReceivedAt,
            ageSeconds: snapshot.ageSeconds,
            isStale: snapshot.isStale,
            etaMinutes,
          }
        : null,
      serverTime: new Date().toISOString(),
    };
  }

  async getAdminFleetLive(organizationId: string, query: AdminFleetLiveQuery) {
    const statusesToQuery =
      query.status === 'ALL_ACTIVE'
        ? (['IN_PROGRESS', 'DRIVER_ACCEPTED', 'ASSIGNED'] as const)
        : ([query.status] as const);

    const conditions = [
      eq(trips.organizationId, organizationId),
      inArray(trips.status, [...statusesToQuery]),
    ];
    if (query.officeId) conditions.push(eq(trips.officeId, query.officeId));
    if (query.shiftId) conditions.push(eq(trips.shiftId, query.shiftId));

    const [[orgSetting], tripRows, orgOffices, orgShifts] = await Promise.all([
      this.dbService.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, organizationId))
        .limit(1),
      this.dbService.db
        .select({
          id: trips.id,
          tripCode: trips.tripCode,
          travelDate: trips.travelDate,
          direction: trips.direction,
          status: trips.status,
          currentStopSequence: trips.currentStopSequence,
          plannedStartAt: trips.plannedStartAt,
          actualStartAt: trips.actualStartAt,
          officeId: offices.id,
          officeName: offices.name,
          officeLat: offices.latitude,
          officeLng: offices.longitude,
          shiftId: shifts.id,
          shiftName: shifts.name,
          shiftTimeLocal: shifts.shiftTimeLocal,
          driverId: drivers.id,
          driverCode: drivers.driverCode,
          driverName: users.fullName,
          driverPhone: users.phone,
          vehicleId: vehicles.id,
          vehicleRegistrationNo: vehicles.registrationNo,
          vehicleModelName: vehicles.modelName,
          seatingCapacity: vehicles.seatingCapacity,
        })
        .from(trips)
        .innerJoin(offices, eq(trips.officeId, offices.id))
        .innerJoin(shifts, eq(trips.shiftId, shifts.id))
        .leftJoin(drivers, eq(trips.driverId, drivers.id))
        .leftJoin(users, eq(drivers.userId, users.id))
        .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
        .where(and(...conditions))
        .orderBy(desc(trips.actualStartAt), desc(trips.plannedStartAt), desc(trips.createdAt))
        .limit(100),
      this.dbService.db
        .select({
          id: offices.id,
          name: offices.name,
          code: offices.code,
          latitude: offices.latitude,
          longitude: offices.longitude,
        })
        .from(offices)
        .where(eq(offices.organizationId, organizationId)),
      this.dbService.db
        .select({
          id: shifts.id,
          name: shifts.name,
          shiftTimeLocal: shifts.shiftTimeLocal,
          direction: shifts.direction,
        })
        .from(shifts)
        .where(eq(shifts.organizationId, organizationId)),
    ]);

    const staleThreshold = orgSetting?.gpsStaleThresholdSeconds ?? 60;
    const tripIds = tripRows.map((t) => t.id);

    const [redisMap, allStops, allAssignments, openAlerts, latestDbLocRows] = tripIds.length > 0
      ? await Promise.all([
          this.redis.getLiveTripLocationsBatch(tripIds, staleThreshold),
          this.dbService.db
            .select()
            .from(tripStops)
            .where(inArray(tripStops.tripId, tripIds))
            .orderBy(asc(tripStops.sequenceNo)),
          this.dbService.db
            .select({
              tripId: passengerAssignments.tripId,
              tripStopId: passengerAssignments.tripStopId,
              status: passengerAssignments.status,
              arrivalDelaySeconds: passengerAssignments.arrivalDelaySeconds,
            })
            .from(passengerAssignments)
            .where(inArray(passengerAssignments.tripId, tripIds)),
          this.dbService.db
            .select({
              id: safetyAlerts.id,
              tripId: safetyAlerts.tripId,
              alertType: safetyAlerts.alertType,
              severity: safetyAlerts.severity,
              status: safetyAlerts.status,
              notes: safetyAlerts.notes,
              createdAt: safetyAlerts.createdAt,
            })
            .from(safetyAlerts)
            .where(
              and(
                eq(safetyAlerts.organizationId, organizationId),
                inArray(safetyAlerts.tripId, tripIds),
                inArray(safetyAlerts.status, ['OPEN', 'ACKNOWLEDGED']),
              ),
            ),
          this.dbService.db
            .select({
              tripId: gpsLocations.tripId,
              driverId: gpsLocations.driverId,
              clientPingId: gpsLocations.clientPingId,
              latitude: gpsLocations.latitude,
              longitude: gpsLocations.longitude,
              accuracyM: gpsLocations.accuracyM,
              speedMps: gpsLocations.speedMps,
              headingDeg: gpsLocations.headingDeg,
              recordedAt: gpsLocations.recordedAt,
              serverReceivedAt: gpsLocations.serverReceivedAt,
            })
            .from(gpsLocations)
            .where(
              and(
                eq(gpsLocations.organizationId, organizationId),
                inArray(gpsLocations.tripId, tripIds),
              ),
            )
            .orderBy(desc(gpsLocations.recordedAt))
            .limit(Math.max(50, tripIds.length * 4)),
        ])
      : [
          new Map<string, LiveLocationSnapshot>(),
          [],
          [],
          [],
          [],
        ];

    const dbLocMap = new Map<string, LiveLocationSnapshot>();
    for (const row of latestDbLocRows) {
      if (dbLocMap.has(row.tripId)) continue;
      const ageSeconds = Math.max(0, Math.floor((Date.now() - row.recordedAt.getTime()) / 1000));
      dbLocMap.set(row.tripId, {
        sampleId: row.clientPingId,
        organizationId,
        driverId: row.driverId,
        tripId: row.tripId,
        latitude: row.latitude,
        longitude: row.longitude,
        accuracyM: row.accuracyM,
        speedMps: row.speedMps,
        headingDeg: row.headingDeg,
        altitudeM: null,
        sequenceNo: null,
        recordedAt: row.recordedAt.toISOString(),
        serverReceivedAt: row.serverReceivedAt.toISOString(),
        etaMinutes: null,
        distanceToNextStopM: null,
        ageSeconds,
        isStale: ageSeconds > staleThreshold,
      });
    }

    const enriched = tripRows.map((t) => {
      const stopsForTrip = allStops.filter((s) => s.tripId === t.id);
      const assignsForTrip = allAssignments.filter((a) => a.tripId === t.id);
      const alertsForTrip = openAlerts.filter((a) => a.tripId === t.id);

      const snapshot = redisMap.get(t.id) ?? dbLocMap.get(t.id) ?? null;
      const nextStop =
        stopsForTrip.find((s) => s.status !== 'COMPLETED' && s.status !== 'SKIPPED') ?? null;

      const maxArrivalDelaySeconds = assignsForTrip.reduce<number | null>((maxVal, a) => {
        if (a.arrivalDelaySeconds == null) return maxVal;
        return maxVal == null ? a.arrivalDelaySeconds : Math.max(maxVal, a.arrivalDelaySeconds);
      }, null);

      const isDelayed = (maxArrivalDelaySeconds ?? 0) > 120;
      const health: FleetHealthStatus =
        alertsForTrip.length > 0
          ? 'EMERGENCY'
          : snapshot === null
            ? 'NO_SIGNAL'
            : snapshot.isStale
              ? 'STALE'
              : isDelayed
                ? 'DELAYED'
                : 'LIVE';

      const completedStopsCount = stopsForTrip.filter((s) => s.status === 'COMPLETED').length;
      const boardedCount = assignsForTrip.filter((a) => a.status === 'BOARDED' || a.status === 'DROPPED').length;
      const noShowCount = assignsForTrip.filter((a) => a.status === 'NO_SHOW').length;

      return {
        ...t,
        health,
        staleThresholdSeconds: staleThreshold,
        totalStops: stopsForTrip.length,
        completedStops: completedStopsCount,
        passengerCount: assignsForTrip.length,
        boardedCount,
        noShowCount,
        maxArrivalDelaySeconds,
        openAlertCount: alertsForTrip.length,
        openAlerts: alertsForTrip,
        nextStop: nextStop
          ? {
              id: nextStop.id,
              sequenceNo: nextStop.sequenceNo,
              stopType: nextStop.stopType,
              locationName: nextStop.locationName,
              address: nextStop.address,
              latitude: nextStop.latitude,
              longitude: nextStop.longitude,
              scheduledArrivalAt: nextStop.scheduledArrivalAt,
              status: nextStop.status,
            }
          : null,
        stops: stopsForTrip.map((s) => ({
          id: s.id,
          sequenceNo: s.sequenceNo,
          stopType: s.stopType,
          locationName: s.locationName,
          latitude: s.latitude,
          longitude: s.longitude,
          status: s.status,
          scheduledArrivalAt: s.scheduledArrivalAt,
          actualArrivalAt: s.actualArrivalAt,
        })),
        gpsTelemetry: snapshot
          ? {
              ...snapshot,
              etaMinutes:
                snapshot.etaMinutes ??
                (nextStop && !snapshot.isStale
                  ? estimateConservativeEtaMinutes(
                      haversineDistanceMeters(
                        snapshot.latitude,
                        snapshot.longitude,
                        nextStop.latitude,
                        nextStop.longitude,
                      ),
                      snapshot.speedMps,
                    )
                  : null),
            }
          : null,
      };
    });

    const searched = query.search
      ? enriched.filter((item) => {
          const q = query.search!.toLowerCase();
          return (
            item.tripCode.toLowerCase().includes(q) ||
            (item.driverName ?? '').toLowerCase().includes(q) ||
            (item.vehicleRegistrationNo ?? '').toLowerCase().includes(q) ||
            item.officeName.toLowerCase().includes(q)
          );
        })
      : enriched;

    const summary = {
      totalActive: searched.length,
      liveCount: searched.filter((i) => i.health === 'LIVE').length,
      delayedCount: searched.filter((i) => i.health === 'DELAYED').length,
      staleCount: searched.filter((i) => i.health === 'STALE').length,
      noSignalCount: searched.filter((i) => i.health === 'NO_SIGNAL').length,
      emergencyCount: searched.filter((i) => i.health === 'EMERGENCY').length,
      staleThresholdSeconds: staleThreshold,
    };

    const finalItems = query.health
      ? searched.filter((item) => item.health === query.health)
      : searched;

    return {
      summary,
      filterOptions: {
        offices: orgOffices,
        shifts: orgShifts,
      },
      items: finalItems,
      serverTime: new Date().toISOString(),
    };
  }

  async getAdminTripLocationBreadcrumbs(organizationId: string, tripId: string) {
    const [[trip], [orgSetting]] = await Promise.all([
      this.dbService.db
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.organizationId, organizationId)))
        .limit(1),
      this.dbService.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, organizationId))
        .limit(1),
    ]);

    if (!trip) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Trip ${tripId} not found in organization.`,
      });
    }

    const staleThreshold = orgSetting?.gpsStaleThresholdSeconds ?? 60;
    const [latest, rows] = await Promise.all([
      this.resolveTripGpsSnapshot(organizationId, tripId, trip.status, staleThreshold),
      this.dbService.db
        .select({
          id: gpsLocations.id,
          clientPingId: gpsLocations.clientPingId,
          latitude: gpsLocations.latitude,
          longitude: gpsLocations.longitude,
          accuracyM: gpsLocations.accuracyM,
          speedMps: gpsLocations.speedMps,
          headingDeg: gpsLocations.headingDeg,
          recordedAt: gpsLocations.recordedAt,
          serverReceivedAt: gpsLocations.serverReceivedAt,
        })
        .from(gpsLocations)
        .where(and(eq(gpsLocations.organizationId, organizationId), eq(gpsLocations.tripId, tripId)))
        .orderBy(asc(gpsLocations.recordedAt))
        .limit(500),
    ]);

    return {
      tripId,
      tripCode: trip.tripCode,
      tripStatus: trip.status,
      latest,
      points: rows.map((r) => ({
        ...r,
        recordedAt: r.recordedAt.toISOString(),
        serverReceivedAt: r.serverReceivedAt.toISOString(),
      })),
    };
  }
}
