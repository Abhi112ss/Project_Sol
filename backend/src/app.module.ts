import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CommonModule } from './infrastructure/common/common.module.js';
import { AppConfigModule } from './infrastructure/config/app-config.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { EventManagementModule } from './infrastructure/event-management/event-management.module.js';
import { HealthModule } from './infrastructure/health/health.module.js';
import { QueueModule } from './infrastructure/queue/queue.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { WebsocketModule } from './infrastructure/websocket/websocket.module.js';
import { ApprovalsModule } from './modules/approvals/approvals.module.js';
import { AssignmentsModule } from './modules/assignments/assignments.module.js';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { CommutesModule } from './modules/commutes/commutes.module.js';
import { DispatchModule } from './modules/dispatch/dispatch.module.js';
import { DriversModule } from './modules/drivers/drivers.module.js';
import { EmployeesModule } from './modules/employees/employees.module.js';
import { LocalitiesModule } from './modules/localities/localities.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OfficesModule } from './modules/offices/offices.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { RoutingModule } from './modules/routing/routing.module.js';
import { SafetyModule } from './modules/safety/safety.module.js';
import { ShiftsModule } from './modules/shifts/shifts.module.js';
import { StopsModule } from './modules/stops/stops.module.js';
import { TrackingModule } from './modules/tracking/tracking.module.js';
import { TripsModule } from './modules/trips/trips.module.js';
import { VehiclesModule } from './modules/vehicles/vehicles.module.js';
import { VendorsModule } from './modules/vendors/vendors.module.js';

@Module({
  imports: [
    // Common infrastructure
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    EventManagementModule,
    WebsocketModule,
    CommonModule,
    HealthModule,

    // 21 Domain modules (Central Transport Core)
    AuditLogsModule,
    OrganizationsModule,
    LocalitiesModule,
    OfficesModule,
    VendorsModule,
    ShiftsModule,
    EmployeesModule,
    DriversModule,
    VehiclesModule,
    BookingsModule,
    ApprovalsModule,
    DispatchModule,
    CommutesModule,
    AssignmentsModule,
    TripsModule,
    StopsModule,
    TrackingModule,
    RoutingModule,
    NotificationsModule,
    SafetyModule,
    ReportsModule,
    BillingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
