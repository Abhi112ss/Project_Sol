import {
  BadRequestException,
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
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Idempotent } from '../../infrastructure/common/idempotency.interceptor.js';
import {
  buildPaginationMeta,
  paginationQuerySchema,
  type PaginationQuery,
} from '../../infrastructure/common/pagination.schema.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  employeeLocations,
  employees,
  memberships,
  offices,
  organizations,
  organizationSettings,
  passengerAssignments,
  shifts,
  trips,
  users,
} from '../../infrastructure/database/schema/index.js';
import { AuditLogsModule, AuditLogsService } from '../audit-logs/audit-logs.module.js';
import { LocalitiesService } from '../localities/localities.module.js';
import { normalizeLocalitySlug } from '../localities/localities.utils.js';

export const createEmployeeSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(6).max(32),
  fullName: z.string().min(2).max(160),
  officeId: z.string().uuid(),
  defaultShiftId: z.string().uuid().optional(),
  employeeCode: z.string().min(2).max(48),
  department: z.string().min(2).max(100),
  transportEligible: z.boolean().default(true),
  emergencyContactName: z.string().max(120).optional(),
  emergencyContactPhone: z.string().max(32).optional(),
  pickupLocation: z
    .object({
      locationName: z.string().min(2).max(120),
      address: z.string().min(4),
      corridorTag: z.string().max(80).optional(),
      localityId: z.string().uuid().optional(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      googlePlaceId: z.string().max(180).optional(),
      originalMapsUrl: z.string().url().optional(),
      geofenceRadiusM: z.number().int().min(25).max(1000).default(150),
    })
    .optional(),
});
export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  fullName: z.string().min(2).max(160).optional(),
  phone: z.string().min(6).max(32).optional(),
  officeId: z.string().uuid().optional(),
  defaultShiftId: z.string().uuid().nullable().optional(),
  department: z.string().min(2).max(100).optional(),
  transportEligible: z.boolean().optional(),
  emergencyContactName: z.string().max(120).nullable().optional(),
  emergencyContactPhone: z.string().max(32).nullable().optional(),
});
export type UpdateEmployeeDto = z.infer<typeof updateEmployeeSchema>;

export const createSavedLocationSchema = z.object({
  locationName: z.string().min(2).max(120),
  address: z.string().min(4),
  corridorTag: z.string().max(80).optional(),
  localityId: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  googlePlaceId: z.string().max(180).optional(),
  originalMapsUrl: z.string().url().optional(),
  geofenceRadiusM: z.number().int().min(25).max(1000).default(150),
  isDefault: z.boolean().default(false),
});
export type CreateSavedLocationDto = z.infer<typeof createSavedLocationSchema>;

export const updateSelfProfileSchema = z.object({
  defaultShiftId: z.string().uuid().nullable().optional(),
  emergencyContactName: z.string().max(120).nullable().optional(),
  emergencyContactPhone: z.string().max(32).nullable().optional(),
});
export type UpdateSelfProfileDto = z.infer<typeof updateSelfProfileSchema>;

export const updateSavedLocationSchema = createSavedLocationSchema.partial();
export type UpdateSavedLocationDto = z.infer<typeof updateSavedLocationSchema>;

export const importEmployeesCsvSchema = z.object({
  csvText: z.string().min(10).max(500_000),
});
export type ImportEmployeesCsvDto = z.infer<typeof importEmployeesCsvSchema>;

const csvRowSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(6).max(32),
  fullName: z.string().min(2).max(160),
  employeeCode: z.string().min(2).max(48),
  department: z.string().min(2).max(100),
  officeCode: z.string().min(1),
  shiftCode: z.string().optional(),
  locationName: z.string().min(2).optional(),
  address: z.string().min(4).optional(),
  corridorTag: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

const uuidParamSchema = z.string().uuid();

export function parseCsvLines(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };

  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (vals[idx] !== undefined && vals[idx] !== '') {
        obj[header] = vals[idx];
      }
    });
    return obj;
  });
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
    @Optional() private readonly localities?: LocalitiesService,
  ) {}

  private async resolveLocalityFields(
    tx: Parameters<Parameters<DatabaseService['transaction']>[0]>[0],
    organizationId: string,
    input: {
      localityId?: string | null;
      corridorTag?: string | null;
      locationName?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    },
  ) {
    const rawName = input.corridorTag ?? input.locationName ?? null;
    const resolved = this.localities
      ? await this.localities.resolveInTx(tx, organizationId, {
          localityId: input.localityId,
          rawName,
          latitude: input.latitude,
          longitude: input.longitude,
        })
      : null;
    return {
      localityId: resolved?.localityId ?? input.localityId ?? null,
      normalizedLocality:
        resolved?.canonicalName ??
        resolved?.normalizedSlug ??
        (normalizeLocalitySlug(rawName) || input.corridorTag || null),
    };
  }

  async listByOrg(organizationId: string, query: PaginationQuery) {
    const offset = (query.page - 1) * query.limit;
    const searchTerm = query.search?.trim();
    const baseFilter = searchTerm
      ? and(
          eq(employees.organizationId, organizationId),
          or(
            ilike(users.fullName, `%${searchTerm}%`),
            ilike(users.email, `%${searchTerm}%`),
            ilike(employees.employeeCode, `%${searchTerm}%`),
            ilike(employees.department, `%${searchTerm}%`),
          ),
        )
      : eq(employees.organizationId, organizationId);

    const [items, countRows] = await Promise.all([
      this.dbService.db
        .select({
          id: employees.id,
          organizationId: employees.organizationId,
          employeeCode: employees.employeeCode,
          department: employees.department,
          officeId: employees.officeId,
          officeName: offices.name,
          defaultShiftId: employees.defaultShiftId,
          transportEligible: employees.transportEligible,
          emergencyContactName: employees.emergencyContactName,
          emergencyContactPhone: employees.emergencyContactPhone,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
          createdAt: employees.createdAt,
        })
        .from(employees)
        .innerJoin(users, eq(employees.userId, users.id))
        .innerJoin(offices, eq(employees.officeId, offices.id))
        .where(baseFilter)
        .orderBy(desc(employees.createdAt))
        .limit(query.limit)
        .offset(offset),
      this.dbService.db
        .select({ count: sql<number>`count(*)::int` })
        .from(employees)
        .innerJoin(users, eq(employees.userId, users.id))
        .where(baseFilter),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(query.page, query.limit, countRows[0]?.count ?? 0),
    };
  }

  async getDetail(organizationId: string, employeeId: string) {
    const [row] = await this.dbService.db
      .select({
        id: employees.id,
        organizationId: employees.organizationId,
        userId: employees.userId,
        employeeCode: employees.employeeCode,
        department: employees.department,
        officeId: employees.officeId,
        officeName: offices.name,
        defaultShiftId: employees.defaultShiftId,
        transportEligible: employees.transportEligible,
        emergencyContactName: employees.emergencyContactName,
        emergencyContactPhone: employees.emergencyContactPhone,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        createdAt: employees.createdAt,
      })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .innerJoin(offices, eq(employees.officeId, offices.id))
      .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Employee ${employeeId} not found in organization.`,
      });
    }

    const [locations, tripHistory] = await Promise.all([
      this.dbService.db
        .select()
        .from(employeeLocations)
        .where(
          and(
            eq(employeeLocations.organizationId, organizationId),
            eq(employeeLocations.employeeId, employeeId),
          ),
        ),
      this.listHistoricalTrips(organizationId, employeeId),
    ]);

    return { ...row, locations, tripHistory };
  }

  async listHistoricalTrips(organizationId: string, employeeId: string) {
    return this.dbService.db
      .select({
        assignmentId: passengerAssignments.id,
        tripId: trips.id,
        tripCode: trips.tripCode,
        travelDate: trips.travelDate,
        direction: trips.direction,
        tripStatus: trips.status,
        passengerStatus: passengerAssignments.status,
        scheduledPickupAt: passengerAssignments.scheduledPickupAt,
        boardedAt: passengerAssignments.boardedAt,
        noShowAt: passengerAssignments.noShowAt,
        arrivalDelaySeconds: passengerAssignments.arrivalDelaySeconds,
        passengerWaitSeconds: passengerAssignments.passengerWaitSeconds,
      })
      .from(passengerAssignments)
      .innerJoin(trips, eq(passengerAssignments.tripId, trips.id))
      .where(
        and(
          eq(passengerAssignments.organizationId, organizationId),
          eq(passengerAssignments.employeeId, employeeId),
        ),
      )
      .orderBy(desc(trips.travelDate))
      .limit(50);
  }

  async createEmployee(identity: RequestIdentity, dto: CreateEmployeeDto) {
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
          role: 'EMPLOYEE',
          officeId: dto.officeId,
        })
        .onConflictDoNothing();

      const [employee] = await tx
        .insert(employees)
        .values({
          organizationId: identity.organizationId,
          userId: user.id,
          officeId: dto.officeId,
          defaultShiftId: dto.defaultShiftId ?? null,
          employeeCode: dto.employeeCode,
          department: dto.department,
          transportEligible: dto.transportEligible,
          emergencyContactName: dto.emergencyContactName ?? null,
          emergencyContactPhone: dto.emergencyContactPhone ?? null,
        })
        .returning();

      let savedLocation = null;
      if (dto.pickupLocation) {
        const locMeta = await this.resolveLocalityFields(tx, identity.organizationId, {
          localityId: dto.pickupLocation.localityId,
          corridorTag: dto.pickupLocation.corridorTag,
          locationName: dto.pickupLocation.locationName,
          latitude: dto.pickupLocation.latitude,
          longitude: dto.pickupLocation.longitude,
        });
        const [loc] = await tx
          .insert(employeeLocations)
          .values({
            organizationId: identity.organizationId,
            employeeId: employee.id,
            locationName: dto.pickupLocation.locationName,
            address: dto.pickupLocation.address,
            corridorTag: dto.pickupLocation.corridorTag ?? null,
            localityId: locMeta.localityId,
            normalizedLocality: locMeta.normalizedLocality,
            latitude: dto.pickupLocation.latitude,
            longitude: dto.pickupLocation.longitude,
            location: { x: dto.pickupLocation.longitude, y: dto.pickupLocation.latitude },
            googlePlaceId: dto.pickupLocation.googlePlaceId ?? null,
            originalMapsUrl: dto.pickupLocation.originalMapsUrl ?? null,
            geofenceRadiusM: dto.pickupLocation.geofenceRadiusM,
            isDefault: true,
            verified: true,
          })
          .returning();
        savedLocation = loc;
      }

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'EMPLOYEE_CREATED',
        entityType: 'employee',
        entityId: employee.id,
        afterJson: { employeeCode: employee.employeeCode, department: employee.department },
      });

      return { ...employee, user, savedLocation };
    });
  }

  async updateEmployee(
    identity: RequestIdentity,
    employeeId: string,
    dto: UpdateEmployeeDto,
  ) {
    return this.dbService.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(employees)
        .where(
          and(eq(employees.id, employeeId), eq(employees.organizationId, identity.organizationId)),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Employee ${employeeId} not found in organization.`,
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

      const [updated] = await tx
        .update(employees)
        .set({
          ...(dto.officeId !== undefined ? { officeId: dto.officeId } : {}),
          ...(dto.defaultShiftId !== undefined ? { defaultShiftId: dto.defaultShiftId } : {}),
          ...(dto.department !== undefined ? { department: dto.department } : {}),
          ...(dto.transportEligible !== undefined
            ? { transportEligible: dto.transportEligible }
            : {}),
          ...(dto.emergencyContactName !== undefined
            ? { emergencyContactName: dto.emergencyContactName }
            : {}),
          ...(dto.emergencyContactPhone !== undefined
            ? { emergencyContactPhone: dto.emergencyContactPhone }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employeeId))
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'EMPLOYEE_UPDATED',
        entityType: 'employee',
        entityId: employeeId,
        beforeJson: existing as unknown as Record<string, unknown>,
        afterJson: updated as unknown as Record<string, unknown>,
      });

      return updated;
    });
  }

  async importCsv(identity: RequestIdentity, dto: ImportEmployeesCsvDto) {
    const rawRows = parseCsvLines(dto.csvText);
    if (rawRows.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'CSV payload must include header row and at least one employee row.',
      });
    }

    const [orgOffices, orgShifts] = await Promise.all([
      this.dbService.db
        .select()
        .from(offices)
        .where(eq(offices.organizationId, identity.organizationId)),
      this.dbService.db
        .select()
        .from(shifts)
        .where(eq(shifts.organizationId, identity.organizationId)),
    ]);

    const officeByCode = new Map(orgOffices.map((o) => [o.code, o]));
    const shiftByCode = new Map(orgShifts.map((s) => [s.code, s]));

    const errors: Array<{ row: number; message: string }> = [];
    let importedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const parsed = csvRowSchema.safeParse(rawRows[i]);
      if (!parsed.success) {
        errors.push({
          row: i + 2,
          message: parsed.error.issues.map((issue) => issue.message).join('; '),
        });
        continue;
      }

      const row = parsed.data;
      const office = officeByCode.get(row.officeCode);
      if (!office) {
        errors.push({ row: i + 2, message: `Unknown officeCode "${row.officeCode}"` });
        continue;
      }

      const shift = row.shiftCode ? shiftByCode.get(row.shiftCode) : undefined;
      if (row.shiftCode && !shift) {
        errors.push({ row: i + 2, message: `Unknown shiftCode "${row.shiftCode}"` });
        continue;
      }

      const [existingEmp] = await this.dbService.db
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            eq(employees.organizationId, identity.organizationId),
            eq(employees.employeeCode, row.employeeCode),
          ),
        )
        .limit(1);

      if (existingEmp) {
        skippedCount++;
        continue;
      }

      await this.createEmployee(identity, {
        email: row.email,
        phone: row.phone,
        fullName: row.fullName,
        officeId: office.id,
        defaultShiftId: shift?.id,
        employeeCode: row.employeeCode,
        department: row.department,
        transportEligible: true,
        pickupLocation:
          row.latitude !== undefined && row.longitude !== undefined
            ? {
                locationName: row.locationName ?? `${row.fullName} Pickup`,
                address: row.address ?? 'Hyderabad Pickup Point',
                corridorTag: row.corridorTag,
                latitude: row.latitude,
                longitude: row.longitude,
                geofenceRadiusM: 150,
              }
            : undefined,
      });
      importedCount++;
    }

    return { importedCount, skippedCount, errors };
  }

  async listSavedLocations(organizationId: string, employeeId: string) {
    const [emp] = await this.dbService.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)))
      .limit(1);

    if (!emp) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Employee ${employeeId} not found in organization.`,
      });
    }

    return this.dbService.db
      .select()
      .from(employeeLocations)
      .where(
        and(
          eq(employeeLocations.organizationId, organizationId),
          eq(employeeLocations.employeeId, employeeId),
        ),
      );
  }

  async addSavedLocation(
    organizationId: string,
    employeeId: string,
    dto: CreateSavedLocationDto,
  ) {
    return this.dbService.transaction(async (tx) => {
      const [emp] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)))
        .limit(1);

      if (!emp) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Employee ${employeeId} not found in organization.`,
        });
      }

      if (dto.isDefault) {
        await tx
          .update(employeeLocations)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(employeeLocations.organizationId, organizationId),
              eq(employeeLocations.employeeId, employeeId),
            ),
          );
      }

      const locMeta = await this.resolveLocalityFields(tx, organizationId, {
        localityId: dto.localityId,
        corridorTag: dto.corridorTag,
        locationName: dto.locationName,
        latitude: dto.latitude,
        longitude: dto.longitude,
      });

      const [created] = await tx
        .insert(employeeLocations)
        .values({
          organizationId,
          employeeId,
          locationName: dto.locationName,
          address: dto.address,
          corridorTag: dto.corridorTag ?? null,
          localityId: locMeta.localityId,
          normalizedLocality: locMeta.normalizedLocality,
          latitude: dto.latitude,
          longitude: dto.longitude,
          location: { x: dto.longitude, y: dto.latitude },
          googlePlaceId: dto.googlePlaceId ?? null,
          originalMapsUrl: dto.originalMapsUrl ?? null,
          geofenceRadiusM: dto.geofenceRadiusM,
          isDefault: dto.isDefault,
          verified: true,
        })
        .returning();

      return created;
    });
  }

  async resolveEmployeeByUserId(organizationId: string, userId: string) {
    const [emp] = await this.dbService.db
      .select()
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), eq(employees.userId, userId)))
      .limit(1);

    if (!emp) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Authenticated user has no employee transport profile in active organization.',
      });
    }
    return emp;
  }

  async getSelfProfile(identity: RequestIdentity) {
    const emp = await this.resolveEmployeeByUserId(identity.organizationId, identity.userId);
    const [
      [userRow],
      [officeRow],
      [orgRow],
      [settingsRow],
      availableOffices,
      availableShifts,
      locations,
    ] = await Promise.all([
      this.dbService.db.select().from(users).where(eq(users.id, identity.userId)).limit(1),
      this.dbService.db.select().from(offices).where(eq(offices.id, emp.officeId)).limit(1),
      this.dbService.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, identity.organizationId))
        .limit(1),
      this.dbService.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, identity.organizationId))
        .limit(1),
      this.dbService.db
        .select()
        .from(offices)
        .where(and(eq(offices.organizationId, identity.organizationId), eq(offices.isActive, true))),
      this.dbService.db
        .select()
        .from(shifts)
        .where(and(eq(shifts.organizationId, identity.organizationId), eq(shifts.isActive, true))),
      this.listSavedLocations(identity.organizationId, emp.id),
    ]);

    const defaultShift =
      availableShifts.find((s) => s.id === emp.defaultShiftId) ?? availableShifts[0] ?? null;

    return {
      employee: emp,
      user: userRow
        ? { id: userRow.id, email: userRow.email, phone: userRow.phone, fullName: userRow.fullName }
        : null,
      office: officeRow ?? null,
      organization: orgRow ?? null,
      settings: settingsRow ?? null,
      defaultShift,
      availableOffices,
      availableShifts,
      savedLocationsCount: locations.length,
    };
  }

  async updateSelfProfile(identity: RequestIdentity, dto: UpdateSelfProfileDto) {
    const emp = await this.resolveEmployeeByUserId(identity.organizationId, identity.userId);
    await this.updateEmployee(identity, emp.id, {
      defaultShiftId: dto.defaultShiftId,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactPhone: dto.emergencyContactPhone,
    });
    return this.getSelfProfile(identity);
  }

  async listSelfLocations(identity: RequestIdentity) {
    const emp = await this.resolveEmployeeByUserId(identity.organizationId, identity.userId);
    return this.dbService.db
      .select()
      .from(employeeLocations)
      .where(
        and(
          eq(employeeLocations.organizationId, identity.organizationId),
          eq(employeeLocations.employeeId, emp.id),
        ),
      )
      .orderBy(desc(employeeLocations.isDefault), desc(employeeLocations.createdAt));
  }

  async addSelfLocation(identity: RequestIdentity, dto: CreateSavedLocationDto) {
    const emp = await this.resolveEmployeeByUserId(identity.organizationId, identity.userId);
    return this.addSavedLocation(identity.organizationId, emp.id, dto);
  }

  async updateSelfLocation(
    identity: RequestIdentity,
    locationId: string,
    dto: UpdateSavedLocationDto,
  ) {
    const emp = await this.resolveEmployeeByUserId(identity.organizationId, identity.userId);
    return this.dbService.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(employeeLocations)
        .where(
          and(
            eq(employeeLocations.id, locationId),
            eq(employeeLocations.employeeId, emp.id),
            eq(employeeLocations.organizationId, identity.organizationId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Saved location ${locationId} not found.`,
        });
      }

      if (dto.isDefault) {
        await tx
          .update(employeeLocations)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(employeeLocations.organizationId, identity.organizationId),
              eq(employeeLocations.employeeId, emp.id),
            ),
          );
      }

      const nextLat = dto.latitude ?? existing.latitude;
      const nextLng = dto.longitude ?? existing.longitude;
      const nextCorridor = dto.corridorTag !== undefined ? dto.corridorTag : existing.corridorTag;
      const nextName = dto.locationName ?? existing.locationName;
      const nextLocalityInputId =
        dto.localityId !== undefined ? dto.localityId : existing.localityId;
      const locMeta = await this.resolveLocalityFields(tx, identity.organizationId, {
        localityId: nextLocalityInputId,
        corridorTag: nextCorridor,
        locationName: nextName,
        latitude: nextLat,
        longitude: nextLng,
      });

      const [updated] = await tx
        .update(employeeLocations)
        .set({
          ...(dto.locationName !== undefined ? { locationName: dto.locationName } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.corridorTag !== undefined ? { corridorTag: dto.corridorTag } : {}),
          localityId: locMeta.localityId,
          normalizedLocality: locMeta.normalizedLocality,
          ...(dto.latitude !== undefined || dto.longitude !== undefined
            ? { latitude: nextLat, longitude: nextLng, location: { x: nextLng, y: nextLat } }
            : {}),
          ...(dto.geofenceRadiusM !== undefined ? { geofenceRadiusM: dto.geofenceRadiusM } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          updatedAt: new Date(),
        })
        .where(eq(employeeLocations.id, locationId))
        .returning();

      return updated;
    });
  }
}

@ApiTags('Admin - Employees')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'List paginated employees in active organization' })
  list(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: paginationQuerySchema }) query: PaginationQuery,
  ) {
    return this.service.listByOrg(identity.organizationId, query);
  }

  @Post()
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Create employee and optional verified saved pickup location' })
  create(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: createEmployeeSchema }) dto: CreateEmployeeDto,
  ) {
    return this.service.createEmployee(identity, dto);
  }

  @Post('import')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Bulk import employees and pickup coordinates from CSV' })
  importCsv(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: importEmployeesCsvSchema }) dto: ImportEmployeesCsvDto,
  ) {
    return this.service.importCsv(identity, dto);
  }

  @Get(':employeeId')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'Get employee profile, saved locations, and historical trips' })
  getDetail(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('employeeId', { schema: uuidParamSchema }) employeeId: string,
  ) {
    return this.service.getDetail(identity.organizationId, employeeId);
  }

  @Patch(':employeeId')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Edit employee profile, shift, or transport eligibility' })
  update(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('employeeId', { schema: uuidParamSchema }) employeeId: string,
    @Body({ schema: updateEmployeeSchema }) dto: UpdateEmployeeDto,
  ) {
    return this.service.updateEmployee(identity, employeeId, dto);
  }

  @Get(':employeeId/trips')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'View employee historical trips' })
  listTrips(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('employeeId', { schema: uuidParamSchema }) employeeId: string,
  ) {
    return this.service.listHistoricalTrips(identity.organizationId, employeeId);
  }

  @Get(':employeeId/locations')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'List saved pickup locations for employee' })
  listLocations(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('employeeId', { schema: uuidParamSchema }) employeeId: string,
  ) {
    return this.service.listSavedLocations(identity.organizationId, employeeId);
  }

  @Post(':employeeId/locations')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Add coordinate-authoritative saved pickup location for employee' })
  addLocation(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('employeeId', { schema: uuidParamSchema }) employeeId: string,
    @Body({ schema: createSavedLocationSchema }) dto: CreateSavedLocationDto,
  ) {
    return this.service.addSavedLocation(identity.organizationId, employeeId, dto);
  }
}

@ApiTags('Employee - Self Profile & Locations')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('employee')
export class EmployeeSelfController {
  constructor(private readonly service: EmployeesService) {}

  @Get('profile')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Fetch authenticated employee profile, office, shifts, and policies' })
  getProfile(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.getSelfProfile(identity);
  }

  @Patch('profile')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Update employee default shift or emergency contact details' })
  updateProfile(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: updateSelfProfileSchema }) dto: UpdateSelfProfileDto,
  ) {
    return this.service.updateSelfProfile(identity, dto);
  }

  @Get('locations')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'List employee saved pickup locations' })
  listLocations(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.listSelfLocations(identity);
  }

  @Post('locations')
  @Idempotent()
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Save a verified pickup coordinate pin for employee rides' })
  addLocation(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: createSavedLocationSchema }) dto: CreateSavedLocationDto,
  ) {
    return this.service.addSelfLocation(identity, dto);
  }

  @Patch('locations/:locationId')
  @Roles('EMPLOYEE', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Update saved pickup location label, coordinates, or default flag' })
  updateLocation(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('locationId', { schema: uuidParamSchema }) locationId: string,
    @Body({ schema: updateSavedLocationSchema }) dto: UpdateSavedLocationDto,
  ) {
    return this.service.updateSelfLocation(identity, locationId, dto);
  }
}

@Module({
  imports: [AuditLogsModule],
  controllers: [EmployeesController, EmployeeSelfController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
