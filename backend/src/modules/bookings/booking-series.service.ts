import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Job } from 'bullmq';
import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { type RequestIdentity } from '../../infrastructure/common/current-user.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  bookings,
  bookingSeries,
  employeeLocations,
  employees,
  notifications,
  offices,
  organizations,
  organizationSettings,
  passengerAssignments,
  shifts,
  trips,
  users,
} from '../../infrastructure/database/schema/index.js';
import { OutboxService } from '../../infrastructure/event-management/outbox.service.js';
import { TRANSPORT_TOPICS } from '../../infrastructure/event-management/topics.js';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import {
  BOOKING_RECURRENCE_TYPES,
  BOOKING_TIME_PREFERENCES,
  DAYS_OF_WEEK,
  TRIP_DIRECTIONS,
} from '../../infrastructure/shared/enums.js';
import { TransportGateway, WS_ROOMS } from '../../infrastructure/websocket/transport.gateway.js';
import { AuditLogsService } from '../audit-logs/audit-logs.module.js';
import {
  buildOperatorCommuteIdentity,
  resolveLocalityDisplayLabel,
} from '../commutes/commutes.utils.js';
import { EmployeesService } from '../employees/employees.module.js';
import {
  addCalendarDays,
  computeScheduleForTimePreference,
  expandSeriesDates,
  formatIsoDateInTimezone,
  formatTimeLocalInTimezone,
} from './bookings.calendar.js';

export const previewSeriesSchema = z.object({
  officeId: z.string().uuid().optional(),
  shiftId: z.string().uuid(),
  pickupLocationId: z.string().uuid(),
  direction: z.enum(TRIP_DIRECTIONS),
  timePreference: z.enum(BOOKING_TIME_PREFERENCES).default('PICKUP_AT'),
  requestedTimeLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(2).max(64).default('Asia/Kolkata'),
  recurrenceType: z.enum(BOOKING_RECURRENCE_TYPES).default('ONE_DAY'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  selectedDaysOfWeek: z.array(z.enum(DAYS_OF_WEEK)).min(1).max(7).optional(),
});
export type PreviewSeriesDto = z.infer<typeof previewSeriesSchema>;

export const createSeriesSchema = previewSeriesSchema.extend({
  notes: z.string().max(500).optional(),
  skipConflictingDates: z.boolean().default(false),
});
export type CreateSeriesDto = z.infer<typeof createSeriesSchema>;

export const skipSeriesDatesSchema = z.object({
  dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .min(1)
    .max(60),
  reason: z.string().min(3).max(500).default('Employee requested date skip'),
});
export type SkipSeriesDatesDto = z.infer<typeof skipSeriesDatesSchema>;

export const updateBookingOccurrenceSchema = z.object({
  pickupLocationId: z.string().uuid().optional(),
  timePreference: z.enum(BOOKING_TIME_PREFERENCES).optional(),
  requestedTimeLocal: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  timezone: z.string().min(2).max(64).optional(),
  scheduledPickupAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
  reason: z.string().min(3).max(500).default('Employee modified upcoming ride details'),
});
export type UpdateBookingOccurrenceDto = z.infer<typeof updateBookingOccurrenceSchema>;

export const extendSeriesSchema = z.object({
  newEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  selectedDaysOfWeek: z.array(z.enum(DAYS_OF_WEEK)).min(1).max(7).optional(),
  skipConflictingDates: z.boolean().default(true),
});
export type ExtendSeriesDto = z.infer<typeof extendSeriesSchema>;

export const cancelSeriesSchema = z.object({
  reason: z.string().min(3).max(500),
});
export type CancelSeriesDto = z.infer<typeof cancelSeriesSchema>;

export const processExpiriesSchema = z.object({
  referenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type ProcessExpiriesDto = z.infer<typeof processExpiriesSchema>;

const ACTIVE_BOOKING_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'DISPATCHED'] as const;

@Injectable()
export class BookingSeriesService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly employeesService: EmployeesService,
    private readonly outbox: OutboxService,
    private readonly gateway: TransportGateway,
  ) {}

  private async resolveEmployeeContext(
    organizationId: string,
    userId: string,
    officeIdOverride?: string,
    shiftId?: string,
    pickupLocationId?: string,
  ) {
    const emp = await this.employeesService.resolveEmployeeByUserId(organizationId, userId);
    if (!emp.transportEligible) {
      throw new UnprocessableEntityException({
        code: 'EMPLOYEE_NOT_ELIGIBLE',
        message: 'Employee transport eligibility is disabled by your administrator.',
      });
    }

    const effectiveOfficeId = officeIdOverride ?? emp.officeId;
    const [[org], [settings], [office], [shift], [pickupLoc]] = await Promise.all([
      this.dbService.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1),
      this.dbService.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, organizationId))
        .limit(1),
      this.dbService.db
        .select()
        .from(offices)
        .where(and(eq(offices.id, effectiveOfficeId), eq(offices.organizationId, organizationId)))
        .limit(1),
      shiftId
        ? this.dbService.db
            .select()
            .from(shifts)
            .where(and(eq(shifts.id, shiftId), eq(shifts.organizationId, organizationId)))
            .limit(1)
        : Promise.resolve([undefined]),
      pickupLocationId
        ? this.dbService.db
            .select()
            .from(employeeLocations)
            .where(
              and(
                eq(employeeLocations.id, pickupLocationId),
                eq(employeeLocations.employeeId, emp.id),
                eq(employeeLocations.organizationId, organizationId),
              ),
            )
            .limit(1)
        : Promise.resolve([undefined]),
    ]);

    if (!office) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Office not found in active organization.',
      });
    }
    if (shiftId && !shift) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Shift not found in active organization.',
      });
    }
    if (pickupLocationId && !pickupLoc) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Pickup location does not belong to authenticated employee.',
      });
    }

    return { emp, org, settings, office, shift, pickupLoc };
  }

  async previewSeriesForSelf(identity: RequestIdentity, dto: PreviewSeriesDto) {
    const ctx = await this.resolveEmployeeContext(
      identity.organizationId,
      identity.userId,
      dto.officeId,
      dto.shiftId,
      dto.pickupLocationId,
    );

    const expanded = expandSeriesDates({
      recurrenceType: dto.recurrenceType,
      startDate: dto.startDate,
      endDate: dto.endDate,
      selectedDaysOfWeek: dto.selectedDaysOfWeek,
    });

    if (expanded.endDate < expanded.startDate) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'endDate cannot be earlier than startDate.',
      });
    }
    if (expanded.dates.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'No matching calendar dates fall within the selected recurrence window and days.',
      });
    }

    const candidateDateStrings = expanded.dates.map((d) => d.travelDate);
    const existingActiveBookings = await this.dbService.db
      .select({
        id: bookings.id,
        seriesId: bookings.seriesId,
        travelDate: bookings.travelDate,
        status: bookings.status,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.organizationId, identity.organizationId),
          eq(bookings.employeeId, ctx.emp.id),
          eq(bookings.direction, dto.direction),
          inArray(bookings.travelDate, candidateDateStrings),
          inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
        ),
      );

    const existingByDate = new Map(existingActiveBookings.map((b) => [b.travelDate, b]));
    const cutoffMin = ctx.settings?.bookingCutoffMinutes ?? 120;
    const arriveByBuffer = ctx.settings?.arriveBySafetyBufferMinutes ?? 10;
    const timezone = dto.timezone || ctx.org?.timezone || 'Asia/Kolkata';
    const now = new Date();
    const todayLocal = formatIsoDateInTimezone(now, timezone);

    const occurrences = expanded.dates.map(({ travelDate, dayOfWeek }) => {
      const sched = computeScheduleForTimePreference({
        travelDate,
        direction: dto.direction,
        timePreference: dto.timePreference,
        requestedTimeLocal: dto.requestedTimeLocal,
        timezone,
        pickupLat: ctx.pickupLoc!.latitude,
        pickupLng: ctx.pickupLoc!.longitude,
        officeLat: ctx.office.latitude,
        officeLng: ctx.office.longitude,
        arriveBySafetyBufferMinutes: arriveByBuffer,
        bookingCutoffMinutes: cutoffMin,
        now,
      });

      const conflict = existingByDate.get(travelDate);
      const leadMs = sched.scheduledPickupAt.getTime() - now.getTime();
      const sameDayBlocked =
        ctx.settings?.allowSameDayBooking === false && travelDate === todayLocal;
      const passesCutoff = leadMs >= cutoffMin * 60_000 && !sameDayBlocked;

      return {
        travelDate,
        dayOfWeek,
        requestedPickupAt: sched.requestedPickupAt.toISOString(),
        scheduledPickupAt: sched.scheduledPickupAt.toISOString(),
        estimatedArrivalAt: sched.estimatedArrivalAt.toISOString(),
        estimatedTravelMinutes: sched.estimatedTravelMinutes,
        isArriveByInfeasible: sched.isArriveByInfeasible,
        feasibilityNote: sched.feasibilityNote,
        passesCutoff,
        cutoffNote: sameDayBlocked
          ? 'Same-day booking is disabled by organization policy.'
          : !passesCutoff
            ? `Requires at least ${cutoffMin} minutes lead time before scheduled pickup.`
            : null,
        hasConflict: Boolean(conflict),
        conflictingBookingId: conflict?.id ?? null,
        conflictingSeriesId: conflict?.seriesId ?? null,
      };
    });

    const conflictingSeriesIds = [
      ...new Set(occurrences.map((o) => o.conflictingSeriesId).filter((x): x is string => Boolean(x))),
    ];

    return {
      recurrenceType: dto.recurrenceType,
      startDate: expanded.startDate,
      endDate: expanded.endDate,
      selectedDaysOfWeek: expanded.selectedDaysOfWeek,
      direction: dto.direction,
      timePreference: dto.timePreference,
      requestedTimeLocal: dto.requestedTimeLocal,
      timezone,
      officeId: ctx.office.id,
      officeName: ctx.office.name,
      shiftId: ctx.shift!.id,
      shiftName: ctx.shift!.name,
      pickupLocationId: ctx.pickupLoc!.id,
      pickupLocationName: ctx.pickupLoc!.locationName,
      totalDatesCount: occurrences.length,
      validDatesCount: occurrences.filter((o) => o.passesCutoff && !o.hasConflict).length,
      conflictingDatesCount: occurrences.filter((o) => o.hasConflict).length,
      infeasibleDatesCount: occurrences.filter((o) => o.isArriveByInfeasible).length,
      conflictingSeriesIds,
      occurrences,
    };
  }

  async createSeriesForSelf(identity: RequestIdentity, dto: CreateSeriesDto) {
    const preview = await this.previewSeriesForSelf(identity, dto);

    const conflicts = preview.occurrences.filter((o) => o.hasConflict);
    if (conflicts.length > 0 && !dto.skipConflictingDates) {
      throw new ConflictException({
        code: 'BOOKING_SERIES_OVERLAP',
        message: `${conflicts.length} date(s) overlap with existing active ${dto.direction} bookings (${conflicts.map((c) => c.travelDate).join(', ')}).`,
        details: {
          conflictingDates: conflicts.map((c) => c.travelDate),
          conflictingSeriesIds: preview.conflictingSeriesIds,
        },
      });
    }

    const eligibleOccurrences = preview.occurrences.filter((o) => o.passesCutoff && !o.hasConflict);
    if (eligibleOccurrences.length === 0) {
      throw new UnprocessableEntityException({
        code: 'BOOKING_CUTOFF_PASSED',
        message:
          'No eligible booking occurrences remain after applying cutoff and overlap checks.',
        details: { occurrences: preview.occurrences },
      });
    }

    const ctx = await this.resolveEmployeeContext(
      identity.organizationId,
      identity.userId,
      dto.officeId,
      dto.shiftId,
      dto.pickupLocationId,
    );

    const localityLabel = resolveLocalityDisplayLabel({
      normalizedLocality: ctx.pickupLoc?.normalizedLocality,
      corridorTag: ctx.pickupLoc?.corridorTag,
      locationName: ctx.pickupLoc?.locationName,
    });
    const commuteIdentity = buildOperatorCommuteIdentity({
      officeId: preview.officeId,
      officeName: ctx.office.name,
      shiftId: preview.shiftId,
      shiftName: ctx.shift!.name,
      direction: dto.direction,
      localityLabel,
      timePreference: dto.timePreference,
      requestedTimeLocal: dto.requestedTimeLocal,
      timezone: preview.timezone,
    });

    const txRes = await this.dbService.transaction(async (tx) => {
      const [series] = await tx
        .insert(bookingSeries)
        .values({
          organizationId: identity.organizationId,
          employeeId: ctx.emp.id,
          shiftId: preview.shiftId,
          officeId: preview.officeId,
          pickupLocationId: preview.pickupLocationId,
          localityId: ctx.pickupLoc?.localityId ?? null,
          commuteKey: commuteIdentity.commuteKey,
          commuteName: commuteIdentity.commuteName,
          direction: dto.direction,
          timePreference: dto.timePreference,
          requestedTimeLocal: dto.requestedTimeLocal,
          timezone: preview.timezone,
          recurrenceType: dto.recurrenceType,
          startDate: preview.startDate,
          endDate: preview.endDate,
          selectedDaysOfWeek: preview.selectedDaysOfWeek.join(','),
          status: 'ACTIVE',
          notes: dto.notes ?? null,
        })
        .returning();

      const createdBookings = await tx
        .insert(bookings)
        .values(
          eligibleOccurrences.map((occ) => ({
            organizationId: identity.organizationId,
            seriesId: series.id,
            commuteKey: commuteIdentity.commuteKey,
            employeeId: ctx.emp.id,
            shiftId: preview.shiftId,
            officeId: preview.officeId,
            pickupLocationId: preview.pickupLocationId,
            travelDate: occ.travelDate,
            direction: dto.direction,
            timePreference: dto.timePreference,
            requestedTimeLocal: dto.requestedTimeLocal,
            timezone: preview.timezone,
            requestedPickupAt: new Date(occ.requestedPickupAt),
            scheduledPickupAt: new Date(occ.scheduledPickupAt),
            isArriveByInfeasible: occ.isArriveByInfeasible,
            feasibilityNote: occ.feasibilityNote,
            status: 'PENDING_APPROVAL' as const,
            notes: dto.notes ?? null,
          })),
        )
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'BOOKING_SERIES_CREATED',
        entityType: 'booking_series',
        entityId: series.id,
        afterJson: {
          recurrenceType: series.recurrenceType,
          startDate: series.startDate,
          endDate: series.endDate,
          createdCount: createdBookings.length,
        },
      });

      await tx.insert(notifications).values({
        organizationId: identity.organizationId,
        recipientUserId: identity.userId,
        channel: 'IN_APP',
        category: 'BOOKING_SERIES_SUBMITTED',
        title: `Recurring ride series scheduled (${series.startDate} -> ${series.endDate})`,
        body: `${createdBookings.length} ${series.direction} ride(s) created for ${series.recurrenceType} schedule.`,
        metadataJson: {
          seriesId: series.id,
          createdCount: createdBookings.length,
        },
      });

      return { series, createdBookings };
    });

    return {
      series: txRes.series,
      bookings: txRes.createdBookings,
      summary: {
        createdCount: txRes.createdBookings.length,
        skippedOverlapCount: conflicts.length,
        skippedCutoffCount: preview.occurrences.filter((o) => !o.passesCutoff).length,
        infeasibleDatesCount: txRes.createdBookings.filter((b) => b.isArriveByInfeasible).length,
      },
    };
  }

  async listSeries(organizationId: string, employeeId?: string) {
    const conditions = [eq(bookingSeries.organizationId, organizationId)];
    if (employeeId) conditions.push(eq(bookingSeries.employeeId, employeeId));

    const seriesRows = await this.dbService.db
      .select({
        id: bookingSeries.id,
        organizationId: bookingSeries.organizationId,
        employeeId: bookingSeries.employeeId,
        employeeCode: employees.employeeCode,
        employeeName: users.fullName,
        shiftId: bookingSeries.shiftId,
        shiftName: shifts.name,
        officeId: bookingSeries.officeId,
        officeName: offices.name,
        pickupLocationId: bookingSeries.pickupLocationId,
        pickupLocationName: employeeLocations.locationName,
        localityName: employeeLocations.normalizedLocality,
        direction: bookingSeries.direction,
        timePreference: bookingSeries.timePreference,
        requestedTimeLocal: bookingSeries.requestedTimeLocal,
        timezone: bookingSeries.timezone,
        recurrenceType: bookingSeries.recurrenceType,
        startDate: bookingSeries.startDate,
        endDate: bookingSeries.endDate,
        selectedDaysOfWeek: bookingSeries.selectedDaysOfWeek,
        status: bookingSeries.status,
        notes: bookingSeries.notes,
        expiredAt: bookingSeries.expiredAt,
        cancelledAt: bookingSeries.cancelledAt,
        cancellationReason: bookingSeries.cancellationReason,
        createdAt: bookingSeries.createdAt,
      })
      .from(bookingSeries)
      .innerJoin(employees, eq(bookingSeries.employeeId, employees.id))
      .innerJoin(users, eq(employees.userId, users.id))
      .innerJoin(shifts, eq(bookingSeries.shiftId, shifts.id))
      .innerJoin(offices, eq(bookingSeries.officeId, offices.id))
      .innerJoin(employeeLocations, eq(bookingSeries.pickupLocationId, employeeLocations.id))
      .where(and(...conditions))
      .orderBy(desc(bookingSeries.createdAt));

    if (seriesRows.length === 0) return [];

    const seriesIds = seriesRows.map((s) => s.id);
    const occurrences = await this.dbService.db
      .select({
        id: bookings.id,
        seriesId: bookings.seriesId,
        travelDate: bookings.travelDate,
        status: bookings.status,
        scheduledPickupAt: bookings.scheduledPickupAt,
        timePreference: bookings.timePreference,
        requestedTimeLocal: bookings.requestedTimeLocal,
        isArriveByInfeasible: bookings.isArriveByInfeasible,
        tripId: passengerAssignments.tripId,
      })
      .from(bookings)
      .leftJoin(passengerAssignments, eq(passengerAssignments.bookingId, bookings.id))
      .where(inArray(bookings.seriesId, seriesIds))
      .orderBy(asc(bookings.travelDate));

    const occBySeries = new Map<string, typeof occurrences>();
    for (const o of occurrences) {
      if (!o.seriesId) continue;
      const arr = occBySeries.get(o.seriesId) ?? [];
      arr.push(o);
      occBySeries.set(o.seriesId, arr);
    }

    return seriesRows.map((s) => {
      const items = occBySeries.get(s.id) ?? [];
      return {
        ...s,
        counts: {
          total: items.length,
          pendingApproval: items.filter((i) => i.status === 'PENDING_APPROVAL').length,
          approved: items.filter((i) => i.status === 'APPROVED').length,
          dispatched: items.filter((i) => i.status === 'DISPATCHED').length,
          cancelled: items.filter((i) => i.status === 'CANCELLED').length,
          expired: items.filter((i) => i.status === 'EXPIRED').length,
        },
        occurrences: items,
      };
    });
  }

  async listSeriesForSelf(identity: RequestIdentity) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );
    return this.listSeries(identity.organizationId, emp.id);
  }

  async skipDatesForSelf(identity: RequestIdentity, seriesId: string, dto: SkipSeriesDatesDto) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    return this.dbService.transaction(async (tx) => {
      const [series] = await tx
        .select()
        .from(bookingSeries)
        .where(
          and(
            eq(bookingSeries.id, seriesId),
            eq(bookingSeries.organizationId, identity.organizationId),
            eq(bookingSeries.employeeId, emp.id),
          ),
        )
        .limit(1);

      if (!series) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Booking series ${seriesId} not found.`,
        });
      }

      const targets = await tx
        .select({
          booking: bookings,
          assignmentId: passengerAssignments.id,
          assignmentStatus: passengerAssignments.status,
          tripId: trips.id,
          tripCode: trips.tripCode,
          tripStatus: trips.status,
        })
        .from(bookings)
        .leftJoin(passengerAssignments, eq(passengerAssignments.bookingId, bookings.id))
        .leftJoin(trips, eq(passengerAssignments.tripId, trips.id))
        .where(
          and(
            eq(bookings.seriesId, seriesId),
            inArray(bookings.travelDate, dto.dates),
            inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
          ),
        );

      const skippedIds: string[] = [];
      const blockedIds: string[] = [];
      const impactedTrips: Array<{ tripId: string; tripCode: string | null }> = [];
      const now = new Date();

      for (const row of targets) {
        const isLockedByTrip =
          (row.assignmentStatus != null &&
            ['BOARDED', 'DROPPED'].includes(row.assignmentStatus)) ||
          (row.tripStatus != null && ['IN_PROGRESS', 'COMPLETED'].includes(row.tripStatus));
        if (isLockedByTrip) {
          blockedIds.push(row.booking.id);
          continue;
        }

        await tx
          .update(bookings)
          .set({
            status: 'CANCELLED',
            cancellationReason: dto.reason,
            cancelledAt: now,
            updatedAt: now,
          })
          .where(eq(bookings.id, row.booking.id));

        if (row.assignmentId && row.assignmentStatus === 'SCHEDULED') {
          await tx
            .update(passengerAssignments)
            .set({
              status: 'CANCELLED',
              cancellationReason: dto.reason,
              updatedAt: now,
            })
            .where(eq(passengerAssignments.id, row.assignmentId));

          if (row.tripId) {
            impactedTrips.push({ tripId: row.tripId, tripCode: row.tripCode });
          }
        }
        skippedIds.push(row.booking.id);
      }

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'BOOKING_SERIES_DATES_SKIPPED',
        entityType: 'booking_series',
        entityId: seriesId,
        reason: dto.reason,
        afterJson: { requestedDates: dto.dates, skippedIds, blockedIds, impactedTrips },
      });

      return {
        seriesId,
        skippedCount: skippedIds.length,
        skippedBookingIds: skippedIds,
        blockedBookingIds: blockedIds,
        impactedTrips,
      };
    });
  }

  async updateOccurrenceForSelf(
    identity: RequestIdentity,
    bookingId: string,
    dto: UpdateBookingOccurrenceDto,
  ) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    const txRes = await this.dbService.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.id, bookingId),
            eq(bookings.organizationId, identity.organizationId),
            eq(bookings.employeeId, emp.id),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Booking ${bookingId} not found.`,
        });
      }

      if (!ACTIVE_BOOKING_STATUSES.includes(existing.status as (typeof ACTIVE_BOOKING_STATUSES)[number])) {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `Cannot modify booking in status ${existing.status}.`,
        });
      }

      const nextLocId = dto.pickupLocationId ?? existing.pickupLocationId;
      const [[loc], [office], [settings]] = await Promise.all([
        tx
          .select()
          .from(employeeLocations)
          .where(
            and(
              eq(employeeLocations.id, nextLocId),
              eq(employeeLocations.employeeId, emp.id),
              eq(employeeLocations.organizationId, identity.organizationId),
            ),
          )
          .limit(1),
        tx.select().from(offices).where(eq(offices.id, existing.officeId)).limit(1),
        tx
          .select()
          .from(organizationSettings)
          .where(eq(organizationSettings.organizationId, identity.organizationId))
          .limit(1),
      ]);

      if (!loc || !office) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: 'Pickup location or office not found.',
        });
      }

      const nextPreference = dto.timePreference ?? existing.timePreference;
      const nextTimezone = dto.timezone ?? existing.timezone;
      const nextTimeLocal =
        dto.requestedTimeLocal ??
        (dto.scheduledPickupAt
          ? formatTimeLocalInTimezone(new Date(dto.scheduledPickupAt), nextTimezone)
          : existing.requestedTimeLocal ??
            formatTimeLocalInTimezone(existing.scheduledPickupAt, nextTimezone));

      const sched = computeScheduleForTimePreference({
        travelDate: existing.travelDate,
        direction: existing.direction,
        timePreference: nextPreference,
        requestedTimeLocal: nextTimeLocal,
        timezone: nextTimezone,
        pickupLat: loc.latitude,
        pickupLng: loc.longitude,
        officeLat: office.latitude,
        officeLng: office.longitude,
        arriveBySafetyBufferMinutes: settings?.arriveBySafetyBufferMinutes ?? 10,
        bookingCutoffMinutes: settings?.bookingCutoffMinutes ?? 120,
      });

      const scheduledPickupDate = dto.scheduledPickupAt
        ? new Date(dto.scheduledPickupAt)
        : sched.scheduledPickupAt;

      const [updated] = await tx
        .update(bookings)
        .set({
          pickupLocationId: nextLocId,
          timePreference: nextPreference,
          requestedTimeLocal: nextTimeLocal,
          timezone: nextTimezone,
          requestedPickupAt: sched.requestedPickupAt,
          scheduledPickupAt: scheduledPickupDate,
          isArriveByInfeasible: sched.isArriveByInfeasible,
          feasibilityNote: sched.feasibilityNote,
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      // Check if booking is already on an unstarted/published trip -> alert ops instead of silently mutating stops
      const [linkedTrip] = await tx
        .select({
          tripId: trips.id,
          tripCode: trips.tripCode,
          tripStatus: trips.status,
          assignmentStatus: passengerAssignments.status,
        })
        .from(passengerAssignments)
        .innerJoin(trips, eq(passengerAssignments.tripId, trips.id))
        .where(eq(passengerAssignments.bookingId, bookingId))
        .limit(1);

      let impactedTripAlert: { tripId: string; tripCode: string; actionRequired: string } | null =
        null;

      if (linkedTrip && !['COMPLETED', 'CANCELLED', 'ABORTED'].includes(linkedTrip.tripStatus)) {
        impactedTripAlert = {
          tripId: linkedTrip.tripId,
          tripCode: linkedTrip.tripCode,
          actionRequired: `Published trip ${linkedTrip.tripCode} (${linkedTrip.tripStatus}) requires dispatcher review after passenger updated pickup/time.`,
        };

        await this.outbox.enqueueInTx(tx, {
          organizationId: identity.organizationId,
          topic: TRANSPORT_TOPICS.ASSIGNMENT_EVENTS,
          aggregateType: 'trip',
          aggregateId: linkedTrip.tripId,
          payload: {
            event: 'trip.reoptimization_required',
            tripId: linkedTrip.tripId,
            tripCode: linkedTrip.tripCode,
            bookingId,
            reason: dto.reason,
          },
        });
      }

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: impactedTripAlert
          ? 'BOOKING_CHANGE_REQUIRES_DISPATCH_REVIEW'
          : 'BOOKING_OCCURRENCE_UPDATED',
        entityType: 'booking',
        entityId: bookingId,
        reason: dto.reason,
        beforeJson: {
          pickupLocationId: existing.pickupLocationId,
          timePreference: existing.timePreference,
          requestedTimeLocal: existing.requestedTimeLocal,
          scheduledPickupAt: existing.scheduledPickupAt,
        },
        afterJson: {
          pickupLocationId: updated.pickupLocationId,
          timePreference: updated.timePreference,
          requestedTimeLocal: updated.requestedTimeLocal,
          scheduledPickupAt: updated.scheduledPickupAt,
          impactedTripAlert,
        },
      });

      return { booking: updated, impactedTripAlert };
    });

    if (txRes.impactedTripAlert) {
      this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'booking.impacted.trip', {
        bookingId,
        ...txRes.impactedTripAlert,
        serverTime: new Date().toISOString(),
      });
    }

    return txRes;
  }

  async extendSeriesForSelf(identity: RequestIdentity, seriesId: string, dto: ExtendSeriesDto) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    const [series] = await this.dbService.db
      .select()
      .from(bookingSeries)
      .where(
        and(
          eq(bookingSeries.id, seriesId),
          eq(bookingSeries.organizationId, identity.organizationId),
          eq(bookingSeries.employeeId, emp.id),
        ),
      )
      .limit(1);

    if (!series) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Booking series ${seriesId} not found.`,
      });
    }
    if (series.status === 'CANCELLED') {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: 'Cancelled booking series cannot be extended; create a new series instead.',
      });
    }
    if (dto.newEndDate <= series.endDate) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `newEndDate (${dto.newEndDate}) must be later than current endDate (${series.endDate}).`,
      });
    }

    const extensionStart = addCalendarDays(series.endDate, 1);
    const parsedDays = (
      dto.selectedDaysOfWeek ??
      (series.selectedDaysOfWeek.split(',').filter(Boolean) as Array<
        (typeof DAYS_OF_WEEK)[number]
      >)
    );

    const preview = await this.previewSeriesForSelf(identity, {
      officeId: series.officeId,
      shiftId: series.shiftId,
      pickupLocationId: series.pickupLocationId,
      direction: series.direction,
      timePreference: series.timePreference,
      requestedTimeLocal: series.requestedTimeLocal,
      timezone: series.timezone,
      recurrenceType: series.recurrenceType === 'ONE_DAY' ? 'CUSTOM' : series.recurrenceType,
      startDate: extensionStart,
      endDate: dto.newEndDate,
      selectedDaysOfWeek: parsedDays,
    });

    const conflicts = preview.occurrences.filter((o) => o.hasConflict);
    if (conflicts.length > 0 && !dto.skipConflictingDates) {
      throw new ConflictException({
        code: 'BOOKING_SERIES_OVERLAP',
        message: `Extension overlaps existing active ${series.direction} bookings on ${conflicts.map((c) => c.travelDate).join(', ')}.`,
      });
    }

    const toCreate = preview.occurrences.filter((o) => o.passesCutoff && !o.hasConflict);

    return this.dbService.transaction(async (tx) => {
      const [updatedSeries] = await tx
        .update(bookingSeries)
        .set({
          endDate: dto.newEndDate,
          ...(dto.selectedDaysOfWeek
            ? { selectedDaysOfWeek: dto.selectedDaysOfWeek.join(',') }
            : {}),
          status: 'ACTIVE',
          expiredAt: null,
          updatedAt: new Date(),
        })
        .where(eq(bookingSeries.id, seriesId))
        .returning();

      const addedBookings =
        toCreate.length > 0
          ? await tx
              .insert(bookings)
              .values(
                toCreate.map((occ) => ({
                  organizationId: identity.organizationId,
                  seriesId: series.id,
                  commuteKey: series.commuteKey,
                  employeeId: emp.id,
                  shiftId: series.shiftId,
                  officeId: series.officeId,
                  pickupLocationId: series.pickupLocationId,
                  travelDate: occ.travelDate,
                  direction: series.direction,
                  timePreference: series.timePreference,
                  requestedTimeLocal: series.requestedTimeLocal,
                  timezone: series.timezone,
                  requestedPickupAt: new Date(occ.requestedPickupAt),
                  scheduledPickupAt: new Date(occ.scheduledPickupAt),
                  isArriveByInfeasible: occ.isArriveByInfeasible,
                  feasibilityNote: occ.feasibilityNote,
                  status: 'PENDING_APPROVAL' as const,
                  notes: series.notes,
                })),
              )
              .returning()
          : [];

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'BOOKING_SERIES_EXTENDED',
        entityType: 'booking_series',
        entityId: seriesId,
        beforeJson: { endDate: series.endDate, status: series.status },
        afterJson: {
          endDate: updatedSeries.endDate,
          status: updatedSeries.status,
          addedBookingsCount: addedBookings.length,
        },
      });

      return { series: updatedSeries, addedBookings };
    });
  }

  async cancelSeriesForSelf(identity: RequestIdentity, seriesId: string, dto: CancelSeriesDto) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    return this.dbService.transaction(async (tx) => {
      const [series] = await tx
        .select()
        .from(bookingSeries)
        .where(
          and(
            eq(bookingSeries.id, seriesId),
            eq(bookingSeries.organizationId, identity.organizationId),
            eq(bookingSeries.employeeId, emp.id),
          ),
        )
        .limit(1);

      if (!series) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Booking series ${seriesId} not found.`,
        });
      }
      if (series.status === 'CANCELLED') {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: 'Series is already cancelled.',
        });
      }

      const now = new Date();
      const [updatedSeries] = await tx
        .update(bookingSeries)
        .set({
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: dto.reason,
          updatedAt: now,
        })
        .where(eq(bookingSeries.id, seriesId))
        .returning();

      const candidateBookings = await tx
        .select({
          booking: bookings,
          assignmentId: passengerAssignments.id,
          assignmentStatus: passengerAssignments.status,
          tripStatus: trips.status,
        })
        .from(bookings)
        .leftJoin(passengerAssignments, eq(passengerAssignments.bookingId, bookings.id))
        .leftJoin(trips, eq(passengerAssignments.tripId, trips.id))
        .where(
          and(
            eq(bookings.seriesId, seriesId),
            inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
          ),
        );

      let cancelledBookingsCount = 0;
      let preservedCompletedOrActiveCount = 0;

      for (const row of candidateBookings) {
        const isActiveOrCompletedTrip =
          (row.tripStatus && ['IN_PROGRESS', 'COMPLETED'].includes(row.tripStatus)) ||
          (row.assignmentStatus && ['BOARDED', 'DROPPED'].includes(row.assignmentStatus));
        if (isActiveOrCompletedTrip) {
          preservedCompletedOrActiveCount++;
          continue;
        }

        await tx
          .update(bookings)
          .set({
            status: 'CANCELLED',
            cancellationReason: dto.reason,
            cancelledAt: now,
            updatedAt: now,
          })
          .where(eq(bookings.id, row.booking.id));

        if (row.assignmentId && row.assignmentStatus === 'SCHEDULED') {
          await tx
            .update(passengerAssignments)
            .set({
              status: 'CANCELLED',
              cancellationReason: dto.reason,
              updatedAt: now,
            })
            .where(eq(passengerAssignments.id, row.assignmentId));
        }
        cancelledBookingsCount++;
      }

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'BOOKING_SERIES_CANCELLED',
        entityType: 'booking_series',
        entityId: seriesId,
        reason: dto.reason,
        afterJson: { cancelledBookingsCount, preservedCompletedOrActiveCount },
      });

      return {
        series: updatedSeries,
        cancelledBookingsCount,
        preservedCompletedOrActiveCount,
      };
    });
  }

  /**
   * Transitions expired recurring series & stale unexecuted bookings into EXPIRED,
   * removing future unstarted trip assignments while preserving completed history & billing logs.
   */
  async processExpiredSeriesAndBookings(referenceDateOverride?: string, organizationId?: string) {
    const now = new Date();
    const cutoffDate = referenceDateOverride ?? formatIsoDateInTimezone(now, 'Asia/Kolkata');

    return this.dbService.transaction(async (tx) => {
      const seriesWhere = [
        eq(bookingSeries.status, 'ACTIVE'),
        lt(bookingSeries.endDate, cutoffDate),
      ];
      if (organizationId) seriesWhere.push(eq(bookingSeries.organizationId, organizationId));

      const expiredSeries = await tx
        .update(bookingSeries)
        .set({
          status: 'EXPIRED',
          expiredAt: now,
          updatedAt: now,
        })
        .where(and(...seriesWhere))
        .returning({
          id: bookingSeries.id,
          organizationId: bookingSeries.organizationId,
          employeeId: bookingSeries.employeeId,
          endDate: bookingSeries.endDate,
        });

      const expiredSeriesIds = expiredSeries.map((s) => s.id);

      // Find all stale bookings belonging to expired series OR whose travelDate passed without starting
      const bookingCandidates = await tx
        .select({
          booking: bookings,
          assignmentId: passengerAssignments.id,
          assignmentStatus: passengerAssignments.status,
          tripStatus: trips.status,
        })
        .from(bookings)
        .leftJoin(passengerAssignments, eq(passengerAssignments.bookingId, bookings.id))
        .leftJoin(trips, eq(passengerAssignments.tripId, trips.id))
        .where(
          and(
            ...(organizationId ? [eq(bookings.organizationId, organizationId)] : []),
            inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
            expiredSeriesIds.length > 0
              ? or(
                  inArray(bookings.seriesId, expiredSeriesIds),
                  lt(bookings.travelDate, cutoffDate),
                )
              : lt(bookings.travelDate, cutoffDate),
          ),
        );

      let expiredBookingsCount = 0;
      let cancelledFutureAssignmentsCount = 0;

      for (const row of bookingCandidates) {
        const isCompletedOrOngoingTrip =
          (row.tripStatus && ['IN_PROGRESS', 'COMPLETED'].includes(row.tripStatus)) ||
          (row.assignmentStatus && ['BOARDED', 'DROPPED'].includes(row.assignmentStatus));
        if (isCompletedOrOngoingTrip) continue;

        await tx
          .update(bookings)
          .set({
            status: 'EXPIRED',
            updatedAt: now,
          })
          .where(eq(bookings.id, row.booking.id));
        expiredBookingsCount++;

        if (row.assignmentId && row.assignmentStatus === 'SCHEDULED') {
          await tx
            .update(passengerAssignments)
            .set({
              status: 'CANCELLED',
              cancellationReason: 'Booking series or travel window expired',
              updatedAt: now,
            })
            .where(eq(passengerAssignments.id, row.assignmentId));
          cancelledFutureAssignmentsCount++;
        }
      }

      for (const s of expiredSeries) {
        await this.auditLogs.recordInTx(tx, {
          organizationId: s.organizationId,
          actorUserId: null,
          actorRole: 'SYSTEM_SCHEDULER',
          action: 'BOOKING_SERIES_EXPIRED',
          entityType: 'booking_series',
          entityId: s.id,
          afterJson: { cutoffDate, endDate: s.endDate },
        });
      }

      return {
        cutoffDate,
        expiredSeriesCount: expiredSeries.length,
        expiredBookingsCount,
        cancelledFutureAssignmentsCount,
      };
    });
  }

  ensureEmployeeNotForbidden(identity: RequestIdentity, employeeUserId: string) {
    if (identity.role === 'EMPLOYEE' && identity.userId !== employeeUserId) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: 'Employees may only manage their own recurring booking series.',
      });
    }
  }
}

@Processor(QUEUE_NAMES.BOOKING_MAINTENANCE)
export class BookingMaintenanceProcessor extends WorkerHost {
  constructor(private readonly seriesService: BookingSeriesService) {
    super();
  }

  async process(job: Job<{ referenceDate?: string }>): Promise<unknown> {
    if (job.name === 'process-booking-expiries') {
      return this.seriesService.processExpiredSeriesAndBookings(job.data?.referenceDate);
    }
    return { ignored: job.name };
  }
}
