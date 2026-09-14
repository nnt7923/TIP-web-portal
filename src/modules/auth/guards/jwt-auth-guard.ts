import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GlobalRole, SchoolUserRole } from '@prisma/client';
import { TokenType } from '../enums/token-type.enum';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
export type JwtPayload = {
  sub: string;
  username: string;
  globalRole: GlobalRole;
  schoolRole?: SchoolUserRole;
  universityId?: string;
  sid: string;
  jti: string;
  tokenType: TokenType;
  iat?: number;
  exp?: number;
};
