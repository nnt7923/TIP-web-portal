import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { SchoolUserStatus } from '@prisma/client';
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
      !payload.sid ||
      !payload.jti
    ) {
      throw new UnauthorizedException('Invalid access token');
    }

    const [sessionExists, isRevoked] = await Promise.all([
      this.redisService.connection.exists(`auth:session:${payload.sid}`),
      this.redisService.connection.exists(`auth:revoked:${payload.jti}`),
    ]);

    if (!sessionExists || isRevoked) {
      throw new UnauthorizedException('Access token has been revoked');
    }

    const user = await this.prisma.schoolUser.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        universityId: true,
        username: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    if (
      !user ||
      user.status !== SchoolUserStatus.ACTIVE ||
      !user.emailVerifiedAt
    ) {
      throw new UnauthorizedException('Invalid or inactive account');
    }

    return user;
  }
}
