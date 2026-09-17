import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccountStatus,
  GlobalRole,
  SchoolUserRole,
  SchoolUserStatus,
  StudentStatus,
} from '@prisma/client';
import type { Request } from 'express';

export type CurrentUserData = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  globalRole: GlobalRole;
  status: AccountStatus;
  emailVerifiedAt: Date | null;
  schoolUser: {
    id: string;
    universityId: string;
    role: SchoolUserRole;
    status: SchoolUserStatus;
  } | null;
  student: {
    id: string;
    universityId: string;
    status: StudentStatus;
  } | null;
};

type RequestWithCurrentUser = Request & {
  user?: CurrentUserData;
};

/** Returns the authenticated user, or one selected user field, from request.user. */
export const CurrentUser = createParamDecorator(
  (
    field: keyof CurrentUserData | undefined,
    context: ExecutionContext,
  ): CurrentUserData | CurrentUserData[keyof CurrentUserData] => {
    const request = context.switchToHttp().getRequest<RequestWithCurrentUser>();

    if (!request.user) {
      throw new UnauthorizedException('Authenticated user was not found');
    }

    return field ? request.user[field] : request.user;
  },
);
