import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Idempotent } from '../../infrastructure/common/idempotency.interceptor.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { organizations, organizationSettings } from '../../infrastructure/database/schema/index.js';
import { AuditLogsModule, AuditLogsService } from '../audit-logs/audit-logs.module.js';

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  countryCode: z.string().min(2).max(8).default('IN'),
  timezone: z.string().min(2).max(64).default('Asia/Kolkata'),
});
export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSettingsSchema = z.object({
  defaultGeofenceRadiusM: z.number().int().min(25).max(2000).optional(),
  noShowWaitSeconds: z.number().int().min(30).max(1800).optional(),
  bookingCutoffMinutes: z.number().int().min(15).max(1440).optional(),
  cancellationCutoffMinutes: z.number().int().min(5).max(720).optional(),
  requireBoardingOtp: z.boolean().optional(),
  requireDeboardingOtp: z.boolean().optional(),
  gpsStaleThresholdSeconds: z.number().int().min(15).max(600).optional(),
  gpsRetentionDays: z.number().int().min(7).max(365).optional(),
  gpsPingIntervalSeconds: z.number().int().min(5).max(120).optional(),
  nearbyLocalityRadiusM: z.number().int().min(200).max(20000).optional(),
  maxRouteDetourRatio: z.number().min(1.05).max(5).optional(),
  pickupWindowToleranceMinutes: z.number().int().min(5).max(120).optional(),
  driverTurnaroundBufferMinutes: z.number().int().min(0).max(180).optional(),
  arriveBySafetyBufferMinutes: z.number().int().min(0).max(60).optional(),
  allowSameDayBooking: z.boolean().optional(),
  currencyCode: z.string().min(3).max(8).optional(),
});
export type UpdateOrganizationSettingsDto = z.infer<typeof updateOrganizationSettingsSchema>;

const uuidParamSchema = z.string().uuid();

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async listVisible(identity: RequestIdentity) {
    if (identity.role === 'PLATFORM_SUPER_ADMIN') {
      return this.dbService.db.select().from(organizations);
    }
    return this.dbService.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, identity.organizationId));
  }

  async getByIdWithSettings(identity: RequestIdentity, orgId: string) {
    if (identity.role !== 'PLATFORM_SUPER_ADMIN' && orgId !== identity.organizationId) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: 'Cannot access another organization.',
      });
    }

    const [org] = await this.dbService.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Organization ${orgId} not found.`,
      });
    }

    const [settings] = await this.dbService.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, orgId))
      .limit(1);

    return { ...org, settings: settings ?? null };
  }

  async createOrganization(identity: RequestIdentity, dto: CreateOrganizationDto) {
    return this.dbService.transaction(async (tx) => {
      const [created] = await tx
        .insert(organizations)
        .values({
          name: dto.name,
          slug: dto.slug,
          countryCode: dto.countryCode,
          timezone: dto.timezone,
        })
        .returning();

      const [settings] = await tx
        .insert(organizationSettings)
        .values({ organizationId: created.id })
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: created.id,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'ORGANIZATION_CREATED',
        entityType: 'organization',
        entityId: created.id,
        afterJson: { name: created.name, slug: created.slug },
      });

      return { ...created, settings };
    });
  }

  async updateSettings(
    identity: RequestIdentity,
    orgId: string,
    dto: UpdateOrganizationSettingsDto,
  ) {
    if (identity.role !== 'PLATFORM_SUPER_ADMIN' && orgId !== identity.organizationId) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: 'Cannot modify settings of another organization.',
      });
    }

    return this.dbService.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, orgId))
        .limit(1);

      if (!existing) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Organization settings for ${orgId} not found.`,
        });
      }

      const [updated] = await tx
        .update(organizationSettings)
        .set({ ...dto, updatedAt: new Date() })
        .where(eq(organizationSettings.organizationId, orgId))
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: orgId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'ORGANIZATION_SETTINGS_UPDATED',
        entityType: 'organization_settings',
        entityId: updated.id,
        beforeJson: existing as unknown as Record<string, unknown>,
        afterJson: updated as unknown as Record<string, unknown>,
      });

      return updated;
    });
  }
}

@ApiTags('Admin - Organizations')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'List accessible organizations' })
  list(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.listVisible(identity);
  }

  @Get(':orgId')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'Get organization profile and operational policy settings' })
  getOne(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('orgId', { schema: uuidParamSchema }) orgId: string,
  ) {
    return this.service.getByIdWithSettings(identity, orgId);
  }

  @Post()
  @Idempotent()
  @Roles('PLATFORM_SUPER_ADMIN')
  @ApiOperation({ summary: 'Create new tenant organization with default policy settings' })
  create(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: createOrganizationSchema }) dto: CreateOrganizationDto,
  ) {
    return this.service.createOrganization(identity, dto);
  }

  @Patch(':orgId/settings')
  @Roles('ORG_ADMIN')
  @ApiOperation({ summary: 'Update organization-level transport policies' })
  updateSettings(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('orgId', { schema: uuidParamSchema }) orgId: string,
    @Body({ schema: updateOrganizationSettingsSchema }) dto: UpdateOrganizationSettingsDto,
  ) {
    return this.service.updateSettings(identity, orgId, dto);
  }
}

@Module({
  imports: [AuditLogsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}

