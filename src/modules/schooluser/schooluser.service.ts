import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  GlobalRole,
  Prisma,
  SchoolUserRole,
  SchoolUserStatus,
} from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { hashPassword } from '../../common/utils/password.util';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateSchoolUserDto } from './dto/create-schooluser';
import { QuerySchoolUserDto } from './dto/query-schooluser';
import { UpdateSchoolUserDto } from './dto/update-schooluser';
import { ApproveSchoolUserDto } from './dto/approve-schooluser.dto';

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
export class SchoolUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async create(user: CurrentUserData, dto: CreateSchoolUserDto) {
    this.managerUniversity(user, dto.universityId);
    this.assertRoleAssignment(user, dto.role);
    try {
      return await this.prisma.account.create({
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email.trim().toLowerCase(),
          username: dto.username.trim(),
          passwordHash: await hashPassword(dto.password),
          phone: dto.phone.trim(),
          globalRole: GlobalRole.USER,
          status: AccountStatus.ACTIVE,
          schoolUser: {
            create: {
              universityId: dto.universityId,
              role: dto.role,
              status: SchoolUserStatus.PENDING,
            },
          },
        },
        select: { ...safeAccountSelect, schoolUser: true },
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  findAllSchoolUsers(
    user: CurrentUserData,
    universityId: string,
    query: QuerySchoolUserDto,
  ) {
    return this.findMany(query, this.managerUniversity(user, universityId));
  }

  findAll(user: CurrentUserData, query: QuerySchoolUserDto) {
    return this.findMany(query, this.managerUniversity(user));
  }

  async findOne(user: CurrentUserData, id: string) {
    const universityId = this.managerUniversity(user);
    const profile = await this.prisma.schoolUser.findFirst({
      where: { id, ...(universityId && { universityId }) },
      include: { account: { select: safeAccountSelect }, university: true },
    });
    if (!profile)
      throw new NotFoundException('School user was not found in your scope');
    return profile;
  }

  async update(user: CurrentUserData, id: string, dto: UpdateSchoolUserDto) {
    const target = await this.findOne(user, id);
    this.assertManageTarget(user, target);
    if (dto.role !== undefined) this.assertRoleAssignment(user, dto.role);
    const email = dto.email?.trim().toLowerCase();
    const emailChanged = email !== undefined && email !== target.account.email;
    const accountData: Prisma.AccountUpdateInput = {
      ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
      ...(emailChanged && { email, emailVerifiedAt: null }),
      ...(dto.username !== undefined && { username: dto.username.trim() }),
      ...(dto.phone !== undefined && { phone: dto.phone.trim() }),
      ...(dto.password !== undefined && {
        passwordHash: await hashPassword(dto.password),
      }),
    };
    try {
      const updated = await this.prisma.schoolUser.update({
        where: {
          id,
          universityId: target.universityId,
          account: { globalRole: GlobalRole.USER },
        },
        data: {
          ...(dto.role !== undefined && { role: dto.role }),
          ...(dto.status !== undefined && { status: dto.status }),
          account: { update: accountData },
        },
        include: { account: { select: safeAccountSelect }, university: true },
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

  /** Xóa profile trường, giữ Account chung và audit log của tài khoản. */
  async remove(user: CurrentUserData, id: string): Promise<void> {
    const target = await this.findOne(user, id);
    this.assertManageTarget(user, target);
    try {
      await this.prisma.schoolUser.delete({
        where: {
          id,
          universityId: target.universityId,
          account: { globalRole: GlobalRole.USER },
        },
      });
      await this.auth.logoutAll(target.accountId);
    } catch (error) {
      this.handleError(error);
    }
  }

  async approve(user: CurrentUserData, id: string, dto: ApproveSchoolUserDto) {
    const target = await this.findOne(user, id);
    if (target.status !== SchoolUserStatus.PENDING) {
      throw new BadRequestException(
        'Only pending school users can be approved',
      );
    }
    return this.update(user, id, {
      role: dto.role,
      status: SchoolUserStatus.ACTIVE,
    });
  }

  private findMany(query: QuerySchoolUserDto, universityId?: string) {
    const keyword = query.keyword?.trim();
    return this.prisma.schoolUser.findMany({
      where: {
        ...(universityId && { universityId }),
        ...(query.status && { status: query.status }),
        ...(query.role && { role: query.role }),
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
      include: { account: { select: safeAccountSelect }, university: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** System Admin có phạm vi toàn hệ thống; admin trường chỉ có trường của mình. */
  private managerUniversity(
    user: CurrentUserData,
    requestedUniversityId?: string,
  ): string | undefined {
    if (user.globalRole === GlobalRole.SYSTEM_ADMIN)
      return requestedUniversityId;
    if (
      user.schoolUser?.role !== SchoolUserRole.UNIVERSITY_ADMIN ||
      user.schoolUser.status !== SchoolUserStatus.ACTIVE
    ) {
      throw new ForbiddenException('Administrator permission is required');
    }
    if (
      requestedUniversityId &&
      requestedUniversityId !== user.schoolUser.universityId
    ) {
      throw new ForbiddenException('You cannot access another university');
    }
    return user.schoolUser.universityId;
  }

  private assertRoleAssignment(
    user: CurrentUserData,
    role: SchoolUserRole,
  ): void {
    if (
      role === SchoolUserRole.UNIVERSITY_ADMIN &&
      user.globalRole !== GlobalRole.SYSTEM_ADMIN
    ) {
      throw new ForbiddenException(
        'Only System Admin can assign UNIVERSITY_ADMIN',
      );
    }
  }

  private assertManageTarget(
    user: CurrentUserData,
    target: {
      accountId: string;
      role: SchoolUserRole;
      account: { globalRole: GlobalRole };
    },
  ): void {
    if (target.account.globalRole !== GlobalRole.USER) {
      throw new ForbiddenException(
        'Privileged accounts cannot be managed through school profiles',
      );
    }
    if (target.accountId === user.id)
      throw new ForbiddenException('Use account self-service endpoints');
    if (
      target.role === SchoolUserRole.UNIVERSITY_ADMIN &&
      user.globalRole !== GlobalRole.SYSTEM_ADMIN
    ) {
      throw new ForbiddenException(
        'Only System Admin can manage a university administrator',
      );
    }
  }

  private handleError(error: unknown): never {
    handlePrismaError(error, {
      duplicate: 'Username or email already exists',
      notFound: 'School user was not found',
    });
  }
}
