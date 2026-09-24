import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailService } from '../../email/email.service';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { RegisterUniversityDto } from './dto/register-university.dto';
import { assertAccountCanAuthenticate } from './auth-account.policy';
import { SystemAdminService } from '../system-admin/system-admin.service';
import { SystemAdminController } from '../system-admin/system-admin.controller';
import { GlobalRolesGuard } from './guards/global-roles.guard';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { getUniversityId } from '../../common/utils/university-scope.util';

const credentials = {
  fullName: ' Person ',
  username: ' person ',
  email: ' Person@Example.test ',
  password: 'test-password',
  phone: ' 123 ',
};
const school = {
  ...credentials,
  universityName: ' New University ',
  universityCode: ' tip ',
  website: 'https://example.test',
};

describe('Personal and university registration', () => {
  const account = {
    id: 'account',
    email: 'person@example.test',
    schoolUser: null,
  };
  let prisma: {
    account: { findFirst: jest.Mock; create: jest.Mock };
    university: { findFirst: jest.Mock };
  };
  let service: AuthService;
  let sendOtp: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      account: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(account),
      },
      university: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      new JwtService(),
      new ConfigService(),
      {} as EmailService,
      {} as RedisService,
    );
    jest
      .spyOn(
        service as unknown as { hashPassword(value: string): Promise<string> },
        'hashPassword',
      )
      .mockResolvedValue('hashed-password');
    sendOtp = jest
      .spyOn(
        service as unknown as { sendOtp(...args: string[]): Promise<void> },
        'sendOtp',
      )
      .mockResolvedValue(undefined);
  });

  it('creates a USER without a profile or caller-supplied privileges', async () => {
    const result = await service.registerUser({
      ...credentials,
      globalRole: 'SYSTEM_ADMIN',
    } as RegisterUserDto);
    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fullName: 'Person',
          username: 'person',
          email: 'person@example.test',
          phone: '123',
          passwordHash: 'hashed-password',
          globalRole: 'USER',
          status: 'ACTIVE',
        },
      }),
    );
    expect(prisma.university.findFirst).not.toHaveBeenCalled();
    expect(sendOtp).toHaveBeenCalledWith(
      'account',
      'person@example.test',
      'email_verification',
    );
    expect(result.otpSent).toBe(true);
    const select = (
      prisma.account.create.mock.calls[0] as [
        { select: Record<string, unknown> },
      ]
    )[0].select;
    expect(select).not.toHaveProperty('passwordHash');
  });

  it('atomically creates a PENDING university and PENDING UNIVERSITY_ADMIN profile', async () => {
    await service.registerUniversity(school);
    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          globalRole: 'USER',
          schoolUser: {
            create: {
              role: 'UNIVERSITY_ADMIN',
              status: 'PENDING',
              university: {
                create: {
                  name: 'New University',
                  code: 'TIP',
                  website: 'https://example.test',
                  address: undefined,
                  status: 'PENDING',
                },
              },
            },
          },
        }) as unknown,
      }),
    );
  });

  it('rejects duplicate accounts and university codes without sending email', async () => {
    prisma.account.findFirst.mockResolvedValueOnce({ id: 'existing' });
    await expect(service.registerUser(credentials)).rejects.toBeInstanceOf(
      ConflictException,
    );
    prisma.university.findFirst.mockResolvedValueOnce({
      id: 'existing-school',
    });
    await expect(service.registerUniversity(school)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.account.create).not.toHaveBeenCalled();
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('maps a concurrent unique constraint failure to conflict', async () => {
    prisma.account.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6',
      }),
    );
    await expect(service.registerUniversity(school)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('reports mail failure while preserving the unverified registration for resend OTP', async () => {
    sendOtp.mockRejectedValueOnce(new Error('Mail unavailable'));
    const result = await service.registerUniversity(school);
    expect(result).toMatchObject({ otpSent: false, account });
    expect(prisma.account.create).toHaveBeenCalledTimes(1);
  });

  it('validates both DTOs and rejects injected status/role or missing school fields', async () => {
    const opts = { whitelist: true, forbidNonWhitelisted: true };
    expect(
      await validate(plainToInstance(RegisterUserDto, credentials), opts),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(RegisterUniversityDto, school), opts),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(RegisterUniversityDto, credentials),
          opts,
        )
      ).length,
    ).toBeGreaterThan(0);
    const errors = await validate(
      plainToInstance(RegisterUserDto, {
        ...credentials,
        globalRole: 'SYSTEM_ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      }),
      opts,
    );
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['globalRole', 'status', 'emailVerifiedAt']),
    );
  });
});

describe('Registration login policy', () => {
  const base = {
    id: 'account',
    username: 'person',
    email: 'person@example.test',
    fullName: 'Person',
    globalRole: 'USER',
    status: 'ACTIVE',
    deletedAt: null,
    emailVerifiedAt: new Date(),
    student: null,
    schoolUser: null,
    companyUser: null,
  } as const;
  it('allows verified personal accounts, but blocks unverified, disabled and deleted accounts', () => {
    expect(() => assertAccountCanAuthenticate(base)).not.toThrow();
    for (const changed of [
      { emailVerifiedAt: null },
      { status: 'SUSPENDED' as const },
      { deletedAt: new Date() },
    ]) {
      expect(() =>
        assertAccountCanAuthenticate({ ...base, ...changed }),
      ).toThrow(ForbiddenException);
    }
  });
  it('keeps organization profile approval mandatory', () => {
    const pending = {
      ...base,
      schoolUser: {
        status: 'PENDING',
        role: 'UNIVERSITY_ADMIN',
        university: { status: 'PENDING' },
      },
    } as unknown as Parameters<typeof assertAccountCanAuthenticate>[0];
    expect(() => assertAccountCanAuthenticate(pending)).toThrow(
      ForbiddenException,
    );
  });
});

it('does not grant personal accounts university scope or permission to approve registrations', () => {
  const user = {
    globalRole: 'USER',
    schoolUser: null,
    student: null,
    companyUser: null,
  } as CurrentUserData;
  expect(() => getUniversityId(user)).toThrow(ForbiddenException);
  const context = {
    getClass: () => SystemAdminController,
    getHandler: () =>
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Reflector reads metadata without invoking the handler.
      SystemAdminController.prototype.approveUniversityRegistration,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  expect(() =>
    new GlobalRolesGuard(new Reflector()).canActivate(context),
  ).toThrow(ForbiddenException);
});

describe('System Admin approves university registration', () => {
  const target = {
    id: 'account',
    globalRole: 'USER',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    deletedAt: null,
    schoolUser: {
      id: 'profile',
      universityId: 'university',
      role: 'UNIVERSITY_ADMIN',
      status: 'PENDING',
      university: { status: 'PENDING' },
    },
  };
  function setup(account: unknown = target) {
    const tx = {
      account: { findUnique: jest.fn().mockResolvedValue(account) },
      university: { update: jest.fn() },
      schoolUser: { update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    return {
      tx,
      prisma,
      service: new SystemAdminService(
        prisma as unknown as PrismaService,
        {} as AuthService,
      ),
    };
  }
  it('verifies school, activates its admin and records audit in a serializable transaction', async () => {
    const { tx, prisma, service } = setup();
    await service.approveUniversityRegistration('system-admin', 'account');
    expect(tx.university.update).toHaveBeenCalledWith({
      where: { id: 'university' },
      data: { status: 'VERIFIED' },
    });
    expect(tx.schoolUser.update).toHaveBeenCalledWith({
      where: { id: 'profile' },
      data: { status: 'ACTIVE' },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'system-admin',
          action: 'UNIVERSITY_REGISTRATION_APPROVED',
        }) as unknown,
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('rejects unverified email, disabled account, wrong role, already approved and suspended schools before writes', async () => {
    for (const account of [
      { ...target, emailVerifiedAt: null },
      { ...target, status: 'SUSPENDED' },
      { ...target, globalRole: 'SYSTEM_ADMIN' },
      { ...target, schoolUser: { ...target.schoolUser, role: 'STAFF' } },
      { ...target, schoolUser: { ...target.schoolUser, status: 'ACTIVE' } },
      {
        ...target,
        schoolUser: {
          ...target.schoolUser,
          university: { status: 'SUSPENDED' },
        },
      },
    ]) {
      const { tx, service } = setup(account);
      await expect(
        service.approveUniversityRegistration('admin', 'account'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.university.update).not.toHaveBeenCalled();
      expect(tx.schoolUser.update).not.toHaveBeenCalled();
    }
  });
});
