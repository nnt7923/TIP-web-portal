import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../../database/prisma.service';
import { CreateSchoolUserDto } from './dto/create-schooluser';
import { QuerySchoolUserDto } from './dto/query-schooluser';

const scryptAsync = promisify(scrypt);

@Injectable()
export class SchoolUserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSchoolUserDto: CreateSchoolUserDto) {
    const passwordHash = await this.hashPassword(createSchoolUserDto.password);

    try {
      return await this.prisma.schoolUser.create({
        data: {
          universityId: createSchoolUserDto.universityId,
          fullName: createSchoolUserDto.fullName.trim(),
          email: createSchoolUserDto.email.trim().toLowerCase(),
          username: createSchoolUserDto.username.trim(),
          passwordHash,
          phone: createSchoolUserDto.phone.trim(),
          role: createSchoolUserDto.role,
        },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;

    return `${salt}:${derivedKey.toString('hex')}`;
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Email already exists for this university');
      }

      if (error.code === 'P2003') {
        throw new NotFoundException('University was not found');
      }
    }

    throw error;
  }

  //find all user in university
  findAllSchoolUsers(universityId: string, query: QuerySchoolUserDto) {
    return this.prisma.schoolUser.findMany({
      where: {
        universityId,
        ...(query.status && { status: query.status }),
        ...(query.role && { role: query.role }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  //findAll user in all university
  findAll(query: QuerySchoolUserDto) {
    return this.prisma.schoolUser.findMany({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.role && { role: query.role }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const schoolUser = await this.prisma.schoolUser.findUnique({
      where: { id },
    });

    if (!schoolUser) {
      throw new NotFoundException(`School user with id "${id}" was not found`);
    }

    return schoolUser;
  }

  async update(id: string, updateSchoolUserDto: Partial<CreateSchoolUserDto>) {
    const currentSchoolUser = await this.findOne(id);
    const passwordHash = updateSchoolUserDto.password
      ? await this.hashPassword(updateSchoolUserDto.password)
      : currentSchoolUser.passwordHash;

    try {
      const data: Prisma.SchoolUserUpdateInput = {
        ...updateSchoolUserDto,
        ...(updateSchoolUserDto.fullName !== undefined && {
          fullName: updateSchoolUserDto.fullName.trim(),
        }),
        ...(updateSchoolUserDto.email !== undefined && {
          email: updateSchoolUserDto.email.trim().toLowerCase(),
        }),
        ...(updateSchoolUserDto.phone !== undefined && {
          phone: updateSchoolUserDto.phone.trim(),
        }),
        passwordHash,
      };

      const updatedSchoolUser = await this.prisma.schoolUser.update({
        where: { id },
        data,
      });

      return updatedSchoolUser;
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    try {
      await this.prisma.schoolUser.delete({
        where: { id },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }
}
