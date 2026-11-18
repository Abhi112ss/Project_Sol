import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
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
  localities,
  memberships,
  organizationSettings,
  trips,
  users,
  vehicles,
  vendors,
} from '../../infrastructure/database/schema/index.js';
import { AuditLogsModule, AuditLogsService } from '../audit-logs/audit-logs.module.js';
import { LocalitiesService } from '../localities/localities.module.js';
import { normalizeLocalitySlug } from '../localities/localities.utils.js';

export const createDriverSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(6).max(32),
  fullName: z.string().min(2).max(160),
  vendorId: z.string().uuid(),
  assignedVehicleId: z.string().uuid().optional(),
  baseLocalityId: z.string().uuid().optional(),
  baseLocalityName: z.string().trim().min(2).max(120).optional(),
  baseLatitude: z.number().min(-90).max(90).optional(),
  baseLongitude: z.number().min(-180).max(180).optional(),
  driverCode: z.string().min(2).max(48),
  licenseNo: z.string().min(4).max(64),
  licenseExpiresAt: z.string().datetime().optional(),
});
export type CreateDriverDto = z.infer<typeof createDriverSchema>;

export const updateDriverSchema = z.object({
  fullName: z.string().min(2).max(160).optional(),
  phone: z.string().min(6).max(32).optional(),
  licenseNo: z.string().min(4).max(64).optional(),
  licenseExpiresAt: z.string().datetime().nullable().optional(),
  assignedVehicleId: z.string().uuid().nullable().optional(),
  baseLocalityId: z.string().uuid().nullable().optional(),
  baseLocalityName: z.string().trim().min(2).max(120).nullable().optional(),
  baseLatitude: z.number().min(-90).max(90).nullable().optional(),
  baseLongitude: z.number().min(-180).max(180).nullable().optional(),
  availabilityStatus: z.enum(['AVAILABLE', 'ON_TRIP', 'OFF_DUTY', 'MAINTENANCE']).optional(),
});
export type UpdateDriverDto = z.infer<typeof updateDriverSchema>;

export const suspendDriverSchema = z.object({
  isSuspended: z.boolean(),
  reason: z.string().min(3).max(500),
});
export type SuspendDriverDto = z.infer<typeof suspendDriverSchema>;

const uuidParamSchema = z.string().uuid();

@Injectable()
export class DriversService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
    @Optional() private readonly localities?: LocalitiesService,
  ) {}

  private async resolveBaseZoneInTx(
    tx: Parameters<Parameters<DatabaseService['transaction']>[0]>[0],
    organizationId: string,
    input: {
      baseLocalityId?: string | null;
      baseLocalityName?: string | null;
      baseLatitude?: number | null;
      baseLongitude?: number | null;
    },
  ) {
    const resolved = this.localities
      ? await this.localities.resolveInTx(tx, organizationId, {
          localityId: input.baseLocalityId,
          rawName: input.baseLocalityName,
          latitude: input.baseLatitude,
          longitude: input.baseLongitude,
        })
      : null;

    const finalLocalityId = resolved?.localityId ?? input.baseLocalityId ?? null;
    let finalName =
      resolved?.canonicalName ??
      input.baseLocalityName ??
      (normalizeLocalitySlug(input.baseLocalityName) || null);
    let finalLat = input.baseLatitude ?? null;
    let finalLng = input.baseLongitude ?? null;

    if (finalLocalityId && (finalLat == null || finalLng == null || !finalName)) {
      const [locRow] = await tx
        .select()
        .from(localities)
        .where(and(eq(localities.id, finalLocalityId), eq(localities.organizationId, organizationId)))
        .limit(1);
      if (locRow) {
        finalName = finalName ?? locRow.canonicalName;
        finalLat = finalLat ?? locRow.centerLatitude;
        finalLng = finalLng ?? locRow.centerLongitude;
      }
    }

    return {
      baseLocalityId: finalLocalityId,
      baseLocalityName: finalName,
      baseLatitude: finalLat,
      baseLongitude: finalLng,
      baseLocation:
        typeof finalLat === 'number' && typeof finalLng === 'number'
          ? { x: finalLng, y: finalLat }
          : null,
    };
  }

  listByOrg(organizationId: string) {
    return this.dbService.db
      .select({
        id: drivers.id,
        organizationId: drivers.organizationId,
        vendorId: drivers.vendorId,
        vendorName: vendors.name,
        assignedVehicleId: drivers.assignedVehicleId,
        vehicleRegistrationNo: vehicles.registrationNo,
        baseLocalityId: drivers.baseLocalityId,
        baseLocalityName: drivers.baseLocalityName,
        baseLatitude: drivers.baseLatitude,
        baseLongitude: drivers.baseLongitude,
        driverCode: drivers.driverCode,
        licenseNo: drivers.licenseNo,
        licenseExpiresAt: drivers.licenseExpiresAt,
        availabilityStatus: drivers.availabilityStatus,
        isSuspended: drivers.isSuspended,
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .innerJoin(vendors, eq(drivers.vendorId, vendors.id))
      .leftJoin(vehicles, eq(drivers.assignedVehicleId, vehicles.id))
      .where(eq(drivers.organizationId, organizationId));
  }

  async createDriver(identity: RequestIdentity, dto: CreateDriverDto) {
    return this.dbService.transaction(async (tx) => {
      const [existingUser] = await tx
        .select()
        .from(users)
        .where(eq(users.email, dto.email))
        .limit(1);

      const user =
        existingUser ??
        (
          await tx
            .insert(users)
            .values({
              email: dto.email,
              phone: dto.phone,
              fullName: dto.fullName,
            })
            .returning()
        )[0];

      await tx
        .insert(memberships)
        .values({
          organizationId: identity.organizationId,
          userId: user.id,
          role: 'DRIVER',
          vendorId: dto.vendorId,
        })
        .onConflictDoNothing();

      const baseZone = await this.resolveBaseZoneInTx(tx, identity.organizationId, {
        baseLocalityId: dto.baseLocalityId,
        baseLocalityName: dto.baseLocalityName,
        baseLatitude: dto.baseLatitude,
        baseLongitude: dto.baseLongitude,
      });

      const [driver] = await tx
        .insert(drivers)
        .values({
          organizationId: identity.organizationId,
          userId: user.id,
          vendorId: dto.vendorId,
          assignedVehicleId: dto.assignedVehicleId ?? null,
          baseLocalityId: baseZone.baseLocalityId,
          baseLocalityName: baseZone.baseLocalityName,
          baseLatitude: baseZone.baseLatitude,
          baseLongitude: baseZone.baseLongitude,
          baseLocation: baseZone.baseLocation,
          driverCode: dto.driverCode,
          licenseNo: dto.licenseNo,
          licenseExpiresAt: dto.licenseExpiresAt ? new Date(dto.licenseExpiresAt) : null,
        })
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'DRIVER_CREATED',
        entityType: 'driver',
        entityId: driver.id,
        afterJson: { driverCode: driver.driverCode, vendorId: driver.vendorId },
      });

      return { ...driver, user };
    });
  }

  async updateDriver(identity: RequestIdentity, driverId: string, dto: UpdateDriverDto) {
    return this.dbService.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(drivers)
        .where(and(eq(drivers.id, driverId), eq(drivers.organizationId, identity.organizationId)))
        .limit(1);

      if (!existing) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Driver ${driverId} not found in organization.`,
        });
      }

      if (dto.fullName !== undefined || dto.phone !== undefined) {
        await tx
          .update(users)
          .set({
            ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.userId));
      }

      const baseLocalityChanged =
        dto.baseLocalityId !== undefined ||
        dto.baseLocalityName !== undefined ||
        dto.baseLatitude !== undefined ||
        dto.baseLongitude !== undefined;

      const baseZone = baseLocalityChanged
        ? await this.resolveBaseZoneInTx(tx, identity.organizationId, {
            baseLocalityId:
              dto.baseLocalityId !== undefined ? dto.baseLocalityId : existing.baseLocalityId,
            baseLocalityName:
              dto.baseLocalityName !== undefined
                ? dto.baseLocalityName
                : dto.baseLocalityId !== undefined
                  ? null
                  : existing.baseLocalityName,
            baseLatitude:
              dto.baseLatitude !== undefined
                ? dto.baseLatitude
                : dto.baseLocalityId !== undefined
                  ? null
                  : existing.baseLatitude,
            baseLongitude:
              dto.baseLongitude !== undefined
                ? dto.baseLongitude
                : dto.baseLocalityId !== undefined
                  ? null
                  : existing.baseLongitude,
          })
        : null;

      const [updated] = await tx
        .update(drivers)
        .set({
          ...(dto.licenseNo !== undefined ? { licenseNo: dto.licenseNo } : {}),
          ...(dto.licenseExpiresAt !== undefined
            ? { licenseExpiresAt: dto.licenseExpiresAt ? new Date(dto.licenseExpiresAt) : null }
            : {}),
          ...(dto.assignedVehicleId !== undefined
            ? { assignedVehicleId: dto.assignedVehicleId }
            : {}),
          ...(baseZone
            ? {
                baseLocalityId: baseZone.baseLocalityId,
                baseLocalityName: baseZone.baseLocalityName,
                baseLatitude: baseZone.baseLatitude,
                baseLongitude: baseZone.baseLongitude,
                baseLocation: baseZone.baseLocation,
              }
            : {}),
          ...(dto.availabilityStatus !== undefined
            ? { availabilityStatus: dto.availabilityStatus }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(drivers.id, driverId))
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'DRIVER_UPDATED',
        entityType: 'driver',
        entityId: driverId,
        beforeJson: existing as unknown as Record<string, unknown>,
        afterJson: updated as unknown as Record<string, unknown>,
      });

      return updated;
    });
  }

  async suspendDriver(identity: RequestIdentity, driverId: string, dto: SuspendDriverDto) {
    return this.dbService.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(drivers)
        .where(and(eq(drivers.id, driverId), eq(drivers.organizationId, identity.organizationId)))
        .limit(1);

      if (!existing) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Driver ${driverId} not found in organization.`,
        });
      }

      const [updated] = await tx
        .update(drivers)
        .set({
          isSuspended: dto.isSuspended,
          availabilityStatus: dto.isSuspended ? 'OFF_DUTY' : 'AVAILABLE',
          updatedAt: new Date(),
        })
        .where(eq(drivers.id, driverId))
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: dto.isSuspended ? 'DRIVER_SUSPENDED' : 'DRIVER_REACTIVATED',
        entityType: 'driver',
        entityId: driverId,
        reason: dto.reason,
        beforeJson: { isSuspended: existing.isSuspended },
        afterJson: { isSuspended: updated.isSuspended },
      });

      return updated;
    });
  }

  async getSchedule(organizationId: string, driverId: string) {
    return this.dbService.db
      .select()
      .from(trips)
      .where(and(eq(trips.organizationId, organizationId), eq(trips.driverId, driverId)))
      .orderBy(desc(trips.travelDate), desc(trips.createdAt))
      .limit(50);
  }

  async resolveDriverByUserId(organizationId: string, userId: string) {
    const [drv] = await this.dbService.db
      .select()
      .from(drivers)
      .where(and(eq(drivers.organizationId, organizationId), eq(drivers.userId, userId)))
      .limit(1);

    if (!drv) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Authenticated user has no driver profile in active organization.',
      });
    }
    return drv;
  }

  async getSelfProfile(identity: RequestIdentity) {
    const drv = await this.resolveDriverByUserId(identity.organizationId, identity.userId);
    const [[userRow], [vendorRow], [vehicleRow], [settingsRow]] = await Promise.all([
      this.dbService.db.select().from(users).where(eq(users.id, identity.userId)).limit(1),
      this.dbService.db.select().from(vendors).where(eq(vendors.id, drv.vendorId)).limit(1),
      drv.assignedVehicleId
        ? this.dbService.db
            .select()
            .from(vehicles)
            .where(eq(vehicles.id, drv.assignedVehicleId))
            .limit(1)
        : Promise.resolve([undefined]),
      this.dbService.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, identity.organizationId))
        .limit(1),
    ]);

    return {
      driver: drv,
      user: userRow
        ? { id: userRow.id, email: userRow.email, phone: userRow.phone, fullName: userRow.fullName }
        : null,
      vendor: vendorRow ?? null,
      assignedVehicle: vehicleRow ?? null,
      settings: settingsRow ?? null,
    };
  }
}

@ApiTags('Admin - Drivers')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/drivers')
export class DriversController {
  constructor(private readonly service: DriversService) {}

  @Get()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'List drivers in active organization' })
  list(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.listByOrg(identity.organizationId);
  }

  @Post()
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR')
  @ApiOperation({ summary: 'Register a fleet driver' })
  create(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: createDriverSchema }) dto: CreateDriverDto,
  ) {
    return this.service.createDriver(identity, dto);
  }

  @Patch(':driverId')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR')
  @ApiOperation({ summary: 'Update driver availability, documents, or vehicle assignment' })
  update(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('driverId', { schema: uuidParamSchema }) driverId: string,
    @Body({ schema: updateDriverSchema }) dto: UpdateDriverDto,
  ) {
    return this.service.updateDriver(identity, driverId, dto);
  }

  @Post(':driverId/suspend')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Suspend or reactivate driver with audit reason' })
  suspend(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('driverId', { schema: uuidParamSchema }) driverId: string,
    @Body({ schema: suspendDriverSchema }) dto: SuspendDriverDto,
  ) {
    return this.service.suspendDriver(identity, driverId, dto);
  }

  @Get(':driverId/schedule')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'View driver scheduled and historical trips' })
  schedule(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('driverId', { schema: uuidParamSchema }) driverId: string,
  ) {
    return this.service.getSchedule(identity.organizationId, driverId);
  }
}

@ApiTags('Driver - Self Profile')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('driver')
export class DriverSelfController {
  constructor(private readonly service: DriversService) {}

  @Get('profile')
  @Roles('DRIVER', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Fetch authenticated driver profile, assigned vehicle & org wait/OTP policy' })
  getProfile(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.getSelfProfile(identity);
  }
}

@Module({
  imports: [AuditLogsModule],
  controllers: [DriversController, DriverSelfController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
