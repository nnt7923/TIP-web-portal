import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateInternShipPeriodDto } from './dto/create-internship-period.dto';
import { UpdateInternShipPeriodDto } from './dto/update-internship-period.dto';
import { QueryInternShipPeriodDto } from './dto/query-internship-period.dto';

@Injectable()
export class InternshipPeriodService {
  constructor(private readonly prisma: PrismaService) {}

  async create(currentUser: CurrentUserData, dto: CreateInternShipPeriodDto) {
    const universityId = this.getUniversityId(currentUser);
    const academicYear = await this.getAcademicYearInUniversity(
      dto.academicYearId,
      universityId,
    );
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const applyStartDate = new Date(dto.applyStartDate);
    const applyEndDate = new Date(dto.applyEndDate);

    this.assertValidDateRange(startDate, endDate, 'Internship period');
    this.assertValidDateRange(
      applyStartDate,
      applyEndDate,
      'Application period',
    );

    try {
      return await this.prisma.internshipPeriod.create({
        data: {
          universityId,
          academicYearId: academicYear.id,
          name: dto.name.trim(),
          periodNumber: dto.periodNumber,
          startDate,
          endDate,
          applyStartDate,
          applyEndDate,
          requiredHours: dto.requiredHours,
          requiredWeeks: dto.requiredWeeks,
          ...(dto.status !== undefined && { status: dto.status }),
        },
      });
    } catch (error) {
      handlePrismaError(error, {
        duplicate: 'Internship period already exists in this academic year',
      });
    }
  }

  findAll(currentUser: CurrentUserData, query: QueryInternShipPeriodDto) {
    const keyword = query.keywords?.trim();
    const universityId = this.getUniversityId(currentUser);
    const where: Prisma.InternshipPeriodWhereInput = {
      universityId,
      ...(query.status && { status: query.status }),
      ...(keyword && {
        name: { contains: keyword, mode: 'insensitive' },
      }),
    };

    return this.prisma.internshipPeriod.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  private getUniversityId(currentUser: CurrentUserData): string {
    if (!currentUser.schoolUser) {
      throw new ForbiddenException('School user profile was not found');
    }

    return currentUser.schoolUser.universityId;
  }

  async findOne(currentUser: CurrentUserData, id: string) {
    const universityId = this.getUniversityId(currentUser);
    const internshipPeriod = await this.prisma.internshipPeriod.findUnique({
      where: { id, universityId },
    });

    if (!internshipPeriod) {
      throw new NotFoundException(
        `Internship Period with id "${id}" was not found`,
      );
    }

    return internshipPeriod;
  }

  async update(
    currentUser: CurrentUserData,
    id: string,
    dto: UpdateInternShipPeriodDto,
  ) {
    const universityId = this.getUniversityId(currentUser);
    const currentPeriod = await this.findInternshipPeriodInUniversity(
      id,
      universityId,
    );
    // const academicYear = await this.getAcademicYearInUniversity(currentPeriod.academicYearId, universityId);

    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : currentPeriod.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : currentPeriod.endDate;
    const applyStartDate = dto.applyStartDate
      ? new Date(dto.applyStartDate)
      : currentPeriod.applyStartDate;
    const applyEndDate = dto.applyEndDate
      ? new Date(dto.applyEndDate)
      : currentPeriod.applyEndDate;

    this.assertValidDateRange(startDate, endDate, 'Internship period');

    this.assertValidDateRange(
      applyStartDate,
      applyEndDate,
      'Application period',
    );

    const data: Prisma.InternshipPeriodUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.periodNumber !== undefined && { periodNumber: dto.periodNumber }),
      ...(dto.startDate !== undefined && { startDate }),
      ...(dto.endDate !== undefined && { endDate }),
      ...(dto.applyStartDate !== undefined && { applyStartDate }),
      ...(dto.applyEndDate !== undefined && { applyEndDate }),
      ...(dto.requiredHours !== undefined && {
        requiredHours: dto.requiredHours,
      }),
      ...(dto.requiredWeeks !== undefined && {
        requiredWeeks: dto.requiredWeeks,
      }),
      ...(dto.status !== undefined && { status: dto.status }),
    };

    try {
      return await this.prisma.internshipPeriod.update({
        where: { id },
        data,
      });
    } catch (error) {
      handlePrismaError(error, {
        duplicate: 'Internship Period already exists in this university',
        notFound: `Internship Period with id "${id}" was not found`,
      });
    }
  }

  async remove(currentUser: CurrentUserData, id: string): Promise<void> {
    const universityId = this.getUniversityId(currentUser);

    await this.findInternshipPeriodInUniversity(id, universityId);

    try {
      await this.prisma.internshipPeriod.delete({ where: { id } });
    } catch (error) {
      handlePrismaError(error, {
        notFound: `Internship Period with id "${id}" was not found`,
      });
    }
  }

  private async findInternshipPeriodInUniversity(
    id: string,
    universityId: string,
  ) {
    const internshipPeriod = await this.prisma.internshipPeriod.findFirst({
      where: {
        id,
        universityId,
      },
    });

    if (!internshipPeriod) {
      throw new NotFoundException(
        'Internship period was not found in your university',
      );
    }

    return internshipPeriod;
  }

  /** Tìm năm học theo ID và bảo đảm nó thuộc trường hiện tại. */
  private async getAcademicYearInUniversity(
    academicYearId: string,
    universityId: string,
  ) {
    const academicYear = await this.prisma.academicYear.findFirst({
      where: {
        id: academicYearId,
        universityId,
      },
      select: {
        id: true,
      },
    });

    if (!academicYear) {
      throw new NotFoundException(
        'Academic Year was not found in your university',
      );
    }

    return academicYear;
  }

  /**
   * Validates a reusable date range such as an internship period or an
   * application period. Both dates must be provided together and the start
   * date must be earlier than the end date.
   */
  private assertValidDateRange(
    startDate: Date | null | undefined,
    endDate: Date | null | undefined,
    fieldName = 'Date range',
  ): void {
    if (!startDate && !endDate) {
      return;
    }

    if (!startDate || !endDate) {
      throw new BadRequestException(
        `${fieldName}: start date and end date must be provided together`,
      );
    }

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException(`${fieldName}: invalid date`);
    }

    if (startDate >= endDate) {
      throw new BadRequestException(
        `${fieldName}: start date must be before end date`,
      );
    }
  }
}
