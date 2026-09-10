import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UniversityStatus } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { QueryUniversityDto } from './dto/query-university.dto';

@Injectable()
export class UniversitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUniversityDto) {
    const existing = await this.prisma.university.findUnique({
      where: {
        code: dto.code,
      },
    });

    if (existing) {
      throw new BadRequestException('Mã trường đã tồn tại');
    }

    return this.prisma.university.create({
      data: {
        name: dto.name,
        code: dto.code,
        website: dto.website,
        address: dto.address,
        logoUrl: dto.logoUrl,
        status: UniversityStatus.PENDING,
      },
    });
  }

  async findAll(query: QueryUniversityDto) {
    return this.prisma.university.findMany({
      where: {
        status: query.status,
        OR: query.keyword
          ? [
              {
                name: {
                  contains: query.keyword,
                  mode: 'insensitive',
                },
              },
              {
                code: {
                  contains: query.keyword,
                  mode: 'insensitive',
                },
              },
            ]
          : undefined,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const university = await this.prisma.university.findUnique({
      where: {
        id,
      },
    });

    if (!university) {
      throw new NotFoundException('Không tìm thấy trường');
    }

    return university;
  }

  async update(id: string, dto: UpdateUniversityDto) {
    const university = await this.prisma.university.findUnique({
      where: {
        id,
      },
    });

    if (!university) {
      throw new NotFoundException('Không tìm thấy trường');
    }

    if (dto.code && dto.code !== university.code) {
      const duplicated = await this.prisma.university.findUnique({
        where: {
          code: dto.code,
        },
      });

      if (duplicated) {
        throw new BadRequestException('Mã trường đã tồn tại');
      }
    }

    return this.prisma.university.update({
      where: {
        id,
      },
      data: {
        name: dto.name,
        code: dto.code,
        website: dto.website,
        address: dto.address,
        logoUrl: dto.logoUrl,
        status: dto.status,
      },
    });
  }

  async verify(id: string) {
    const university = await this.prisma.university.findUnique({
      where: {
        id,
      },
    });

    if (!university) {
      throw new NotFoundException('Không tìm thấy trường');
    }

    return this.prisma.university.update({
      where: {
        id,
      },
      data: {
        status: UniversityStatus.VERIFIED,
      },
    });
  }

  async suspend(id: string) {
    const university = await this.prisma.university.findUnique({
      where: {
        id,
      },
    });

    if (!university) {
      throw new NotFoundException('Không tìm thấy trường');
    }

    return this.prisma.university.update({
      where: {
        id,
      },
      data: {
        status: UniversityStatus.SUSPENDED,
      },
    });
  }

  async remove(id: string) {
    const university = await this.prisma.university.findUnique({
      where: {
        id,
      },
    });

    if (!university) {
      throw new NotFoundException('Không tìm thấy trường');
    }

    await this.prisma.university.delete({
      where: {
        id,
      },
    });

    return {
      message: 'Xóa trường thành công',
    };
  }
}