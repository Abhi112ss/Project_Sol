import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { desc, eq, sql } from 'drizzle-orm';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import {
  buildPaginationMeta,
  paginationQuerySchema,
  type PaginationQuery,
} from '../../infrastructure/common/pagination.schema.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { DatabaseService, type SolTransaction } from '../../infrastructure/database/database.service.js';
import { auditLogs } from '../../infrastructure/database/schema/index.js';

export interface AuditWriteInput {
  organizationId: string;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  correlationId?: string | null;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly dbService: DatabaseService) {}

  async recordInTx(tx: SolTransaction, input: AuditWriteInput): Promise<void> {
    await tx.insert(auditLogs).values({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason ?? null,
      beforeJson: input.beforeJson ?? null,
      afterJson: input.afterJson ?? null,
      correlationId: input.correlationId ?? null,
    });
  }

  async listForOrg(organizationId: string, query: PaginationQuery) {
    const offset = (query.page - 1) * query.limit;
    const [items, countRows] = await Promise.all([
      this.dbService.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.organizationId, organizationId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(query.limit)
        .offset(offset),
      this.dbService.db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(eq(auditLogs.organizationId, organizationId)),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(query.page, query.limit, countRows[0]?.count ?? 0),
    };
  }
}

@ApiTags('Admin - Audit Logs')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/audit-logs')
@Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'AUDITOR')
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List immutable audit logs for active organization' })
  list(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: paginationQuerySchema }) query: PaginationQuery,
  ) {
    return this.service.listForOrg(identity.organizationId, query);
  }
}

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}

