import { SetMetadata } from '@nestjs/common';
import { SchoolUserRole } from '@prisma/client';

export const SCHOOL_ROLES_KEY = 'schoolRoles';

/** Khai báo các role của trường được phép truy cập endpoint. */
export const SchoolRoles = (...roles: SchoolUserRole[]) =>
  SetMetadata(SCHOOL_ROLES_KEY, roles);
