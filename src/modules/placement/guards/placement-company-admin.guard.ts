import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentUserData } from '../../../common/decorators/current-user.decorator';
import { getPlacementCompanyId } from '../placement.policy';

@Injectable()
export class PlacementCompanyAdminGuard implements CanActivate {
  /** Kiểm tra hồ sơ COMPANY_ADMIN thật, kể cả khi tài khoản là SYSTEM_ADMIN. */
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUserData }>();
    if (!user) throw new UnauthorizedException();
    getPlacementCompanyId(user);
    return true;
  }
}
