import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports infrastructure status', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaService;
    const redis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    } as unknown as RedisService;
    const config = {
      get: jest.fn().mockReturnValue('demo-cloud'),
    } as unknown as ConfigService;
    const controller = new HealthController(prisma, redis, config);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.services).toEqual({
      database: 'up',
      redis: 'up',
      cloudinary: 'configured',
    });
  });
});
