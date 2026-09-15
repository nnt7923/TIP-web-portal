import { Injectable, NotFoundException } from '@nestjs/common';
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

  async create(dto: CreateMajorDto) {
    try {
      return await this.prisma.major.create({
        data: {
          universityId: dto.universityId,
          name: dto.name.trim(),
          code: normalizeCode(dto.code),
        },
      });
    } catch (error) {
      handlePrismaError(error, {
        duplicate: 'Major code already exists',
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

  async update(id: string, updateMajorDto: UpdateMajorDto) {
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
        duplicate: 'Major code already exist',
        notFound: `Major with id "${id}" was not found`,
      });
    }
  }

  async remove(id: string) {
    try {
      const deleteMajor = await this.prisma.major.delete({
        where: { id },
      });

      return deleteMajor;
    } catch (error) {
      handlePrismaError(error, {
        notFound: `Major with "${id}" was not found`,
      });
    }
  }
}
