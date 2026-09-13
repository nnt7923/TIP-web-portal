import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { SchoolUserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../../database/prisma.service';
import type { JwtPayload } from '../guards/jwt-auth-guard';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.schoolUser.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        universityId: true,
        username: true,
        role: true,
        status: true,
      },
    });

    if (!user || user.status !== SchoolUserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid or inactive account');
    }

    return user;
  }
}
