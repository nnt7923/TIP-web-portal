import { ForbiddenException } from '@nestjs/common';
import type { CurrentUserData } from '../decorators/current-user.decorator';

/** Returns the company scope of the authenticated company user. */
export function getCompanyId(user: CurrentUserData): string {
  if (!user.companyUser) {
    throw new ForbiddenException('Company user profile was not found');
  }

  return user.companyUser.companyId;
}
