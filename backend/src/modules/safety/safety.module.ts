import { InjectQueue } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  Get,
  Module,
  type OnModuleInit,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Idempotent } from '../../infrastructure/common/idempotency.interceptor.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { DriversModule } from '../drivers/drivers.module.js';
import { EmployeesModule } from '../employees/employees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SafetyProcessor } from './safety.processor.js';
import {
  type AcknowledgeAlertDto,
  acknowledgeAlertSchema,
  type ListSafetyAlertsQuery,
  listSafetyAlertsQuerySchema,
  type ResolveAlertDto,
  resolveAlertSchema,
  type TriggerSosDto,
  triggerSosSchema,
  uuidParamSchema,
} from './safety.schemas.js';
import { SafetyService } from './safety.service.js';

@ApiTags('Employee - Safety')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('employee/safety')
export class EmployeeSafetyController {
  constructor(private readonly service: SafetyService) {}

  @Post('sos')
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Trigger high-priority SOS safety alert with optional GPS evidence' })
  triggerSos(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: triggerSosSchema }) dto: TriggerSosDto,
  ) {
    return this.service.triggerEmployeeSos(identity, dto);
  }
}

@ApiTags('Driver - Safety')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('driver/safety')
export class DriverSafetyController {
  constructor(private readonly service: SafetyService) {}

  @Post('sos')
  @Idempotent()
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Trigger urgent cab driver SOS escalation alert during duty' })
  triggerSos(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: triggerSosSchema }) dto: TriggerSosDto,
  ) {
    return this.service.triggerDriverSos(identity, dto);
  }
}

@ApiTags('Admin - Safety & Escalations')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/safety')
export class AdminSafetyController {
  constructor(private readonly service: SafetyService) {}

  @Get('alerts')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'List active and historical safety alerts across tenant' })
  listAlerts(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: listSafetyAlertsQuerySchema }) query: ListSafetyAlertsQuery,
  ) {
    return this.service.listAdminAlerts(identity.organizationId, query);
  }

  @Post('alerts/:alertId/acknowledge')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({ summary: 'Acknowledge an OPEN safety escalation alert' })
  acknowledgeAlert(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('alertId', { schema: uuidParamSchema }) alertId: string,
    @Body({ schema: acknowledgeAlertSchema }) dto: AcknowledgeAlertDto,
  ) {
    return this.service.acknowledgeAlert(identity, alertId, dto);
  }

  @Post('alerts/:alertId/resolve')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({ summary: 'Resolve an OPEN/ACKNOWLEDGED safety alert with resolution notes' })
  resolveAlert(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('alertId', { schema: uuidParamSchema }) alertId: string,
    @Body({ schema: resolveAlertSchema }) dto: ResolveAlertDto,
  ) {
    return this.service.resolveAlert(identity, alertId, dto);
  }

  @Post('run-checks')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Manually trigger Safe-Reach overdue scan for active tenant' })
  runSafetyChecks(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.scanOverdueSafeReach(identity.organizationId);
  }
}

@Module({
  imports: [EmployeesModule, DriversModule, AuditLogsModule, NotificationsModule],
  controllers: [EmployeeSafetyController, DriverSafetyController, AdminSafetyController],
  providers: [SafetyService, SafetyProcessor],
  exports: [SafetyService],
})
export class SafetyModule implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.SCHEDULED_JOBS)
    private readonly scheduledQueue: Queue<{ organizationId?: string }>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.scheduledQueue.upsertJobScheduler(
        'repeat-safety-overdue',
        { every: 60_000 },
        { name: 'scan-safety-overdue', data: {} },
      );
    } catch {
      // Safe no-op if Redis scheduler busy or already registered.
    }
  }
}
