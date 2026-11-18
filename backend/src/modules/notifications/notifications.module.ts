import { Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import {
  paginationQuerySchema,
  type PaginationQuery,
} from '../../infrastructure/common/pagination.schema.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { NotificationsProcessor, TripRemindersProcessor } from './notifications.processor.js';
import {
  type RegisterDeviceTokenDto,
  registerDeviceTokenSchema,
  uuidParamSchema,
} from './notifications.schemas.js';
import { FcmAdapterService, NotificationsService } from './notifications.service.js';

@ApiTags('Employee - Notifications')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('employee/notifications')
export class EmployeeNotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'List employee in-app trip & operational notifications' })
  list(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: paginationQuerySchema }) query: PaginationQuery,
  ) {
    return this.service.listForUser(identity, query);
  }

  @Patch(':notificationId/read')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Mark employee notification as read' })
  markRead(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('notificationId', { schema: uuidParamSchema }) notificationId: string,
  ) {
    return this.service.markRead(identity, notificationId);
  }

  @Post('mark-all-read')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Mark all employee notifications as read' })
  markAllRead(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.markAllRead(identity);
  }

  @Post('device-token')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Register employee FCM/local push token for notifications' })
  registerToken(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: registerDeviceTokenSchema }) dto: RegisterDeviceTokenDto,
  ) {
    return this.service.registerDeviceToken(identity.organizationId, identity.userId, dto);
  }
}

@ApiTags('Driver - Notifications')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('driver/notifications')
export class DriverNotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'List driver duty alerts, cancellations & safety notifications' })
  list(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: paginationQuerySchema }) query: PaginationQuery,
  ) {
    return this.service.listForUser(identity, query);
  }

  @Patch(':notificationId/read')
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Mark driver notification as read' })
  markRead(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('notificationId', { schema: uuidParamSchema }) notificationId: string,
  ) {
    return this.service.markRead(identity, notificationId);
  }

  @Post('mark-all-read')
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Mark all driver notifications as read' })
  markAllRead(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.markAllRead(identity);
  }

  @Post('device-token')
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Register driver FCM/local push token for duty notifications' })
  registerToken(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: registerDeviceTokenSchema }) dto: RegisterDeviceTokenDto,
  ) {
    return this.service.registerDeviceToken(identity.organizationId, identity.userId, dto);
  }
}

@Module({
  controllers: [EmployeeNotificationsController, DriverNotificationsController],
  providers: [
    FcmAdapterService,
    NotificationsService,
    NotificationsProcessor,
    TripRemindersProcessor,
  ],
  exports: [NotificationsService, FcmAdapterService],
})
export class NotificationsModule {}
