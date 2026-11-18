import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  type OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import { and, desc, eq, inArray } from 'drizzle-orm';
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
  employeeLocations,
  employees,
  notifications,
  offices,
  organizationSettings,
  passengerAssignments,
  shifts,
  tripEvents,
  trips,
  users,
} from '../../infrastructure/database/schema/index.js';
import { OutboxService } from '../../infrastructure/event-management/outbox.service.js';
import { TRANSPORT_TOPICS } from '../../infrastructure/event-management/topics.js';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import {
  BOOKING_STATUSES,
  BOOKING_TIME_PREFERENCES,
  TRIP_DIRECTIONS,
} from '../../infrastructure/shared/enums.js';
import { assertPassengerTransition } from '../../infrastructure/shared/state-machines.js';
import { TransportGateway, WS_ROOMS } from '../../infrastructure/websocket/transport.gateway.js';
import { AuditLogsModule, AuditLogsService } from '../audit-logs/audit-logs.module.js';
import {
  buildOperatorCommuteIdentity,
  resolveLocalityDisplayLabel,
} from '../commutes/commutes.utils.js';
import { EmployeesModule, EmployeesService } from '../employees/employees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  BookingMaintenanceProcessor,
  BookingSeriesService,
  cancelSeriesSchema,
  createSeriesSchema,
  extendSeriesSchema,
  previewSeriesSchema,
  processExpiriesSchema,
  skipSeriesDatesSchema,
  updateBookingOccurrenceSchema,
  type CancelSeriesDto,
  type CreateSeriesDto,
  type ExtendSeriesDto,
  type PreviewSeriesDto,
  type ProcessExpiriesDto,
  type SkipSeriesDatesDto,
  type UpdateBookingOccurrenceDto,
} from './booking-series.service.js';
import {
  computeScheduleForTimePreference,
  formatTimeLocalInTimezone,
} from './bookings.calendar.js';

export const createBookingSchema = z.object({
  employeeId: z.string().uuid(),
  shiftId: z.string().uuid(),
  officeId: z.string().uuid(),
  pickupLocationId: z.string().uuid(),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(TRIP_DIRECTIONS),
  timePreference: z.enum(BOOKING_TIME_PREFERENCES).default('PICKUP_AT'),
  requestedTimeLocal: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  timezone: z.string().min(2).max(64).default('Asia/Kolkata'),
  scheduledPickupAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});
export type CreateBookingDto = z.infer<typeof createBookingSchema>;

export const employeeCreateBookingSchema = createBookingSchema.omit({ employeeId: true });
export type EmployeeCreateBookingDto = z.infer<typeof employeeCreateBookingSchema>;

export const listBookingsQuerySchema = z.object({
  travelDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  direction: z.enum(TRIP_DIRECTIONS).optional(),
  shiftId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
});
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

export const cancelBookingSchema = z.object({
  reason: z.string().min(3).max(500),
});
export type CancelBookingDto = z.infer<typeof cancelBookingSchema>;

const uuidParamSchema = z.string().uuid();

@Injectable()
export class BookingsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly employeesService: EmployeesService,
    private readonly outbox: OutboxService,
    private readonly gateway: TransportGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async listByOrg(
    organizationId: string,
    query: ListBookingsQuery & { employeeId?: string },
  ) {
    const conditions = [eq(bookings.organizationId, organizationId)];
    if (query.employeeId) conditions.push(eq(bookings.employeeId, query.employeeId));
    if (query.travelDate) conditions.push(eq(bookings.travelDate, query.travelDate));
    if (query.direction) conditions.push(eq(bookings.direction, query.direction));
    if (query.shiftId) conditions.push(eq(bookings.shiftId, query.shiftId));
    if (query.officeId) conditions.push(eq(bookings.officeId, query.officeId));
    if (query.status) conditions.push(eq(bookings.status, query.status));

    return this.dbService.db
      .select({
        id: bookings.id,
        organizationId: bookings.organizationId,
        employeeId: bookings.employeeId,
        employeeCode: employees.employeeCode,
        employeeName: users.fullName,
        department: employees.department,
        shiftId: bookings.shiftId,
        shiftName: shifts.name,
        shiftTimeLocal: shifts.shiftTimeLocal,
        officeId: bookings.officeId,
        officeName: offices.name,
        pickupLocationId: bookings.pickupLocationId,
        pickupLocationName: employeeLocations.locationName,
        pickupAddress: employeeLocations.address,
        corridorTag: employeeLocations.corridorTag,
        localityId: employeeLocations.localityId,
        normalizedLocality: employeeLocations.normalizedLocality,
        latitude: employeeLocations.latitude,
        longitude: employeeLocations.longitude,
        seriesId: bookings.seriesId,
        travelDate: bookings.travelDate,
        direction: bookings.direction,
        timePreference: bookings.timePreference,
        requestedTimeLocal: bookings.requestedTimeLocal,
        timezone: bookings.timezone,
        requestedPickupAt: bookings.requestedPickupAt,
        scheduledPickupAt: bookings.scheduledPickupAt,
        isArriveByInfeasible: bookings.isArriveByInfeasible,
        feasibilityNote: bookings.feasibilityNote,
        status: bookings.status,
        notes: bookings.notes,
        cancellationReason: bookings.cancellationReason,
        cancelledAt: bookings.cancelledAt,
        tripId: trips.id,
        tripCode: trips.tripCode,
        tripStatus: trips.status,
        passengerStatus: passengerAssignments.status,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .innerJoin(employees, eq(bookings.employeeId, employees.id))
      .innerJoin(users, eq(employees.userId, users.id))
      .innerJoin(shifts, eq(bookings.shiftId, shifts.id))
      .innerJoin(offices, eq(bookings.officeId, offices.id))
      .innerJoin(employeeLocations, eq(bookings.pickupLocationId, employeeLocations.id))
      .leftJoin(passengerAssignments, eq(passengerAssignments.bookingId, bookings.id))
      .leftJoin(trips, eq(passengerAssignments.tripId, trips.id))
      .where(and(...conditions))
      .orderBy(desc(bookings.travelDate), desc(bookings.createdAt));
  }

  async createBooking(
    identity: RequestIdentity,
    dto: CreateBookingDto,
    options: { enforceCutoff?: boolean } = {},
  ) {
    return this.dbService.transaction(async (tx) => {
      const [[emp], [shift], [office], [loc], [settings]] = await Promise.all([
        tx
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.id, dto.employeeId),
              eq(employees.organizationId, identity.organizationId),
            ),
          )
          .limit(1),
        tx
          .select()
          .from(shifts)
          .where(
            and(eq(shifts.id, dto.shiftId), eq(shifts.organizationId, identity.organizationId)),
          )
          .limit(1),
        tx
          .select()
          .from(offices)
          .where(
            and(eq(offices.id, dto.officeId), eq(offices.organizationId, identity.organizationId)),
          )
          .limit(1),
        tx
          .select()
          .from(employeeLocations)
          .where(
            and(
              eq(employeeLocations.id, dto.pickupLocationId),
              eq(employeeLocations.employeeId, dto.employeeId),
              eq(employeeLocations.organizationId, identity.organizationId),
            ),
          )
          .limit(1),
        tx
          .select()
          .from(organizationSettings)
          .where(eq(organizationSettings.organizationId, identity.organizationId))
          .limit(1),
      ]);

      if (!emp || !shift || !office || !loc) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message:
            'Employee, shift, office, and pickup location must belong to the active organization.',
        });
      }

      if (!emp.transportEligible) {
        throw new UnprocessableEntityException({
          code: 'EMPLOYEE_NOT_ELIGIBLE',
          message: 'Employee transport eligibility is currently disabled by your administrator.',
        });
      }

      if (!dto.scheduledPickupAt && !dto.requestedTimeLocal) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Provide either scheduledPickupAt or requestedTimeLocal.',
        });
      }

      const timezone = dto.timezone || 'Asia/Kolkata';
      const timePreference = dto.timePreference ?? 'PICKUP_AT';
      const cutoffMin = settings?.bookingCutoffMinutes ?? 120;
      const arriveByBuffer = settings?.arriveBySafetyBufferMinutes ?? 10;

      const computedSchedule = dto.requestedTimeLocal
        ? computeScheduleForTimePreference({
            travelDate: dto.travelDate,
            direction: dto.direction,
            timePreference,
            requestedTimeLocal: dto.requestedTimeLocal,
            timezone,
            pickupLat: loc.latitude,
            pickupLng: loc.longitude,
            officeLat: office.latitude,
            officeLng: office.longitude,
            arriveBySafetyBufferMinutes: arriveByBuffer,
            bookingCutoffMinutes: cutoffMin,
          })
        : null;

      const scheduledAt = dto.scheduledPickupAt
        ? new Date(dto.scheduledPickupAt)
        : computedSchedule!.scheduledPickupAt;
      const requestedAt = computedSchedule
        ? computedSchedule.requestedPickupAt
        : scheduledAt;
      const resolvedTimeLocal =
        dto.requestedTimeLocal ?? formatTimeLocalInTimezone(scheduledAt, timezone);

      if (options.enforceCutoff) {
        const diffMs = scheduledAt.getTime() - Date.now();
        if (diffMs < cutoffMin * 60_000) {
          throw new UnprocessableEntityException({
            code: 'BOOKING_CUTOFF_PASSED',
            message: `Shift bookings must be submitted at least ${cutoffMin} minutes before scheduled pickup.`,
            details: { requiredCutoffMinutes: cutoffMin },
          });
        }
      }

      const [duplicate] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.organizationId, identity.organizationId),
            eq(bookings.employeeId, dto.employeeId),
            eq(bookings.travelDate, dto.travelDate),
            eq(bookings.shiftId, dto.shiftId),
            eq(bookings.direction, dto.direction),
            inArray(bookings.status, ['PENDING_APPROVAL', 'APPROVED', 'DISPATCHED']),
          ),
        )
        .limit(1);

      if (duplicate) {
        throw new ConflictException({
          code: 'BOOKING_ALREADY_EXISTS',
          message: 'An active booking already exists for this employee, date, shift, and direction.',
        });
      }

      const commuteMeta = buildOperatorCommuteIdentity({
        officeId: dto.officeId,
        officeName: office.name,
        shiftId: dto.shiftId,
        shiftName: shift.name,
        direction: dto.direction,
        localityLabel: resolveLocalityDisplayLabel({
          normalizedLocality: loc.normalizedLocality,
          corridorTag: loc.corridorTag,
          locationName: loc.locationName,
        }),
        timePreference,
        requestedTimeLocal: resolvedTimeLocal,
        timezone,
      });

      const [created] = await tx
        .insert(bookings)
        .values({
          organizationId: identity.organizationId,
          commuteKey: commuteMeta.commuteKey,
          employeeId: dto.employeeId,
          shiftId: dto.shiftId,
          officeId: dto.officeId,
          pickupLocationId: dto.pickupLocationId,
          travelDate: dto.travelDate,
          direction: dto.direction,
          timePreference,
          requestedTimeLocal: resolvedTimeLocal,
          timezone,
          requestedPickupAt: requestedAt,
          scheduledPickupAt: scheduledAt,
          isArriveByInfeasible: computedSchedule?.isArriveByInfeasible ?? false,
          feasibilityNote: computedSchedule?.feasibilityNote ?? null,
          notes: dto.notes ?? null,
          status: 'PENDING_APPROVAL',
        })
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'BOOKING_CREATED',
        entityType: 'booking',
        entityId: created.id,
        afterJson: {
          employeeId: created.employeeId,
          travelDate: created.travelDate,
          direction: created.direction,
        },
      });

      return created;
    });
  }

  async cancelBooking(identity: RequestIdentity, bookingId: string, dto: CancelBookingDto) {
    return this.dbService.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(bookings)
        .where(
          and(eq(bookings.id, bookingId), eq(bookings.organizationId, identity.organizationId)),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Booking ${bookingId} not found.`,
        });
      }

      if (existing.status === 'DISPATCHED' || existing.status === 'CANCELLED') {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `Cannot cancel booking in status ${existing.status}.`,
        });
      }

      const [updated] = await tx
        .update(bookings)
        .set({
          status: 'CANCELLED',
          cancellationReason: dto.reason,
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'BOOKING_CANCELLED',
        entityType: 'booking',
        entityId: bookingId,
        reason: dto.reason,
        beforeJson: { status: existing.status },
        afterJson: { status: updated.status },
      });

      return updated;
    });
  }

  async listForSelf(identity: RequestIdentity, query: ListBookingsQuery) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );
    return this.listByOrg(identity.organizationId, { ...query, employeeId: emp.id });
  }

  async createForSelf(identity: RequestIdentity, dto: EmployeeCreateBookingDto) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );
    const created = await this.createBooking(
      identity,
      { ...dto, employeeId: emp.id },
      { enforceCutoff: true },
    );
    await this.dbService.db.insert(notifications).values({
      organizationId: identity.organizationId,
      recipientUserId: identity.userId,
      channel: 'IN_APP',
      category: 'BOOKING_SUBMITTED',
      title: `Shift booking submitted (${created.travelDate})`,
      body: `Your ${created.direction} ride request is awaiting duty approver sign-off.`,
      metadataJson: { bookingId: created.id, travelDate: created.travelDate },
    });
    return created;
  }

  async cancelForSelf(identity: RequestIdentity, bookingId: string, dto: CancelBookingDto) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    const txResult = await this.dbService.transaction(async (tx) => {
      const [[existing], [settings]] = await Promise.all([
        tx
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.id, bookingId),
              eq(bookings.employeeId, emp.id),
              eq(bookings.organizationId, identity.organizationId),
            ),
          )
          .limit(1),
        tx
          .select()
          .from(organizationSettings)
          .where(eq(organizationSettings.organizationId, identity.organizationId))
          .limit(1),
      ]);

      if (!existing) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Booking ${bookingId} not found for employee.`,
        });
      }

      if (existing.status === 'CANCELLED' || existing.status === 'REJECTED') {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `Booking is already in terminal status ${existing.status}.`,
        });
      }

      const cancelCutoffMin = settings?.cancellationCutoffMinutes ?? 45;
      const diffMs = existing.scheduledPickupAt.getTime() - Date.now();
      if (diffMs < cancelCutoffMin * 60_000) {
        throw new UnprocessableEntityException({
          code: 'BOOKING_CUTOFF_PASSED',
          message: `Cannot cancel within ${cancelCutoffMin} minutes of scheduled pickup.`,
          details: { requiredCutoffMinutes: cancelCutoffMin },
        });
      }

      const now = new Date();
      const [updated] = await tx
        .update(bookings)
        .set({
          status: 'CANCELLED',
          cancellationReason: dto.reason,
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      let affectedTripId: string | null = null;
      let driverIdToNotify: string | null = null;
      let driverUserIdToNotify: string | null = null;
      let tripCodeToNotify: string | null = null;

      if (existing.status === 'DISPATCHED') {
        const [pa] = await tx
          .select()
          .from(passengerAssignments)
          .where(
            and(
              eq(passengerAssignments.bookingId, bookingId),
              eq(passengerAssignments.organizationId, identity.organizationId),
            ),
          )
          .limit(1);

        if (pa) {
          assertPassengerTransition(pa.status, 'CANCELLED');
          await tx
            .update(passengerAssignments)
            .set({
              status: 'CANCELLED',
              cancellationReason: dto.reason,
              updatedAt: now,
            })
            .where(eq(passengerAssignments.id, pa.id));

          affectedTripId = pa.tripId;
          const [tripRow] = await tx
            .select({ id: trips.id, tripCode: trips.tripCode, driverId: trips.driverId })
            .from(trips)
            .where(eq(trips.id, pa.tripId))
            .limit(1);

          await tx.insert(tripEvents).values({
            organizationId: identity.organizationId,
            tripId: pa.tripId,
            tripStopId: pa.tripStopId,
            passengerAssignmentId: pa.id,
            actorUserId: identity.userId,
            actorRole: identity.role,
            eventType: 'PASSENGER_CANCELLED',
            clientEventId: crypto.randomUUID(),
            occurredAtClient: now,
            payloadJson: { reason: dto.reason, employeeId: emp.id },
          });

          if (tripRow?.driverId) {
            driverIdToNotify = tripRow.driverId;
            tripCodeToNotify = tripRow.tripCode;
            const [driverRow] = await tx
              .select({ userId: drivers.userId })
              .from(drivers)
              .where(eq(drivers.id, tripRow.driverId))
              .limit(1);
            if (driverRow) {
              driverUserIdToNotify = driverRow.userId;
              await tx.insert(notifications).values({
                organizationId: identity.organizationId,
                recipientUserId: driverRow.userId,
                channel: 'IN_APP',
                category: 'PASSENGER_CANCELLED',
                title: `Passenger cannot board · ${tripRow.tripCode}`,
                body: `Stop updated cleanly (${dto.reason}). Proceed to next pending pickup.`,
                metadataJson: { tripId: tripRow.id, passengerAssignmentId: pa.id },
              });
            }
          }
        }
      }

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'EMPLOYEE_BOOKING_CANCELLED',
        entityType: 'booking',
        entityId: bookingId,
        reason: dto.reason,
        beforeJson: { status: existing.status },
        afterJson: { status: updated.status, tripId: affectedTripId },
      });

      await this.outbox.enqueueInTx(tx, {
        organizationId: identity.organizationId,
        topic: TRANSPORT_TOPICS.NOTIFICATION_EVENTS,
        aggregateType: 'booking',
        aggregateId: bookingId,
        payload: {
          event: 'passenger.cancelled',
          bookingId,
          employeeId: emp.id,
          tripId: affectedTripId,
          reason: dto.reason,
        },
      });

      return {
        booking: updated,
        affectedTripId,
        driverIdToNotify,
        driverUserIdToNotify,
        tripCodeToNotify,
      };
    });

    if (txResult.affectedTripId) {
      const payload = {
        bookingId,
        employeeId: emp.id,
        tripId: txResult.affectedTripId,
        reason: dto.reason,
        serverTime: new Date().toISOString(),
      };
      this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'passenger.cancelled', payload);
      this.gateway.emitToRoom(WS_ROOMS.trip(txResult.affectedTripId), 'passenger.cancelled', payload);
      if (txResult.driverIdToNotify) {
        this.gateway.emitToRoom(WS_ROOMS.driver(txResult.driverIdToNotify), 'passenger.cancelled', payload);
      }
      if (txResult.driverUserIdToNotify) {
        await this.notifications.enqueueNotification({
          organizationId: identity.organizationId,
          recipientUserId: txResult.driverUserIdToNotify,
          driverId: txResult.driverIdToNotify,
          tripId: txResult.affectedTripId,
          channel: 'PUSH',
          category: 'PASSENGER_CANCELLED',
          title: `Passenger cannot board · ${txResult.tripCodeToNotify ?? 'Shift'}`,
          body: `Stop updated (${dto.reason}). Proceed to next pending pickup.`,
          metadataJson: { tripId: txResult.affectedTripId, bookingId },
          persistDb: false,
          dedupKey: `cancel-drv-${bookingId}`,
        });
      }
    }

    return txResult.booking;
  }
}

@ApiTags('Admin - Bookings')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/bookings')
export class BookingsController {
  constructor(
    private readonly service: BookingsService,
    private readonly seriesService: BookingSeriesService,
  ) {}

  @Get()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'List shift transport bookings with operational filters' })
  list(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: listBookingsQuerySchema }) query: ListBookingsQuery,
  ) {
    return this.service.listByOrg(identity.organizationId, query);
  }

  @Get('series')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'List recurring employee booking series and expiry states' })
  listSeries(@CurrentIdentity() identity: RequestIdentity) {
    return this.seriesService.listSeries(identity.organizationId);
  }

  @Post('series/process-expiries')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({ summary: 'Transition expired recurring series and future stale assignments' })
  processExpiries(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: processExpiriesSchema }) dto: ProcessExpiriesDto,
  ) {
    return this.seriesService.processExpiredSeriesAndBookings(
      dto.referenceDate,
      identity.organizationId,
    );
  }

  @Post()
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({ summary: 'Create an employee transport booking for shift scheduling' })
  create(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: createBookingSchema }) dto: CreateBookingDto,
  ) {
    return this.service.createBooking(identity, dto);
  }

  @Post(':bookingId/cancel')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({ summary: 'Cancel a pending or approved booking before dispatch' })
  cancel(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('bookingId', { schema: uuidParamSchema }) bookingId: string,
    @Body({ schema: cancelBookingSchema }) dto: CancelBookingDto,
  ) {
    return this.service.cancelBooking(identity, bookingId, dto);
  }
}

@ApiTags('Employee - Bookings')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('employee/bookings')
export class EmployeeBookingsController {
  constructor(
    private readonly service: BookingsService,
    private readonly seriesService: BookingSeriesService,
  ) {}

  @Get()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'List authenticated employee shift bookings and dispatch state' })
  list(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: listBookingsQuerySchema }) query: ListBookingsQuery,
  ) {
    return this.service.listForSelf(identity, query);
  }

  @Post()
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Submit employee shift transport booking with cutoff validation' })
  create(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: employeeCreateBookingSchema }) dto: EmployeeCreateBookingDto,
  ) {
    return this.service.createForSelf(identity, dto);
  }

  @Post('series/preview')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({
    summary:
      'Preview recurring calendar dates, PICKUP_AT/ARRIVE_BY timings, infeasibility, and overlaps',
  })
  previewSeries(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: previewSeriesSchema }) dto: PreviewSeriesDto,
  ) {
    return this.seriesService.previewSeriesForSelf(identity, dto);
  }

  @Get('series')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'List authenticated employee active, expired, and cancelled series' })
  listMySeries(@CurrentIdentity() identity: RequestIdentity) {
    return this.seriesService.listSeriesForSelf(identity);
  }

  @Post('series')
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Confirm and create a time-bounded recurring booking series' })
  createSeries(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: createSeriesSchema }) dto: CreateSeriesDto,
  ) {
    return this.seriesService.createSeriesForSelf(identity, dto);
  }

  @Post('series/:seriesId/skip-dates')
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Skip individual future dates from a recurring booking series' })
  skipSeriesDates(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('seriesId', { schema: uuidParamSchema }) seriesId: string,
    @Body({ schema: skipSeriesDatesSchema }) dto: SkipSeriesDatesDto,
  ) {
    return this.seriesService.skipDatesForSelf(identity, seriesId, dto);
  }

  @Post('series/:seriesId/extend')
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Extend or renew an active/expired recurring booking series' })
  extendSeries(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('seriesId', { schema: uuidParamSchema }) seriesId: string,
    @Body({ schema: extendSeriesSchema }) dto: ExtendSeriesDto,
  ) {
    return this.seriesService.extendSeriesForSelf(identity, seriesId, dto);
  }

  @Post('series/:seriesId/cancel')
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({
    summary:
      'Cancel remaining future occurrences of a series while preserving completed history/billing',
  })
  cancelSeries(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('seriesId', { schema: uuidParamSchema }) seriesId: string,
    @Body({ schema: cancelSeriesSchema }) dto: CancelSeriesDto,
  ) {
    return this.seriesService.cancelSeriesForSelf(identity, seriesId, dto);
  }

  @Patch(':bookingId')
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({
    summary:
      'Update pickup location or PICKUP_AT/ARRIVE_BY preference for a future ride (alerts ops if dispatched)',
  })
  updateOccurrence(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('bookingId', { schema: uuidParamSchema }) bookingId: string,
    @Body({ schema: updateBookingOccurrenceSchema }) dto: UpdateBookingOccurrenceDto,
  ) {
    return this.seriesService.updateOccurrenceForSelf(identity, bookingId, dto);
  }

  @Post(':bookingId/cancel')
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Submit Cannot Board cancellation enforcing org cutoff policy' })
  cancel(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('bookingId', { schema: uuidParamSchema }) bookingId: string,
    @Body({ schema: cancelBookingSchema }) dto: CancelBookingDto,
  ) {
    return this.service.cancelForSelf(identity, bookingId, dto);
  }
}

@Module({
  imports: [AuditLogsModule, EmployeesModule, NotificationsModule],
  controllers: [BookingsController, EmployeeBookingsController],
  providers: [BookingsService, BookingSeriesService, BookingMaintenanceProcessor],
  exports: [BookingsService, BookingSeriesService],
})
export class BookingsModule implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.BOOKING_MAINTENANCE)
    private readonly maintenanceQueue: Queue<{ referenceDate?: string }>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.maintenanceQueue.upsertJobScheduler(
        'repeat-booking-expiries',
        { every: 60_000 },
        { name: 'process-booking-expiries', data: {} },
      );
    } catch {
      // Safe no-op if Redis scheduler busy or already registered.
    }
  }
}
