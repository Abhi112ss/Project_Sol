import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  bookings,
  drivers,
  employeeLocations,
  employees,
  offices,
  shifts,
  users,
  vehicles,
} from '../../infrastructure/database/schema/index.js';
import { TRIP_DIRECTIONS } from '../../infrastructure/shared/enums.js';
import { buildGoogleMapsNavigationUrl } from '../../infrastructure/shared/maps.util.js';
import { solveVrptwRecommendations } from './vrptw.solver.js';

export const recommendationsQuerySchema = z.object({
  travelDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  shiftId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional(),
  direction: z.enum(TRIP_DIRECTIONS).optional(),
});
export type RecommendationsQuery = z.infer<typeof recommendationsQuerySchema>;

@Injectable()
export class RoutingService {
  /**
   * MVP deterministic routing selects the lowest sequence pending stop
   * and returns the authoritative Google Maps external navigation URL.
   * Phase 7 adds optional capacitated VRPTW route recommendations via RoutingRecommendationsService.
   */
  selectNextStop<
    T extends { sequenceNo: number; latitude: number; longitude: number; isPending: boolean },
  >(stops: T[]): (T & { navigationUrl: string }) | null {
    const next = [...stops]
      .filter((s) => s.isPending)
      .sort((a, b) => a.sequenceNo - b.sequenceNo)[0];
    if (!next) return null;
    return {
      ...next,
      navigationUrl: buildGoogleMapsNavigationUrl(next.latitude, next.longitude),
    };
  }
}

@Injectable()
export class RoutingRecommendationsService {
  constructor(private readonly dbService: DatabaseService) {}

  async recommendClusters(organizationId: string, query: RecommendationsQuery) {
    const bookingConditions = [
      eq(bookings.organizationId, organizationId),
      eq(bookings.status, 'APPROVED'),
    ];
    if (query.travelDate) bookingConditions.push(eq(bookings.travelDate, query.travelDate));
    if (query.shiftId) bookingConditions.push(eq(bookings.shiftId, query.shiftId));
    if (query.officeId) bookingConditions.push(eq(bookings.officeId, query.officeId));
    if (query.direction) bookingConditions.push(eq(bookings.direction, query.direction));

    const [bookingRows, vehicleRows, driverRows] = await Promise.all([
      this.dbService.db
        .select({
          bookingId: bookings.id,
          employeeId: employees.id,
          employeeCode: employees.employeeCode,
          employeeName: users.fullName,
          department: employees.department,
          officeId: offices.id,
          officeName: offices.name,
          officeLatitude: offices.latitude,
          officeLongitude: offices.longitude,
          shiftId: shifts.id,
          shiftName: shifts.name,
          shiftCode: shifts.code,
          shiftTimeLocal: shifts.shiftTimeLocal,
          travelDate: bookings.travelDate,
          direction: bookings.direction,
          scheduledPickupAt: bookings.scheduledPickupAt,
          pickupLocationName: employeeLocations.locationName,
          address: employeeLocations.address,
          corridorTag: employeeLocations.corridorTag,
          latitude: employeeLocations.latitude,
          longitude: employeeLocations.longitude,
        })
        .from(bookings)
        .innerJoin(employees, eq(employees.id, bookings.employeeId))
        .innerJoin(users, eq(users.id, employees.userId))
        .innerJoin(offices, eq(offices.id, bookings.officeId))
        .innerJoin(shifts, eq(shifts.id, bookings.shiftId))
        .innerJoin(employeeLocations, eq(employeeLocations.id, bookings.pickupLocationId))
        .where(and(...bookingConditions))
        .orderBy(asc(bookings.travelDate), asc(bookings.scheduledPickupAt)),
      this.dbService.db
        .select({
          id: vehicles.id,
          registrationNo: vehicles.registrationNo,
          modelName: vehicles.modelName,
          vehicleType: vehicles.vehicleType,
          seatingCapacity: vehicles.seatingCapacity,
        })
        .from(vehicles)
        .where(and(eq(vehicles.organizationId, organizationId), eq(vehicles.isActive, true)))
        .orderBy(asc(vehicles.seatingCapacity), asc(vehicles.registrationNo)),
      this.dbService.db
        .select({
          id: drivers.id,
          driverCode: drivers.driverCode,
          fullName: users.fullName,
          assignedVehicleId: drivers.assignedVehicleId,
        })
        .from(drivers)
        .innerJoin(users, eq(users.id, drivers.userId))
        .where(and(eq(drivers.organizationId, organizationId), eq(drivers.isSuspended, false)))
        .orderBy(asc(drivers.driverCode)),
    ]);

    return solveVrptwRecommendations({
      bookings: bookingRows.map((row) => ({
        ...row,
        scheduledPickupAt: row.scheduledPickupAt.toISOString(),
      })),
      vehicles: vehicleRows,
      drivers: driverRows,
    });
  }
}

@ApiTags('Admin - Routing Optimization')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/routing')
export class RoutingController {
  constructor(private readonly recommendations: RoutingRecommendationsService) {}

  @Get('recommendations')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({
    summary:
      'Generate draft capacitated VRPTW dispatch clusters for APPROVED bookings (human-in-the-loop review)',
  })
  getRecommendations(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: recommendationsQuerySchema }) query: RecommendationsQuery,
  ) {
    return this.recommendations.recommendClusters(identity.organizationId, query);
  }
}

@Module({
  controllers: [RoutingController],
  providers: [RoutingService, RoutingRecommendationsService],
  exports: [RoutingService, RoutingRecommendationsService],
})
export class RoutingModule {}
