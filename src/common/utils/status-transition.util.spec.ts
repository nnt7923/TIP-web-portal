import { NotificationEventsService } from '../../modules/notifications/notification-events.service';
const notificationEvents = {
  profileApproved: jest.fn(),
  pendingProfile: jest.fn(),
  placement: jest.fn(),
  internshipRegistration: jest.fn(),
  application: jest.fn(),
  enrollment: jest.fn(),
} as unknown as NotificationEventsService;
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { AuthService } from '../../modules/auth/auth.service';
import { CompanyService } from '../../modules/company/company.service';
import { CompanyUserService } from '../../modules/companyuser/company-user.service';
import { SchoolUserService } from '../../modules/schooluser/schooluser.service';
import { SystemAdminService } from '../../modules/system-admin/system-admin.service';
import { UniversitiesService } from '../../modules/universities/universities.service';
import type { CurrentUserData } from '../decorators/current-user.decorator';

const actor = { id: 'admin', globalRole: 'SYSTEM_ADMIN' } as CurrentUserData;

function setup(status: string) {
  const record = {
    id: 'target',
    status,
    globalRole: 'USER',
    role: 'STAFF',
    accountId: 'account',
    universityId: 'university',
    companyId: 'company',
    account: { globalRole: 'USER', email: 'user@example.test' },
  };
  const model = () => ({
    findUnique: jest.fn().mockResolvedValue(record),
    findUniqueOrThrow: jest.fn().mockResolvedValue(record),
    findFirst: jest.fn().mockResolvedValue(record),
    update: jest.fn().mockResolvedValue(record),
  });
  const db = {
    account: model(),
    company: model(),
    schoolUser: model(),
    companyUser: model(),
    university: model(),
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(
    (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
  );
  const prisma = db as unknown as PrismaService;
  const auth = { logoutAll: jest.fn() };
  const cloudinary = { uploadBuffer: jest.fn() };
  const authService = auth as unknown as AuthService;
  const uploads = cloudinary as unknown as CloudinaryService;
  return {
    db,
    auth,
    cloudinary,
    calls: [
      {
        name: 'account',
        model: db.account,
        run: () =>
          new SystemAdminService(prisma, authService, {
            ...notificationEvents,
            transaction: prisma.$transaction.bind(prisma),
          } as NotificationEventsService).updateAccountStatus(
            actor.id,
            'target',
            { status: 'PENDING' },
          ),
      },
      {
        name: 'company',
        model: db.company,
        run: () =>
          new CompanyService(prisma, uploads).update(actor.id, 'target', {
            status: 'PENDING',
          }),
      },
      {
        name: 'school user',
        model: db.schoolUser,
        run: () =>
          new SchoolUserService(prisma, authService, {
            ...notificationEvents,
            transaction: prisma.$transaction.bind(prisma),
          } as NotificationEventsService).update(actor, 'target', {
            status: 'PENDING',
          }),
      },
      {
        name: 'company user',
        model: db.companyUser,
        run: () =>
          new CompanyUserService(prisma, authService, {
            ...notificationEvents,
            transaction: prisma.$transaction.bind(prisma),
          } as NotificationEventsService).update(actor, 'target', {
            status: 'PENDING',
          }),
      },
      {
        name: 'university update',
        model: db.university,
        run: () =>
          new UniversitiesService(prisma, uploads).update(actor.id, 'target', {
            status: 'PENDING',
          }),
      },
      {
        name: 'university status',
        model: db.university,
        run: () =>
          new SystemAdminService(prisma, authService, {
            ...notificationEvents,
            transaction: prisma.$transaction.bind(prisma),
          } as NotificationEventsService).updateUniversityStatus(
            actor.id,
            'target',
            { status: 'PENDING' },
          ),
      },
    ],
  };
}

describe('Pending state cannot be restored through update endpoints', () => {
  for (const index of [0, 1, 2, 3, 4, 5]) {
    const name = setup('PENDING').calls[index].name;
    const approved = [1, 4, 5].includes(index) ? 'VERIFIED' : 'ACTIVE';
    it.each([approved, 'SUSPENDED', 'INACTIVE'])(
      `${name}: rejects %s -> PENDING without side effects`,
      async (status) => {
        const context = setup(status);
        const call = context.calls[index];
        await expect(call.run()).rejects.toBeInstanceOf(BadRequestException);
        expect(call.model.update).not.toHaveBeenCalled();
        expect(context.db.auditLog.create).not.toHaveBeenCalled();
        expect(context.auth.logoutAll).not.toHaveBeenCalled();
        expect(context.cloudinary.uploadBuffer).not.toHaveBeenCalled();
      },
    );

    it(`${name}: permits unchanged PENDING with an atomic status condition`, async () => {
      const call = setup('PENDING').calls[index];
      await call.run();
      const update = (call.model.update.mock.calls as unknown[][])[0][0] as {
        where: { id: string; status: string };
      };
      expect(update.where).toMatchObject({ id: 'target', status: 'PENDING' });
    });
  }
});
