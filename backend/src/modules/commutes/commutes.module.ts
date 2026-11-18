import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Idempotent } from '../../infrastructure/common/idempotency.interceptor.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { DispatchModule } from '../dispatch/dispatch.module.js';
import { DriversModule } from '../drivers/drivers.module.js';
import { StopsModule } from '../stops/stops.module.js';
import {
  allocateCommuteDatesSchema,
  approveCommuteDatesSchema,
  CommutesService,
  driverCalendarQuerySchema,
  listAdminCommutesQuerySchema,
  type AllocateCommuteDatesDto,
  type ApproveCommuteDatesDto,
  type DriverCalendarQuery,
  type ListAdminCommutesQuery,
} from './commutes.service.js';

const commuteKeyParamSchema = z.string().trim().min(3).max(160);
const isoDateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

@ApiTags('Admin - Commutes Workspace')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/commutes')
export class AdminCommutesController {
  constructor(private readonly service: CommutesService) {}

  @Get()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({
    summary:
      'List server-paginated grouped commute plans instead of cluttered per-date bookings',
  })
  list(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: listAdminCommutesQuerySchema }) query: ListAdminCommutesQuery,
  ) {
    return this.service.listAdminCommutes(identity.organizationId, query);
  }

  @Get(':commuteKey')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({
    summary:
      'Retrieve focused commute plan details, roster, vehicle requirements, driver matches, dates & audit history',
  })
  detail(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('commuteKey', { schema: commuteKeyParamSchema }) commuteKey: string,
  ) {
    return this.service.getAdminCommuteDetail(identity.organizationId, commuteKey);
  }

  @Post(':commuteKey/approve-dates')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({
    summary: 'Approve or reject selected or all pending dates belonging strictly to this commute',
  })
  approveDates(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('commuteKey', { schema: commuteKeyParamSchema }) commuteKey: string,
    @Body({ schema: approveCommuteDatesSchema }) dto: ApproveCommuteDatesDto,
  ) {
    return this.service.approveCommuteDates(identity, commuteKey, dto);
  }

  @Post(':commuteKey/allocate-dates')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({
    summary:
      'Preview or publish interval-aware locality auto-allocation strictly scoped to this commute',
  })
  allocateDates(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('commuteKey', { schema: commuteKeyParamSchema }) commuteKey: string,
    @Body({ schema: allocateCommuteDatesSchema }) dto: AllocateCommuteDatesDto,
  ) {
    return this.service.allocateCommuteDates(identity, commuteKey, dto);
  }
}

@ApiTags('Driver - Commutes & Calendar')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('driver/commutes')
export class DriverCommutesController {
  constructor(private readonly service: CommutesService) {}

  @Get('overview')
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({
    summary: "Fetch driver's Today's Target trips plus compact grouped Assigned Commute cards",
  })
  overview(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.getDriverCommutesOverview(identity);
  }

  @Get(':commuteId/calendar')
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({
    summary: 'Fetch compact monthly schedule showing only dates with published trips assigned to this driver',
  })
  calendar(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('commuteId', { schema: commuteKeyParamSchema }) commuteId: string,
    @Query({ schema: driverCalendarQuerySchema }) query: DriverCalendarQuery,
  ) {
    return this.service.getDriverCommuteCalendar(identity, commuteId, query);
  }

  @Get(':commuteId/dates/:date')
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({
    summary: 'Fetch full manifest details for a specific scheduled date on an assigned commute',
  })
  dateManifest(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('commuteId', { schema: commuteKeyParamSchema }) commuteId: string,
    @Param('date', { schema: isoDateParamSchema }) date: string,
  ) {
    return this.service.getDriverCommuteDateManifest(identity, commuteId, date);
  }
}

@Module({
  imports: [ApprovalsModule, DispatchModule, DriversModule, StopsModule],
  controllers: [AdminCommutesController, DriverCommutesController],
  providers: [CommutesService],
  exports: [CommutesService],
})
export class CommutesModule {}
