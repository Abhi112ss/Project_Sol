import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import type { Request } from 'express';
import { z } from 'zod';
import { AppConfigService } from '../config/app-config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { memberships } from '../database/schema/index.js';
import { USER_ROLES, type UserRole } from '../shared/enums.js';
import type { RequestIdentity } from './current-user.decorator.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './roles.decorator.js';

const uuidSchema = z.string().uuid();
const roleSchema = z.enum(USER_ROLES);

@Injectable()
export class RequestContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
    private readonly dbService: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    if (!this.config.isDevAuthBypassEnabled) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required in production mode (Phase 8 JWT pending).',
      });
    }

    const req = context
      .switchToHttp()
      .getRequest<Request & { identity?: RequestIdentity }>();
    const rawUserId = req.header('x-dev-user-id');
    const rawOrgId = req.header('x-dev-org-id');
    const rawRole = req.header('x-dev-role');

    const userIdParse = uuidSchema.safeParse(rawUserId);
    const orgIdParse = uuidSchema.safeParse(rawOrgId);
    if (!userIdParse.success || !orgIdParse.success) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Valid X-Dev-User-Id and X-Dev-Org-Id UUID headers are required in dev mode.',
      });
    }

    let requestedRole: UserRole | undefined;
    if (rawRole !== undefined) {
      const parsedRole = roleSchema.safeParse(rawRole);
      if (!parsedRole.success) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'Invalid X-Dev-Role header value.',
        });
      }
      requestedRole = parsedRole.data;
    }

    const activeMemberships = await this.dbService.db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userIdParse.data),
          eq(memberships.organizationId, orgIdParse.data),
          eq(memberships.isActive, true),
        ),
      );

    if (activeMemberships.length === 0) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: 'Caller has no active membership in the requested organization.',
      });
    }

    const matchedMembership = requestedRole
      ? activeMemberships.find((m) => m.role === requestedRole)
      : activeMemberships[0];

    if (!matchedMembership) {
      throw new ForbiddenException({
        code: 'ROLE_FORBIDDEN',
        message: `Caller does not hold role ${requestedRole} in this organization.`,
      });
    }

    const identity: RequestIdentity = {
      userId: matchedMembership.userId,
      organizationId: matchedMembership.organizationId,
      role: matchedMembership.role,
      vendorId: matchedMembership.vendorId,
      officeId: matchedMembership.officeId,
    };
    req.identity = identity;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      requiredRoles &&
      requiredRoles.length > 0 &&
      identity.role !== 'PLATFORM_SUPER_ADMIN' &&
      !requiredRoles.includes(identity.role)
    ) {
      throw new ForbiddenException({
        code: 'ROLE_FORBIDDEN',
        message: `Role ${identity.role} is not authorized for this operation.`,
      });
    }

    return true;
  }
}

