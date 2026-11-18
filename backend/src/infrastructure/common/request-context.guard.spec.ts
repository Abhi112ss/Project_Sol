import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import type { AppConfigService } from '../config/app-config.service.js';
import type { DatabaseService } from '../database/database.service.js';
import { RequestContextGuard } from './request-context.guard.js';

function createHttpContext(headers: Record<string, string>) {
  const req = {
    header: (name: string) => headers[name.toLowerCase()],
    identity: undefined as unknown,
  };
  return {
    req,
    context: {
      getType: () => 'http',
      getHandler: () => () => undefined,
      getClass: () => class Dummy {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext,
  };
}

describe('RequestContextGuard', () => {
  const orgId = '11111111-1111-4111-8111-111111111101';
  const userId = '55555555-5555-4555-8555-555555555502';

  it('allows @Public routes without headers', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValueOnce(true) } as unknown as Reflector;
    const config = { isDevAuthBypassEnabled: false } as AppConfigService;
    const dbService = {} as DatabaseService;
    const guard = new RequestContextGuard(reflector, config, dbService);
    const { context } = createHttpContext({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('fails closed in production when dev bypass is disabled', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector;
    const config = { isDevAuthBypassEnabled: false } as AppConfigService;
    const guard = new RequestContextGuard(reflector, config, {} as DatabaseService);
    const { context } = createHttpContext({
      'x-dev-user-id': userId,
      'x-dev-org-id': orgId,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects callers missing membership in requested organization', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector;
    const config = { isDevAuthBypassEnabled: true } as AppConfigService;
    const dbService = {
      db: {
        select: () => ({
          from: () => ({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      },
    } as unknown as DatabaseService;

    const guard = new RequestContextGuard(reflector, config, dbService);
    const { context } = createHttpContext({
      'x-dev-user-id': userId,
      'x-dev-org-id': orgId,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('enforces @Roles RBAC checks on matched membership', async () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['ORG_ADMIN']),
    } as unknown as Reflector;
    const config = { isDevAuthBypassEnabled: true } as AppConfigService;
    const dbService = {
      db: {
        select: () => ({
          from: () => ({
            where: vi.fn().mockResolvedValue([
              {
                userId,
                organizationId: orgId,
                role: 'EMPLOYEE',
                vendorId: null,
                officeId: null,
                isActive: true,
              },
            ]),
          }),
        }),
      },
    } as unknown as DatabaseService;

    const guard = new RequestContextGuard(reflector, config, dbService);
    const { context } = createHttpContext({
      'x-dev-user-id': userId,
      'x-dev-org-id': orgId,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});

