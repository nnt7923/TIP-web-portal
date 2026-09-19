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

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  /** Giới hạn theo IP và hành động; không tin header X-Forwarded-For tự gửi. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const action = context.getHandler().name;
    const limit = ['register', 'resendOtp'].includes(action) ? 5 : 30;
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
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
