import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { ApplicationService } from './application.service';

const studentUser = {
  id: 'account',
  globalRole: 'USER',
  student: { id: 'student', universityId: 'school', status: 'ACTIVE' },
} as CurrentUserData;
const recruiter = {
  id: 'recruiter',
  globalRole: 'USER',
  companyUser: {
    companyId: 'company',
    status: 'ACTIVE',
    role: 'COMPANY_ADMIN',
  },
} as CurrentUserData;

function setup(cvUrl: string | null = 'https://example.invalid/cv.pdf') {
  const db = {
    student: {
      findFirst: jest
        .fn<Promise<unknown>, [Prisma.StudentFindFirstArgs]>()
        .mockResolvedValue({ id: 'student', universityId: 'school', cvUrl }),
    },
    opportunity: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'OPEN',
        applicationDeadline: new Date(Date.now() + 86400000),
        company: { status: 'VERIFIED' },
      }),
    },
    application: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'application', status: 'PENDING' }),
      findFirst: jest.fn<Promise<unknown>, [Prisma.ApplicationFindFirstArgs]>(),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit' }) },
  };
  const events = {
    transaction: jest.fn((work: (tx: typeof db) => Promise<unknown>) =>
      work(db),
    ),
    application: jest.fn(),
  };
  return {
    db,
    events,
    service: new ApplicationService(
      db as unknown as PrismaService,
      events as unknown as NotificationEventsService,
    ),
  };
}

describe('Application CV requirement and visibility', () => {
  it.each([
    null,
    '',
    '  ',
    'javascript:alert(1)',
    'not-a-url',
    'https://user:password@example.invalid/cv.pdf',
  ])(
    'rejects a missing or unusable saved CV (%s) without creating application, audit or notification',
    async (url) => {
      const { service, db, events } = setup(url);
      await expect(
        service.create(studentUser, { opportunityId: 'opportunity' }),
      ).rejects.toThrow(BadRequestException);
      expect(db.application.create).not.toHaveBeenCalled();
      expect(db.auditLog.create).not.toHaveBeenCalled();
      expect(events.application).not.toHaveBeenCalled();
    },
  );

  it.each(['pdf', 'doc', 'docx'])(
    'accepts a saved %s CV inside the serializable transaction',
    async (extension) => {
      const { service, db, events } = setup(
        `https://example.invalid/cv.${extension}`,
      );
      await expect(
        service.create(studentUser, { opportunityId: 'opportunity' }),
      ).resolves.toMatchObject({ id: 'application' });
      expect(events.transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      const query = db.student.findFirst.mock.calls[0][0];
      expect(query.where).toMatchObject({ accountId: studentUser.id });
      expect(query.select).toMatchObject({ cvUrl: true });
      expect(events.application).toHaveBeenCalledTimes(1);
    },
  );

  it('does not trust a stale CV on the authenticated user', async () => {
    const { service } = setup(null);
    await expect(
      service.create(
        {
          ...studentUser,
          student: {
            ...studentUser.student!,
            cvUrl: 'https://example.invalid/stale.pdf',
          },
        } as CurrentUserData,
        { opportunityId: 'opportunity' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('still rejects an inactive student', async () => {
    const { service, db } = setup();
    db.student.findFirst.mockResolvedValue(null);
    await expect(
      service.create(studentUser, { opportunityId: 'opportunity' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns the current CV only through application detail scoped to the recruiter company', async () => {
    const { service, db } = setup();
    db.application.findFirst.mockResolvedValue({
      id: 'application',
      student: { cvUrl: 'https://example.invalid/cv.pdf' },
    });
    await expect(
      service.findOne(recruiter, 'application'),
    ).resolves.toMatchObject({
      student: { cvUrl: 'https://example.invalid/cv.pdf' },
    });
    const query = db.application.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({
      AND: [
        { id: 'application' },
        { OR: [{ opportunity: { companyId: 'company' } }] },
      ],
    });
    expect(query.include).toMatchObject({
      student: { select: { cvUrl: true } },
    });
    db.application.findFirst.mockResolvedValue(null);
    await expect(
      service.findOne(recruiter, 'other-company-application'),
    ).rejects.toThrow(NotFoundException);
  });
});
