import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  currentAccountSelect,
  assertAccountCanAuthenticate,
} from '../auth-account.policy';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { TokenType } from '../enums/token-type.enum';
import type { JwtPayload } from '../guards/jwt-auth-guard';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (
      payload.tokenType !== TokenType.Access ||
      !payload.sub ||
      !payload.sid ||
      !payload.jti
    ) {
      throw new UnauthorizedException('Invalid access token');
    }

    const [session, isRevoked] = await Promise.all([
      this.redisService.connection.hgetall(`auth:session:${payload.sid}`),
      this.redisService.connection.exists(`auth:revoked:${payload.jti}`),
    ]);
    const sessionAccountId = session.accountId ?? session.userId;

    if (sessionAccountId !== payload.sub || isRevoked) {
      throw new UnauthorizedException('Access token has been revoked');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: payload.sub },
      select: currentAccountSelect,
    });
    if (!account) throw new UnauthorizedException('Invalid account');
    try {
      assertAccountCanAuthenticate(account);
    } catch {
      throw new UnauthorizedException(
        'Invalid or inactive account or university',
      );
    }

    return account;
  }
}
