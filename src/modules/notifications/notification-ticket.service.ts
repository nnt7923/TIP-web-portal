import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../database/prisma.service';
import { validateSession } from '../auth/validate-session';
import type { JwtPayload } from '../auth/guards/jwt-auth-guard';
import { RATE_LIMIT } from '../auth/redis-scripts';
import { NotificationDeliveryService } from './notification-delivery.service';

@Injectable()
export class NotificationTicketService {
  private readonly jwt = new JwtService();
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async rateLimit(
    kind: 'ticket' | 'handshake',
    identity: string,
    limit: number,
  ) {
    const hash = createHash('sha256').update(identity).digest('hex');
    const count = await this.redis.connection.eval(
      RATE_LIMIT,
      1,
      `${this.delivery.prefix}:rate:${kind}:${hash}`,
      60,
    );
    if (Number(count) > limit)
      throw new HttpException('Too many requests. Try again later.', 429);
  }

  async issue(authorization: string | undefined, accountId: string) {
    if (!this.delivery.enabled)
      throw new ServiceUnavailableException({
        code: 'REALTIME_DISABLED',
        message: 'Realtime disabled',
      });
    await this.rateLimit('ticket', accountId, 30);
    let claims: JwtPayload;
    try {
      claims = await this.jwt.verifyAsync<JwtPayload>(
        authorization?.replace(/^Bearer\s+/i, '') ?? '',
        {
          secret: this.config.getOrThrow<string>('JWT_SECRET'),
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
    if (claims.sub !== accountId) throw new UnauthorizedException();
    await this.validate(claims);
    const ticket = randomBytes(32).toString('base64url');
    const ttl = Math.min(60, Math.floor(claims.exp! - Date.now() / 1000));
    if (ttl < 1) throw new UnauthorizedException();
    await this.redis.connection.set(
      this.key(ticket),
      JSON.stringify(claims),
      'EX',
      ttl,
    );
    return {
      ticket,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  async consume(ticket: unknown): Promise<JwtPayload> {
    if (typeof ticket !== 'string' || !/^[\w-]{43}$/.test(ticket))
      throw new UnauthorizedException('Invalid ticket');
    const value = await this.redis.connection.getdel(this.key(ticket));
    if (!value) throw new UnauthorizedException('Invalid or expired ticket');
    const claims = JSON.parse(value) as JwtPayload;
    await this.validate(claims);
    return claims;
  }
  validate(claims: JwtPayload) {
    return validateSession(this.prisma, this.redis, claims);
  }
  private key(ticket: string) {
    return `${this.delivery.prefix}:ticket:${createHash('sha256').update(ticket).digest('hex')}`;
  }
}
