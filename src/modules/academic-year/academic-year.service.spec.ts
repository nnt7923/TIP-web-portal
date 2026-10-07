import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { AcademicYearService } from './academic-year.service';

const user = { schoolUser: { universityId: 'school' } } as CurrentUserData;
function setup() {
  const db = {
    academicYear: {
      findFirst: jest.fn().mockResolvedValue({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      }),
      update: jest.fn(),
      delete: jest.fn(),
    },
    internshipPeriod: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(
    (work: (tx: typeof db) => Promise<unknown>) => work(db),
  );
  return {
    db,
    service: new AcademicYearService(db as unknown as PrismaService),
  };
}
describe('Academic year integrity', () => {
  it('rejects a date change which excludes an existing period', async () => {
    const { db, service } = setup();
    db.internshipPeriod.findFirst.mockResolvedValue({ id: 'period' });
    await expect(
      service.update(user, 'year', { endDate: '2026-06-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.academicYear.update).not.toHaveBeenCalled();
  });
  it('checks scope and dates within the same serializable transaction as the update', async () => {
    const { db, service } = setup();
    await service.update(user, 'year', { name: 'Year 2026' });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(db.academicYear.findFirst).toHaveBeenCalledWith({
      where: { id: 'year', universityId: 'school' },
    });
    expect(db.academicYear.update).toHaveBeenCalledWith({
      where: { id: 'year', universityId: 'school' },
      data: { name: 'Year 2026' },
    });
  });
  it('rejects an out-of-scope academic year', async () => {
    const { db, service } = setup();
    db.academicYear.findFirst.mockResolvedValue(null);
    await expect(
      service.update(user, 'foreign-year', { name: 'Rename' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.academicYear.update).not.toHaveBeenCalled();
  });
  it('returns a conflict when deleting a year that still has periods', async () => {
    const { db, service } = setup();
    db.academicYear.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('foreign key', {
        code: 'P2003',
        clientVersion: '6',
      }),
    );
    await expect(service.remove(user, 'year')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
