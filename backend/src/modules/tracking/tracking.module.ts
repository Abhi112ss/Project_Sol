import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { DriversModule } from '../drivers/drivers.module.js';
import { EmployeesModule } from '../employees/employees.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { LocationProcessingProcessor } from './tracking.processor.js';
import {
  type AdminFleetLiveQuery,
  type GpsBatchInputDto,
  type GpsSampleInputDto,
  adminFleetLiveQuerySchema,
  gpsBatchInputSchema,
  gpsSampleInputSchema,
  uuidParamSchema,
} from './tracking.schemas.js';
import { TrackingService } from './tracking.service.js';

@ApiTags('Driver - Live GPS Telemetry')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('driver/trips')
export class TrackingDriverController {
  constructor(private readonly service: TrackingService) {}

  @Post(':tripId/location')
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Ingest single real-time driver GPS ping (Redis + PostGIS + Socket.IO)' })
  ingestLocation(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
    @Body({ schema: gpsSampleInputSchema }) dto: GpsSampleInputDto,
  ) {
    return this.service.ingestDriverLocation(identity, tripId, dto);
  }

  @Post(':tripId/locations/batch')
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({
    summary: 'Idempotently ingest chronologically buffered offline/queued GPS samples (1-100)',
  })
  ingestLocationBatch(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
    @Body({ schema: gpsBatchInputSchema }) dto: GpsBatchInputDto,
  ) {
    return this.service.ingestDriverLocationBatch(identity, tripId, dto.samples);
  }
}

@ApiTags('Admin - Fleet Live Tracking')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin')
export class TrackingAdminController {
  constructor(private readonly service: TrackingService) {}

  @Get('fleet/live')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'Real-time fleet snapshot combining Redis live cache, PostGIS & alerts' })
  getFleetLive(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: adminFleetLiveQuerySchema }) query: AdminFleetLiveQuery,
  ) {
    return this.service.getAdminFleetLive(identity.organizationId, query);
  }

  @Get('trips/:tripId/locations')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'Fetch recorded PostGIS GPS breadcrumb trail & latest snapshot for trip' })
  getTripLocations(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
  ) {
    return this.service.getAdminTripLocationBreadcrumbs(identity.organizationId, tripId);
  }
}

@ApiTags('Employee - Live Trip Telemetry')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('employee/trips')
export class TrackingEmployeeController {
  constructor(private readonly service: TrackingService) {}

  @Get(':tripId/live')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({
    summary: 'Fetch privacy-scoped live cab telemetry & conservative ETA for assigned trip',
  })
  getLiveTelemetry(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
  ) {
    return this.service.getEmployeeLiveTelemetry(identity, tripId);
  }
}

@Module({
  imports: [DriversModule, EmployeesModule, NotificationsModule, SafetyModule],
  controllers: [TrackingDriverController, TrackingAdminController, TrackingEmployeeController],
  providers: [TrackingService, LocationProcessingProcessor],
  exports: [TrackingService],
})
export class TrackingModule {}
