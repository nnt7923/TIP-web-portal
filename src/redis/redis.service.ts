import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(configService: ConfigService) {
    this.client = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 3,
      commandTimeout: 3000,
      keyPrefix: configService.get<string>('REDIS_KEY_PREFIX', ''),
      retryStrategy: (attempt) => Math.min(attempt * 100, 2_000),
    });
    // Do not let connection errors print provider URLs or credentials to runtime logs.
    this.client.on('error', () =>
      this.logger.warn('redis_connection_unavailable'),
    );
  }

  get connection(): Redis {
    return this.client;
  }

  ping(): Promise<string> {
    return this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
