import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException ,
} from '@nestjs/common';
import {
  AccountStatus,
  GlobalRole,
  Prisma,
  SchoolUserStatus,
} from '@prisma/client';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { CreateSchoolUserDto } from './dto/create-schooluser';
import { QuerySchoolUserDto } from './dto/query-schooluser';
import { UpdateSchoolUserDto } from './dto/update-schooluser';
import { ApproveSchoolUserDto } from './dto/approve-schooluser.dto';

const scryptAsync = promisify(scrypt);
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
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSchoolUserDto) {
    try {
      return await this.prisma.account.create({
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email.trim().toLowerCase(),
          username: dto.username.trim(),
          passwordHash: await this.hashPassword(dto.password),
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
        select: {
          ...safeAccountSelect,
          schoolUser: true,
        },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  findAllSchoolUsers(universityId: string, query: QuerySchoolUserDto) {
    return this.findMany({ ...query, universityId });
  }

  findAll(query: QuerySchoolUserDto) {
    return this.findMany(query);
  }

  async findOne(id: string) {
    const schoolUser = await this.prisma.schoolUser.findUnique({
      where: { id },
      include: { account: { select: safeAccountSelect }, university: true },
    });

    if (!schoolUser) {
      throw new NotFoundException(`School user with id "${id}" was not found`);
    }

    return schoolUser;
  }

  async update(id: string, dto: UpdateSchoolUserDto) {
    await this.findOne(id);

    const accountData: Prisma.AccountUpdateInput = {
      ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
      ...(dto.email !== undefined && {
        email: dto.email.trim().toLowerCase(),
      }),
      ...(dto.username !== undefined && { username: dto.username.trim() }),
      ...(dto.phone !== undefined && { phone: dto.phone.trim() }),
      ...(dto.password !== undefined && {
        passwordHash: await this.hashPassword(dto.password),
      }),
    };

    try {
      return await this.prisma.schoolUser.update({
        where: { id },
        data: {
          ...(dto.role !== undefined && { role: dto.role }),
          ...(dto.status !== undefined && { status: dto.status }),
          account: { update: accountData },
        },
        include: { account: { select: safeAccountSelect }, university: true },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string): Promise<void> {
    const schoolUser = await this.findOne(id);

    try {
      await this.prisma.account.delete({
        where: { id: schoolUser.accountId },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private findMany(query: QuerySchoolUserDto & { universityId?: string }) {
    const keyword = query.keyword?.trim();

    return this.prisma.schoolUser.findMany({
      where: {
        ...(query.universityId && { universityId: query.universityId }),
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

  async approve(
    currentUser: CurrentUserData,
    schoolUserId: string,
    dto: ApproveSchoolUserDto,
  ) {
    const adminProfile = currentUser.schoolUser;

    if (!adminProfile) {
      throw new ForbiddenException('School user profile was not found');
    }

    const targetUser = await this.prisma.schoolUser.findUnique({
      where: { id: schoolUserId },
      select: {
        id: true,
        universityId: true,
        status: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('School user was not found');
    }

    if (targetUser.universityId !== adminProfile.universityId) {
      throw new ForbiddenException('You cannot manage users from anther university');
    }

    return this.prisma.schoolUser.update({
      where: { id: schoolUserId },
      data: {
        role: dto.role,
        status: SchoolUserStatus.ACTIVE,
      },
      include: {
        account: {
          select: safeAccountSelect,
        },
        university: true
      },
    });
  }

  /** Creates a salted scrypt hash for safe password storage. */
  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  /** Converts known Prisma constraint errors into readable HTTP errors. */
  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Username or email already exists');
      }

      if (error.code === 'P2003') {
        throw new NotFoundException('University was not found');
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('School user was not found');
      }
    }

    throw error;
  }
}
