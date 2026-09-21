import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyUserRole, CompanyUserStatus, GlobalRole } from '@prisma/client';
import type { Request } from 'express';
import { COMPANY_ROLES_KEY } from '../../../common/decorators/company-roles.decorator';
import type { CurrentUserData } from '../../../common/decorators/current-user.decorator';

type AuthenticatedRequest = Request & { user?: CurrentUserData };

@Injectable()
export class CompanyRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<CompanyUserRole[]>(
      COMPANY_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!roles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (user?.globalRole === GlobalRole.SYSTEM_ADMIN) return true;

    if (!user?.companyUser) {
      throw new ForbiddenException(
        'This endpoint is only available to company users',
      );
    }
    if (user.companyUser.status !== CompanyUserStatus.ACTIVE) {
      throw new ForbiddenException('Company user is not active');
    }
    if (!roles.includes(user.companyUser.role)) {
      throw new ForbiddenException('You do not have permission to do this');
    }

    return true;
  }
}
