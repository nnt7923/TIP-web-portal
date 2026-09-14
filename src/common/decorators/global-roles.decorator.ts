import { SetMetadata } from '@nestjs/common';
import { GlobalRole } from '@prisma/client';

export const GLOBAL_ROLES_KEY = 'globalRoles';

/** Declares which global Account roles may access an endpoint. */
export const GlobalRoles = (...roles: GlobalRole[]) =>
  SetMetadata(GLOBAL_ROLES_KEY, roles);
