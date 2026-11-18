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
import { vendors } from '../../infrastructure/database/schema/index.js';

export const createVendorSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(2).max(48),
  contactName: z.string().min(2).max(120),
  contactPhone: z.string().min(6).max(32),
  billingBaseTripPaise: z.number().int().min(0).default(45000),
  billingRatePerKmPaise: z.number().int().min(0).default(1800),
});
export type CreateVendorDto = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = createVendorSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateVendorDto = z.infer<typeof updateVendorSchema>;

const uuidParamSchema = z.string().uuid();

@Injectable()
export class VendorsService {
  constructor(private readonly dbService: DatabaseService) {}

  listByOrg(organizationId: string) {
    return this.dbService.db
      .select()
      .from(vendors)
      .where(eq(vendors.organizationId, organizationId));
  }

  async createVendor(organizationId: string, dto: CreateVendorDto) {
    const [created] = await this.dbService.db
      .insert(vendors)
      .values({ organizationId, ...dto })
      .returning();
    return created;
  }

  async updateVendor(organizationId: string, vendorId: string, dto: UpdateVendorDto) {
    const [existing] = await this.dbService.db
      .select()
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Vendor ${vendorId} not found in organization.`,
      });
    }

    const [updated] = await this.dbService.db
      .update(vendors)
      .set({ ...dto, updatedAt: new Date() })
      .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, organizationId)))
      .returning();
    return updated;
  }
}

@ApiTags('Admin - Vendors')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/vendors')
export class VendorsController {
  constructor(private readonly service: VendorsService) {}

  @Get()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'List fleet vendors for active organization' })
  list(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.listByOrg(identity.organizationId);
  }

  @Post()
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Create fleet vendor' })
  create(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: createVendorSchema }) dto: CreateVendorDto,
  ) {
    return this.service.createVendor(identity.organizationId, dto);
  }

  @Patch(':vendorId')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Update vendor contact or rate card' })
  update(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('vendorId', { schema: uuidParamSchema }) vendorId: string,
    @Body({ schema: updateVendorSchema }) dto: UpdateVendorDto,
  ) {
    return this.service.updateVendor(identity.organizationId, vendorId, dto);
  }
}

@Module({
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
