import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Idempotent } from '../../infrastructure/common/idempotency.interceptor.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  bookings,
  drivers,
  employees,
  noShowRecords,
  notifications,
  offices,
  organizationSettings,
  otpRecords,
  passengerAssignments,
  safetyAlerts,
  shifts,
  tripEvents,
  trips,
  tripStops,
  users,
  vehicles,
} from '../../infrastructure/database/schema/index.js';
import { OutboxService } from '../../infrastructure/event-management/outbox.service.js';
import { TRANSPORT_TOPICS } from '../../infrastructure/event-management/topics.js';
import { TRIP_DIRECTIONS, TRIP_STATUSES } from '../../infrastructure/shared/enums.js';
import { deriveAssignmentOtp } from '../../infrastructure/shared/otp.util.js';
import { TransportGateway, WS_ROOMS } from '../../infrastructure/websocket/transport.gateway.js';
import { AuditLogsModule, AuditLogsService } from '../audit-logs/audit-logs.module.js';
import {
  AssignmentsModule,
  AssignmentsService,
  submitAppealSchema,
  type SubmitAppealDto,
} from '../assignments/assignments.module.js';
import { EmployeesModule, EmployeesService } from '../employees/employees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TrackingModule } from '../tracking/tracking.module.js';
import { TrackingService } from '../tracking/tracking.service.js';

export const listTripsQuerySchema = z.object({
  travelDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(TRIP_STATUSES).optional(),
  direction: z.enum(TRIP_DIRECTIONS).optional(),
});
export type ListTripsQuery = z.infer<typeof listTripsQuerySchema>;

export const runningLateSchema = z.object({
  etaMinutes: z.number().int().min(1).max(60),
  note: z.string().max(300).optional(),
});
export type RunningLateDto = z.infer<typeof runningLateSchema>;

const uuidParamSchema = z.string().uuid();

@Injectable()
export class TripsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly employeesService: EmployeesService,
    private readonly auditLogs: AuditLogsService,
    private readonly outbox: OutboxService,
    private readonly gateway: TransportGateway,
    private readonly trackingService: TrackingService,
    private readonly notifications: NotificationsService,
  ) {}

  async getOverview(organizationId: string) {
    const db = this.dbService.db;
    const [
      [empCount],
      [driverAvailCount],
      [vehAvailCount],
      [vehAssignedCount],
      [activeTripCount],
      [completedTripCount],
      [cancelledTripCount],
      [noShowCount],
      [delayedCount],
      [pendingApprovalsCount],
      [approvedAwaitingDispatchCount],
      [activeEmergencyCount],
      shiftList,
      recentTrips,
      openAlerts,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(employees)
        .where(eq(employees.organizationId, organizationId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(drivers)
        .where(
          and(
            eq(drivers.organizationId, organizationId),
            eq(drivers.isSuspended, false),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vehicles)
        .where(
          and(
            eq(vehicles.organizationId, organizationId),
            eq(vehicles.availabilityStatus, 'AVAILABLE'),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vehicles)
        .where(
          and(
            eq(vehicles.organizationId, organizationId),
            eq(vehicles.availabilityStatus, 'ON_TRIP'),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(trips)
        .where(
          and(
            eq(trips.organizationId, organizationId),
            sql`${trips.status} IN ('ASSIGNED', 'DRIVER_ACCEPTED', 'IN_PROGRESS')`,
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(trips)
        .where(and(eq(trips.organizationId, organizationId), eq(trips.status, 'COMPLETED'))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(trips)
        .where(
          and(
            eq(trips.organizationId, organizationId),
            sql`${trips.status} IN ('CANCELLED', 'ABORTED')`,
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(passengerAssignments)
        .where(
          and(
            eq(passengerAssignments.organizationId, organizationId),
            eq(passengerAssignments.status, 'NO_SHOW'),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(passengerAssignments)
        .where(
          and(
            eq(passengerAssignments.organizationId, organizationId),
            sql`${passengerAssignments.arrivalDelaySeconds} > 120`,
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookings)
        .where(
          and(
            eq(bookings.organizationId, organizationId),
            eq(bookings.status, 'PENDING_APPROVAL'),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookings)
        .where(and(eq(bookings.organizationId, organizationId), eq(bookings.status, 'APPROVED'))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(safetyAlerts)
        .where(
          and(
            eq(safetyAlerts.organizationId, organizationId),
            sql`${safetyAlerts.status} != 'RESOLVED'`,
          ),
        ),
      db.select().from(shifts).where(eq(shifts.organizationId, organizationId)),
      this.listTrips(organizationId, {}),
      db
        .select()
        .from(safetyAlerts)
        .where(
          and(
            eq(safetyAlerts.organizationId, organizationId),
            sql`${safetyAlerts.status} != 'RESOLVED'`,
          ),
        )
        .orderBy(desc(safetyAlerts.createdAt))
        .limit(10),
    ]);

    return {
      kpis: {
        totalEmployees: empCount?.count ?? 0,
        activeDrivers: driverAvailCount?.count ?? 0,
        availableVehicles: vehAvailCount?.count ?? 0,
        assignedVehicles: vehAssignedCount?.count ?? 0,
        activeTrips: activeTripCount?.count ?? 0,
        completedTrips: completedTripCount?.count ?? 0,
        cancelledTrips: cancelledTripCount?.count ?? 0,
        noShowPassengers: noShowCount?.count ?? 0,
        delayedPickups: delayedCount?.count ?? 0,
        pendingApprovals: pendingApprovalsCount?.count ?? 0,
        approvedAwaitingDispatch: approvedAwaitingDispatchCount?.count ?? 0,
        activeEmergencies: activeEmergencyCount?.count ?? 0,
      },
      upcomingShifts: shiftList,
      recentTrips: recentTrips.slice(0, 10),
      openAlerts,
    };
  }

  async listTrips(organizationId: string, query: ListTripsQuery) {
    const conditions = [eq(trips.organizationId, organizationId)];
    if (query.travelDate) conditions.push(eq(trips.travelDate, query.travelDate));
    if (query.status) conditions.push(eq(trips.status, query.status));
    if (query.direction) conditions.push(eq(trips.direction, query.direction));

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
        officeId: offices.id,
        officeName: offices.name,
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
        createdAt: trips.createdAt,
      })
      .from(trips)
      .innerJoin(offices, eq(trips.officeId, offices.id))
      .innerJoin(shifts, eq(trips.shiftId, shifts.id))
      .leftJoin(drivers, eq(trips.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
      .where(and(...conditions))
      .orderBy(desc(trips.travelDate), desc(trips.createdAt));

    const passengerCounts = await this.dbService.db
      .select({
        tripId: passengerAssignments.tripId,
        count: sql<number>`count(*)::int`,
      })
      .from(passengerAssignments)
      .where(eq(passengerAssignments.organizationId, organizationId))
      .groupBy(passengerAssignments.tripId);

    const countByTrip = new Map(passengerCounts.map((c) => [c.tripId, c.count]));
    return rows.map((row) => ({
      ...row,
      passengerCount: countByTrip.get(row.id) ?? 0,
    }));
  }

  async getTripDetail(organizationId: string, tripId: string) {
    const [trip] = await this.dbService.db
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
        abortedAt: trips.abortedAt,
        abortReason: trips.abortReason,
        officeName: offices.name,
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
        createdAt: trips.createdAt,
      })
      .from(trips)
      .innerJoin(offices, eq(trips.officeId, offices.id))
      .innerJoin(shifts, eq(trips.shiftId, shifts.id))
      .leftJoin(drivers, eq(trips.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
      .where(and(eq(trips.id, tripId), eq(trips.organizationId, organizationId)))
      .limit(1);

    if (!trip) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Trip ${tripId} not found in organization.`,
      });
    }

    const [stops, assignments, events, noShows] = await Promise.all([
      this.dbService.db
        .select()
        .from(tripStops)
        .where(and(eq(tripStops.tripId, tripId), eq(tripStops.organizationId, organizationId)))
        .orderBy(asc(tripStops.sequenceNo)),
      this.dbService.db
        .select({
          assignmentId: passengerAssignments.id,
          tripStopId: passengerAssignments.tripStopId,
          bookingId: passengerAssignments.bookingId,
          employeeId: employees.id,
          employeeCode: employees.employeeCode,
          employeeName: users.fullName,
          employeePhone: users.phone,
          department: employees.department,
          status: passengerAssignments.status,
          scheduledPickupAt: passengerAssignments.scheduledPickupAt,
          driverArrivedAt: passengerAssignments.driverArrivedAt,
          boardedAt: passengerAssignments.boardedAt,
          noShowAt: passengerAssignments.noShowAt,
          arrivalDelaySeconds: passengerAssignments.arrivalDelaySeconds,
          passengerWaitSeconds: passengerAssignments.passengerWaitSeconds,
          runningLateEtaMinutes: passengerAssignments.runningLateEtaMinutes,
        })
        .from(passengerAssignments)
        .innerJoin(employees, eq(passengerAssignments.employeeId, employees.id))
        .innerJoin(users, eq(employees.userId, users.id))
        .where(
          and(
            eq(passengerAssignments.tripId, tripId),
            eq(passengerAssignments.organizationId, organizationId),
          ),
        ),
      this.dbService.db
        .select()
        .from(tripEvents)
        .where(and(eq(tripEvents.tripId, tripId), eq(tripEvents.organizationId, organizationId)))
        .orderBy(asc(tripEvents.serverReceivedAt)),
      this.dbService.db
        .select()
        .from(noShowRecords)
        .where(
          and(eq(noShowRecords.tripId, tripId), eq(noShowRecords.organizationId, organizationId)),
        ),
    ]);

    return { trip, stops, assignments, events, noShows };
  }

  async listEmployeeTrips(identity: RequestIdentity) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    return this.dbService.db
      .select({
        assignmentId: passengerAssignments.id,
        passengerStatus: passengerAssignments.status,
        scheduledPickupAt: passengerAssignments.scheduledPickupAt,
        boardedAt: passengerAssignments.boardedAt,
        noShowAt: passengerAssignments.noShowAt,
        arrivalDelaySeconds: passengerAssignments.arrivalDelaySeconds,
        passengerWaitSeconds: passengerAssignments.passengerWaitSeconds,
        runningLateEtaMinutes: passengerAssignments.runningLateEtaMinutes,
        safeReachConfirmedAt: passengerAssignments.safeReachConfirmedAt,
        tripId: trips.id,
        tripCode: trips.tripCode,
        travelDate: trips.travelDate,
        direction: trips.direction,
        tripStatus: trips.status,
        plannedStartAt: trips.plannedStartAt,
        shiftName: shifts.name,
        shiftTimeLocal: shifts.shiftTimeLocal,
        officeName: offices.name,
        stopSequence: tripStops.sequenceNo,
        pickupLocationName: tripStops.locationName,
        pickupAddress: tripStops.address,
        driverName: users.fullName,
        driverPhone: users.phone,
        vehicleRegistrationNo: vehicles.registrationNo,
        vehicleModelName: vehicles.modelName,
      })
      .from(passengerAssignments)
      .innerJoin(trips, eq(passengerAssignments.tripId, trips.id))
      .innerJoin(tripStops, eq(passengerAssignments.tripStopId, tripStops.id))
      .innerJoin(shifts, eq(trips.shiftId, shifts.id))
      .innerJoin(offices, eq(trips.officeId, offices.id))
      .leftJoin(drivers, eq(trips.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
      .where(
        and(
          eq(passengerAssignments.organizationId, identity.organizationId),
          eq(passengerAssignments.employeeId, emp.id),
        ),
      )
      .orderBy(
        sql`CASE ${trips.status} WHEN 'IN_PROGRESS' THEN 0 WHEN 'DRIVER_ACCEPTED' THEN 1 WHEN 'ASSIGNED' THEN 2 WHEN 'CREATED' THEN 2 ELSE 3 END`,
        sql`CASE WHEN ${trips.status} IN ('IN_PROGRESS', 'DRIVER_ACCEPTED', 'ASSIGNED', 'CREATED') THEN ${trips.travelDate} END ASC NULLS LAST`,
        sql`CASE WHEN ${trips.status} IN ('IN_PROGRESS', 'DRIVER_ACCEPTED', 'ASSIGNED', 'CREATED') THEN ${trips.plannedStartAt} END ASC NULLS LAST`,
        desc(trips.travelDate),
        desc(trips.createdAt),
      );
  }

  async getEmployeeUpcomingTrip(identity: RequestIdentity) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    const activeRows = await this.dbService.db
      .select({
        tripId: trips.id,
        scheduledPickupAt: passengerAssignments.scheduledPickupAt,
      })
      .from(passengerAssignments)
      .innerJoin(trips, eq(passengerAssignments.tripId, trips.id))
      .where(
        and(
          eq(passengerAssignments.organizationId, identity.organizationId),
          eq(passengerAssignments.employeeId, emp.id),
          inArray(trips.status, ['CREATED', 'ASSIGNED', 'DRIVER_ACCEPTED', 'IN_PROGRESS']),
          sql`${passengerAssignments.status} NOT IN ('CANCELLED', 'SKIPPED', 'DROPPED')`,
        ),
      )
      .orderBy(
        sql`CASE ${trips.status} WHEN 'IN_PROGRESS' THEN 0 WHEN 'DRIVER_ACCEPTED' THEN 1 ELSE 2 END`,
        asc(passengerAssignments.scheduledPickupAt),
        asc(trips.plannedStartAt),
      )
      .limit(1);

    if (activeRows.length === 0) {
      return null;
    }

    return this.getEmployeeTripDetail(identity, activeRows[0].tripId);
  }

  async getEmployeeTripDetail(identity: RequestIdentity, tripId: string) {
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

    const detail = await this.getTripDetail(identity.organizationId, tripId);
    const [[orgSetting], [otpRow]] = await Promise.all([
      this.dbService.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, identity.organizationId))
        .limit(1),
      this.dbService.db
        .select()
        .from(otpRecords)
        .where(
          and(
            eq(otpRecords.passengerAssignmentId, myAssignment.id),
            eq(otpRecords.otpType, 'BOARDING'),
          ),
        )
        .limit(1),
    ]);

    const myStop = detail.stops.find((s) => s.id === myAssignment.tripStopId) ?? null;
    const staleThreshold = orgSetting?.gpsStaleThresholdSeconds ?? 60;
    const liveGps = await this.trackingService.resolveTripGpsSnapshot(
      identity.organizationId,
      tripId,
      detail.trip.status,
      staleThreshold,
    );

    const boardingOtp =
      (orgSetting?.requireBoardingOtp ?? true) && otpRow && !otpRow.verifiedAt
        ? deriveAssignmentOtp(identity.organizationId, myAssignment.id, 'BOARDING')
        : null;

    return {
      trip: detail.trip,
      yourAssignment: myAssignment,
      yourStopSequence: myStop?.sequenceNo ?? null,
      boardingOtp,
      passengersTotal: detail.assignments.length,
      stops: detail.stops.map((s) => {
        const isYourStop = s.id === myAssignment.tripStopId;
        const stopAssignments = detail.assignments.filter((a) => a.tripStopId === s.id);
        return {
          id: s.id,
          sequenceNo: s.sequenceNo,
          stopType: s.stopType,
          // Preserve co-passenger home privacy: show full address only on caller's stop or campus office
          locationName: isYourStop || s.stopType === 'OFFICE' ? s.locationName : `Pickup Stop #${s.sequenceNo}`,
          address: isYourStop || s.stopType === 'OFFICE' ? s.address : 'Hyderabad Corridor Stop',
          latitude: isYourStop || s.stopType === 'OFFICE' ? s.latitude : null,
          longitude: isYourStop || s.stopType === 'OFFICE' ? s.longitude : null,
          scheduledArrivalAt: s.scheduledArrivalAt,
          actualArrivalAt: s.actualArrivalAt,
          completedAt: s.completedAt,
          status: s.status,
          isYourStop,
          passengerCountAtStop: stopAssignments.length,
        };
      }),
      gpsTelemetry: liveGps
        ? {
            latitude: liveGps.latitude,
            longitude: liveGps.longitude,
            accuracyM: liveGps.accuracyM,
            speedMps: liveGps.speedMps,
            headingDeg: liveGps.headingDeg,
            recordedAt: liveGps.recordedAt,
            serverReceivedAt: liveGps.serverReceivedAt,
            ageSeconds: liveGps.ageSeconds,
            isStale: liveGps.isStale,
            etaMinutes: !liveGps.isStale ? liveGps.etaMinutes : null,
          }
        : null,
      settings: orgSetting ?? null,
    };
  }

  async reportRunningLate(identity: RequestIdentity, tripId: string, dto: RunningLateDto) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    const txRes = await this.dbService.transaction(async (tx) => {
      const [pa] = await tx
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

      if (!pa) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `No passenger assignment on trip ${tripId}.`,
        });
      }

      if (pa.status === 'CANCELLED' || pa.status === 'NO_SHOW' || pa.status === 'DROPPED') {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `Cannot report running late while assignment is ${pa.status}.`,
        });
      }

      const now = new Date();
      const [updated] = await tx
        .update(passengerAssignments)
        .set({
          runningLateEtaMinutes: dto.etaMinutes,
          runningLateReportedAt: now,
          updatedAt: now,
        })
        .where(eq(passengerAssignments.id, pa.id))
        .returning();

      const [tripRow] = await tx
        .select({ id: trips.id, tripCode: trips.tripCode, driverId: trips.driverId })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

      await tx.insert(tripEvents).values({
        organizationId: identity.organizationId,
        tripId,
        tripStopId: pa.tripStopId,
        passengerAssignmentId: pa.id,
        actorUserId: identity.userId,
        actorRole: identity.role,
        eventType: 'PASSENGER_RUNNING_LATE',
        clientEventId: crypto.randomUUID(),
        occurredAtClient: now,
        payloadJson: { etaMinutes: dto.etaMinutes, note: dto.note ?? null },
      });

      let driverUserId: string | null = null;
      if (tripRow?.driverId) {
        const [driverRow] = await tx
          .select({ userId: drivers.userId })
          .from(drivers)
          .where(eq(drivers.id, tripRow.driverId))
          .limit(1);
        if (driverRow) {
          driverUserId = driverRow.userId;
          await tx.insert(notifications).values({
            organizationId: identity.organizationId,
            recipientUserId: driverRow.userId,
            channel: 'IN_APP',
            category: 'PASSENGER_RUNNING_LATE',
            title: `Passenger running +${dto.etaMinutes}m late · ${tripRow.tripCode}`,
            body: dto.note ?? `Commuter indicated an expected delay of ${dto.etaMinutes} min.`,
            metadataJson: { tripId, passengerAssignmentId: pa.id, etaMinutes: dto.etaMinutes },
          });
        }
      }

      await this.outbox.enqueueInTx(tx, {
        organizationId: identity.organizationId,
        topic: TRANSPORT_TOPICS.NOTIFICATION_EVENTS,
        aggregateType: 'passenger_assignment',
        aggregateId: pa.id,
        payload: {
          event: 'passenger.running_late',
          tripId,
          employeeId: emp.id,
          etaMinutes: dto.etaMinutes,
        },
      });

      return {
        assignment: updated,
        driverId: tripRow?.driverId ?? null,
        driverUserId,
        tripCode: tripRow?.tripCode ?? null,
      };
    });

    const payload = {
      tripId,
      employeeId: emp.id,
      etaMinutes: dto.etaMinutes,
      note: dto.note ?? null,
      serverTime: new Date().toISOString(),
    };
    this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'passenger.running_late', payload);
    this.gateway.emitToRoom(WS_ROOMS.trip(tripId), 'passenger.running_late', payload);
    if (txRes.driverId) {
      this.gateway.emitToRoom(WS_ROOMS.driver(txRes.driverId), 'passenger.running_late', payload);
    }
    if (txRes.driverUserId) {
      await this.notifications.enqueueNotification({
        organizationId: identity.organizationId,
        recipientUserId: txRes.driverUserId,
        driverId: txRes.driverId,
        tripId,
        channel: 'PUSH',
        category: 'PASSENGER_RUNNING_LATE',
        title: `Passenger running +${dto.etaMinutes}m late · ${txRes.tripCode ?? ''}`,
        body: dto.note ?? `Commuter indicated an expected delay of ${dto.etaMinutes} min.`,
        metadataJson: { tripId, etaMinutes: dto.etaMinutes },
        persistDb: false,
        dedupKey: `late-${txRes.assignment.id}-${dto.etaMinutes}`,
      });
    }

    return txRes.assignment;
  }

  async confirmSafeReach(identity: RequestIdentity, tripId: string) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    return this.dbService.transaction(async (tx) => {
      const [pa] = await tx
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

      if (!pa) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `No passenger assignment on trip ${tripId}.`,
        });
      }

      const now = new Date();
      const [updated] = await tx
        .update(passengerAssignments)
        .set({ safeReachConfirmedAt: now, updatedAt: now })
        .where(eq(passengerAssignments.id, pa.id))
        .returning();

      await tx.insert(tripEvents).values({
        organizationId: identity.organizationId,
        tripId,
        tripStopId: pa.tripStopId,
        passengerAssignmentId: pa.id,
        actorUserId: identity.userId,
        actorRole: identity.role,
        eventType: 'EMPLOYEE_SAFE_REACH',
        clientEventId: crypto.randomUUID(),
        occurredAtClient: now,
        payloadJson: { employeeId: emp.id },
      });

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'EMPLOYEE_SAFE_REACH',
        entityType: 'passenger_assignment',
        entityId: pa.id,
        afterJson: { safeReachConfirmedAt: now.toISOString() },
      });

      return updated;
    });
  }
}

@ApiTags('Admin - Operations & Trips')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin')
export class TripsController {
  constructor(private readonly service: TripsService) {}

  @Get('overview')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'Operational KPI overview, active trips, and open safety alerts' })
  getOverview(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.getOverview(identity.organizationId);
  }

  @Get('trips')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'List scheduled, active, and completed trips' })
  listTrips(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: listTripsQuerySchema }) query: ListTripsQuery,
  ) {
    return this.service.listTrips(identity.organizationId, query);
  }

  @Get('trips/:tripId')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'Inspect trip stops, passenger assignments, delays, and event history' })
  getTripDetail(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
  ) {
    return this.service.getTripDetail(identity.organizationId, tripId);
  }
}

@ApiTags('Employee - Trips & Execution Transparency')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('employee/trips')
export class EmployeeTripsController {
  constructor(
    private readonly service: TripsService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  @Get('upcoming')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Fetch next upcoming assigned trip card & pickup transparency details' })
  getUpcoming(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.getEmployeeUpcomingTrip(identity);
  }

  @Get()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'List authenticated employee upcoming and historical trips' })
  list(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.listEmployeeTrips(identity);
  }

  @Get(':tripId')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Get stop sequence, boarding OTP, and driver/GPS telemetry freshness' })
  detail(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
  ) {
    return this.service.getEmployeeTripDetail(identity, tripId);
  }

  @Post(':tripId/running-late')
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Notify transport desk and driver of expected pickup delay' })
  runningLate(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
    @Body({ schema: runningLateSchema }) dto: RunningLateDto,
  ) {
    return this.service.reportRunningLate(identity, tripId, dto);
  }

  @Post(':tripId/safe-reach')
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Confirm employee reached home/office safely' })
  safeReach(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
  ) {
    return this.service.confirmSafeReach(identity, tripId);
  }

  @Post(':tripId/appeal-no-show')
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Submit an appeal note contesting a NO_SHOW assignment' })
  appealNoShow(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
    @Body({ schema: submitAppealSchema }) dto: SubmitAppealDto,
  ) {
    return this.assignmentsService.submitEmployeeAppeal(identity, tripId, dto);
  }
}

@Module({
  imports: [EmployeesModule, AuditLogsModule, AssignmentsModule, TrackingModule, NotificationsModule],
  controllers: [TripsController, EmployeeTripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
