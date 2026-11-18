import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../shared/enums.js';

export const ROLES_KEY = 'sol_roles';
export const IS_PUBLIC_KEY = 'sol_is_public';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

