import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  assertAccountCanAuthenticate,
  currentAccountSelect,
} from './auth-account.policy';
import type { JwtPayload } from './guards/jwt-auth-guard';
import { TokenType } from './enums/token-type.enum';

/** Claims must already have a verified signature (or come from a consumed server ticket). */
export async function validateSession(
  prisma: PrismaService,
  redis: RedisService,
  payload: JwtPayload,
) {
  if (
    payload.tokenType !== TokenType.Access ||
    !payload.sub ||
    !payload.sid ||
    !payload.jti ||
    !payload.exp ||
    payload.exp * 1000 <= Date.now()
  ) {
    throw new UnauthorizedException('Invalid access token');
  }
  const [session, revoked] = await Promise.all([
    redis.connection.hgetall(`auth:session:${payload.sid}`),
    redis.connection.exists(`auth:revoked:${payload.jti}`),
  ]);
  if ((session.accountId ?? session.userId) !== payload.sub || revoked) {
    throw new UnauthorizedException('Access token has been revoked');
  }
  const account = await prisma.account.findUnique({
    where: { id: payload.sub },
    select: currentAccountSelect,
  });
  if (!account) throw new UnauthorizedException('Invalid account');
  try {
    assertAccountCanAuthenticate(account);
  } catch {
    throw new UnauthorizedException(
      'Invalid or inactive account or organization',
    );
  }
  return account;
}
