import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { Prisma } from '@prisma/client';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { normalizeCode } from '../../common/utils/text.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateMajorDto } from './dto/create-major.dto';
import { QueryMajorDto } from './dto/query-major.dto';
import { UpdateMajorDto } from './dto/update-major.dto';

@Injectable()
export class MajorService {
  constructor(private readonly prisma: PrismaService) {}

  async create(currentUser: CurrentUserData, dto: CreateMajorDto) {
    const universityId = this.getUniversityId(currentUser);
    try {
      return await this.prisma.major.create({
        data: {
          universityId,
          name: dto.name.trim(),
          code: normalizeCode(dto.code),
        },
      });
    } catch (error) {
      handlePrismaError(error, {
        duplicate: 'Major name or code already exists in this university',
      });
    }
  }

  findAll(query: QueryMajorDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.MajorWhereInput = {
      ...(keyword && {
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { code: { contains: keyword, mode: 'insensitive' } },
        ],
      }),
    };

    return this.prisma.major.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const major = await this.prisma.major.findUnique({
      where: { id },
    });

    if (!major) {
      throw new NotFoundException(`Major with id "${id}" was not found`);
    }

    return major;
  }

  async update(
    currentUser: CurrentUserData,
    id: string,
    updateMajorDto: UpdateMajorDto,
  ) {
    const universityId = this.getUniversityId(currentUser);

    await this.findOneInUniversity(id, universityId);
    const { ...majorData } = updateMajorDto;
    const data: Prisma.MajorUpdateInput = {
      ...majorData,
      ...(updateMajorDto.name !== undefined && {
        name: updateMajorDto.name.trim(),
      }),
      ...(updateMajorDto.code !== undefined && {
        code: normalizeCode(updateMajorDto.code),
      }),
    };

    try {
      const updateMajor = await this.prisma.major.update({
        where: { id },
        data,
      });

      return updateMajor;
    } catch (error) {
      handlePrismaError(error, {
        duplicate: 'Major name or code already exist in this university',
        notFound: `Major with id "${id}" was not found`,
      });
    }
  }

  /** Lấy trường của SchoolUser đang đăng nhập. */
  private getUniversityId(currentUser: CurrentUserData): string {
    if (!currentUser.schoolUser) {
      throw new ForbiddenException('School user profile was not found');
    }

    return currentUser.schoolUser.universityId;
  }

  private async findOneInUniversity(id: string, universityId: string) {
    const major = await this.prisma.major.findFirst({
      where: {
        id,
        universityId,
      },
    });

    if (!major) {
      throw new NotFoundException('Major was not found in your university');
    }

    return major;
  }

  async remove(currentUser: CurrentUserData, id: string) {
    const universityId = this.getUniversityId(currentUser);

    await this.findOneInUniversity(id, universityId);

    await this.prisma.major.delete({
      where: { id },
    });
  }
}
