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
import { shifts } from '../../infrastructure/database/schema/index.js';
import { TRIP_DIRECTIONS } from '../../infrastructure/shared/enums.js';

export const createShiftSchema = z.object({
  officeId: z.string().uuid(),
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(48),
  direction: z.enum(TRIP_DIRECTIONS),
  shiftTimeLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  daysOfWeek: z.string().default('MON,TUE,WED,THU,FRI'),
});
export type CreateShiftDto = z.infer<typeof createShiftSchema>;

export const updateShiftSchema = createShiftSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateShiftDto = z.infer<typeof updateShiftSchema>;

const uuidParamSchema = z.string().uuid();

@Injectable()
export class ShiftsService {
  constructor(private readonly dbService: DatabaseService) {}

  listByOrg(organizationId: string) {
    return this.dbService.db
      .select()
      .from(shifts)
      .where(eq(shifts.organizationId, organizationId));
  }

  async createShift(organizationId: string, dto: CreateShiftDto) {
    const [created] = await this.dbService.db
      .insert(shifts)
      .values({ organizationId, ...dto })
      .returning();
    return created;
  }

  async updateShift(organizationId: string, shiftId: string, dto: UpdateShiftDto) {
    const [existing] = await this.dbService.db
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Shift ${shiftId} not found in organization.`,
      });
    }

    const [updated] = await this.dbService.db
      .update(shifts)
      .set({ ...dto, updatedAt: new Date() })
      .where(and(eq(shifts.id, shiftId), eq(shifts.organizationId, organizationId)))
      .returning();
    return updated;
  }
}

@ApiTags('Admin - Shifts')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/shifts')
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  @Get()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'EMPLOYEE', 'DRIVER', 'AUDITOR')
  @ApiOperation({ summary: 'List configured login/logout shifts for active organization' })
  list(@CurrentIdentity() identity: RequestIdentity) {
    return this.service.listByOrg(identity.organizationId);
  }

  @Post()
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Create a shift definition' })
  create(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: createShiftSchema }) dto: CreateShiftDto,
  ) {
    return this.service.createShift(identity.organizationId, dto);
  }

  @Patch(':shiftId')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Update shift schedule or active status' })
  update(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('shiftId', { schema: uuidParamSchema }) shiftId: string,
    @Body({ schema: updateShiftSchema }) dto: UpdateShiftDto,
  ) {
    return this.service.updateShift(identity.organizationId, shiftId, dto);
  }
}

@Module({
  controllers: [ShiftsController],
  providers: [ShiftsService],
  exports: [ShiftsService],
})
export class ShiftsModule {}
