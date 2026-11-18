import {
  Body,
  ConflictException,
  Controller,
  Get,
  Global,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Idempotent } from '../../infrastructure/common/idempotency.interceptor.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { DatabaseService, type SolTransaction } from '../../infrastructure/database/database.service.js';
import { localities } from '../../infrastructure/database/schema/index.js';
import {
  normalizeLocalitySlug,
  resolveCanonicalLocalityMatch,
} from './localities.utils.js';

export const createLocalitySchema = z.object({
  canonicalName: z.string().trim().min(2).max(120),
  aliases: z.array(z.string().trim().min(1).max(120)).max(25).default([]),
  centerLatitude: z.number().min(-90).max(90),
  centerLongitude: z.number().min(-180).max(180),
  proximityRadiusM: z.number().int().min(200).max(20_000).default(3500),
});
export type CreateLocalityDto = z.infer<typeof createLocalitySchema>;

export const updateLocalitySchema = createLocalitySchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateLocalityDto = z.infer<typeof updateLocalitySchema>;

export const listLocalitiesQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
});
export type ListLocalitiesQuery = z.infer<typeof listLocalitiesQuerySchema>;

const uuidParamSchema = z.string().uuid();

@Injectable()
export class LocalitiesService {
  constructor(private readonly dbService: DatabaseService) {}

  listByOrg(organizationId: string, includeInactive = false) {
    const conditions = [eq(localities.organizationId, organizationId)];
    if (!includeInactive) conditions.push(eq(localities.isActive, true));
    return this.dbService.db
      .select()
      .from(localities)
      .where(and(...conditions))
      .orderBy(asc(localities.canonicalName));
  }

  async create(organizationId: string, dto: CreateLocalityDto) {
    const normalizedSlug = normalizeLocalitySlug(dto.canonicalName);
    if (!normalizedSlug) {
      throw new ConflictException({
        code: 'INVALID_LOCALITY_NAME',
        message: 'Locality name must contain alphanumeric characters.',
      });
    }

    const [existing] = await this.dbService.db
      .select({ id: localities.id })
      .from(localities)
      .where(
        and(
          eq(localities.organizationId, organizationId),
          eq(localities.normalizedSlug, normalizedSlug),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictException({
        code: 'LOCALITY_ALREADY_EXISTS',
        message: `Canonical locality ${dto.canonicalName} already exists (slug=${normalizedSlug}).`,
      });
    }

    const mergedAliases = [...new Set([dto.canonicalName, ...dto.aliases])];
    const [created] = await this.dbService.db
      .insert(localities)
      .values({
        organizationId,
        canonicalName: dto.canonicalName,
        normalizedSlug,
        aliases: mergedAliases,
        centerLatitude: dto.centerLatitude,
        centerLongitude: dto.centerLongitude,
        centerPoint: { x: dto.centerLongitude, y: dto.centerLatitude },
        proximityRadiusM: dto.proximityRadiusM,
      })
      .returning();

    return created;
  }

  async update(organizationId: string, localityId: string, dto: UpdateLocalityDto) {
    const [existing] = await this.dbService.db
      .select()
      .from(localities)
      .where(and(eq(localities.id, localityId), eq(localities.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Locality ${localityId} not found in organization.`,
      });
    }

    const nextLat = dto.centerLatitude ?? existing.centerLatitude;
    const nextLng = dto.centerLongitude ?? existing.centerLongitude;
    const nextName = dto.canonicalName ?? existing.canonicalName;
    const nextSlug = dto.canonicalName
      ? normalizeLocalitySlug(dto.canonicalName) || existing.normalizedSlug
      : existing.normalizedSlug;

    const [updated] = await this.dbService.db
      .update(localities)
      .set({
        canonicalName: nextName,
        normalizedSlug: nextSlug,
        ...(dto.aliases !== undefined ? { aliases: dto.aliases } : {}),
        centerLatitude: nextLat,
        centerLongitude: nextLng,
        centerPoint: { x: nextLng, y: nextLat },
        ...(dto.proximityRadiusM !== undefined ? { proximityRadiusM: dto.proximityRadiusM } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(localities.id, localityId))
      .returning();

    return updated;
  }

  /**
   * Resolves a canonical locality inside an active transaction:
   * uses alias normalization + PostGIS ST_DistanceSphere verification when coordinates exist.
   */
  async resolveInTx(
    tx: SolTransaction,
    organizationId: string,
    input: {
      localityId?: string | null;
      rawName?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    },
  ) {
    const activeLocalities = await tx
      .select()
      .from(localities)
      .where(and(eq(localities.organizationId, organizationId), eq(localities.isActive, true)));

    const match = resolveCanonicalLocalityMatch({
      ...input,
      localities: activeLocalities,
    });

    // If derived slug didn't match by alias, also run an authoritative PostGIS spherical containment query
    if (
      !match.localityId &&
      typeof input.latitude === 'number' &&
      typeof input.longitude === 'number'
    ) {
      const spatialRows = await tx
        .select({
          id: localities.id,
          canonicalName: localities.canonicalName,
          normalizedSlug: localities.normalizedSlug,
        })
        .from(localities)
        .where(
          and(
            eq(localities.organizationId, organizationId),
            eq(localities.isActive, true),
            sql`ST_DistanceSphere(${localities.centerPoint}, ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)) <= ${localities.proximityRadiusM}`,
          ),
        )
        .orderBy(
          sql`ST_DistanceSphere(${localities.centerPoint}, ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)) ASC`,
        )
        .limit(1);

      if (spatialRows[0]) {
        return {
          localityId: spatialRows[0].id,
          canonicalName: spatialRows[0].canonicalName,
          normalizedSlug: spatialRows[0].normalizedSlug,
          matchMethod: 'SPATIAL_PROXIMITY' as const,
        };
      }
    }

    return match;
  }
}

@ApiTags('Admin - Localities')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/localities')
export class LocalitiesController {
  constructor(private readonly service: LocalitiesService) {}

  @Get()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'List canonical pickup/operational localities in active organization' })
  list(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: listLocalitiesQuerySchema }) query: ListLocalitiesQuery,
  ) {
    return this.service.listByOrg(identity.organizationId, query.includeInactive);
  }

  @Post()
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Create canonical locality with aliases & PostGIS center radius' })
  create(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: createLocalitySchema }) dto: CreateLocalityDto,
  ) {
    return this.service.create(identity.organizationId, dto);
  }

  @Patch(':localityId')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Update canonical locality aliases, center coordinates, or proximity radius' })
  update(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('localityId', { schema: uuidParamSchema }) localityId: string,
    @Body({ schema: updateLocalitySchema }) dto: UpdateLocalityDto,
  ) {
    return this.service.update(identity.organizationId, localityId, dto);
  }
}

@Global()
@Module({
  controllers: [LocalitiesController],
  providers: [LocalitiesService],
  exports: [LocalitiesService],
})
export class LocalitiesModule {}
