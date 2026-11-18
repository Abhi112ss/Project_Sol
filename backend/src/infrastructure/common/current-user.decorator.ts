import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '../shared/enums.js';

export interface RequestIdentity {
  userId: string;
  organizationId: string;
  role: UserRole;
  vendorId: string | null;
  officeId: string | null;
}

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestIdentity => {
    const req = ctx.switchToHttp().getRequest<{ identity: RequestIdentity }>();
    return req.identity;
  },
);

