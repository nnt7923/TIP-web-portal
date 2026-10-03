import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { RedisService } from '../../../redis/redis.service';
import { RATE_LIMIT } from '../redis-scripts';
import { ConfigService } from '@nestjs/config';
import { clientIp } from '../../../common/client-ip';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /** Giới hạn theo IP và hành động; không tin header X-Forwarded-For tự gửi. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const action = context.getHandler().name;
    const limit = [
      'register',
      'registerUser',
      'registerUniversity',
      'registerCompany',
      'resendOtp',
    ].includes(action)
      ? 5
      : 30;
    const ip = clientIp(request, this.config.get<string>('ORIGIN_SECRET'));
    const key = createHash('sha256').update(`${action}:${ip}`).digest('hex');
    const count = await this.redis.connection.eval(
      RATE_LIMIT,
      1,
      `auth:rate:ip:${key}`,
      60,
    );
    if (Number(count) > limit)
      throw new HttpException(
        'Too many requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return true;
  }
}
