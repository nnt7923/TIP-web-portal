import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import {
  getPlacementCompanyId,
  getPlacementUniversityId,
} from '../placement/placement.policy';
import { QueryLookupDto } from './dto/query-lookup.dto';
import { LookupKind } from './lookup-kind.enum';

const activeAccount = {
  status: 'ACTIVE',
  deletedAt: null,
  emailVerifiedAt: { not: null },
} satisfies Prisma.AccountWhereInput;
const activeUniversity = {
  status: { notIn: ['INACTIVE', 'SUSPENDED'] },
} satisfies Prisma.UniversityWhereInput;
const take = 51;
type Option = { value: string; label: string };

@Injectable()
export class LookupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOptions(
    user: CurrentUserData,
    kind: LookupKind,
    query: QueryLookupDto,
  ) {
    if (user.status !== 'ACTIVE')
      throw new ForbiddenException('Active account required');
    const search = {
      contains: query.keyword?.trim() || '',
      mode: 'insensitive' as const,
    };
    const admin = user.globalRole === 'SYSTEM_ADMIN';
    let options: Option[];
    switch (kind) {
      case LookupKind.Universities: {
        if (!admin) throw new ForbiddenException('System Admin required');
        const rows = await this.prisma.university.findMany({
          where: { OR: [{ name: search }, { code: search }] },
          select: { id: true, name: true, code: true },
          orderBy: { name: 'asc' },
          take,
        });
        options = rows.map((row) => ({
          value: row.id,
          label: `${row.name} · ${row.code}`,
        }));
        break;
      }
      case LookupKind.Companies: {
        if (!admin) getPlacementUniversityId(user);
        const rows = await this.prisma.company.findMany({
          where: { status: 'VERIFIED', name: search },
          select: { id: true, name: true, address: true },
          orderBy: { name: 'asc' },
          take,
        });
        options = rows.map((row) => ({
          value: row.id,
          label: [row.name, row.address].filter(Boolean).join(' · '),
        }));
        break;
      }
      case LookupKind.Majors:
      case LookupKind.AcademicYears: {
        const universityId = getPlacementUniversityId(user);
        if (user.schoolUser?.role !== 'UNIVERSITY_ADMIN')
          throw new ForbiddenException('University Admin required');
        if (kind === LookupKind.Majors) {
          const rows = await this.prisma.major.findMany({
            where: { universityId, OR: [{ name: search }, { code: search }] },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
            take,
          });
          options = rows.map((row) => ({
            value: row.id,
            label: [row.name, row.code].filter(Boolean).join(' · '),
          }));
        } else {
          const rows = await this.prisma.academicYear.findMany({
            where: { universityId, status: 'ACTIVE', name: search },
            select: { id: true, name: true, startDate: true, endDate: true },
            orderBy: { startDate: 'desc' },
            take,
          });
          options = rows.map((row) => ({
            value: row.id,
            label: `${row.name} · ${row.startDate.toLocaleDateString('vi-VN')} – ${row.endDate.toLocaleDateString('vi-VN')}`,
          }));
        }
        break;
      }
      case LookupKind.Students: {
        const universityId = getPlacementUniversityId(user);
        const rows = await this.prisma.student.findMany({
          where: {
            universityId,
            status: 'ACTIVE',
            account: activeAccount,
            university: activeUniversity,
            OR: [{ studentCode: search }, { account: { fullName: search } }],
          },
          select: {
            id: true,
            studentCode: true,
            account: { select: { fullName: true } },
          },
          orderBy: { studentCode: 'asc' },
          take,
        });
        options = rows.map((row) => ({
          value: row.id,
          label: `${row.account.fullName} · ${row.studentCode}`,
        }));
        break;
      }
      case LookupKind.Applications: {
        const universityId = getPlacementUniversityId(user);
        const rows = await this.prisma.application.findMany({
          where: {
            universityId,
            status: 'ACCEPTED',
            placement: null,
            student: {
              status: 'ACTIVE',
              account: activeAccount,
              university: activeUniversity,
            },
            opportunity: {
              company: { status: 'VERIFIED' },
              status: { in: ['OPEN', 'CLOSED'] },
            },
            OR: [
              { student: { studentCode: search } },
              { student: { account: { fullName: search } } },
              { opportunity: { title: search } },
            ],
          },
          select: {
            id: true,
            student: {
              select: {
                studentCode: true,
                account: { select: { fullName: true } },
              },
            },
            opportunity: {
              select: { title: true, company: { select: { name: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          take,
        });
        options = rows.map((row) => ({
          value: row.id,
          label: `${row.student.account.fullName} · ${row.student.studentCode} · ${row.opportunity.title} · ${row.opportunity.company.name}`,
        }));
        break;
      }
      case LookupKind.Opportunities: {
        getPlacementUniversityId(user);
        if (!query.companyId)
          throw new BadRequestException('Choose a company first');
        const rows = await this.prisma.opportunity.findMany({
          where: {
            companyId: query.companyId,
            company: { status: 'VERIFIED' },
            status: { in: ['OPEN', 'CLOSED'] },
            title: search,
          },
          select: { id: true, title: true, type: true },
          orderBy: { createdAt: 'desc' },
          take,
        });
        options = rows.map((row) => ({
          value: row.id,
          label: `${row.title} · ${row.type}`,
        }));
        break;
      }
      case LookupKind.UniversitySupervisors: {
        const universityId = getPlacementUniversityId(user);
        const rows = await this.prisma.schoolUser.findMany({
          where: {
            universityId,
            role: 'UNIVERSITY_SUPERVISOR',
            status: 'ACTIVE',
            account: { ...activeAccount, fullName: search },
          },
          select: {
            id: true,
            account: { select: { fullName: true, username: true } },
          },
          orderBy: { account: { fullName: 'asc' } },
          take,
        });
        options = rows.map((row) => ({
          value: row.id,
          label: `${row.account.fullName} · ${row.account.username}`,
        }));
        break;
      }
      case LookupKind.CompanySupervisors: {
        const companyId = getPlacementCompanyId(user);
        const rows = await this.prisma.companyUser.findMany({
          where: {
            companyId,
            status: 'ACTIVE',
            account: { ...activeAccount, fullName: search },
          },
          select: {
            id: true,
            account: { select: { fullName: true, username: true } },
          },
          orderBy: { account: { fullName: 'asc' } },
          take,
        });
        options = rows.map((row) => ({
          value: row.id,
          label: `${row.account.fullName} · ${row.account.username}`,
        }));
        break;
      }
      case LookupKind.StudentInternships: {
        const universityId = getPlacementUniversityId(user);
        let studentId = query.studentId;
        // Existing placement/application is authoritative; never trust a supplied student from another source.
        if (query.placementId) {
          const placement = await this.prisma.placement.findFirst({
            where: { id: query.placementId, universityId },
            select: { studentId: true },
          });
          if (!placement)
            throw new NotFoundException(
              'Placement not found in your university',
            );
          studentId = placement.studentId;
        } else if (query.applicationId) {
          const application = await this.prisma.application.findFirst({
            where: {
              id: query.applicationId,
              universityId,
              status: 'ACCEPTED',
            },
            select: { studentId: true },
          });
          if (!application)
            throw new NotFoundException(
              'Application not found in your university',
            );
          studentId = application.studentId;
        }
        if (!studentId)
          throw new BadRequestException(
            'Choose a student or accepted application first',
          );
        const rows = await this.prisma.studentInternship.findMany({
          where: {
            studentId,
            student: { universityId, status: 'ACTIVE', account: activeAccount },
            status: { in: ['READY', 'APPLYING', 'PLACED', 'IN_PROGRESS'] },
            internshipPeriod: {
              universityId,
              status: { notIn: ['CANCELLED', 'COMPLETED'] },
              name: search,
            },
            placements: {
              none: {
                status: { not: 'CANCELLED' },
                ...(query.placementId
                  ? { id: { not: query.placementId } }
                  : {}),
              },
            },
          },
          select: {
            id: true,
            internshipPeriod: {
              select: { name: true, startDate: true, endDate: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take,
        });
        options = rows.map((row) => ({
          value: row.id,
          label: `${row.internshipPeriod.name} · ${row.internshipPeriod.startDate.toLocaleDateString('vi-VN')} – ${row.internshipPeriod.endDate.toLocaleDateString('vi-VN')}`,
        }));
        break;
      }
      default:
        throw new BadRequestException('Unsupported lookup');
    }
    return { options: options.slice(0, 50), hasMore: options.length > 50 };
  }
}
