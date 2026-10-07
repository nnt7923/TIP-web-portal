import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { LookupKind } from './lookup-kind.enum';
import { LookupsService } from './lookups.service';

const user = {
  id: 'user',
  status: 'ACTIVE',
  globalRole: 'USER',
  schoolUser: {
    id: 'staff',
    universityId: 'my-school',
    role: 'STAFF',
    status: 'ACTIVE',
  },
  companyUser: null,
  student: null,
} as CurrentUserData;

function setup() {
  const model = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  });
  const db = {
    university: model(),
    company: model(),
    academicYear: model(),
    major: model(),
    student: model(),
    application: model(),
    opportunity: model(),
    schoolUser: model(),
    companyUser: model(),
    studentInternship: model(),
    placement: model(),
  };
  return { db, service: new LookupsService(db as unknown as PrismaService) };
}
function query(mock: jest.Mock) {
  return (
    mock.mock.calls as [
      {
        where: Record<string, unknown>;
        select: Record<string, unknown>;
        take: number;
      },
    ][]
  )[0][0];
}

describe('Scoped lookups', () => {
  it.each([
    LookupKind.Students,
    LookupKind.Applications,
    LookupKind.UniversitySupervisors,
    LookupKind.StudentInternships,
  ])('does not give a global admin school scope for %s', async (kind) => {
    const { service } = setup();
    await expect(
      service.findOptions(
        { ...user, globalRole: 'SYSTEM_ADMIN', schoolUser: null },
        kind,
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects inactive profiles and accounts before querying data', async () => {
    const { db, service } = setup();
    await expect(
      service.findOptions(
        { ...user, status: 'SUSPENDED' },
        LookupKind.Students,
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.findOptions(
        { ...user, schoolUser: { ...user.schoolUser!, status: 'PENDING' } },
        LookupKind.Students,
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.student.findMany).not.toHaveBeenCalled();
  });

  it('uses the authenticated school for students and only exposes option labels', async () => {
    const { db, service } = setup();
    db.student.findMany.mockResolvedValue([
      { id: 's1', studentCode: 'SV001', account: { fullName: 'Student One' } },
    ]);
    const result = await service.findOptions(user, LookupKind.Students, {
      keyword: 'Student',
    });
    expect(query(db.student.findMany).where.universityId).toBe('my-school');
    expect(query(db.student.findMany).select).toEqual({
      id: true,
      studentCode: true,
      account: { select: { fullName: true } },
    });
    expect(result).toEqual({
      options: [{ value: 's1', label: 'Student One · SV001' }],
      hasMore: false,
    });
  });

  it('requires a real university admin for academic year choices', async () => {
    const { db, service } = setup();
    await expect(
      service.findOptions(user, LookupKind.AcademicYears, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.findOptions(
      {
        ...user,
        schoolUser: { ...user.schoolUser!, role: 'UNIVERSITY_ADMIN' },
      },
      LookupKind.AcademicYears,
      {},
    );
    expect(query(db.academicYear.findMany).where).toMatchObject({
      universityId: 'my-school',
      status: 'ACTIVE',
    });
  });

  it('limits applications to accepted, unassigned records in the current school', async () => {
    const { db, service } = setup();
    await service.findOptions(user, LookupKind.Applications, {});
    expect(query(db.application.findMany).where).toMatchObject({
      universityId: 'my-school',
      status: 'ACCEPTED',
      placement: null,
    });
  });

  it('does not let a foreign application or placement expose registration choices', async () => {
    const { db, service } = setup();
    await expect(
      service.findOptions(user, LookupKind.StudentInternships, {
        applicationId: 'foreign',
        studentId: 'forged',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query(db.application.findFirst).where).toMatchObject({
      id: 'foreign',
      universityId: 'my-school',
    });
    await expect(
      service.findOptions(user, LookupKind.StudentInternships, {
        placementId: 'foreign',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.studentInternship.findMany).not.toHaveBeenCalled();
  });

  it('derives student from application and scopes registrations to the same school', async () => {
    const { db, service } = setup();
    db.application.findFirst.mockResolvedValue({ studentId: 'real-student' });
    await service.findOptions(user, LookupKind.StudentInternships, {
      applicationId: 'accepted',
      studentId: 'forged',
    });
    expect(query(db.studentInternship.findMany).where).toMatchObject({
      studentId: 'real-student',
      student: { universityId: 'my-school' },
      internshipPeriod: { universityId: 'my-school' },
    });
  });

  it('does not accept a caller-supplied company scope for supervisors', async () => {
    const { db, service } = setup();
    const companyAdmin = {
      ...user,
      companyUser: {
        id: 'admin',
        companyId: 'my-company',
        role: 'COMPANY_ADMIN' as const,
        status: 'ACTIVE' as const,
      },
    };
    await service.findOptions(companyAdmin, LookupKind.CompanySupervisors, {
      companyId: 'foreign',
    });
    expect(query(db.companyUser.findMany).where.companyId).toBe('my-company');
  });

  it('caps lists and advertises more results for search', async () => {
    const { db, service } = setup();
    db.company.findMany.mockResolvedValue(
      Array.from({ length: 51 }, (_, i) => ({
        id: String(i),
        name: `Company ${i}`,
        address: null,
      })),
    );
    const result = await service.findOptions(user, LookupKind.Companies, {});
    expect(result.options).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    expect(query(db.company.findMany).take).toBe(51);
    expect(query(db.company.findMany).where.status).toBe('VERIFIED');
  });
});
