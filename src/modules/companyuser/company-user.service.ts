import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  CompanyUserRole,
  CompanyUserStatus,
  GlobalRole,
  Prisma,
} from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { hashPassword } from '../../common/utils/password.util';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { normalizeOptionalText } from '../../common/utils/text.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ApproveCompanyUserDto } from './dto/approve-company-user.dto';
import { CreateCompanyUserDto } from './dto/create-company-user.dto';
import { QueryCompanyUserDto } from './dto/query-company-user.dto';
import { UpdateCompanyUserProfileDto } from './dto/update-company-user-profile.dto';
import { UpdateCompanyUserDto } from './dto/update-company-user.dto';

const safeAccountSelect = {
  id: true,
  fullName: true,
  email: true,
  username: true,
  phone: true,
  globalRole: true,
  status: true,
  emailVerifiedAt: true,
} satisfies Prisma.AccountSelect;

@Injectable()
export class CompanyUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async create(user: CurrentUserData, dto: CreateCompanyUserDto) {
    const companyId = this.managerCompany(user, dto.companyId) ?? dto.companyId;
    this.assertRoleAssignment(user, dto.role);
    await this.assertCompanyExists(companyId);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const account = await transaction.account.create({
          data: {
            fullName: dto.fullName.trim(),
            email: dto.email.trim().toLowerCase(),
            username: dto.username.trim(),
            passwordHash: await hashPassword(dto.password),
            phone: normalizeOptionalText(dto.phone),
            globalRole: GlobalRole.USER,
            status: AccountStatus.ACTIVE,
            companyUser: {
              create: {
                companyId,
                role: dto.role,
                status: CompanyUserStatus.PENDING,
              },
            },
          },
          select: {
            ...safeAccountSelect,
            companyUser: {
              select: { id: true, companyId: true, role: true, status: true },
            },
          },
        });

        await transaction.auditLog.create({
          data: {
            actorId: user.id,
            action: 'COMPANY_USER_CREATED',
            entityType: 'CompanyUser',
            entityId: account.companyUser?.id,
            metadata: { companyId, role: dto.role },
          },
        });

        return account;
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  findAll(user: CurrentUserData, query: QueryCompanyUserDto) {
    const companyId = this.managerCompany(user, query.companyId);
    return this.findMany(query, companyId);
  }

  findAllInCompany(
    user: CurrentUserData,
    companyId: string,
    query: QueryCompanyUserDto,
  ) {
    return this.findMany(query, this.managerCompany(user, companyId));
  }

  async findOne(user: CurrentUserData, id: string) {
    const companyId = this.managerCompany(user);
    return this.findOneInScope(id, companyId);
  }

  async findMe(user: CurrentUserData) {
    if (!user.companyUser) {
      throw new ForbiddenException('Company user profile is required');
    }
    return this.findOneInScope(user.companyUser.id, user.companyUser.companyId);
  }

  async updateMe(user: CurrentUserData, dto: UpdateCompanyUserProfileDto) {
    if (!user.companyUser) {
      throw new ForbiddenException('Company user profile is required');
    }

    const data: Prisma.AccountUpdateInput = {
      ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
      ...(dto.phone !== undefined && {
        phone: normalizeOptionalText(dto.phone) || null,
      }),
    };
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field must be updated');
    }

    return this.prisma.account.update({
      where: { id: user.id },
      data,
      select: {
        ...safeAccountSelect,
        companyUser: { include: { company: true } },
      },
    });
  }

  async update(user: CurrentUserData, id: string, dto: UpdateCompanyUserDto) {
    const target = await this.findOne(user, id);
    this.assertManageTarget(user, target);
    if (dto.role !== undefined) this.assertRoleAssignment(user, dto.role);

    const email = dto.email?.trim().toLowerCase();
    const emailChanged = email !== undefined && email !== target.account.email;
    const accountData: Prisma.AccountUpdateInput = {
      ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
      ...(emailChanged && { email, emailVerifiedAt: null }),
      ...(dto.username !== undefined && { username: dto.username.trim() }),
      ...(dto.phone !== undefined && {
        phone: normalizeOptionalText(dto.phone) || null,
      }),
      ...(dto.password !== undefined && {
        passwordHash: await hashPassword(dto.password),
      }),
    };
    const data: Prisma.CompanyUserUpdateInput = {
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(Object.keys(accountData).length > 0 && {
        account: { update: accountData },
      }),
    };

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field must be updated');
    }

    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const companyUser = await transaction.companyUser.update({
          where: {
            id,
            companyId: target.companyId,
            account: { globalRole: GlobalRole.USER },
          },
          data,
          include: {
            account: { select: safeAccountSelect },
            company: true,
          },
        });

        await transaction.auditLog.create({
          data: {
            actorId: user.id,
            action: 'COMPANY_USER_UPDATED',
            entityType: 'CompanyUser',
            entityId: id,
            metadata: { changedFields: Object.keys(dto) },
          },
        });

        return companyUser;
      });

      if (
        emailChanged ||
        dto.password !== undefined ||
        dto.status !== undefined ||
        dto.role !== undefined
      ) {
        await this.auth.logoutAll(target.accountId);
      }
      return updated;
    } catch (error) {
      this.handleError(error);
    }
  }

  async approve(user: CurrentUserData, id: string, dto: ApproveCompanyUserDto) {
    const target = await this.findOne(user, id);
    if (target.status !== CompanyUserStatus.PENDING) {
      throw new BadRequestException(
        'Only pending company users can be approved',
      );
    }

    return this.update(user, id, {
      role: dto.role,
      status: CompanyUserStatus.ACTIVE,
    });
  }

  async remove(user: CurrentUserData, id: string): Promise<void> {
    const target = await this.findOne(user, id);
    this.assertManageTarget(user, target);

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.companyUser.delete({
          where: {
            id,
            companyId: target.companyId,
            account: { globalRole: GlobalRole.USER },
          },
        });
        await transaction.auditLog.create({
          data: {
            actorId: user.id,
            action: 'COMPANY_USER_DELETED',
            entityType: 'CompanyUser',
            entityId: id,
            metadata: { companyId: target.companyId },
          },
        });
      });
      await this.auth.logoutAll(target.accountId);
    } catch (error) {
      this.handleError(error);
    }
  }

  private findMany(query: QueryCompanyUserDto, companyId?: string) {
    const keyword = query.keyword?.trim();
    return this.prisma.companyUser.findMany({
      where: {
        ...(companyId && { companyId }),
        ...(query.role && { role: query.role }),
        ...(query.status && { status: query.status }),
        ...(keyword && {
          account: {
            OR: [
              { fullName: { contains: keyword, mode: 'insensitive' } },
              { username: { contains: keyword, mode: 'insensitive' } },
              { email: { contains: keyword, mode: 'insensitive' } },
            ],
          },
        }),
      },
      include: { account: { select: safeAccountSelect }, company: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findOneInScope(id: string, companyId?: string) {
    const profile = await this.prisma.companyUser.findFirst({
      where: { id, ...(companyId && { companyId }) },
      include: { account: { select: safeAccountSelect }, company: true },
    });
    if (!profile) {
      throw new NotFoundException('Company user was not found in your scope');
    }
    return profile;
  }

  private managerCompany(
    user: CurrentUserData,
    requestedCompanyId?: string,
  ): string | undefined {
    if (user.globalRole === GlobalRole.SYSTEM_ADMIN) return requestedCompanyId;
    if (
      user.companyUser?.role !== CompanyUserRole.COMPANY_ADMIN ||
      user.companyUser.status !== CompanyUserStatus.ACTIVE
    ) {
      throw new ForbiddenException(
        'Company administrator permission is required',
      );
    }
    if (
      requestedCompanyId &&
      requestedCompanyId !== user.companyUser.companyId
    ) {
      throw new ForbiddenException('You cannot access another company');
    }
    return user.companyUser.companyId;
  }

  private assertRoleAssignment(
    user: CurrentUserData,
    role: CompanyUserRole,
  ): void {
    if (
      role === CompanyUserRole.COMPANY_ADMIN &&
      user.globalRole !== GlobalRole.SYSTEM_ADMIN
    ) {
      throw new ForbiddenException(
        'Only System Admin can assign COMPANY_ADMIN',
      );
    }
  }

  private assertManageTarget(
    user: CurrentUserData,
    target: {
      accountId: string;
      role: CompanyUserRole;
      account: { globalRole: GlobalRole };
    },
  ): void {
    if (target.account.globalRole !== GlobalRole.USER) {
      throw new ForbiddenException(
        'Privileged accounts cannot be managed through company profiles',
      );
    }
    if (target.accountId === user.id) {
      throw new ForbiddenException('Use account self-service endpoints');
    }
    if (
      target.role === CompanyUserRole.COMPANY_ADMIN &&
      user.globalRole !== GlobalRole.SYSTEM_ADMIN
    ) {
      throw new ForbiddenException(
        'Only System Admin can manage a company administrator',
      );
    }
  }

  private async assertCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company was not found');
  }

  private handleError(error: unknown): never {
    handlePrismaError(error, {
      duplicate: 'Username or email already exists',
      notFound: 'Company user was not found',
    });
  }
}
