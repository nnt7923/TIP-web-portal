import { SchoolUserRole } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
export type JwtPayload = {
  sub: string;
  username: string;
  role: SchoolUserRole;
};
