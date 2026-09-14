import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole } from '@prisma/client';
import type { Request } from 'express';
import { GLOBAL_ROLES_KEY } from '../../../common/decorators/global-roles.decorator';
import type { CurrentUserData } from '../../../common/decorators/current-user.decorator';

type AuthenticatedRequest = Request & { user?: CurrentUserData };

@Injectable()
export class GlobalRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<GlobalRole[]>(
      GLOBAL_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowedRoles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.globalRole;

    if (!role || !allowedRoles.includes(role)) {
      throw new ForbiddenException('You do not have permission to do this');
    }

    return true;
  }
}
