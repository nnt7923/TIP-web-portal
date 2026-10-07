import { NotificationEventsService } from '../notifications/notification-events.service';
const notificationEvents = {
  profileApproved: jest.fn(),
  pendingProfile: jest.fn(),
  placement: jest.fn(),
  internshipRegistration: jest.fn(),
  application: jest.fn(),
  enrollment: jest.fn(),
} as unknown as NotificationEventsService;
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { PlacementService } from './placement.service';

const school = {
  id: 'school-actor',
  schoolUser: { universityId: 'school', role: 'STAFF', status: 'ACTIVE' },
} as CurrentUserData;
const company = {
  id: 'company-actor',
  companyUser: {
    companyId: 'company',
    role: 'COMPANY_ADMIN',
    status: 'ACTIVE',
  },
} as CurrentUserData;
const placement = {
  id: 'placement',
  universityId: 'school',
  companyId: 'company',
  studentId: 'student',
  positionTitle: 'Intern',
  startDate: new Date('2020-01-01'),
  endDate: new Date('2020-03-01'),
  status: 'IN_PROGRESS',
  updatedAt: new Date('2020-01-01'),
  universitySupervisorId: 'inactive-school',
  companySupervisorId: 'inactive-company',
};
function setup() {
  const db = {
    placement: {
      findFirst: jest.fn().mockResolvedValue(placement),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    schoolUser: { findFirst: jest.fn().mockResolvedValue(null) },
    companyUser: { findFirst: jest.fn().mockResolvedValue(null) },
    student: { findFirst: jest.fn().mockResolvedValue({ id: 'student' }) },
    company: { findFirst: jest.fn().mockResolvedValue({ id: 'company' }) },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(
    (work: (tx: typeof db) => Promise<unknown>) => work(db),
  );
  return {
    db,
    service: new PlacementService(
      db as unknown as PrismaService,
      {
        ...notificationEvents,
        transaction: db.$transaction,
      } as unknown as NotificationEventsService,
    ),
  };
}
describe('Supervisor reassignment', () => {
  it('replaces the school supervisor even when the company supervisor is inactive', async () => {
    const { db, service } = setup();
    db.schoolUser.findFirst.mockResolvedValue({ id: 'new-school' });
    await service.update(school, 'placement', {
      universitySupervisorId: 'new-school',
    });
    expect(db.companyUser.findFirst).not.toHaveBeenCalled();
    expect(db.schoolUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'new-school',
          universityId: 'school',
          role: 'UNIVERSITY_SUPERVISOR',
          status: 'ACTIVE',
        }) as unknown,
      }),
    );
    expect(db.placement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { universitySupervisorId: 'new-school' },
      }),
    );
    expect(db.auditLog.create).toHaveBeenCalled();
  });
  it('replaces the company supervisor even when the school supervisor is inactive', async () => {
    const { db, service } = setup();
    db.companyUser.findFirst.mockResolvedValue({ id: 'new-company' });
    await service.assignCompanySupervisor(company, 'placement', {
      companySupervisorId: 'new-company',
    });
    expect(db.schoolUser.findFirst).not.toHaveBeenCalled();
    expect(db.companyUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'new-company',
          companyId: 'company',
          status: 'ACTIVE',
        }) as unknown,
      }),
    );
    expect(db.placement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { companySupervisorId: 'new-company' } }),
    );
  });
  it('allows each side to clear its own assignment', async () => {
    const { db, service } = setup();
    await service.update(school, 'placement', { universitySupervisorId: null });
    await service.assignCompanySupervisor(company, 'placement', {
      companySupervisorId: null,
    });
    expect(db.schoolUser.findFirst).not.toHaveBeenCalled();
    expect(db.companyUser.findFirst).not.toHaveBeenCalled();
    expect(db.placement.updateMany).toHaveBeenCalledTimes(2);
  });
  it('still rejects inactive or out-of-scope replacement supervisors', async () => {
    const { db, service } = setup();
    await expect(
      service.update(school, 'placement', {
        universitySupervisorId: 'foreign-school',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.assignCompanySupervisor(company, 'placement', {
        companySupervisorId: 'foreign-company',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.placement.updateMany).not.toHaveBeenCalled();
  });
  it.each(['COMPLETED', 'CANCELLED'])(
    'preserves immutable %s placements',
    async (status) => {
      const { db, service } = setup();
      db.placement.findFirst.mockResolvedValue({ ...placement, status });
      await expect(
        service.update(school, 'placement', { universitySupervisorId: null }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.assignCompanySupervisor(company, 'placement', {
          companySupervisorId: null,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.placement.updateMany).not.toHaveBeenCalled();
    },
  );
  it('still checks both supervisors when progressing a placement', async () => {
    const { db, service } = setup();
    db.schoolUser.findFirst.mockResolvedValue({ id: 'active-school' });
    await expect(
      service.updateStatus(school, 'placement', { status: 'COMPLETED' }),
    ).rejects.toThrow('active company supervisor');
    expect(db.placement.updateMany).not.toHaveBeenCalled();
  });
  it('does not let a supervisor update bypass schedule validation', async () => {
    const { db, service } = setup();
    db.placement.findFirst.mockResolvedValue({
      ...placement,
      status: 'PENDING',
    });
    await expect(
      service.update(school, 'placement', {
        startDate: '2021-01-01',
        universitySupervisorId: null,
      }),
    ).rejects.toThrow('startDate must be');
    expect(db.placement.updateMany).not.toHaveBeenCalled();
  });
});
