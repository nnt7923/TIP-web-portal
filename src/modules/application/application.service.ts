import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  ApplicationStatus,
  CompanyStatus,
  CompanyUserRole,
  CompanyUserStatus,
  GlobalRole,
  OpportunityStatus,
  Prisma,
  SchoolUserStatus,
  StudentStatus,
  UniversityStatus,
} from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { QueryApplicationDto } from './dto/query-application.dto';
import {
  applicationReviewStatuses,
  UpdateApplicationStatusDto,
} from './dto/update-application-status.dto';

// Only return information needed to view an application; never include passwordHash.
const applicationInclude = {
  university: { select: { id: true, name: true, code: true } },
  student: {
    select: {
      id: true,
      studentCode: true,
      cvUrl: true,
      major: { select: { id: true, name: true } },
      account: { select: { fullName: true, email: true, phone: true } },
    },
  },
  opportunity: {
    select: {
      id: true,
      companyId: true,
      title: true,
      type: true,
      status: true,
      applicationDeadline: true,
      vacancies: true,
      company: { select: { id: true, name: true, status: true } },
    },
  },
} satisfies Prisma.ApplicationInclude;

const pendingStatuses: ApplicationStatus[] = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
];

@Injectable()
export class ApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sinh viên nộp đơn bằng hồ sơ của mình; trường được lấy từ database. */
  async create(user: CurrentUserData, dto: CreateApplicationDto) {
    const profile = this.getStudent(user);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const student = await transaction.student.findFirst({
            where: {
              id: profile.id,
              accountId: user.id,
              status: StudentStatus.ACTIVE,
              account: {
                status: AccountStatus.ACTIVE,
                deletedAt: null,
                emailVerifiedAt: { not: null },
              },
              university: {
                status: {
                  notIn: [
                    UniversityStatus.SUSPENDED,
                    UniversityStatus.INACTIVE,
                  ],
                },
              },
            },
            select: { id: true, universityId: true },
          });
          if (!student)
            throw new ForbiddenException(
              'An active, verified student account is required',
            );

          const opportunity = await transaction.opportunity.findUnique({
            where: { id: dto.opportunityId },
            select: {
              status: true,
              applicationDeadline: true,
              company: { select: { status: true } },
            },
          });
          if (
            !opportunity ||
            opportunity.company.status !== CompanyStatus.VERIFIED
          ) {
            throw new NotFoundException('Opportunity is not available');
          }
          if (opportunity.status !== OpportunityStatus.OPEN) {
            throw new BadRequestException(
              'Only OPEN opportunities accept applications',
            );
          }
          if (
            !opportunity.applicationDeadline ||
            opportunity.applicationDeadline <= new Date()
          ) {
            throw new BadRequestException(
              'The application deadline is missing or has passed',
            );
          }

          const application = await transaction.application.create({
            data: {
              studentId: student.id,
              universityId: student.universityId,
              opportunityId: dto.opportunityId,
              status: ApplicationStatus.PENDING,
            },
            include: applicationInclude,
          });
          await this.writeAudit(
            transaction,
            user.id,
            application.id,
            'APPLICATION_CREATED',
            {
              studentId: student.id,
              universityId: student.universityId,
              opportunityId: dto.opportunityId,
              status: application.status,
            },
          );
          return application;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      handlePrismaError(error, {
        duplicate:
          'You have already applied for this opportunity, including withdrawn or rejected applications',
      });
    }
  }

  /** Lọc và phân trang trong phạm vi được phép; query không thể mở rộng quyền truy cập. */
  async findAll(user: CurrentUserData, query: QueryApplicationDto) {
    const keyword = query.keyword?.trim();
    const filters: Prisma.ApplicationWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.opportunityId && { opportunityId: query.opportunityId }),
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.universityId && { universityId: query.universityId }),
      ...(query.companyId && { opportunity: { companyId: query.companyId } }),
      ...(keyword && {
        OR: [
          {
            opportunity: { title: { contains: keyword, mode: 'insensitive' } },
          },
          {
            student: {
              studentCode: { contains: keyword, mode: 'insensitive' },
            },
          },
          {
            student: {
              account: { fullName: { contains: keyword, mode: 'insensitive' } },
            },
          },
        ],
      }),
    };
    const where: Prisma.ApplicationWhereInput = {
      AND: [this.getReadScope(user), filters],
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await this.prisma.$transaction(
      [
        this.prisma.application.findMany({
          where,
          include: applicationInclude,
          orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.application.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Trả 404 nếu đơn không tồn tại hoặc nằm ngoài phạm vi được phép xem. */
  async findOne(user: CurrentUserData, id: string) {
    return this.findInScope(this.prisma, id, this.getReadScope(user));
  }

  /** Công ty duyệt đơn của mình; trạng thái cuối không được mở lại qua API này. */
  async updateStatus(
    user: CurrentUserData,
    id: string,
    dto: UpdateApplicationStatusDto,
  ) {
    const scope = this.getReviewScope(user);
    if (!applicationReviewStatuses.includes(dto.status)) {
      throw new BadRequestException(
        'Status must be REVIEWING, ACCEPTED or REJECTED',
      );
    }

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const current = await this.findInScope(transaction, id, scope);
          this.assertPending(current.status);
          if (current.status === dto.status) {
            throw new BadRequestException(
              'Application already has this status',
            );
          }
          if (
            current.opportunity.company.status !== CompanyStatus.VERIFIED ||
            !(
              [
                OpportunityStatus.OPEN,
                OpportunityStatus.CLOSED,
              ] as OpportunityStatus[]
            ).includes(current.opportunity.status)
          ) {
            throw new BadRequestException(
              'Only OPEN or CLOSED opportunities of a verified company can be reviewed',
            );
          }
          if (
            dto.status === ApplicationStatus.ACCEPTED &&
            current.opportunity.vacancies !== null
          ) {
            const accepted = await transaction.application.count({
              where: {
                opportunityId: current.opportunityId,
                status: ApplicationStatus.ACCEPTED,
              },
            });
            if (accepted >= current.opportunity.vacancies) {
              throw new ConflictException(
                'All vacancies for this opportunity have been filled',
              );
            }
          }

          const updated = await transaction.application.updateMany({
            where: { AND: [{ id, status: current.status }, scope] },
            data: { status: dto.status },
          });
          if (updated.count !== 1)
            throw new ConflictException(
              'Application changed. Reload and try again',
            );
          await this.writeAudit(
            transaction,
            user.id,
            id,
            'APPLICATION_STATUS_UPDATED',
            {
              from: current.status,
              to: dto.status,
              opportunityId: current.opportunityId,
            },
          );
          return this.findInScope(transaction, id, scope);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      handlePrismaError(error, { notFound: 'Application was not found' });
    }
  }

  /** Sinh viên chỉ rút đơn của mình khi còn chờ xử lý; giữ lại đơn và lịch sử. */
  async withdraw(user: CurrentUserData, id: string) {
    const student = this.getStudent(user);
    const scope: Prisma.ApplicationWhereInput = {
      studentId: student.id,
      student: { accountId: user.id },
    };

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const current = await this.findInScope(transaction, id, scope);
          this.assertPending(current.status);
          const updated = await transaction.application.updateMany({
            where: { AND: [{ id, status: current.status }, scope] },
            data: { status: ApplicationStatus.WITHDRAWN },
          });
          if (updated.count !== 1)
            throw new ConflictException(
              'Application changed. Reload and try again',
            );
          await this.writeAudit(
            transaction,
            user.id,
            id,
            'APPLICATION_WITHDRAWN',
            {
              from: current.status,
              to: ApplicationStatus.WITHDRAWN,
            },
          );
          return this.findInScope(transaction, id, scope);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      handlePrismaError(error, { notFound: 'Application was not found' });
    }
  }

  /** Xác định hồ sơ sinh viên đang hoạt động từ tài khoản đã xác thực. */
  private getStudent(user: CurrentUserData) {
    if (!user.student || user.student.status !== StudentStatus.ACTIVE) {
      throw new ForbiddenException(
        'Only active students can apply or withdraw their applications',
      );
    }
    return user.student;
  }

  /** Sinh viên xem đơn của mình; công ty/trường xem trong tổ chức; System Admin xem tất cả. */
  private getReadScope(user: CurrentUserData): Prisma.ApplicationWhereInput {
    if (user.globalRole === GlobalRole.SYSTEM_ADMIN) return {};
    const scopes: Prisma.ApplicationWhereInput[] = [];
    if (user.student?.status === StudentStatus.ACTIVE) {
      scopes.push({
        studentId: user.student.id,
        student: { accountId: user.id },
      });
    }
    if (user.companyUser?.status === CompanyUserStatus.ACTIVE) {
      scopes.push({ opportunity: { companyId: user.companyUser.companyId } });
    }
    if (user.schoolUser?.status === SchoolUserStatus.ACTIVE) {
      scopes.push({ universityId: user.schoolUser.universityId });
    }
    if (!scopes.length)
      throw new ForbiddenException(
        'You do not have permission to view applications',
      );
    return { OR: scopes };
  }

  /** Chỉ COMPANY_ADMIN và SYSTEM_ADMIN được đưa ra quyết định tuyển dụng. */
  private getReviewScope(user: CurrentUserData): Prisma.ApplicationWhereInput {
    if (user.globalRole === GlobalRole.SYSTEM_ADMIN) return {};
    if (
      user.companyUser?.status !== CompanyUserStatus.ACTIVE ||
      user.companyUser.role !== CompanyUserRole.COMPANY_ADMIN
    ) {
      throw new ForbiddenException(
        'Company administrator permission is required',
      );
    }
    return { opportunity: { companyId: user.companyUser.companyId } };
  }

  /** Dùng chung điều kiện phạm vi cho cả truy vấn đọc và transaction cập nhật. */
  private async findInScope(
    transaction: Prisma.TransactionClient,
    id: string,
    scope: Prisma.ApplicationWhereInput,
  ) {
    const application = await transaction.application.findFirst({
      where: { AND: [{ id }, scope] },
      include: applicationInclude,
    });
    if (!application)
      throw new NotFoundException('Application was not found in your scope');
    return application;
  }

  /** Ngăn sửa/rút đơn đã được chấp nhận, từ chối hoặc rút trước đó. */
  private assertPending(status: ApplicationStatus): void {
    if (!pendingStatuses.includes(status)) {
      throw new BadRequestException(
        'Only PENDING or REVIEWING applications can be changed',
      );
    }
  }

  /** Ghi audit log trong cùng transaction để đồng bộ với thay đổi của đơn. */
  private async writeAudit(
    transaction: Prisma.TransactionClient,
    actorId: string,
    id: string,
    action: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        actorId,
        action,
        entityType: 'Application',
        entityId: id,
        metadata,
      },
    });
  }
}
