import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SchoolUserRole, SchoolUserStatus } from '@prisma/client';
import type { Request } from 'express';
import { SCHOOL_ROLES_KEY } from '../../../common/decorators/school-roles.decorator';
import type { CurrentUserData } from '../../../common/decorators/current-user.decorator';

type AuthenticatedRequest = Request & {
  user?: CurrentUserData;
};

@Injectable()
export class SchoolRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<SchoolUserRole[]>(
      SCHOOL_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Endpoint không dùng @SchoolRoles() thì không cần kiểm tra role.
    if (!allowedRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const schoolUser = request.user?.schoolUser;

    if (!schoolUser) {
      throw new ForbiddenException(
        'This endpoint is only available to school users',
      );
    }

    if (schoolUser.status !== SchoolUserStatus.ACTIVE) {
      throw new ForbiddenException('School user is not active');
    }

    if (!allowedRoles.includes(schoolUser.role)) {
      throw new ForbiddenException('You do not have permission to do this');
    }

    return true;
  }
}
