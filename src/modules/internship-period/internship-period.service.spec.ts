import { NotificationEventsService } from '../notifications/notification-events.service';
const notificationEvents = {
  profileApproved: jest.fn(),
  pendingProfile: jest.fn(),
  placement: jest.fn(),
  internshipRegistration: jest.fn(),
  application: jest.fn(),
  enrollment: jest.fn(),
} as unknown as NotificationEventsService;
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { InternshipPeriodStatus } from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { InternshipPeriodService } from './internship-period.service';

const user = {
  id: 'actor',
  schoolUser: {
    universityId: 'school',
    role: 'UNIVERSITY_ADMIN',
    status: 'ACTIVE',
  },
} as CurrentUserData;
const period = {
  id: 'period',
  universityId: 'school',
  academicYearId: 'year',
  status: 'ONGOING',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-06-30'),
  applyStartDate: new Date('2025-11-01'),
  applyEndDate: new Date('2025-12-31'),
};
function setup() {
  const db = {
    internshipPeriod: {
      findFirst: jest.fn().mockResolvedValue(period),
      update: jest.fn().mockResolvedValue({ id: 'period' }),
      create: jest.fn(),
      delete: jest.fn(),
    },
    academicYear: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'year',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2027-12-31'),
      }),
    },
    placement: { findFirst: jest.fn().mockResolvedValue(null) },
    student: { findFirst: jest.fn().mockResolvedValue({ id: 'student' }) },
    studentInternship: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'registration', status: 'READY' }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(
    (work: (tx: typeof db) => Promise<unknown>) => work(db),
  );
  return {
    db,
    service: new InternshipPeriodService(
      db as unknown as PrismaService,
      {
        ...notificationEvents,
        transaction: db.$transaction,
      } as unknown as NotificationEventsService,
    ),
  };
}
function openRegistration(db: ReturnType<typeof setup>['db']) {
  db.internshipPeriod.findFirst.mockResolvedValue({
    ...period,
    status: 'OPEN',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-12-31'),
    applyStartDate: new Date('2026-09-01'),
    applyEndDate: new Date('2026-09-30'),
  });
}

describe('Internship period lifecycle and registrations', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-28T10:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it.each([{ endDate: '2026-05-31' }, { startDate: '2026-02-01' }])(
    'rejects a schedule that excludes an existing placement: %o',
    async (dto) => {
      const { db, service } = setup();
      db.placement.findFirst.mockResolvedValue({ id: 'placement' });
      await expect(service.update(user, 'period', dto)).rejects.toThrow(
        'Existing placement dates',
      );
      expect(db.placement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentInternship: { internshipPeriodId: 'period' },
            status: { not: 'CANCELLED' },
          }) as unknown,
        }),
      );
      expect(db.internshipPeriod.update).not.toHaveBeenCalled();
    },
  );
  it('allows an enclosing schedule in a serializable transaction', async () => {
    const { db, service } = setup();
    await service.update(user, 'period', { endDate: '2026-07-31' });
    expect(db.internshipPeriod.update).toHaveBeenCalledWith({
      where: { id: 'period', universityId: 'school' },
      data: { endDate: new Date('2026-07-31') },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it.each(['COMPLETED', 'CANCELLED'] as InternshipPeriodStatus[])(
    'blocks %s while a registration has unfinished placements',
    async (status) => {
      const { db, service } = setup();
      db.studentInternship.findFirst.mockResolvedValue({ id: 'registration' });
      await expect(service.update(user, 'period', { status })).rejects.toThrow(
        'Finish or cancel',
      );
      expect(db.studentInternship.findFirst).toHaveBeenCalledWith({
        where: {
          internshipPeriodId: 'period',
          OR: [
            { status: { in: ['PLACED', 'IN_PROGRESS'] } },
            {
              placements: {
                some: {
                  status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
                },
              },
            },
          ],
        },
        select: { id: true },
      });
      expect(db.internshipPeriod.update).not.toHaveBeenCalled();
      expect(db.studentInternship.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each(['COMPLETED', 'CANCELLED'] as InternshipPeriodStatus[])(
    'closes an eligible period as %s and marks only unplaced registrations NOT_ASSIGNED',
    async (status) => {
      const { db, service } = setup();
      await service.update(user, 'period', { status });
      expect(db.studentInternship.updateMany).toHaveBeenCalledWith({
        where: {
          internshipPeriodId: 'period',
          status: { in: ['READY', 'APPLYING'] },
        },
        data: { status: 'NOT_ASSIGNED' },
      });
      expect(db.internshipPeriod.update).toHaveBeenCalled();
    },
  );
  it.each(['COMPLETED', 'CANCELLED'])(
    'prevents edits and rollback from %s',
    async (status) => {
      const { db, service } = setup();
      db.internshipPeriod.findFirst.mockResolvedValue({ ...period, status });
      await expect(
        service.update(user, 'period', { status: 'DRAFT' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.update(user, 'period', { name: 'Changed history' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.internshipPeriod.update).not.toHaveBeenCalled();
    },
  );
  it('rejects backward transitions and premature start/completion', async () => {
    const { db, service } = setup();
    await expect(
      service.update(user, 'period', { status: 'OPEN' }),
    ).rejects.toThrow('Cannot change period');
    openRegistration(db);
    await expect(
      service.update(user, 'period', { status: 'ONGOING' }),
    ).rejects.toThrow('start date has not');
    db.internshipPeriod.findFirst.mockResolvedValue({
      ...period,
      endDate: new Date('2026-12-31'),
    });
    await expect(
      service.update(user, 'period', { status: 'COMPLETED' }),
    ).rejects.toThrow('end date has not');
  });
  it('creates an audited READY registration for an eligible student in the same university', async () => {
    const { db, service } = setup();
    openRegistration(db);
    await expect(
      service.registerStudent(user, 'period', { studentId: 'student' }),
    ).resolves.toMatchObject({ status: 'READY' });
    expect(db.internshipPeriod.findFirst).toHaveBeenCalledWith({
      where: { id: 'period', universityId: 'school' },
    });
    expect(db.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'student',
          universityId: 'school',
          status: 'ACTIVE',
          account: {
            status: 'ACTIVE',
            deletedAt: null,
            emailVerifiedAt: { not: null },
          },
          university: { status: { notIn: ['INACTIVE', 'SUSPENDED'] } },
        },
      }),
    );
    expect(db.studentInternship.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          studentId: 'student',
          internshipPeriodId: 'period',
          status: 'READY',
        },
      }),
    );
    expect(db.auditLog.create).toHaveBeenCalled();
  });
  it('allows school staff but rejects supervisors and unscoped global admins', async () => {
    const { db, service } = setup();
    openRegistration(db);
    await service.registerStudent(
      { ...user, schoolUser: { ...user.schoolUser!, role: 'STAFF' } },
      'period',
      { studentId: 'student' },
    );
    for (const actor of [
      {
        ...user,
        schoolUser: {
          ...user.schoolUser!,
          role: 'UNIVERSITY_SUPERVISOR' as const,
        },
      },
      { ...user, globalRole: 'SYSTEM_ADMIN' as const, schoolUser: null },
    ]) {
      await expect(
        service.registerStudent(actor, 'period', { studentId: 'student' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.listRegistrations(actor, 'period', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
  it('rejects an out-of-scope period or student without writing or listing registrations', async () => {
    const { db, service } = setup();
    openRegistration(db);
    db.student.findFirst.mockResolvedValue(null);
    await expect(
      service.registerStudent(user, 'period', { studentId: 'foreign-student' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    db.internshipPeriod.findFirst.mockResolvedValue(null);
    await expect(
      service.registerStudent(user, 'foreign-period', { studentId: 'student' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.listRegistrations(user, 'foreign-period', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.studentInternship.create).not.toHaveBeenCalled();
    expect(db.studentInternship.findMany).not.toHaveBeenCalled();
  });
  it.each(['DRAFT', 'ONGOING', 'COMPLETED', 'CANCELLED'])(
    'rejects registration in a %s period',
    async (status) => {
      const { db, service } = setup();
      db.internshipPeriod.findFirst.mockResolvedValue({ ...period, status });
      await expect(
        service.registerStudent(user, 'period', { studentId: 'student' }),
      ).rejects.toThrow('not accepting registrations');
      expect(db.studentInternship.create).not.toHaveBeenCalled();
    },
  );
  it.each(['2026-08-31', '2026-09-30T00:00:00.001Z', '2026-10-01'])(
    'rejects registration outside the window at %s',
    async (now) => {
      const { db, service } = setup();
      openRegistration(db);
      jest.setSystemTime(new Date(now));
      await expect(
        service.registerStudent(user, 'period', { studentId: 'student' }),
      ).rejects.toThrow('not accepting registrations');
    },
  );
  it('maps duplicates and serialization conflicts to HTTP 409', async () => {
    const { db, service } = setup();
    openRegistration(db);
    db.studentInternship.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6',
      }),
    );
    await expect(
      service.registerStudent(user, 'period', { studentId: 'student' }),
    ).rejects.toBeInstanceOf(ConflictException);
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('race', {
        code: 'P2034',
        clientVersion: '6',
      }),
    );
    await expect(
      service.update(user, 'period', { name: 'New name' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('paginates registrations with only display fields', async () => {
    const { db, service } = setup();
    await service.listRegistrations(user, 'period', { page: 2, limit: 10 });
    expect(db.studentInternship.findMany).toHaveBeenCalledWith({
      where: {
        internshipPeriodId: 'period',
        student: { universityId: 'school' },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        student: {
          select: {
            studentCode: true,
            account: { select: { fullName: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    });
  });
});
