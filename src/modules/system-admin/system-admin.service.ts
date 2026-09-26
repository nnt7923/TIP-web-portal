import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  GlobalRole,
  Prisma,
  SchoolUserRole,
  SchoolUserStatus,
  UniversityStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { QueryUniversityDto } from '../universities/dto/query-university.dto';
import { QueryAccountDto } from './dto/query-account.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { UpdateAccountStatusDto } from './dto/update-account-status.dto';
import { UpdateUniversityStatusDto } from './dto/update-university-status.dto';

const accountSelect = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  phone: true,
  globalRole: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: { id: true, universityId: true, studentCode: true, status: true },
  },
  schoolUser: {
    select: {
      id: true,
      universityId: true,
      role: true,
      status: true,
      university: {
        select: { id: true, name: true, code: true, status: true },
      },
    },
  },
  companyUser: {
    select: {
      id: true,
      companyId: true,
      role: true,
      status: true,
      company: {
        select: { id: true, name: true, status: true },
      },
    },
  },
} satisfies Prisma.AccountSelect;

@Injectable()
export class SystemAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  findAllAccounts(query: QueryAccountDto) {
    const keyword = query.keyword?.trim();

    return this.prisma.account.findMany({
      where: {
        ...(query.globalRole && { globalRole: query.globalRole }),
        ...(query.status && { status: query.status }),
        ...(keyword && {
          OR: [
            { username: { contains: keyword, mode: 'insensitive' as const } },
            { email: { contains: keyword, mode: 'insensitive' as const } },
            { fullName: { contains: keyword, mode: 'insensitive' as const } },
          ],
        }),
      },
      select: accountSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneAccount(id: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      select: accountSelect,
    });

    if (!account) {
      throw new NotFoundException(`Account with id "${id}" was not found`);
    }

    return account;
  }

  async updateAccountStatus(
    actorId: string,
    accountId: string,
    dto: UpdateAccountStatusDto,
    ipAddress?: string,
  ) {
    if (actorId === accountId && dto.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException('You cannot disable your own account');
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.account.findUnique({
        where: { id: accountId },
        select: { id: true, globalRole: true, status: true },
      });

      if (!current) {
        throw new NotFoundException(
          `Account with id "${accountId}" was not found`,
        );
      }

      if (
        current.globalRole === GlobalRole.SYSTEM_ADMIN &&
        current.status === AccountStatus.ACTIVE &&
        dto.status !== AccountStatus.ACTIVE
      ) {
        const activeAdminCount = await transaction.account.count({
          where: {
            globalRole: GlobalRole.SYSTEM_ADMIN,
            status: AccountStatus.ACTIVE,
          },
        });

        if (activeAdminCount <= 1) {
          throw new ConflictException(
            'The last active system admin cannot be disabled',
          );
        }
      }

      const account = await transaction.account.update({
        where: { id: accountId },
        data: { status: dto.status },
        select: accountSelect,
      });

      await transaction.auditLog.create({
        data: {
          actorId,
          action: 'ACCOUNT_STATUS_UPDATED',
          entityType: 'Account',
          entityId: accountId,
          metadata: { from: current.status, to: dto.status },
          ipAddress,
        },
      });

      return account;
    });

    if (dto.status !== AccountStatus.ACTIVE) {
      await this.authService.logoutAll(accountId);
    }

    return updated;
  }

  async logoutAccount(actorId: string, accountId: string, ipAddress?: string) {
    await this.findOneAccount(accountId);
    await this.authService.logoutAll(accountId);
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'ACCOUNT_SESSIONS_REVOKED',
        entityType: 'Account',
        entityId: accountId,
        ipAddress,
      },
    });

    return { message: 'All sessions for the account were revoked.' };
  }

  async approveUniversityRegistration(
    actorId: string,
    accountId: string,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const account = await tx.account.findUnique({
          where: { id: accountId },
          select: accountSelect,
        });
        if (!account) throw new NotFoundException('Account was not found');
        const profile = account.schoolUser;
        if (
          account.deletedAt ||
          !account.emailVerifiedAt ||
          account.status !== AccountStatus.ACTIVE ||
          account.globalRole !== GlobalRole.USER
        ) {
          throw new BadRequestException(
            'An active account with verified email is required',
          );
        }
        if (
          !profile ||
          profile.role !== SchoolUserRole.UNIVERSITY_ADMIN ||
          profile.status !== SchoolUserStatus.PENDING
        ) {
          throw new BadRequestException(
            'Only a pending university administrator registration can be approved',
          );
        }
        if (
          profile.university.status !== UniversityStatus.PENDING &&
          profile.university.status !== UniversityStatus.VERIFIED
        ) {
          throw new BadRequestException(
            'A suspended or inactive university cannot be approved',
          );
        }
        await tx.university.update({
          where: { id: profile.universityId },
          data: { status: UniversityStatus.VERIFIED },
        });
        await tx.schoolUser.update({
          where: { id: profile.id },
          data: { status: SchoolUserStatus.ACTIVE },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'UNIVERSITY_REGISTRATION_APPROVED',
            entityType: 'University',
            entityId: profile.universityId,
            metadata: {
              accountId,
              schoolUserId: profile.id,
              universityStatusFrom: profile.university.status,
              universityStatusTo: UniversityStatus.VERIFIED,
            },
            ipAddress,
          },
        });
        return { message: 'University verified and administrator approved.' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  findAllUniversities(query: QueryUniversityDto) {
    const keyword = query.keyword?.trim();

    return this.prisma.university.findMany({
      where: {
        ...(query.status && { status: query.status }),
        ...(keyword && {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' as const } },
            { code: { contains: keyword, mode: 'insensitive' as const } },
          ],
        }),
      },
      include: { _count: { select: { schoolUsers: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUniversityStatus(
    actorId: string,
    universityId: string,
    dto: UpdateUniversityStatusDto,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.university.findUnique({
        where: { id: universityId },
        select: { status: true },
      });

      if (!current) {
        throw new NotFoundException(
          `University with id "${universityId}" was not found`,
        );
      }

      const order: Record<UniversityStatus, number> = {
        [UniversityStatus.PENDING]: 0,
        [UniversityStatus.VERIFIED]: 1,
        [UniversityStatus.SUSPENDED]: 2,
        [UniversityStatus.INACTIVE]: 3,
      };

      if (order[dto.status] < order[current.status]) {
        throw new BadRequestException(
          `Can not back to status before: ${current.status} -> ${dto.status}`,
        );
      }

      const university = await transaction.university.update({
        where: { id: universityId },
        data: { status: dto.status },
      });

      await transaction.auditLog.create({
        data: {
          actorId,
          action: 'UNIVERSITY_STATUS_UPDATED',
          entityType: 'University',
          entityId: universityId,
          metadata: { from: current.status, to: dto.status },
          ipAddress,
        },
      });

      return university;
    });
  }

  findAuditLogs(query: QueryAuditLogDto) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(query.actorId && { actorId: query.actorId }),
        ...(query.action && {
          action: { contains: query.action.trim(), mode: 'insensitive' },
        }),
        ...(query.entityType && {
          entityType: {
            contains: query.entityType.trim(),
            mode: 'insensitive',
          },
        }),
      },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            fullName: true,
            globalRole: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
