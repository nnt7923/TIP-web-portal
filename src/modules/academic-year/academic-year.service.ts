import { getUniversityId } from '../../common/utils/university-scope.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { QueryAcademicYearDto } from './dto/query-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';

@Injectable()
export class AcademicYearService {
  constructor(private readonly prisma: PrismaService) {}

  async create(currentUser: CurrentUserData, dto: CreateAcademicYearDto) {
    const universityId = this.getUniversityId(currentUser);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    this.assertValidDateRange(startDate, endDate);

    try {
      return await this.prisma.academicYear.create({
        data: {
          universityId,
          name: dto.name.trim(),
          startDate,
          endDate,
          ...(dto.status !== undefined && { status: dto.status }),
        },
      });
    } catch (error) {
      handlePrismaError(error, {
        duplicate: 'Academic Year already exists in this university',
      });
    }
  }

  findAll(currentUser: CurrentUserData, query: QueryAcademicYearDto) {
    const keyword = query.keywords?.trim();
    const where: Prisma.AcademicYearWhereInput = {
      universityId: this.getUniversityId(currentUser),
      ...(query.status && { status: query.status }),
      ...(keyword && {
        name: { contains: keyword, mode: 'insensitive' },
      }),
    };

    return this.prisma.academicYear.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(currentUser: CurrentUserData, id: string) {
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { id, universityId: this.getUniversityId(currentUser) },
    });

    if (!academicYear) {
      throw new NotFoundException(
        `Academic Year with id "${id}" was not found`,
      );
    }

    return academicYear;
  }

  async update(
    currentUser: CurrentUserData,
    id: string,
    dto: UpdateAcademicYearDto,
  ) {
    const universityId = this.getUniversityId(currentUser);
    const currentAcademicYear = await this.findOneInUniversity(
      id,
      universityId,
    );
    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : currentAcademicYear.startDate;
    const endDate = dto.endDate
      ? new Date(dto.endDate)
      : currentAcademicYear.endDate;

    this.assertValidDateRange(startDate, endDate);

    const outsidePeriod = await this.prisma.internshipPeriod.findFirst({
      where: {
        academicYearId: id,
        OR: [{ startDate: { lt: startDate } }, { endDate: { gt: endDate } }],
      },
      select: { id: true },
    });
    if (outsidePeriod)
      throw new BadRequestException(
        'Existing internship periods fall outside the new academic year dates',
      );

    const data: Prisma.AcademicYearUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.startDate !== undefined && { startDate }),
      ...(dto.endDate !== undefined && { endDate }),
      ...(dto.status !== undefined && { status: dto.status }),
    };

    try {
      return await this.prisma.academicYear.update({
        where: { id, universityId },
        data,
      });
    } catch (error) {
      handlePrismaError(error, {
        duplicate: 'Academic Year already exists in this university',
        notFound: `Academic Year with id "${id}" was not found`,
      });
    }
  }

  async remove(currentUser: CurrentUserData, id: string): Promise<void> {
    const universityId = this.getUniversityId(currentUser);

    await this.findOneInUniversity(id, universityId);

    try {
      await this.prisma.academicYear.delete({ where: { id, universityId } });
    } catch (error) {
      handlePrismaError(error, {
        notFound: `Academic Year with id "${id}" was not found`,
      });
    }
  }

  /** Returns the university of the authenticated SchoolUser or Student. */
  private getUniversityId(currentUser: CurrentUserData): string {
    return getUniversityId(currentUser);
  }

  /** Finds an Academic Year only when it belongs to the current university. */
  private async findOneInUniversity(id: string, universityId: string) {
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id, universityId },
    });

    if (!academicYear) {
      throw new NotFoundException(
        'Academic Year was not found in your university',
      );
    }

    return academicYear;
  }

  /** Ensures the academic year begins before it ends. */
  private assertValidDateRange(startDate: Date, endDate: Date): void {
    if (startDate >= endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }
  }
}
