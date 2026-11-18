import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Idempotent } from '../../infrastructure/common/idempotency.interceptor.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { drivers, vehicles, vendors } from '../../infrastructure/database/schema/index.js';
import { AuditLogsModule, AuditLogsService } from '../audit-logs/audit-logs.module.js';

export function resolveMaxVehiclePassengerCapacity(vehicleType: string): number {
  switch (vehicleType) {
    case 'SEDAN':
    case 'EV_SEDAN':
      return 4;
    case 'SUV':
      return 6;
    case 'TEMPO_TRAVELLER':
      return 12;
    case 'SHUTTLE_BUS':
      return 45;
    default:
      return 6;
  }
}

export function resolveDefaultVehicleCapacity(vehicleType: string): number {
  switch (vehicleType) {
    case 'SEDAN':
    case 'EV_SEDAN':
      return 4;
    case 'SUV':
      return 6;
    case 'TEMPO_TRAVELLER':
      return 12;
    case 'SHUTTLE_BUS':
      return 24;
    default:
      return 4;
  }
}

export function resolveEffectiveVehicleCapacity(
  vehicleType: string,
  seatingCapacity: number | null | undefined,
): number {
  const maxAllowed = resolveMaxVehiclePassengerCapacity(vehicleType);
  const raw = seatingCapacity ?? resolveDefaultVehicleCapacity(vehicleType);
  return Math.max(1, Math.min(raw, maxAllowed));
}

export function validateConfiguredVehicleCapacity(
  vehicleType: string,
  seatingCapacity: number | undefined,
): number {
  const resolved = seatingCapacity ?? resolveDefaultVehicleCapacity(vehicleType);
  const maxAllowed = resolveMaxVehiclePassengerCapacity(vehicleType);
  if (resolved > maxAllowed) {
    throw new UnprocessableEntityException({
      code: 'VEHICLE_CAPACITY_EXCEEDED',
      message: `${vehicleType} passenger capacity excludes the driver and cannot exceed ${maxAllowed} (got ${resolved}).`,
      details: { vehicleType, requestedCapacity: resolved, maxAllowed },
    });
  }
  return resolved;
}

export const createVehicleSchema = z.object({
  vendorId: z.string().uuid(),
  registrationNo: z.string().min(4).max(32),
  modelName: z.string().min(2).max(100),
  vehicleType: z
    .enum(['SEDAN', 'SUV', 'TEMPO_TRAVELLER', 'EV_SEDAN', 'SHUTTLE_BUS'])
    .default('SEDAN'),
  seatingCapacity: z.number().int().min(1).max(60).optional(),
  insuranceExpiresAt: z.string().datetime().optional(),
  permitExpiresAt: z.string().datetime().optional(),
  fitnessExpiresAt: z.string().datetime().optional(),
});
export type CreateVehicleDto = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = z.object({
  modelName: z.string().min(2).max(100).optional(),
  vehicleType: z.enum(['SEDAN', 'SUV', 'TEMPO_TRAVELLER', 'EV_SEDAN', 'SHUTTLE_BUS']).optional(),
  seatingCapacity: z.number().int().min(1).max(60).optional(),
  availabilityStatus: z.enum(['AVAILABLE', 'ON_TRIP', 'OFF_DUTY', 'MAINTENANCE']).optional(),
  insuranceExpiresAt: z.string().datetime().nullable().optional(),
  permitExpiresAt: z.string().datetime().nullable().optional(),
  fitnessExpiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateVehicleDto = z.infer<typeof updateVehicleSchema>;

export const assignDriverToVehicleSchema = z.object({
  driverId: z.string().uuid(),
});
export type AssignDriverToVehicleDto = z.infer<typeof assignDriverToVehicleSchema>;

const uuidParamSchema = z.string().uuid();

@Injectable()
export class VehiclesService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  listByOrg(organizationId: string) {
    return this.dbService.db
      .select({
        id: vehicles.id,
        organizationId: vehicles.organizationId,
        vendorId: vehicles.vendorId,
        vendorName: vendors.name,
        registrationNo: vehicles.registrationNo,
        modelName: vehicles.modelName,
        vehicleType: vehicles.vehicleType,
        seatingCapacity: vehicles.seatingCapacity,
        availabilityStatus: vehicles.availabilityStatus,
        insuranceExpiresAt: vehicles.insuranceExpiresAt,
        permitExpiresAt: vehicles.permitExpiresAt,
        fitnessExpiresAt: vehicles.fitnessExpiresAt,
        isActive: vehicles.isActive,
      })
      .from(vehicles)
      .innerJoin(vendors, eq(vehicles.vendorId, vendors.id))
      .where(eq(vehicles.organizationId, organizationId));
  }

  async createVehicle(organizationId: string, dto: CreateVehicleDto) {
    const resolvedCapacity = validateConfiguredVehicleCapacity(
      dto.vehicleType,
      dto.seatingCapacity,
    );
    const [created] = await this.dbService.db
      .insert(vehicles)
      .values({
        organizationId,
        vendorId: dto.vendorId,
        registrationNo: dto.registrationNo,
        modelName: dto.modelName,
        vehicleType: dto.vehicleType,
        seatingCapacity: resolvedCapacity,
        insuranceExpiresAt: dto.insuranceExpiresAt ? new Date(dto.insuranceExpiresAt) : null,
        permitExpiresAt: dto.permitExpiresAt ? new Date(dto.permitExpiresAt) : null,
        fitnessExpiresAt: dto.fitnessExpiresAt ? new Date(dto.fitnessExpiresAt) : null,
      })
      .returning();
    return created;
  }

  async updateVehicle(organizationId: string, vehicleId: string, dto: UpdateVehicleDto) {
    const [existing] = await this.dbService.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Vehicle ${vehicleId} not found in organization.`,
      });
    }

    const nextType = dto.vehicleType ?? existing.vehicleType;
    const nextCapacity =
      dto.seatingCapacity !== undefined || dto.vehicleType !== undefined
        ? validateConfiguredVehicleCapacity(
            nextType,
            dto.seatingCapacity ??
              (dto.vehicleType && dto.vehicleType !== existing.vehicleType
                ? Math.min(existing.seatingCapacity, resolveMaxVehiclePassengerCapacity(nextType))
                : existing.seatingCapacity),
          )
        : existing.seatingCapacity;

    const [updated] = await this.dbService.db
      .update(vehicles)
      .set({
        ...(dto.modelName !== undefined ? { modelName: dto.modelName } : {}),
        ...(dto.vehicleType !== undefined ? { vehicleType: dto.vehicleType } : {}),
        ...(dto.seatingCapacity !== undefined || dto.vehicleType !== undefined
          ? { seatingCapacity: nextCapacity }
          : {}),
        ...(dto.availabilityStatus !== undefined
          ? { availabilityStatus: dto.availabilityStatus }
          : {}),
        ...(dto.insuranceExpiresAt !== undefined
          ? { insuranceExpiresAt: dto.insuranceExpiresAt ? new Date(dto.insuranceExpiresAt) : null }
          : {}),
        ...(dto.permitExpiresAt !== undefined
          ? { permitExpiresAt: dto.permitExpiresAt ? new Date(dto.permitExpiresAt) : null }
          : {}),
        ...(dto.fitnessExpiresAt !== undefined
          ? { fitnessExpiresAt: dto.fitnessExpiresAt ? new Date(dto.fitnessExpiresAt) : null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, vehicleId))
      .returning();

    return updated;
  }

  async assignDriver(
    identity: RequestIdentity,
    vehicleId: string,
    dto: AssignDriverToVehicleDto,
  ) {
    return this.dbService.transaction(async (tx) => {
      const [veh] = await tx
        .select()
        .from(vehicles)
        .where(
          and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, identity.organizationId)),
        )
        .limit(1);
      if (!veh) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Vehicle ${vehicleId} not found in organization.`,
        });
      }

      const [drv] = await tx
        .select()
        .from(drivers)
        .where(
          and(eq(drivers.id, dto.driverId), eq(drivers.organizationId, identity.organizationId)),
        )
        .limit(1);
      if (!drv) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Driver ${dto.driverId} not found in organization.`,
        });
      }

      const [updated] = await tx
        .update(drivers)
        .set({ assignedVehicleId: vehicleId, updatedAt: new Date() })
        .where(eq(drivers.id, dto.driverId))
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'VEHICLE_DRIVER_ASSIGNED',
        entityType: 'vehicle',
        entityId: vehicleId,
        afterJson: { driverId: dto.driverId, registrationNo: veh.registrationNo },
      });

      return updated;
    });
  }
}

@ApiTags('Admin - Vehicles')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/vehicles')
export class VehiclesController {
  constructor(private readonly service: VehiclesService) {}

  @Get()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'List vehicles in active organization' })
  list(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.listByOrg(identity.organizationId);
  }

  @Post()
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR')
  @ApiOperation({ summary: 'Register a fleet vehicle' })
  create(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: createVehicleSchema }) dto: CreateVehicleDto,
  ) {
    return this.service.createVehicle(identity.organizationId, dto);
  }

  @Patch(':vehicleId')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR')
  @ApiOperation({ summary: 'Update vehicle availability, capacity, or compliance dates' })
  update(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('vehicleId', { schema: uuidParamSchema }) vehicleId: string,
    @Body({ schema: updateVehicleSchema }) dto: UpdateVehicleDto,
  ) {
    return this.service.updateVehicle(identity.organizationId, vehicleId, dto);
  }

  @Post(':vehicleId/assign-driver')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR')
  @ApiOperation({ summary: 'Pair an active driver to this vehicle' })
  assignDriver(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('vehicleId', { schema: uuidParamSchema }) vehicleId: string,
    @Body({ schema: assignDriverToVehicleSchema }) dto: AssignDriverToVehicleDto,
  ) {
    return this.service.assignDriver(identity, vehicleId, dto);
  }
}

@Module({
  imports: [AuditLogsModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
