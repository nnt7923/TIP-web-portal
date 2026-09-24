import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { EmailService } from '../../email/email.service';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from './auth.service';
import { REMOVE_ALL_SESSIONS } from './redis-scripts';

describe('Auth session and password flows', () => {
  const account = {
    id: 'user',
    username: 'person',
    globalRole: 'USER',
    status: 'ACTIVE',
    deletedAt: null,
    emailVerifiedAt: new Date(),
    student: null,
    schoolUser: null,
    companyUser: null,
    passwordHash: 'hash',
  };
  let service: AuthService;
  let jwt: JwtService;
  let token: string;
  let prisma: { account: { findUnique: jest.Mock; update: jest.Mock } };
  let redis: { hgetall: jest.Mock; eval: jest.Mock; multi: jest.Mock };

  beforeEach(async () => {
    prisma = {
      account: {
        findUnique: jest.fn().mockResolvedValue(account),
        update: jest.fn().mockResolvedValue(account),
      },
    };
    const multi = {
      del: jest.fn().mockReturnThis(),
      srem: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    redis = {
      hgetall: jest
        .fn()
        .mockResolvedValue({ accountId: 'user', refreshJti: 'old-jti' }),
      eval: jest.fn().mockResolvedValue(1),
      multi: jest.fn().mockReturnValue(multi),
    };
    jwt = new JwtService();
    const config = new ConfigService({
      JWT_SECRET: 'unit-test-access-secret',
      JWT_REFRESH_SECRET: 'unit-test-refresh-secret',
    });
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      {} as EmailService,
      { connection: redis } as unknown as RedisService,
    );
    token = await jwt.signAsync(
      { sub: 'user', sid: 'session', jti: 'old-jti', tokenType: 'refresh' },
      { secret: 'unit-test-refresh-secret', expiresIn: '1h' },
    );
  });

  it('rotates into signed access and refresh tokens using atomic session storage', async () => {
    const result = await service.refreshToken(token);
    expect(
      await jwt.verifyAsync(result.accessToken, {
        secret: 'unit-test-access-secret',
      }),
    ).toMatchObject({ sub: 'user', tokenType: 'access', sid: 'session' });
    expect(
      await jwt.verifyAsync(result.refreshToken, {
        secret: 'unit-test-refresh-secret',
      }),
    ).toMatchObject({ sub: 'user', tokenType: 'refresh', sid: 'session' });
    expect(redis.eval).toHaveBeenCalled();
  });

  it('returns the winning token pair when atomic rotation reports a concurrent request', async () => {
    redis.hgetall.mockResolvedValueOnce({
      accountId: 'user',
      refreshJti: 'winning-jti',
    });
    redis.eval.mockResolvedValueOnce(
      JSON.stringify({
        accessToken: 'winning-access',
        refreshToken: 'winning-refresh',
        refreshJti: 'winning-jti',
      }),
    );
    expect(await service.refreshToken(token)).toEqual({
      accessToken: 'winning-access',
      refreshToken: 'winning-refresh',
    });
  });

  it('cannot refresh a revoked session, a blocked account or an invalid signed token', async () => {
    redis.hgetall.mockResolvedValueOnce({});
    await expect(service.refreshToken(token)).rejects.toThrow(
      UnauthorizedException,
    );
    prisma.account.findUnique.mockResolvedValueOnce({
      ...account,
      status: 'SUSPENDED',
    });
    await expect(service.refreshToken(token)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.refreshToken('invalid')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('rejects reuse outside the Redis concurrency window', async () => {
    redis.eval.mockResolvedValueOnce(0);
    await expect(service.refreshToken(token)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('wrong current password cannot change the password or revoke other sessions', async () => {
    jest
      .spyOn(
        service as unknown as {
          verifyPassword(value: string, hash: string): Promise<boolean>;
        },
        'verifyPassword',
      )
      .mockResolvedValue(false);
    await expect(
      service.changePassword('user', {
        currentPassword: 'wrong',
        newPassword: 'new-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('successful password change revokes every session', async () => {
    jest
      .spyOn(
        service as unknown as {
          verifyPassword(value: string, hash: string): Promise<boolean>;
        },
        'verifyPassword',
      )
      .mockResolvedValue(true);
    jest
      .spyOn(
        service as unknown as { hashPassword(value: string): Promise<string> },
        'hashPassword',
      )
      .mockResolvedValue('new-hash');
    await service.changePassword('user', {
      currentPassword: 'old-password',
      newPassword: 'new-password',
    });
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'user' },
      data: { passwordHash: 'new-hash' },
    });
    expect(redis.eval).toHaveBeenCalledWith(
      REMOVE_ALL_SESSIONS,
      1,
      'auth:user-sessions:user',
      'auth:session:',
    );
  });

  it('expired or already-consumed password-reset token cannot update a password', async () => {
    const read = jest
      .spyOn(
        service as unknown as {
          readPasswordResetToken(value: string): Promise<string | null>;
        },
        'readPasswordResetToken',
      )
      .mockResolvedValue(null);
    await expect(
      service.resetPassword({
        resetToken: 'expired',
        newPassword: 'new-password',
      }),
    ).rejects.toThrow(BadRequestException);
    read.mockResolvedValue('user');
    jest
      .spyOn(
        service as unknown as {
          verifyPassword(value: string, hash: string): Promise<boolean>;
        },
        'verifyPassword',
      )
      .mockResolvedValue(false);
    jest
      .spyOn(
        service as unknown as {
          consumePasswordResetToken(
            value: string,
            id: string,
          ): Promise<boolean>;
        },
        'consumePasswordResetToken',
      )
      .mockResolvedValue(false);
    await expect(
      service.resetPassword({
        resetToken: 'used',
        newPassword: 'new-password',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});
