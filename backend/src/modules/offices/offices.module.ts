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
import { offices } from '../../infrastructure/database/schema/index.js';

export const createOfficeSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(2).max(48),
  address: z.string().min(4),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  geofenceRadiusM: z.number().int().min(50).max(2000).default(250),
});
export type CreateOfficeDto = z.infer<typeof createOfficeSchema>;

export const updateOfficeSchema = createOfficeSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateOfficeDto = z.infer<typeof updateOfficeSchema>;

const uuidParamSchema = z.string().uuid();

@Injectable()
export class OfficesService {
  constructor(private readonly dbService: DatabaseService) {}

  listByOrg(organizationId: string) {
    return this.dbService.db
      .select()
      .from(offices)
      .where(eq(offices.organizationId, organizationId));
  }

  async createOffice(organizationId: string, dto: CreateOfficeDto) {
    const [created] = await this.dbService.db
      .insert(offices)
      .values({
        organizationId,
        name: dto.name,
        code: dto.code,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        location: { x: dto.longitude, y: dto.latitude },
        geofenceRadiusM: dto.geofenceRadiusM,
      })
      .returning();
    return created;
  }

  async updateOffice(organizationId: string, officeId: string, dto: UpdateOfficeDto) {
    const [existing] = await this.dbService.db
      .select()
      .from(offices)
      .where(and(eq(offices.id, officeId), eq(offices.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Office ${officeId} not found in organization.`,
      });
    }

    const nextLat = dto.latitude ?? existing.latitude;
    const nextLng = dto.longitude ?? existing.longitude;
    const [updated] = await this.dbService.db
      .update(offices)
      .set({
        ...dto,
        location: { x: nextLng, y: nextLat },
        updatedAt: new Date(),
      })
      .where(and(eq(offices.id, officeId), eq(offices.organizationId, organizationId)))
      .returning();
    return updated;
  }
}

@ApiTags('Admin - Offices')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/offices')
export class OfficesController {
  constructor(private readonly service: OfficesService) {}

  @Get()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'EMPLOYEE', 'AUDITOR')
  @ApiOperation({ summary: 'List corporate campus offices in active organization' })
  list(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.listByOrg(identity.organizationId);
  }

  @Post()
  @Idempotent()
  @Roles('ORG_ADMIN')
  @ApiOperation({ summary: 'Register office campus with PostGIS coordinates' })
  create(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: createOfficeSchema }) dto: CreateOfficeDto,
  ) {
    return this.service.createOffice(identity.organizationId, dto);
  }

  @Patch(':officeId')
  @Roles('ORG_ADMIN')
  @ApiOperation({ summary: 'Update corporate campus office details or geofence' })
  update(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('officeId', { schema: uuidParamSchema }) officeId: string,
    @Body({ schema: updateOfficeSchema }) dto: UpdateOfficeDto,
  ) {
    return this.service.updateOffice(identity.organizationId, officeId, dto);
  }
}

@Module({
  controllers: [OfficesController],
  providers: [OfficesService],
  exports: [OfficesService],
})
export class OfficesModule {}
