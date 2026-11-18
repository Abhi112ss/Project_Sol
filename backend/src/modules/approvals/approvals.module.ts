import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Idempotent } from '../../infrastructure/common/idempotency.interceptor.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  approvals,
  bookings,
  employeeLocations,
  employees,
  offices,
  shifts,
  users,
} from '../../infrastructure/database/schema/index.js';
import { OutboxService } from '../../infrastructure/event-management/outbox.service.js';
import { TRANSPORT_TOPICS } from '../../infrastructure/event-management/topics.js';
import { BOOKING_STATUSES, TRIP_DIRECTIONS } from '../../infrastructure/shared/enums.js';
import { AuditLogsModule, AuditLogsService } from '../audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export const approvalQueueQuerySchema = z.object({
  travelDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  direction: z.enum(TRIP_DIRECTIONS).optional(),
  shiftId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional(),
  department: z.string().trim().optional(),
  corridorTag: z.string().trim().optional(),
  status: z.enum(BOOKING_STATUSES).default('PENDING_APPROVAL'),
});
export type ApprovalQueueQuery = z.infer<typeof approvalQueueQuerySchema>;

export const bulkDecisionSchema = z.object({
  bookingIds: z.array(z.string().uuid()).min(1).max(200),
  decision: z.enum(['APPROVED', 'REJECTED']),
  remarks: z.string().max(500).optional(),
});
export type BulkDecisionDto = z.infer<typeof bulkDecisionSchema>;

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationsService,
  ) {}

  async getQueue(organizationId: string, query: ApprovalQueueQuery) {
    const conditions = [
      eq(bookings.organizationId, organizationId),
      eq(bookings.status, query.status),
    ];

    if (query.travelDate) conditions.push(eq(bookings.travelDate, query.travelDate));
    if (query.direction) conditions.push(eq(bookings.direction, query.direction));
    if (query.shiftId) conditions.push(eq(bookings.shiftId, query.shiftId));
    if (query.officeId) conditions.push(eq(bookings.officeId, query.officeId));
    if (query.department) conditions.push(ilike(employees.department, `%${query.department}%`));
    if (query.corridorTag) {
      conditions.push(ilike(employeeLocations.corridorTag, `%${query.corridorTag}%`));
    }

    return this.dbService.db
      .select({
        bookingId: bookings.id,
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
        employeeId: employees.id,
        employeeCode: employees.employeeCode,
        employeeName: users.fullName,
        employeePhone: users.phone,
        department: employees.department,
        shiftId: shifts.id,
        shiftName: shifts.name,
        shiftTimeLocal: shifts.shiftTimeLocal,
        officeId: offices.id,
        officeName: offices.name,
        officeLatitude: offices.latitude,
        officeLongitude: offices.longitude,
        pickupLocationId: employeeLocations.id,
        pickupLocationName: employeeLocations.locationName,
        pickupAddress: employeeLocations.address,
        corridorTag: employeeLocations.corridorTag,
        localityId: employeeLocations.localityId,
        normalizedLocality: employeeLocations.normalizedLocality,
        latitude: employeeLocations.latitude,
        longitude: employeeLocations.longitude,
      })
      .from(bookings)
      .innerJoin(employees, eq(bookings.employeeId, employees.id))
      .innerJoin(users, eq(employees.userId, users.id))
      .innerJoin(shifts, eq(bookings.shiftId, shifts.id))
      .innerJoin(offices, eq(bookings.officeId, offices.id))
      .innerJoin(employeeLocations, eq(bookings.pickupLocationId, employeeLocations.id))
      .where(and(...conditions))
      .orderBy(asc(bookings.scheduledPickupAt));
  }

  async bulkDecide(identity: RequestIdentity, dto: BulkDecisionDto) {
    return this.dbService.transaction(async (tx) => {
      const targetBookings = await tx
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.organizationId, identity.organizationId),
            inArray(bookings.id, dto.bookingIds),
          ),
        );

      if (targetBookings.length !== dto.bookingIds.length) {
        throw new BadRequestException({
          code: 'RESOURCE_NOT_FOUND',
          message: 'One or more bookingIds do not exist in the active organization.',
        });
      }

      const invalid = targetBookings.filter((b) => b.status !== 'PENDING_APPROVAL');
      if (invalid.length > 0) {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: 'Only PENDING_APPROVAL bookings can be approved or rejected.',
          details: { invalidBookingIds: invalid.map((b) => b.id) },
        });
      }

      const now = new Date();
      await tx
        .update(bookings)
        .set({ status: dto.decision, updatedAt: now })
        .where(
          and(
            eq(bookings.organizationId, identity.organizationId),
            inArray(bookings.id, dto.bookingIds),
          ),
        );

      await tx.insert(approvals).values(
        targetBookings.map((b) => ({
          organizationId: identity.organizationId,
          bookingId: b.id,
          approverUserId: identity.userId,
          decision: dto.decision,
          remarks: dto.remarks ?? null,
          decidedAt: now,
        })),
      );

      for (const b of targetBookings) {
        await this.auditLogs.recordInTx(tx, {
          organizationId: identity.organizationId,
          actorUserId: identity.userId,
          actorRole: identity.role,
          action: `BOOKING_${dto.decision}`,
          entityType: 'booking',
          entityId: b.id,
          reason: dto.remarks ?? null,
          beforeJson: { status: b.status },
          afterJson: { status: dto.decision },
        });

        await this.outbox.enqueueInTx(tx, {
          organizationId: identity.organizationId,
          topic: TRANSPORT_TOPICS.NOTIFICATION_EVENTS,
          aggregateType: 'booking',
          aggregateId: b.id,
          payload: {
            event: `booking.${dto.decision.toLowerCase()}`,
            bookingId: b.id,
            employeeId: b.employeeId,
            decision: dto.decision,
          },
        });
      }

      const empUserRows = await tx
        .select({ empId: employees.id, userId: employees.userId })
        .from(employees)
        .where(
          inArray(
            employees.id,
            targetBookings.map((b) => b.employeeId),
          ),
        );
      const empUserMap = new Map(empUserRows.map((r) => [r.empId, r.userId]));

      return {
        decidedCount: targetBookings.length,
        decision: dto.decision,
        bookingIds: dto.bookingIds,
        notifications: targetBookings.map((b) => ({
          bookingId: b.id,
          employeeId: b.employeeId,
          commuteKey: b.commuteKey ?? b.id,
          userId: empUserMap.get(b.employeeId) ?? null,
          travelDate: b.travelDate,
          direction: b.direction,
        })),
      };
    }).then(async (txRes) => {
      const grouped = new Map<string, typeof txRes.notifications>();
      for (const n of txRes.notifications) {
        if (!n.userId) continue;
        const key = `${n.userId}:${n.commuteKey}`;
        const arr = grouped.get(key) ?? [];
        arr.push(n);
        grouped.set(key, arr);
      }
      for (const entries of grouped.values()) {
        const sorted = [...entries].sort((a, b) => a.travelDate.localeCompare(b.travelDate));
        const first = sorted[0];
        if (sorted.length === 1) {
          await this.notifications.enqueueNotification({
            organizationId: identity.organizationId,
            recipientUserId: first.userId!,
            employeeId: first.employeeId,
            channel: 'PUSH',
            category: `BOOKING_${txRes.decision}`,
            title:
              txRes.decision === 'APPROVED'
                ? `Booking Approved (${first.travelDate})`
                : `Booking Rejected (${first.travelDate})`,
            body:
              txRes.decision === 'APPROVED'
                ? `Your ${first.direction} shift booking was approved for dispatch.`
                : `Your ${first.direction} shift booking was rejected${dto.remarks ? `: ${dto.remarks}` : '.'}`,
            metadataJson: { bookingId: first.bookingId, decision: txRes.decision },
            dedupKey: `approval-${first.bookingId}-${txRes.decision}`,
          });
        } else {
          await this.notifications.enqueueNotification({
            organizationId: identity.organizationId,
            recipientUserId: first.userId!,
            employeeId: first.employeeId,
            channel: 'PUSH',
            category: `BOOKING_${txRes.decision}`,
            title:
              txRes.decision === 'APPROVED'
                ? `Commute Approved (${sorted.length} dates)`
                : `Commute Rejected (${sorted.length} dates)`,
            body:
              txRes.decision === 'APPROVED'
                ? `${sorted.length} ${first.direction} commute dates (${sorted[0].travelDate} to ${sorted[sorted.length - 1].travelDate}) approved for dispatch.`
                : `${sorted.length} ${first.direction} commute dates rejected${dto.remarks ? `: ${dto.remarks}` : '.'}`,
            metadataJson: {
              commuteKey: first.commuteKey,
              decision: txRes.decision,
              bookingCount: sorted.length,
            },
            dedupKey: `approval-batch-${first.commuteKey}-${sorted[0].bookingId}-${sorted.length}-${txRes.decision}`,
          });
        }
      }
      return {
        decidedCount: txRes.decidedCount,
        decision: txRes.decision,
        bookingIds: txRes.bookingIds,
      };
    });
  }
}

@ApiTags('Admin - Duty Approvals')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/approvals')
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Get('queue')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'Filter shift transport queue by date, shift, department, corridor' })
  getQueue(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: approvalQueueQuerySchema }) query: ApprovalQueueQuery,
  ) {
    return this.service.getQueue(identity.organizationId, query);
  }

  @Post('bulk-decide')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({ summary: 'Bulk approve or reject selected employee transport requests' })
  bulkDecide(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: bulkDecisionSchema }) dto: BulkDecisionDto,
  ) {
    return this.service.bulkDecide(identity, dto);
  }
}

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
