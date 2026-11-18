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
import { and, desc, eq } from 'drizzle-orm';
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
  trips,
  tripStops,
  users,
} from '../../infrastructure/database/schema/index.js';
import { TransportGateway, WS_ROOMS } from '../../infrastructure/websocket/transport.gateway.js';
import { AuditLogsModule, AuditLogsService } from '../audit-logs/audit-logs.module.js';
import { EmployeesModule, EmployeesService } from '../employees/employees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const uuidParamSchema = z.string().uuid();

export const listNoShowsQuerySchema = z.object({
  appealStatus: z.enum(['NONE', 'APPEALED', 'OVERTURNED', 'UPHELD']).optional(),
});
export type ListNoShowsQuery = z.infer<typeof listNoShowsQuerySchema>;

export const resolveAppealSchema = z.object({
  decision: z.enum(['OVERTURNED', 'UPHELD']),
  resolutionNote: z.string().min(3).max(500),
});
export type ResolveAppealDto = z.infer<typeof resolveAppealSchema>;

export const submitAppealSchema = z.object({
  appealNote: z.string().min(5).max(500),
});
export type SubmitAppealDto = z.infer<typeof submitAppealSchema>;

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly employeesService: EmployeesService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TransportGateway,
  ) {}

  async listNoShows(organizationId: string, query: ListNoShowsQuery) {
    const conditions = [eq(noShowRecords.organizationId, organizationId)];
    if (query.appealStatus) {
      conditions.push(eq(noShowRecords.appealStatus, query.appealStatus));
    }

    return this.dbService.db
      .select({
        id: noShowRecords.id,
        tripId: noShowRecords.tripId,
        tripCode: trips.tripCode,
        travelDate: trips.travelDate,
        tripStopId: noShowRecords.tripStopId,
        stopLocationName: tripStops.locationName,
        passengerAssignmentId: noShowRecords.passengerAssignmentId,
        employeeId: noShowRecords.employeeId,
        employeeCode: employees.employeeCode,
        employeeName: users.fullName,
        driverId: noShowRecords.driverId,
        driverCode: drivers.driverCode,
        reasonCode: noShowRecords.reasonCode,
        driverNotes: noShowRecords.driverNotes,
        waitedSeconds: noShowRecords.waitedSeconds,
        distanceFromStopM: noShowRecords.distanceFromStopM,
        geofenceVerified: noShowRecords.geofenceVerified,
        syncStatus: noShowRecords.syncStatus,
        appealStatus: noShowRecords.appealStatus,
        appealNote: noShowRecords.appealNote,
        appealResolutionNote: noShowRecords.appealResolutionNote,
        markedAt: noShowRecords.markedAt,
      })
      .from(noShowRecords)
      .innerJoin(trips, eq(noShowRecords.tripId, trips.id))
      .innerJoin(tripStops, eq(noShowRecords.tripStopId, tripStops.id))
      .innerJoin(employees, eq(noShowRecords.employeeId, employees.id))
      .innerJoin(users, eq(employees.userId, users.id))
      .innerJoin(drivers, eq(noShowRecords.driverId, drivers.id))
      .where(and(...conditions))
      .orderBy(desc(noShowRecords.markedAt))
      .limit(100);
  }

  async submitEmployeeAppeal(identity: RequestIdentity, tripId: string, dto: SubmitAppealDto) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    return this.dbService.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(noShowRecords)
        .where(
          and(
            eq(noShowRecords.tripId, tripId),
            eq(noShowRecords.employeeId, emp.id),
            eq(noShowRecords.organizationId, identity.organizationId),
          ),
        )
        .limit(1);

      if (!record) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `No NO_SHOW record found for employee on trip ${tripId}.`,
        });
      }

      if (record.appealStatus !== 'NONE') {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `No-show appeal is already in status ${record.appealStatus}.`,
        });
      }

      const [updated] = await tx
        .update(noShowRecords)
        .set({
          appealStatus: 'APPEALED',
          appealNote: dto.appealNote.trim(),
          updatedAt: new Date(),
        })
        .where(eq(noShowRecords.id, record.id))
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'NO_SHOW_APPEAL_SUBMITTED',
        entityType: 'no_show_record',
        entityId: record.id,
        reason: dto.appealNote.trim(),
        afterJson: { appealStatus: 'APPEALED' },
      });

      return updated;
    });
  }

  async resolveAppeal(identity: RequestIdentity, noShowId: string, dto: ResolveAppealDto) {
    return this.dbService.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(noShowRecords)
        .where(
          and(
            eq(noShowRecords.id, noShowId),
            eq(noShowRecords.organizationId, identity.organizationId),
          ),
        )
        .limit(1);

      if (!record) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `No-show record ${noShowId} not found in active organization.`,
        });
      }

      const now = new Date();
      const [updated] = await tx
        .update(noShowRecords)
        .set({
          appealStatus: dto.decision,
          appealResolvedBy: identity.userId,
          appealResolutionNote: dto.resolutionNote.trim(),
          updatedAt: now,
        })
        .where(eq(noShowRecords.id, noShowId))
        .returning();

      const [empRow] = await tx
        .select({ userId: employees.userId })
        .from(employees)
        .where(eq(employees.id, record.employeeId))
        .limit(1);
      if (empRow) {
        await tx.insert(notifications).values({
          organizationId: identity.organizationId,
          recipientUserId: empRow.userId,
          channel: 'IN_APP',
          category: 'NO_SHOW_APPEAL_RESOLVED',
          title: `No-Show Appeal ${dto.decision}`,
          body: dto.resolutionNote.trim(),
          metadataJson: { noShowRecordId: noShowId, decision: dto.decision },
        });
      }

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'NO_SHOW_APPEAL_RESOLVED',
        entityType: 'no_show_record',
        entityId: noShowId,
        reason: dto.resolutionNote.trim(),
        beforeJson: { appealStatus: record.appealStatus },
        afterJson: { appealStatus: dto.decision },
      });

      return { updated, employeeUserId: empRow?.userId ?? null };
    }).then(async (txRes) => {
      if (txRes.employeeUserId) {
        await this.notifications.enqueueNotification({
          organizationId: identity.organizationId,
          recipientUserId: txRes.employeeUserId,
          employeeId: txRes.updated.employeeId,
          tripId: txRes.updated.tripId,
          channel: 'PUSH',
          category: 'NO_SHOW_APPEAL_RESOLVED',
          title: `No-Show Appeal ${dto.decision}`,
          body: dto.resolutionNote.trim(),
          metadataJson: { noShowRecordId: noShowId, decision: dto.decision },
          persistDb: false,
          dedupKey: `appeal-res-${noShowId}-${dto.decision}`,
        });
      }
      this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'no_show.appeal.resolved', {
        noShowRecordId: noShowId,
        decision: dto.decision,
        tripId: txRes.updated.tripId,
      });
      return txRes.updated;
    });
  }
}

@ApiTags('Admin - No-Show Appeals & Audits')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/no-shows')
export class AdminNoShowsController {
  constructor(private readonly service: AssignmentsService) {}

  @Get()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'List employee no-show records & appeal queues' })
  list(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: listNoShowsQuerySchema }) query: ListNoShowsQuery,
  ) {
    return this.service.listNoShows(identity.organizationId, query);
  }

  @Post(':noShowId/resolve-appeal')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({ summary: 'Approve (OVERTURNED) or reject (UPHELD) a contested no-show appeal' })
  resolveAppeal(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('noShowId', { schema: uuidParamSchema }) noShowId: string,
    @Body({ schema: resolveAppealSchema }) dto: ResolveAppealDto,
  ) {
    return this.service.resolveAppeal(identity, noShowId, dto);
  }
}

@Module({
  imports: [AuditLogsModule, EmployeesModule, NotificationsModule],
  controllers: [AdminNoShowsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
