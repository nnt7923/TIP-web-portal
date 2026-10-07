import { NotificationEventsService } from './modules/notifications/notification-events.service';
const notificationEvents = {
  profileApproved: jest.fn(),
  pendingProfile: jest.fn(),
  placement: jest.fn(),
  internshipRegistration: jest.fn(),
  application: jest.fn(),
  enrollment: jest.fn(),
} as unknown as NotificationEventsService;
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { clientIp } from './common/client-ip';
import { PrismaService } from './database/prisma.service';
import { EmailService } from './email/email.service';
import { RedisService } from './redis/redis.service';
import { AuthService } from './modules/auth/auth.service';
import { AuthRateLimitGuard } from './modules/auth/guards/auth-rate-limit.guard';
import type { ExecutionContext } from '@nestjs/common';
import { SystemAdminService } from './modules/system-admin/system-admin.service';
import { OpportunityService } from './modules/opportunity/opportunity.service';
import type { CurrentUserData } from './common/decorators/current-user.decorator';

describe('Client IP trust boundary', () => {
  it('limits one relayed visitor without blocking another visitor', async () => {
    const counts = new Map<string, number>();
    const redis = {
      connection: {
        eval: (_script: string, _keys: number, key: string) => {
          const count = (counts.get(key) ?? 0) + 1;
          counts.set(key, count);
          return Promise.resolve(count);
        },
      },
    };
    const guard = new AuthRateLimitGuard(
      redis as unknown as RedisService,
      new ConfigService({ ORIGIN_SECRET: 'test-secret' }),
    );
    const context = (ip: string) =>
      ({
        getHandler: () => ({ name: 'registerUser' }),
        switchToHttp: () => ({
          getRequest: () =>
            request({ 'x-secret': 'test-secret', 'x-tip-client-ip': ip }),
        }),
      }) as unknown as ExecutionContext;
    for (let attempt = 0; attempt < 5; attempt++)
      await guard.canActivate(context('192.0.2.1'));
    await expect(guard.canActivate(context('192.0.2.1'))).rejects.toMatchObject(
      { status: 429 },
    );
    await expect(guard.canActivate(context('192.0.2.2'))).resolves.toBe(true);
  });
  const original = process.env.VERCEL;
  afterEach(() => {
    if (original === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = original;
  });
  const request = (headers: Record<string, string>) =>
    ({ ip: '127.0.0.1', get: (name: string) => headers[name] }) as Request;
  it('separates visitors behind the authenticated web server', () => {
    const ip = (value: string) =>
      clientIp(
        request({ 'x-secret': 'test-secret', 'x-tip-client-ip': value }),
        'test-secret',
      );
    expect(ip('192.0.2.1')).toBe('192.0.2.1');
    expect(ip('192.0.2.2')).toBe('192.0.2.2');
  });
  it('rejects forged relay headers and trusts only Vercel ingress for mobile', () => {
    delete process.env.VERCEL;
    const req = request({
      'x-secret': 'wrong',
      'x-tip-client-ip': '192.0.2.9',
      'x-forwarded-for': '192.0.2.1',
    });
    expect(clientIp(req, 'test-secret')).toBe('127.0.0.1');
    process.env.VERCEL = '1';
    expect(clientIp(req, 'test-secret')).toBe('192.0.2.1');
    expect(clientIp(request({ 'x-forwarded-for': 'fake,192.0.2.1' }))).toBe(
      '127.0.0.1',
    );
  });
});

describe('Company registration delivery result', () => {
  it.each([true, false])(
    'returns otpSent=%s and preserves the account',
    async (success) => {
      const account = {
        id: 'account',
        email: 'test@example.invalid',
        companyUser: { companyId: 'company' },
      };
      const db = {
        account: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(account),
          delete: jest.fn(),
        },
      };
      const multi = {
        set: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      const mail = {
        sendOtp: success
          ? jest.fn().mockResolvedValue(undefined)
          : jest.fn().mockRejectedValue(new Error('unavailable')),
      };
      const redis = {
        connection: {
          set: jest.fn().mockResolvedValue('OK'),
          multi: () => multi,
          eval: jest.fn(),
        },
      };
      const service = new AuthService(
        db as unknown as PrismaService,
        new JwtService(),
        new ConfigService(),
        mail as unknown as EmailService,
        redis as unknown as RedisService,
        notificationEvents,
      );
      const result = await service.registerCompany({
        fullName: 'Test',
        username: 'test',
        email: account.email,
        password: 'test-password',
        companyName: 'Test company',
      });
      expect(result).toMatchObject({ otpSent: success, account });
      expect(db.account.delete).not.toHaveBeenCalled();
      expect(mail.sendOtp).toHaveBeenCalledTimes(1);
    },
  );
});

describe('System admin invariant', () => {
  function setup(count = 2) {
    const db = {
      account: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'target',
          globalRole: 'SYSTEM_ADMIN',
          status: 'ACTIVE',
        }),
        count: jest.fn().mockResolvedValue(count),
        update: jest.fn().mockResolvedValue({ id: 'target' }),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) =>
      fn(db),
    );
    const auth = { logoutAll: jest.fn() };
    return {
      db,
      auth,
      service: new SystemAdminService(
        db as unknown as PrismaService,
        auth as unknown as AuthService,
        notificationEvents,
      ),
    };
  }
  it('uses serializable isolation for count-and-disable and rejects the last admin', async () => {
    const { service, db } = setup(1);
    await expect(
      service.updateAccountStatus('actor', 'target', { status: 'SUSPENDED' }),
    ).rejects.toThrow('last active system admin');
    expect(db.account.update).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('returns a conflict on a concurrent transaction abort without revoking sessions', async () => {
    const { service, db, auth } = setup();
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.updateAccountStatus('actor', 'target', { status: 'SUSPENDED' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(auth.logoutAll).not.toHaveBeenCalled();
  });
});

describe('Opportunity updates preserve placements', () => {
  const user = { companyUser: { companyId: 'company' } } as CurrentUserData;
  function setup(linked = true) {
    const db = {
      opportunity: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'job',
          companyId: 'company',
          type: 'INTERNSHIP',
          status: 'CLOSED',
          applicationDeadline: null,
        }),
        update: jest.fn().mockResolvedValue({ id: 'job' }),
      },
      placement: {
        findFirst: jest
          .fn()
          .mockResolvedValue(linked ? { id: 'placement' } : null),
      },
      application: { count: jest.fn().mockResolvedValue(3) },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) =>
      fn(db),
    );
    return {
      db,
      service: new OpportunityService(db as unknown as PrismaService),
    };
  }
  it.each([
    { type: 'JOB' as const },
    { status: 'CANCELLED' as const },
    { status: 'DRAFT' as const },
  ])('rejects incompatible updates %o', async (dto) => {
    const { service, db } = setup();
    await expect(service.update(user, 'job', dto)).rejects.toThrow(
      'linked to a non-cancelled placement',
    );
    expect(db.opportunity.update).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('allows unrelated edits and cancellation when no placement is linked', async () => {
    await expect(
      setup().service.update(user, 'job', { title: 'New title' }),
    ).resolves.toMatchObject({ id: 'job' });
    await expect(
      setup(false).service.update(user, 'job', { status: 'CANCELLED' }),
    ).resolves.toMatchObject({ id: 'job' });
  });
  it('does not lower vacancies below accepted applications', async () => {
    await expect(
      setup().service.update(user, 'job', { vacancies: 2 }),
    ).rejects.toThrow('accepted applications');
  });
});
