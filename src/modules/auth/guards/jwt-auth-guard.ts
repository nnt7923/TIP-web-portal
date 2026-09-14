import { SchoolUserRole } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TokenType } from '../enums/token-type.enum';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
export type JwtPayload = {
  sub: string;
  username: string;
  role: SchoolUserRole;
  sid: string;
  jti: string;
  tokenType: TokenType;
  iat?: number;
  exp?: number;
};
