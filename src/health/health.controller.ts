import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'up'),
      this.redis.ping().then(() => 'up'),
    ]);

    return {
      status: 'ok',
      services: {
        database,
        redis,
        cloudinary: this.configService.get<string>('CLOUDINARY_CLOUD_NAME')
          ? 'configured'
          : 'not_configured',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
