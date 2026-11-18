import crypto from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Post,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Idempotent } from '../../infrastructure/common/idempotency.interceptor.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  drivers,
  employees,
  noShowRecords,
  notifications,
  offices,
  organizationSettings,
  otpRecords,
  passengerAssignments,
  shifts,
  tripEvents,
  trips,
  tripStops,
  users,
  vehicles,
} from '../../infrastructure/database/schema/index.js';
import { OutboxService } from '../../infrastructure/event-management/outbox.service.js';
import { TRANSPORT_TOPICS } from '../../infrastructure/event-management/topics.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { calculateDelaySeconds } from '../../infrastructure/shared/delay.util.js';
import { NO_SHOW_REASONS, type PassengerAssignmentStatus } from '../../infrastructure/shared/enums.js';
import {
  buildGoogleMapsNavigationUrl,
  haversineDistanceMeters,
} from '../../infrastructure/shared/maps.util.js';
import { verifyOtpCode } from '../../infrastructure/shared/otp.util.js';
import {
  assertPassengerTransition,
  assertTripTransition,
  isPassengerPendingForRouting,
} from '../../infrastructure/shared/state-machines.js';
import { TransportGateway, WS_ROOMS } from '../../infrastructure/websocket/transport.gateway.js';
import { AuditLogsModule, AuditLogsService } from '../audit-logs/audit-logs.module.js';
import { DriversModule, DriversService } from '../drivers/drivers.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RoutingModule, RoutingService } from '../routing/routing.module.js';

const uuidParamSchema = z.string().uuid();

export const arriveAtStopSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().min(0).max(5000).optional(),
  occurredAtClient: z.string().datetime().optional(),
  clientEventId: z.string().uuid().optional(),
});
export type ArriveAtStopDto = z.infer<typeof arriveAtStopSchema>;

export const pickupPassengerSchema = z.object({
  otpCode: z.string().trim().min(4).max(8).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().min(0).max(5000).optional(),
  occurredAtClient: z.string().datetime().optional(),
  clientEventId: z.string().uuid().optional(),
});
export type PickupPassengerDto = z.infer<typeof pickupPassengerSchema>;

export const noShowPassengerSchema = z.object({
  reasonCode: z.enum(NO_SHOW_REASONS),
  notes: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(5000).optional(),
  occurredAtClient: z.string().datetime().optional(),
  clientEventId: z.string().uuid().optional(),
});
export type NoShowPassengerDto = z.infer<typeof noShowPassengerSchema>;

export const completeTripSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  occurredAtClient: z.string().datetime().optional(),
  clientEventId: z.string().uuid().optional(),
});
export type CompleteTripDto = z.infer<typeof completeTripSchema>;

const batchEventItemSchema = z.object({
  clientEventId: z.string().uuid(),
  eventType: z.enum([
    'TRIP_ACCEPT',
    'TRIP_START',
    'STOP_ARRIVE',
    'PASSENGER_PICKUP',
    'PASSENGER_NO_SHOW',
    'TRIP_COMPLETE',
  ]),
  stopId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  occurredAtClient: z.string().datetime(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().min(0).max(5000).optional(),
  otpCode: z.string().max(8).optional(),
  reasonCode: z.enum(NO_SHOW_REASONS).optional(),
  notes: z.string().max(500).optional(),
});

export const syncDriverEventsSchema = z.object({
  events: z.array(batchEventItemSchema).min(1).max(100),
});
export type SyncDriverEventsDto = z.infer<typeof syncDriverEventsSchema>;

interface StopExecutionOptions {
  clientEventId?: string;
  occurredAtClient?: Date;
  isOfflineReplay?: boolean;
}

type DrizzleTx = Parameters<Parameters<DatabaseService['transaction']>[0]>[0];

@Injectable()
export class DriverExecutionService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly driversService: DriversService,
    private readonly routingService: RoutingService,
    private readonly auditLogs: AuditLogsService,
    private readonly outbox: OutboxService,
    private readonly gateway: TransportGateway,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Computes the next active stop using `RoutingService.selectNextStop` so pickup
   * stops with unresolved passengers always take precedence before campus drop-off.
   */
  computeNextPendingStop(
    stops: Array<typeof tripStops.$inferSelect>,
    assignments: Array<typeof passengerAssignments.$inferSelect>,
  ) {
    const candidates = stops.map((s) => {
      const stopPassengers = assignments.filter((a) => a.tripStopId === s.id);
      const hasPendingPassenger = stopPassengers.some((a) =>
        isPassengerPendingForRouting(a.status),
      );
      const isOfficePending =
        s.stopType === 'OFFICE' && s.status !== 'COMPLETED' && s.status !== 'SKIPPED';
      const isPending =
        s.stopType === 'OFFICE'
          ? isOfficePending
          : s.status !== 'COMPLETED' && s.status !== 'SKIPPED' && hasPendingPassenger;

      return {
        id: s.id,
        sequenceNo: s.sequenceNo,
        stopType: s.stopType,
        locationName: s.locationName,
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
        geofenceRadiusM: s.geofenceRadiusM,
        status: s.status,
        scheduledArrivalAt: s.scheduledArrivalAt,
        isPending,
      };
    });

    const selectedPickup = this.routingService.selectNextStop(
      candidates.filter((c) => c.stopType !== 'OFFICE'),
    );
    if (selectedPickup) return selectedPickup;

    return this.routingService.selectNextStop(candidates);
  }

  private async _requireDriverTrip(organizationId: string, driverId: string, tripId: string) {
    const [trip] = await this.dbService.db
      .select()
      .from(trips)
      .where(
        and(
          eq(trips.id, tripId),
          eq(trips.organizationId, organizationId),
          eq(trips.driverId, driverId),
        ),
      )
      .limit(1);

    if (!trip) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Trip ${tripId} not found for active driver.`,
      });
    }
    return trip;
  }

  private async _measureDistanceMeters(
    tx: DrizzleTx,
    stop: typeof tripStops.$inferSelect,
    lat: number,
    lng: number,
  ): Promise<number> {
    const [row] = await tx
      .select({
        distanceM: sql<number>`ST_Distance(${tripStops.location}::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)`,
      })
      .from(tripStops)
      .where(eq(tripStops.id, stop.id))
      .limit(1);

    if (row && typeof row.distanceM === 'number' && Number.isFinite(row.distanceM)) {
      return Math.round(row.distanceM * 10) / 10;
    }
    return Math.round(haversineDistanceMeters(stop.latitude, stop.longitude, lat, lng) * 10) / 10;
  }

  private async _advanceStopAndNextInTx(
    tx: DrizzleTx,
    organizationId: string,
    tripId: string,
    stopId: string,
    now: Date,
  ) {
    const [allStops, allAssignments] = await Promise.all([
      tx
        .select()
        .from(tripStops)
        .where(and(eq(tripStops.tripId, tripId), eq(tripStops.organizationId, organizationId)))
        .orderBy(asc(tripStops.sequenceNo)),
      tx
        .select()
        .from(passengerAssignments)
        .where(
          and(
            eq(passengerAssignments.tripId, tripId),
            eq(passengerAssignments.organizationId, organizationId),
          ),
        ),
    ]);

    const stopAssignments = allAssignments.filter((a) => a.tripStopId === stopId);
    const hasPendingAtStop = stopAssignments.some((a) => isPassengerPendingForRouting(a.status));

    if (!hasPendingAtStop) {
      await tx
        .update(tripStops)
        .set({ status: 'COMPLETED', completedAt: now, updatedAt: now })
        .where(eq(tripStops.id, stopId));

      const idx = allStops.findIndex((s) => s.id === stopId);
      if (idx >= 0) {
        allStops[idx] = { ...allStops[idx], status: 'COMPLETED', completedAt: now };
      }
    }

    const nextStop = this.computeNextPendingStop(allStops, allAssignments);
    if (nextStop) {
      await tx
        .update(trips)
        .set({ currentStopSequence: nextStop.sequenceNo, updatedAt: now })
        .where(eq(trips.id, tripId));

      if (nextStop.status === 'PENDING') {
        await tx
          .update(tripStops)
          .set({ status: 'ACTIVE', updatedAt: now })
          .where(eq(tripStops.id, nextStop.id));
      }
    }

    return { nextStop, completedStopNow: !hasPendingAtStop };
  }

  async listDriverTrips(identity: RequestIdentity) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );

    const rows = await this.dbService.db
      .select({
        id: trips.id,
        tripCode: trips.tripCode,
        travelDate: trips.travelDate,
        direction: trips.direction,
        status: trips.status,
        currentStopSequence: trips.currentStopSequence,
        plannedStartAt: trips.plannedStartAt,
        actualStartAt: trips.actualStartAt,
        completedAt: trips.completedAt,
        officeName: offices.name,
        shiftName: shifts.name,
        shiftTimeLocal: shifts.shiftTimeLocal,
        vehicleRegistrationNo: vehicles.registrationNo,
        vehicleModelName: vehicles.modelName,
      })
      .from(trips)
      .innerJoin(offices, eq(trips.officeId, offices.id))
      .innerJoin(shifts, eq(trips.shiftId, shifts.id))
      .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
      .where(and(eq(trips.organizationId, identity.organizationId), eq(trips.driverId, driver.id)))
      .orderBy(
        sql`CASE ${trips.status} WHEN 'IN_PROGRESS' THEN 0 WHEN 'DRIVER_ACCEPTED' THEN 1 WHEN 'ASSIGNED' THEN 2 WHEN 'CREATED' THEN 2 ELSE 3 END`,
        sql`CASE WHEN ${trips.status} IN ('IN_PROGRESS', 'DRIVER_ACCEPTED', 'ASSIGNED', 'CREATED') THEN ${trips.travelDate} END ASC NULLS LAST`,
        sql`CASE WHEN ${trips.status} IN ('IN_PROGRESS', 'DRIVER_ACCEPTED', 'ASSIGNED', 'CREATED') THEN ${trips.plannedStartAt} END ASC NULLS LAST`,
        desc(trips.travelDate),
        desc(trips.createdAt),
      )
      .limit(40);

    const enriched = await Promise.all(
      rows.map(async (trip) => {
        const [stopList, assignList] = await Promise.all([
          this.dbService.db
            .select({ id: tripStops.id, stopType: tripStops.stopType })
            .from(tripStops)
            .where(eq(tripStops.tripId, trip.id)),
          this.dbService.db
            .select({ id: passengerAssignments.id, status: passengerAssignments.status })
            .from(passengerAssignments)
            .where(eq(passengerAssignments.tripId, trip.id)),
        ]);

        return {
          ...trip,
          stopsCount: stopList.length,
          passengersCount: assignList.length,
          pendingPassengersCount: assignList.filter((a) => isPassengerPendingForRouting(a.status))
            .length,
        };
      }),
    );

    return enriched;
  }

  async getDriverTripManifest(identity: RequestIdentity, tripId: string) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );
    await this._requireDriverTrip(identity.organizationId, driver.id, tripId);

    const [[tripRow], stopsRows, assignRows, [settingsRow]] = await Promise.all([
      this.dbService.db
        .select({
          id: trips.id,
          organizationId: trips.organizationId,
          tripCode: trips.tripCode,
          travelDate: trips.travelDate,
          direction: trips.direction,
          status: trips.status,
          currentStopSequence: trips.currentStopSequence,
          plannedStartAt: trips.plannedStartAt,
          actualStartAt: trips.actualStartAt,
          completedAt: trips.completedAt,
          officeName: offices.name,
          officeAddress: offices.address,
          shiftName: shifts.name,
          shiftTimeLocal: shifts.shiftTimeLocal,
          vehicleRegistrationNo: vehicles.registrationNo,
          vehicleModelName: vehicles.modelName,
        })
        .from(trips)
        .innerJoin(offices, eq(trips.officeId, offices.id))
        .innerJoin(shifts, eq(trips.shiftId, shifts.id))
        .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
        .where(eq(trips.id, tripId))
        .limit(1),
      this.dbService.db
        .select()
        .from(tripStops)
        .where(and(eq(tripStops.tripId, tripId), eq(tripStops.organizationId, identity.organizationId)))
        .orderBy(asc(tripStops.sequenceNo)),
      this.dbService.db
        .select({
          assignment: passengerAssignments,
          employeeCode: employees.employeeCode,
          department: employees.department,
          fullName: users.fullName,
          phone: users.phone,
        })
        .from(passengerAssignments)
        .innerJoin(employees, eq(passengerAssignments.employeeId, employees.id))
        .innerJoin(users, eq(employees.userId, users.id))
        .where(
          and(
            eq(passengerAssignments.tripId, tripId),
            eq(passengerAssignments.organizationId, identity.organizationId),
          ),
        ),
      this.dbService.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, identity.organizationId))
        .limit(1),
    ]);

    const requireOtp = settingsRow?.requireBoardingOtp ?? true;
    const rawAssignments = assignRows.map((r) => r.assignment);
    const nextPendingStop = this.computeNextPendingStop(stopsRows, rawAssignments);

    const stops = stopsRows.map((stop) => {
      const passengers = assignRows
        .filter((r) => r.assignment.tripStopId === stop.id)
        .map((r) => ({
          id: r.assignment.id,
          bookingId: r.assignment.bookingId,
          employeeId: r.assignment.employeeId,
          employeeCode: r.employeeCode,
          department: r.department,
          fullName: r.fullName,
          phone: r.phone,
          status: r.assignment.status,
          scheduledPickupAt: r.assignment.scheduledPickupAt,
          driverArrivedAt: r.assignment.driverArrivedAt,
          boardedAt: r.assignment.boardedAt,
          noShowAt: r.assignment.noShowAt,
          arrivalDelaySeconds: r.assignment.arrivalDelaySeconds,
          passengerWaitSeconds: r.assignment.passengerWaitSeconds,
          runningLateEtaMinutes: r.assignment.runningLateEtaMinutes,
          otpRequired: requireOtp,
        }));

      return {
        ...stop,
        navigationUrl: buildGoogleMapsNavigationUrl(stop.latitude, stop.longitude),
        passengers,
      };
    });

    return {
      trip: tripRow,
      stops,
      nextPendingStop,
      settings: settingsRow ?? null,
    };
  }

  async getTripStopsWithNext(identity: RequestIdentity, tripId: string) {
    const manifest = await this.getDriverTripManifest(identity, tripId);
    return {
      stops: manifest.stops,
      nextPendingStop: manifest.nextPendingStop,
    };
  }

  async acceptTrip(
    identity: RequestIdentity,
    tripId: string,
    options: StopExecutionOptions = {},
  ) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );
    if (driver.isSuspended) {
      throw new UnprocessableEntityException({
        code: 'DRIVER_SUSPENDED',
        message: 'Suspended drivers cannot accept trips.',
      });
    }

    const updated = await this.dbService.transaction(async (tx) => {
      const [trip] = await tx
        .select()
        .from(trips)
        .where(
          and(
            eq(trips.id, tripId),
            eq(trips.organizationId, identity.organizationId),
            eq(trips.driverId, driver.id),
          ),
        )
        .limit(1);

      if (!trip) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Trip ${tripId} not found for driver.`,
        });
      }

      assertTripTransition(trip.status, 'DRIVER_ACCEPTED');
      const now = options.occurredAtClient ?? new Date();
      const [saved] = await tx
        .update(trips)
        .set({ status: 'DRIVER_ACCEPTED', updatedAt: now })
        .where(eq(trips.id, tripId))
        .returning();

      await tx.insert(tripEvents).values({
        organizationId: identity.organizationId,
        tripId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        eventType: 'DRIVER_ACCEPTED_TRIP',
        clientEventId: options.clientEventId ?? crypto.randomUUID(),
        occurredAtClient: now,
        payloadJson: { driverId: driver.id },
      });

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'DRIVER_TRIP_ACCEPTED',
        entityType: 'trip',
        entityId: tripId,
        beforeJson: { status: trip.status },
        afterJson: { status: saved.status },
      });

      return saved;
    });

    const payload = {
      tripId,
      status: updated.status,
      currentStopSequence: updated.currentStopSequence,
      serverTime: new Date().toISOString(),
    };
    this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'trip.status.changed', payload);
    this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'trip.status.changed', payload);

    return updated;
  }

  async startTrip(
    identity: RequestIdentity,
    tripId: string,
    options: StopExecutionOptions = {},
  ) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );
    if (driver.isSuspended) {
      throw new UnprocessableEntityException({
        code: 'DRIVER_SUSPENDED',
        message: 'Suspended drivers cannot start trips.',
      });
    }

    const txRes = await this.dbService.transaction(async (tx) => {
      const [trip] = await tx
        .select()
        .from(trips)
        .where(
          and(
            eq(trips.id, tripId),
            eq(trips.organizationId, identity.organizationId),
            eq(trips.driverId, driver.id),
          ),
        )
        .limit(1);

      if (!trip) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Trip ${tripId} not found for driver.`,
        });
      }

      assertTripTransition(trip.status, 'IN_PROGRESS');
      const now = options.occurredAtClient ?? new Date();

      const [savedTrip] = await tx
        .update(trips)
        .set({
          status: 'IN_PROGRESS',
          actualStartAt: trip.actualStartAt ?? now,
          updatedAt: now,
        })
        .where(eq(trips.id, tripId))
        .returning();

      await tx
        .update(drivers)
        .set({ availabilityStatus: 'ON_TRIP', updatedAt: now })
        .where(eq(drivers.id, driver.id));

      if (trip.vehicleId) {
        await tx
          .update(vehicles)
          .set({ availabilityStatus: 'ON_TRIP', updatedAt: now })
          .where(eq(vehicles.id, trip.vehicleId));
      }

      // Transition SCHEDULED passengers -> EN_ROUTE cleanly per state machine
      await tx
        .update(passengerAssignments)
        .set({ status: 'EN_ROUTE', updatedAt: now })
        .where(
          and(
            eq(passengerAssignments.tripId, tripId),
            eq(passengerAssignments.status, 'SCHEDULED'),
          ),
        );

      const [stopsList, assignRows] = await Promise.all([
        tx
          .select()
          .from(tripStops)
          .where(eq(tripStops.tripId, tripId))
          .orderBy(asc(tripStops.sequenceNo)),
        tx
          .select({
            assignment: passengerAssignments,
            empUserId: employees.userId,
          })
          .from(passengerAssignments)
          .innerJoin(employees, eq(passengerAssignments.employeeId, employees.id))
          .where(eq(passengerAssignments.tripId, tripId)),
      ]);

      const nextPending = this.computeNextPendingStop(
        stopsList,
        assignRows.map((r) => r.assignment),
      );
      if (nextPending) {
        await tx
          .update(tripStops)
          .set({ status: 'ACTIVE', updatedAt: now })
          .where(and(eq(tripStops.id, nextPending.id), eq(tripStops.status, 'PENDING')));
        await tx
          .update(trips)
          .set({ currentStopSequence: nextPending.sequenceNo, updatedAt: now })
          .where(eq(trips.id, tripId));
      }

      for (const row of assignRows) {
        await tx.insert(notifications).values({
          organizationId: identity.organizationId,
          recipientUserId: row.empUserId,
          channel: 'IN_APP',
          category: 'TRIP_STARTED',
          title: `Trip Started · ${trip.tripCode}`,
          body: 'Your cab is now en route toward your pickup corridor.',
          metadataJson: { tripId },
        });
      }

      await tx.insert(tripEvents).values({
        organizationId: identity.organizationId,
        tripId,
        tripStopId: nextPending?.id ?? null,
        actorUserId: identity.userId,
        actorRole: identity.role,
        eventType: 'TRIP_STARTED',
        clientEventId: options.clientEventId ?? crypto.randomUUID(),
        occurredAtClient: now,
        payloadJson: { nextStopId: nextPending?.id ?? null },
      });

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'DRIVER_TRIP_STARTED',
        entityType: 'trip',
        entityId: tripId,
        beforeJson: { status: trip.status },
        afterJson: { status: 'IN_PROGRESS', currentStopSequence: nextPending?.sequenceNo ?? 1 },
      });

      await this.outbox.enqueueInTx(tx, {
        organizationId: identity.organizationId,
        topic: TRANSPORT_TOPICS.TRIP_EVENTS,
        aggregateType: 'trip',
        aggregateId: tripId,
        payload: { event: 'trip.started', tripId, currentStopSequence: nextPending?.sequenceNo ?? 1 },
      });

      return {
        trip: savedTrip,
        nextPendingStop: nextPending,
        notifyTargets: assignRows.map((r) => ({
          employeeId: r.assignment.employeeId,
          userId: r.empUserId,
        })),
      };
    });

    const payload = {
      tripId,
      status: txRes.trip.status,
      currentStopSequence: txRes.nextPendingStop?.sequenceNo ?? txRes.trip.currentStopSequence,
      serverTime: new Date().toISOString(),
    };
    this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'trip.status.changed', payload);
    this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'trip.status.changed', payload);

    for (const target of txRes.notifyTargets) {
      await this.notifications.enqueueNotification({
        organizationId: identity.organizationId,
        recipientUserId: target.userId,
        employeeId: target.employeeId,
        tripId,
        channel: 'PUSH',
        category: 'TRIP_STARTED',
        title: `Trip Started · ${txRes.trip.tripCode}`,
        body: 'Your cab is now en route toward your pickup corridor.',
        metadataJson: { tripId },
        persistDb: false,
        dedupKey: `start-${tripId}-${target.employeeId}`,
      });
    }

    return { trip: txRes.trip, nextPendingStop: txRes.nextPendingStop };
  }

  async arriveAtStop(
    identity: RequestIdentity,
    tripId: string,
    stopId: string,
    dto: ArriveAtStopDto,
    options: StopExecutionOptions = {},
  ) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );

    const txRes = await this.dbService.transaction(async (tx) => {
      const [[trip], [stop], [orgSetting]] = await Promise.all([
        tx
          .select()
          .from(trips)
          .where(
            and(
              eq(trips.id, tripId),
              eq(trips.organizationId, identity.organizationId),
              eq(trips.driverId, driver.id),
            ),
          )
          .limit(1),
        tx
          .select()
          .from(tripStops)
          .where(and(eq(tripStops.id, stopId), eq(tripStops.tripId, tripId)))
          .limit(1),
        tx
          .select()
          .from(organizationSettings)
          .where(eq(organizationSettings.organizationId, identity.organizationId))
          .limit(1),
      ]);

      if (!trip || !stop) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Trip ${tripId} or stop ${stopId} not found for active driver.`,
        });
      }

      if (trip.status !== 'IN_PROGRESS') {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `Cannot arrive at stop while trip status is ${trip.status}.`,
        });
      }

      const occurredAt =
        options.occurredAtClient ??
        (dto.occurredAtClient ? new Date(dto.occurredAtClient) : new Date());

      let distanceFromStopM: number | null = null;
      let geofenceVerified = false;
      if (dto.latitude !== undefined && dto.longitude !== undefined) {
        distanceFromStopM = await this._measureDistanceMeters(
          tx,
          stop,
          dto.latitude,
          dto.longitude,
        );
        geofenceVerified = distanceFromStopM <= stop.geofenceRadiusM;
      }

      const scheduledBase = stop.scheduledArrivalAt ?? trip.plannedStartAt ?? occurredAt;
      const arrivalDelay = calculateDelaySeconds(scheduledBase, occurredAt);

      const [updatedStop] = await tx
        .update(tripStops)
        .set({
          status: stop.status === 'COMPLETED' ? 'COMPLETED' : 'ARRIVED',
          actualArrivalAt: stop.actualArrivalAt ?? occurredAt,
          updatedAt: occurredAt,
        })
        .where(eq(tripStops.id, stopId))
        .returning();

      const stopAssigns = await tx
        .select({
          assignment: passengerAssignments,
          empUserId: employees.userId,
        })
        .from(passengerAssignments)
        .innerJoin(employees, eq(passengerAssignments.employeeId, employees.id))
        .where(eq(passengerAssignments.tripStopId, stopId));

      const updatedPassengers: Array<typeof passengerAssignments.$inferSelect> = [];
      for (const row of stopAssigns) {
        const pa = row.assignment;
        if (pa.status === 'SCHEDULED' || pa.status === 'EN_ROUTE') {
          if (pa.status === 'SCHEDULED') {
            assertPassengerTransition('SCHEDULED', 'EN_ROUTE');
            assertPassengerTransition('EN_ROUTE', 'ARRIVED');
          } else {
            assertPassengerTransition(pa.status, 'ARRIVED');
          }

          const [savedPa] = await tx
            .update(passengerAssignments)
            .set({
              status: 'ARRIVED',
              driverArrivedAt: pa.driverArrivedAt ?? occurredAt,
              arrivalDelaySeconds: arrivalDelay.seconds,
              updatedAt: occurredAt,
            })
            .where(eq(passengerAssignments.id, pa.id))
            .returning();
          updatedPassengers.push(savedPa);

          await tx.insert(notifications).values({
            organizationId: identity.organizationId,
            recipientUserId: row.empUserId,
            channel: 'IN_APP',
            category: 'DRIVER_ARRIVED',
            title: `Cab Arrived · Stop #${stop.sequenceNo}`,
            body: `Driver reached ${stop.locationName} (${arrivalDelay.formattedLabel}).`,
            metadataJson: { tripId, stopId, passengerAssignmentId: pa.id },
          });
        }
      }

      await tx.insert(tripEvents).values({
        organizationId: identity.organizationId,
        tripId,
        tripStopId: stopId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        eventType: 'STOP_ARRIVED',
        clientEventId: options.clientEventId ?? dto.clientEventId ?? crypto.randomUUID(),
        occurredAtClient: occurredAt,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        gpsAccuracyM: dto.accuracyM ?? null,
        payloadJson: {
          distanceFromStopM,
          geofenceVerified,
          arrivalDelaySeconds: arrivalDelay.seconds,
        },
      });

      await this.outbox.enqueueInTx(tx, {
        organizationId: identity.organizationId,
        topic: TRANSPORT_TOPICS.STOP_EVENTS,
        aggregateType: 'trip_stop',
        aggregateId: stopId,
        payload: {
          event: 'stop.arrived',
          tripId,
          stopId,
          arrivalDelaySeconds: arrivalDelay.seconds,
          distanceFromStopM,
          geofenceVerified,
        },
      });

      return {
        stop: updatedStop,
        distanceFromStopM,
        geofenceVerified,
        arrivalDelay,
        waitRequiredSeconds: orgSetting?.noShowWaitSeconds ?? 180,
        waitStartsAt: occurredAt.toISOString(),
        passengerUpdates: updatedPassengers,
        tripCode: trip.tripCode,
        stopNotifyTargets: stopAssigns.map((row) => ({
          employeeId: row.assignment.employeeId,
          userId: row.empUserId,
          assignmentId: row.assignment.id,
        })),
      };
    });

    this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'stop.progressed', {
      tripId,
      stopId,
      status: txRes.stop.status,
      serverTime: new Date().toISOString(),
    });
    this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'stop.progressed', {
      tripId,
      stopId,
      status: txRes.stop.status,
      serverTime: new Date().toISOString(),
    });

    for (const target of txRes.stopNotifyTargets) {
      await this.notifications.enqueueNotification({
        organizationId: identity.organizationId,
        recipientUserId: target.userId,
        employeeId: target.employeeId,
        tripId,
        channel: 'PUSH',
        category: 'DRIVER_ARRIVED',
        title: `Cab Arrived · Stop #${txRes.stop.sequenceNo}`,
        body: `Driver reached ${txRes.stop.locationName} (${txRes.arrivalDelay.formattedLabel}).`,
        metadataJson: { tripId, stopId, passengerAssignmentId: target.assignmentId },
        persistDb: false,
        dedupKey: `arrive-${stopId}-${target.assignmentId}`,
      });
    }

    if (txRes.arrivalDelay.seconds > 120) {
      const delayPayload = {
        tripId,
        stopId,
        tripCode: txRes.tripCode,
        delaySeconds: txRes.arrivalDelay.seconds,
        label: txRes.arrivalDelay.formattedLabel,
        serverTime: new Date().toISOString(),
      };
      this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'trip.delayed', delayPayload);
      this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'trip.delayed', delayPayload);

      const delayMinutes = Math.max(2, Math.round(txRes.arrivalDelay.seconds / 60));
      const downstreamRows = await this.dbService.db
        .select({
          employeeId: passengerAssignments.employeeId,
          userId: employees.userId,
        })
        .from(passengerAssignments)
        .innerJoin(employees, eq(passengerAssignments.employeeId, employees.id))
        .where(
          and(
            eq(passengerAssignments.organizationId, identity.organizationId),
            eq(passengerAssignments.tripId, tripId),
            eq(passengerAssignments.status, 'EN_ROUTE'),
          ),
        );
      for (const ds of downstreamRows) {
        await this.notifications.enqueueNotification({
          organizationId: identity.organizationId,
          recipientUserId: ds.userId,
          employeeId: ds.employeeId,
          tripId,
          channel: 'PUSH',
          category: 'DRIVER_DELAYED',
          title: `Cab Running ~${delayMinutes}m Late · ${txRes.tripCode}`,
          body: `Updated stop delay (${txRes.arrivalDelay.formattedLabel}) detected on active route.`,
          metadataJson: { tripId, delaySeconds: txRes.arrivalDelay.seconds },
          dedupKey: `delay-${stopId}-${ds.employeeId}`,
        });
      }
    }

    return {
      stop: txRes.stop,
      distanceFromStopM: txRes.distanceFromStopM,
      geofenceVerified: txRes.geofenceVerified,
      arrivalDelay: txRes.arrivalDelay,
      waitRequiredSeconds: txRes.waitRequiredSeconds,
      waitStartsAt: txRes.waitStartsAt,
      passengerUpdates: txRes.passengerUpdates,
    };
  }

  async pickupPassenger(
    identity: RequestIdentity,
    tripId: string,
    stopId: string,
    assignmentId: string,
    dto: PickupPassengerDto,
    options: StopExecutionOptions = {},
  ) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );

    const txRes = await this.dbService.transaction(async (tx) => {
      const [[trip], [pa], [orgSetting], [otpRow]] = await Promise.all([
        tx
          .select()
          .from(trips)
          .where(
            and(
              eq(trips.id, tripId),
              eq(trips.organizationId, identity.organizationId),
              eq(trips.driverId, driver.id),
            ),
          )
          .limit(1),
        tx
          .select()
          .from(passengerAssignments)
          .where(
            and(
              eq(passengerAssignments.id, assignmentId),
              eq(passengerAssignments.tripId, tripId),
              eq(passengerAssignments.tripStopId, stopId),
            ),
          )
          .limit(1),
        tx
          .select()
          .from(organizationSettings)
          .where(eq(organizationSettings.organizationId, identity.organizationId))
          .limit(1),
        tx
          .select()
          .from(otpRecords)
          .where(
            and(
              eq(otpRecords.passengerAssignmentId, assignmentId),
              eq(otpRecords.otpType, 'BOARDING'),
            ),
          )
          .limit(1),
      ]);

      if (!trip || !pa) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Assignment ${assignmentId} on trip ${tripId} not found.`,
        });
      }

      if (trip.status !== 'IN_PROGRESS') {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `Trip must be IN_PROGRESS to board passengers (currently ${trip.status}).`,
        });
      }

      assertPassengerTransition(pa.status, 'BOARDED');

      const occurredAt =
        options.occurredAtClient ??
        (dto.occurredAtClient ? new Date(dto.occurredAtClient) : new Date());

      const requireOtp = orgSetting?.requireBoardingOtp ?? true;
      if (requireOtp && otpRow && !otpRow.verifiedAt) {
        if (!dto.otpCode) {
          throw new UnprocessableEntityException({
            code: 'BOARDING_OTP_REQUIRED',
            message: '4-digit passenger boarding OTP is required by organization policy.',
          });
        }
        const matched = verifyOtpCode(identity.organizationId, dto.otpCode, otpRow.otpCodeHash);
        if (!matched) {
          // Persist failed attempt count outside the rolled-back transaction before throwing 422.
          await this.dbService.db
            .update(otpRecords)
            .set({ attempts: otpRow.attempts + 1 })
            .where(eq(otpRecords.id, otpRow.id));
          throw new UnprocessableEntityException({
            code: 'INVALID_BOARDING_OTP',
            message: `Entered boarding OTP does not match commuter pass code for ${trip.tripCode}.`,
          });
        }
        await tx
          .update(otpRecords)
          .set({ verifiedAt: occurredAt })
          .where(eq(otpRecords.id, otpRow.id));
      }

      const waitSeconds = pa.driverArrivedAt
        ? Math.max(0, Math.round((occurredAt.getTime() - pa.driverArrivedAt.getTime()) / 1000))
        : 0;

      const [updatedPa] = await tx
        .update(passengerAssignments)
        .set({
          status: 'BOARDED',
          boardedAt: occurredAt,
          passengerWaitSeconds: waitSeconds,
          updatedAt: occurredAt,
        })
        .where(eq(passengerAssignments.id, pa.id))
        .returning();

      const progression = await this._advanceStopAndNextInTx(
        tx,
        identity.organizationId,
        tripId,
        stopId,
        occurredAt,
      );

      await tx.insert(tripEvents).values({
        organizationId: identity.organizationId,
        tripId,
        tripStopId: stopId,
        passengerAssignmentId: pa.id,
        actorUserId: identity.userId,
        actorRole: identity.role,
        eventType: 'PASSENGER_BOARDED',
        clientEventId: options.clientEventId ?? dto.clientEventId ?? crypto.randomUUID(),
        occurredAtClient: occurredAt,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        gpsAccuracyM: dto.accuracyM ?? null,
        payloadJson: { waitSeconds, nextStopId: progression.nextStop?.id ?? null },
      });

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'DRIVER_PASSENGER_BOARDED',
        entityType: 'passenger_assignment',
        entityId: pa.id,
        afterJson: { status: 'BOARDED', passengerWaitSeconds: waitSeconds },
      });

      await this.outbox.enqueueInTx(tx, {
        organizationId: identity.organizationId,
        topic: TRANSPORT_TOPICS.PASSENGER_EVENTS,
        aggregateType: 'passenger_assignment',
        aggregateId: pa.id,
        payload: {
          event: 'passenger.boarded',
          tripId,
          assignmentId: pa.id,
          passengerWaitSeconds: waitSeconds,
          nextStopId: progression.nextStop?.id ?? null,
        },
      });

      return {
        assignment: updatedPa,
        nextPendingStop: progression.nextStop,
      };
    });

    this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'passenger.status.changed', {
      tripId,
      assignmentId,
      status: 'BOARDED',
      serverTime: new Date().toISOString(),
    });
    this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'stop.progressed', {
      tripId,
      completedStopId: stopId,
      nextStop: txRes.nextPendingStop,
      serverTime: new Date().toISOString(),
    });

    return txRes;
  }

  async markPassengerNoShow(
    identity: RequestIdentity,
    tripId: string,
    stopId: string,
    assignmentId: string,
    dto: NoShowPassengerDto,
    options: StopExecutionOptions = {},
  ) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );

    const txRes = await this.dbService.transaction(async (tx) => {
      const [[trip], [stop], [pa], [orgSetting]] = await Promise.all([
        tx
          .select()
          .from(trips)
          .where(
            and(
              eq(trips.id, tripId),
              eq(trips.organizationId, identity.organizationId),
              eq(trips.driverId, driver.id),
            ),
          )
          .limit(1),
        tx
          .select()
          .from(tripStops)
          .where(and(eq(tripStops.id, stopId), eq(tripStops.tripId, tripId)))
          .limit(1),
        tx
          .select()
          .from(passengerAssignments)
          .where(
            and(
              eq(passengerAssignments.id, assignmentId),
              eq(passengerAssignments.tripId, tripId),
              eq(passengerAssignments.tripStopId, stopId),
            ),
          )
          .limit(1),
        tx
          .select()
          .from(organizationSettings)
          .where(eq(organizationSettings.organizationId, identity.organizationId))
          .limit(1),
      ]);

      if (!trip || !stop || !pa) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Stop ${stopId} / assignment ${assignmentId} not found for driver trip.`,
        });
      }

      if (trip.status !== 'IN_PROGRESS') {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `Trip must be IN_PROGRESS to mark no-show.`,
        });
      }

      assertPassengerTransition(pa.status, 'NO_SHOW');
      if (!pa.driverArrivedAt) {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: 'Driver arrival must be logged before starting no-show countdown.',
        });
      }

      const distanceM = await this._measureDistanceMeters(tx, stop, dto.latitude, dto.longitude);
      if (distanceM > stop.geofenceRadiusM) {
        throw new UnprocessableEntityException({
          code: 'NO_SHOW_GEOFENCE_OUT_OF_RANGE',
          message: `Driver GPS (${Math.round(distanceM)}m) is outside stop geofence (${stop.geofenceRadiusM}m).`,
          details: { distanceM, allowedRadiusM: stop.geofenceRadiusM },
        });
      }

      const serverNow = new Date();
      const clientMoment =
        options.isOfflineReplay && options.occurredAtClient && options.occurredAtClient <= serverNow
          ? options.occurredAtClient
          : serverNow;

      const requiredWaitSeconds = orgSetting?.noShowWaitSeconds ?? 180;
      const elapsedSeconds = Math.max(
        0,
        Math.floor((clientMoment.getTime() - pa.driverArrivedAt.getTime()) / 1000),
      );
      if (elapsedSeconds < requiredWaitSeconds) {
        throw new UnprocessableEntityException({
          code: 'NO_SHOW_WAIT_TIMER_NOT_ELAPSED',
          message: `Minimum wait window (${requiredWaitSeconds}s) not yet elapsed (${elapsedSeconds}s waited).`,
          details: { requiredWaitSeconds, elapsedSeconds },
        });
      }

      const [updatedPa] = await tx
        .update(passengerAssignments)
        .set({
          status: 'NO_SHOW',
          noShowAt: clientMoment,
          passengerWaitSeconds: elapsedSeconds,
          updatedAt: clientMoment,
        })
        .where(eq(passengerAssignments.id, pa.id))
        .returning();

      const [noShowRow] = await tx
        .insert(noShowRecords)
        .values({
          organizationId: identity.organizationId,
          tripId,
          tripStopId: stopId,
          passengerAssignmentId: pa.id,
          employeeId: pa.employeeId,
          driverId: driver.id,
          reasonCode: dto.reasonCode,
          driverNotes: dto.notes ?? null,
          driverArrivedAt: pa.driverArrivedAt,
          waitStartedAt: pa.driverArrivedAt,
          markedAt: clientMoment,
          waitedSeconds: elapsedSeconds,
          distanceFromStopM: distanceM,
          geofenceVerified: true,
          gpsAccuracyM: dto.accuracyM ?? null,
          latitude: dto.latitude,
          longitude: dto.longitude,
          syncStatus: options.isOfflineReplay ? 'PENDING_RECONCILE' : 'VERIFIED',
        })
        .returning();

      const [empRow] = await tx
        .select({ userId: employees.userId })
        .from(employees)
        .where(eq(employees.id, pa.employeeId))
        .limit(1);
      if (empRow) {
        await tx.insert(notifications).values({
          organizationId: identity.organizationId,
          recipientUserId: empRow.userId,
          channel: 'IN_APP',
          category: 'NO_SHOW_MARKED',
          title: `Marked No-Show · ${trip.tripCode}`,
          body: `Driver departed after waiting ${elapsedSeconds}s (${dto.reasonCode}). You may file an appeal if needed.`,
          metadataJson: { tripId, noShowRecordId: noShowRow.id },
        });
      }

      const progression = await this._advanceStopAndNextInTx(
        tx,
        identity.organizationId,
        tripId,
        stopId,
        clientMoment,
      );

      await tx.insert(tripEvents).values({
        organizationId: identity.organizationId,
        tripId,
        tripStopId: stopId,
        passengerAssignmentId: pa.id,
        actorUserId: identity.userId,
        actorRole: identity.role,
        eventType: 'PASSENGER_NO_SHOW',
        clientEventId: options.clientEventId ?? dto.clientEventId ?? crypto.randomUUID(),
        occurredAtClient: clientMoment,
        latitude: dto.latitude,
        longitude: dto.longitude,
        gpsAccuracyM: dto.accuracyM ?? null,
        payloadJson: {
          reasonCode: dto.reasonCode,
          waitedSeconds: elapsedSeconds,
          distanceM,
          nextStopId: progression.nextStop?.id ?? null,
        },
      });

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'DRIVER_PASSENGER_NO_SHOW',
        entityType: 'no_show_record',
        entityId: noShowRow.id,
        reason: dto.notes ?? dto.reasonCode,
        afterJson: { reasonCode: dto.reasonCode, waitedSeconds: elapsedSeconds, distanceM },
      });

      await this.outbox.enqueueInTx(tx, {
        organizationId: identity.organizationId,
        topic: TRANSPORT_TOPICS.PASSENGER_EVENTS,
        aggregateType: 'no_show_record',
        aggregateId: noShowRow.id,
        payload: {
          event: 'passenger.no_show',
          tripId,
          assignmentId: pa.id,
          reasonCode: dto.reasonCode,
          waitedSeconds: elapsedSeconds,
        },
      });

      return {
        assignment: updatedPa,
        noShowRecord: noShowRow,
        nextPendingStop: progression.nextStop,
        empUserId: empRow?.userId ?? null,
        tripCode: trip.tripCode,
        elapsedSeconds,
      };
    });

    this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'passenger.status.changed', {
      tripId,
      assignmentId,
      status: 'NO_SHOW',
      reason: dto.reasonCode,
      serverTime: new Date().toISOString(),
    });
    this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'stop.progressed', {
      tripId,
      completedStopId: stopId,
      nextStop: txRes.nextPendingStop,
      serverTime: new Date().toISOString(),
    });

    if (txRes.empUserId) {
      await this.notifications.enqueueNotification({
        organizationId: identity.organizationId,
        recipientUserId: txRes.empUserId,
        employeeId: txRes.assignment.employeeId,
        tripId,
        channel: 'PUSH',
        category: 'NO_SHOW_MARKED',
        title: `Marked No-Show · ${txRes.tripCode}`,
        body: `Driver departed after waiting ${txRes.elapsedSeconds}s (${dto.reasonCode}). You may file an appeal if needed.`,
        metadataJson: { tripId, noShowRecordId: txRes.noShowRecord.id },
        persistDb: false,
        dedupKey: `noshow-${txRes.noShowRecord.id}`,
      });
    }

    return {
      assignment: txRes.assignment,
      noShowRecord: txRes.noShowRecord,
      nextPendingStop: txRes.nextPendingStop,
    };
  }

  async completeTrip(
    identity: RequestIdentity,
    tripId: string,
    dto: CompleteTripDto = {},
    options: StopExecutionOptions = {},
  ) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );

    const savedTrip = await this.dbService.transaction(async (tx) => {
      const [trip] = await tx
        .select()
        .from(trips)
        .where(
          and(
            eq(trips.id, tripId),
            eq(trips.organizationId, identity.organizationId),
            eq(trips.driverId, driver.id),
          ),
        )
        .limit(1);

      if (!trip) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Trip ${tripId} not found for driver.`,
        });
      }

      assertTripTransition(trip.status, 'COMPLETED');
      const now =
        options.occurredAtClient ??
        (dto.occurredAtClient ? new Date(dto.occurredAtClient) : new Date());

      const assigns = await tx
        .select()
        .from(passengerAssignments)
        .where(eq(passengerAssignments.tripId, tripId));

      const stillPending = assigns.filter((a) => isPassengerPendingForRouting(a.status));
      if (stillPending.length > 0) {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `${stillPending.length} passenger assignment(s) remain unresolved before completion.`,
        });
      }

      for (const a of assigns) {
        if (a.status === 'BOARDED') {
          assertPassengerTransition('BOARDED', 'DROPPED');
          await tx
            .update(passengerAssignments)
            .set({ status: 'DROPPED', droppedAt: now, updatedAt: now })
            .where(eq(passengerAssignments.id, a.id));
        }
      }

      await tx
        .update(tripStops)
        .set({ status: 'COMPLETED', completedAt: now, updatedAt: now })
        .where(and(eq(tripStops.tripId, tripId), eq(tripStops.stopType, 'OFFICE')));

      const [completedTrip] = await tx
        .update(trips)
        .set({ status: 'COMPLETED', completedAt: now, updatedAt: now })
        .where(eq(trips.id, tripId))
        .returning();

      await tx
        .update(drivers)
        .set({ availabilityStatus: 'AVAILABLE', updatedAt: now })
        .where(eq(drivers.id, driver.id));

      if (trip.vehicleId) {
        await tx
          .update(vehicles)
          .set({ availabilityStatus: 'AVAILABLE', updatedAt: now })
          .where(eq(vehicles.id, trip.vehicleId));
      }

      await tx.insert(tripEvents).values({
        organizationId: identity.organizationId,
        tripId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        eventType: 'TRIP_COMPLETED',
        clientEventId: options.clientEventId ?? dto.clientEventId ?? crypto.randomUUID(),
        occurredAtClient: now,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        payloadJson: { totalAssignments: assigns.length },
      });

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'DRIVER_TRIP_COMPLETED',
        entityType: 'trip',
        entityId: tripId,
        beforeJson: { status: trip.status },
        afterJson: { status: 'COMPLETED' },
      });

      await this.outbox.enqueueInTx(tx, {
        organizationId: identity.organizationId,
        topic: TRANSPORT_TOPICS.TRIP_EVENTS,
        aggregateType: 'trip',
        aggregateId: tripId,
        payload: { event: 'trip.completed', tripId },
      });

      return completedTrip;
    });

    await this.redis.clearTripLiveState(tripId, driver.id);

    const payload = {
      tripId,
      status: 'COMPLETED',
      currentStopSequence: savedTrip.currentStopSequence,
      serverTime: new Date().toISOString(),
    };
    this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'trip.status.changed', payload);
    this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'trip.status.changed', payload);
    this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'trip.gps.status.changed', {
      tripId,
      gpsStatus: 'OFFLINE_COMPLETED',
      serverTime: payload.serverTime,
    });
    this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'trip.gps.status.changed', {
      tripId,
      gpsStatus: 'OFFLINE_COMPLETED',
      serverTime: payload.serverTime,
    });

    return savedTrip;
  }

  async syncEventsBatch(
    identity: RequestIdentity,
    tripId: string,
    dto: SyncDriverEventsDto,
  ) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );
    await this._requireDriverTrip(identity.organizationId, driver.id, tripId);

    const chronological = [...dto.events].sort(
      (a, b) => new Date(a.occurredAtClient).getTime() - new Date(b.occurredAtClient).getTime(),
    );

    let processedCount = 0;
    let skippedDuplicateCount = 0;
    const results: Array<{ clientEventId: string; status: 'PROCESSED' | 'DUPLICATE_SKIPPED' }> = [];

    for (const evt of chronological) {
      const [existingEvt] = await this.dbService.db
        .select({ id: tripEvents.id })
        .from(tripEvents)
        .where(
          and(
            eq(tripEvents.organizationId, identity.organizationId),
            eq(tripEvents.clientEventId, evt.clientEventId),
          ),
        )
        .limit(1);

      if (existingEvt) {
        skippedDuplicateCount++;
        results.push({ clientEventId: evt.clientEventId, status: 'DUPLICATE_SKIPPED' });
        continue;
      }

      const occurredAt = new Date(evt.occurredAtClient);
      const opts: StopExecutionOptions = {
        clientEventId: evt.clientEventId,
        occurredAtClient: occurredAt,
        isOfflineReplay: true,
      };

      switch (evt.eventType) {
        case 'TRIP_ACCEPT':
          await this.acceptTrip(identity, tripId, opts);
          break;
        case 'TRIP_START':
          await this.startTrip(identity, tripId, opts);
          break;
        case 'STOP_ARRIVE':
          if (!evt.stopId) {
            throw new BadRequestException({
              code: 'VALIDATION_ERROR',
              message: 'stopId is required for STOP_ARRIVE offline event.',
            });
          }
          await this.arriveAtStop(
            identity,
            tripId,
            evt.stopId,
            {
              latitude: evt.latitude,
              longitude: evt.longitude,
              accuracyM: evt.accuracyM,
            },
            opts,
          );
          break;
        case 'PASSENGER_PICKUP':
          if (!evt.stopId || !evt.assignmentId) {
            throw new BadRequestException({
              code: 'VALIDATION_ERROR',
              message: 'stopId and assignmentId are required for PASSENGER_PICKUP event.',
            });
          }
          await this.pickupPassenger(
            identity,
            tripId,
            evt.stopId,
            evt.assignmentId,
            {
              otpCode: evt.otpCode,
              latitude: evt.latitude,
              longitude: evt.longitude,
              accuracyM: evt.accuracyM,
            },
            opts,
          );
          break;
        case 'PASSENGER_NO_SHOW':
          if (
            !evt.stopId ||
            !evt.assignmentId ||
            !evt.reasonCode ||
            evt.latitude === undefined ||
            evt.longitude === undefined
          ) {
            throw new BadRequestException({
              code: 'VALIDATION_ERROR',
              message:
                'stopId, assignmentId, reasonCode, latitude, and longitude are required for PASSENGER_NO_SHOW.',
            });
          }
          await this.markPassengerNoShow(
            identity,
            tripId,
            evt.stopId,
            evt.assignmentId,
            {
              reasonCode: evt.reasonCode,
              notes: evt.notes,
              latitude: evt.latitude,
              longitude: evt.longitude,
              accuracyM: evt.accuracyM,
            },
            opts,
          );
          break;
        case 'TRIP_COMPLETE':
          await this.completeTrip(
            identity,
            tripId,
            { latitude: evt.latitude, longitude: evt.longitude },
            opts,
          );
          break;
      }

      processedCount++;
      results.push({ clientEventId: evt.clientEventId, status: 'PROCESSED' });
    }

    const latestManifest = await this.getDriverTripManifest(identity, tripId);
    return {
      processedCount,
      skippedDuplicateCount,
      results,
      manifest: latestManifest,
    };
  }
}

@ApiTags('Driver - Trip Execution')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('driver/trips')
export class DriverTripsController {
  constructor(private readonly service: DriverExecutionService) {}

  @Get()
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'List assigned upcoming, active, and recent trips for driver' })
  list(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.listDriverTrips(identity);
  }

  @Get(':tripId')
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Get full offline-cacheable trip manifest with next pending stop' })
  detail(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
  ) {
    return this.service.getDriverTripManifest(identity, tripId);
  }

  @Post(':tripId/accept')
  @Idempotent()
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Acknowledge dispatched duty (ASSIGNED -> DRIVER_ACCEPTED)' })
  accept(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
  ) {
    return this.service.acceptTrip(identity, tripId);
  }

  @Post(':tripId/start')
  @Idempotent()
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Start active cab execution (-> IN_PROGRESS) & resolve next stop URL' })
  start(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
  ) {
    return this.service.startTrip(identity, tripId);
  }

  @Get(':tripId/stops')
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Fetch ordered stops and deterministic nextPendingStop' })
  stops(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
  ) {
    return this.service.getTripStopsWithNext(identity, tripId);
  }

  @Post(':tripId/stops/:stopId/arrive')
  @Idempotent()
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Log driver stop arrival with PostGIS geofence distance & delay calc' })
  arrive(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
    @Param('stopId', { schema: uuidParamSchema }) stopId: string,
    @Body({ schema: arriveAtStopSchema }) dto: ArriveAtStopDto,
  ) {
    return this.service.arriveAtStop(identity, tripId, stopId, dto);
  }

  @Post(':tripId/stops/:stopId/passengers/:assignmentId/pickup')
  @Idempotent()
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Verify OTP if required, mark passenger BOARDED & return next stop' })
  pickup(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
    @Param('stopId', { schema: uuidParamSchema }) stopId: string,
    @Param('assignmentId', { schema: uuidParamSchema }) assignmentId: string,
    @Body({ schema: pickupPassengerSchema }) dto: PickupPassengerDto,
  ) {
    return this.service.pickupPassenger(identity, tripId, stopId, assignmentId, dto);
  }

  @Post(':tripId/stops/:stopId/passengers/:assignmentId/no-show')
  @Idempotent()
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({
    summary: 'Mark NO_SHOW after verifying PostGIS geofence & org wait countdown completion',
  })
  noShow(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
    @Param('stopId', { schema: uuidParamSchema }) stopId: string,
    @Param('assignmentId', { schema: uuidParamSchema }) assignmentId: string,
    @Body({ schema: noShowPassengerSchema }) dto: NoShowPassengerDto,
  ) {
    return this.service.markPassengerNoShow(identity, tripId, stopId, assignmentId, dto);
  }

  @Post(':tripId/events')
  @Idempotent()
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Replay queued offline trip execution events chronologically by clientEventId' })
  syncEvents(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
    @Body({ schema: syncDriverEventsSchema }) dto: SyncDriverEventsDto,
  ) {
    return this.service.syncEventsBatch(identity, tripId, dto);
  }

  @Post(':tripId/complete')
  @Idempotent()
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Complete trip at destination campus / final drop point' })
  complete(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
    @Body({ schema: completeTripSchema }) dto: CompleteTripDto,
  ) {
    return this.service.completeTrip(identity, tripId, dto);
  }
}

export type DriverStopCandidate = {
  id: string;
  sequenceNo: number;
  stopType: string;
  status: string;
  passengerStatuses: PassengerAssignmentStatus[];
};

@Module({
  imports: [DriversModule, RoutingModule, AuditLogsModule, NotificationsModule],
  controllers: [DriverTripsController],
  providers: [DriverExecutionService],
  exports: [DriverExecutionService],
})
export class StopsModule {}
