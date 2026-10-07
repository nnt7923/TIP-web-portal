import { NotificationEventsService } from '../notifications/notification-events.service';
import { getUniversityId } from '../../common/utils/university-scope.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  InternshipPeriodStatus,
  PlacementStatus,
  StudentInternshipStatus,
} from '@prisma/client';
import { getPlacementUniversityId } from '../placement/placement.policy';
import { CreateInternshipRegistrationDto } from './dto/create-internship-registration.dto';
import { QueryInternshipRegistrationsDto } from './dto/query-internship-registrations.dto';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateInternShipPeriodDto } from './dto/create-internship-period.dto';
import { UpdateInternShipPeriodDto } from './dto/update-internship-period.dto';
import { QueryInternShipPeriodDto } from './dto/query-internship-period.dto';

const transitions: Record<InternshipPeriodStatus, InternshipPeriodStatus[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['ONGOING', 'CANCELLED'],
  ONGOING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};
const terminal: InternshipPeriodStatus[] = ['COMPLETED', 'CANCELLED'];
const registrationSelect = {
  id: true,
  status: true,
  createdAt: true,
  student: {
    select: { studentCode: true, account: { select: { fullName: true } } },
  },
} satisfies Prisma.StudentInternshipSelect;

@Injectable()
export class InternshipPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEvents: NotificationEventsService,
  ) {}

  async create(currentUser: CurrentUserData, dto: CreateInternShipPeriodDto) {
    const universityId = this.getUniversityId(currentUser);
    return this.mutate(async (tx) => {
      if (
        dto.status &&
        dto.status !== InternshipPeriodStatus.DRAFT &&
        dto.status !== InternshipPeriodStatus.OPEN
      )
        throw new BadRequestException('New periods must be DRAFT or OPEN');
      const academicYear = await this.getAcademicYearInUniversity(
        dto.academicYearId,
        universityId,
        tx,
      );
      const startDate = new Date(dto.startDate);
      const endDate = new Date(dto.endDate);
      const applyStartDate = new Date(dto.applyStartDate);
      const applyEndDate = new Date(dto.applyEndDate);

      this.assertValidDateRange(startDate, endDate, 'Internship period');
      this.assertPeriodSchedule(startDate, endDate, applyEndDate, academicYear);
      this.assertValidDateRange(
        applyStartDate,
        applyEndDate,
        'Application period',
      );

      return await tx.internshipPeriod.create({
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
    });
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
    return getUniversityId(currentUser);
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
    return this.mutate(async (tx) => {
      const currentPeriod = await this.findInternshipPeriodInUniversity(
        id,
        universityId,
        tx,
      );
      if (terminal.includes(currentPeriod.status))
        throw new BadRequestException(
          'Completed or cancelled periods cannot be edited',
        );
      const nextStatus = dto.status ?? currentPeriod.status;
      if (
        nextStatus !== currentPeriod.status &&
        !transitions[currentPeriod.status].includes(nextStatus)
      )
        throw new BadRequestException(
          `Cannot change period from ${currentPeriod.status} to ${nextStatus}`,
        );
      const academicYear = await this.getAcademicYearInUniversity(
        currentPeriod.academicYearId,
        universityId,
        tx,
      );

      const startDate = dto.startDate
        ? new Date(dto.startDate)
        : currentPeriod.startDate;
      const endDate = dto.endDate
        ? new Date(dto.endDate)
        : currentPeriod.endDate;
      const applyStartDate = dto.applyStartDate
        ? new Date(dto.applyStartDate)
        : currentPeriod.applyStartDate;
      const applyEndDate = dto.applyEndDate
        ? new Date(dto.applyEndDate)
        : currentPeriod.applyEndDate;

      this.assertValidDateRange(startDate, endDate, 'Internship period');
      this.assertPeriodSchedule(startDate, endDate, applyEndDate, academicYear);

      this.assertValidDateRange(
        applyStartDate,
        applyEndDate,
        'Application period',
      );

      const outsidePlacement = await tx.placement.findFirst({
        where: {
          studentInternship: { internshipPeriodId: id },
          status: { not: PlacementStatus.CANCELLED },
          OR: [{ startDate: { lt: startDate } }, { endDate: { gt: endDate } }],
        },
        select: { id: true },
      });
      if (outsidePlacement)
        throw new BadRequestException(
          'Existing placement dates fall outside the new internship period dates',
        );
      if (nextStatus !== currentPeriod.status) {
        const now = new Date();
        if (nextStatus === InternshipPeriodStatus.ONGOING && now < startDate)
          throw new BadRequestException(
            'The internship period start date has not been reached',
          );
        if (nextStatus === InternshipPeriodStatus.COMPLETED && now < endDate)
          throw new BadRequestException(
            'The internship period end date has not been reached',
          );
        if (terminal.includes(nextStatus)) {
          const unfinished = await tx.studentInternship.findFirst({
            where: {
              internshipPeriodId: id,
              OR: [
                {
                  status: {
                    in: [
                      StudentInternshipStatus.PLACED,
                      StudentInternshipStatus.IN_PROGRESS,
                    ],
                  },
                },
                {
                  placements: {
                    some: {
                      status: {
                        in: [
                          PlacementStatus.PENDING,
                          PlacementStatus.CONFIRMED,
                          PlacementStatus.IN_PROGRESS,
                        ],
                      },
                    },
                  },
                },
              ],
            },
            select: { id: true },
          });
          if (unfinished)
            throw new BadRequestException(
              'Finish or cancel all active placements before closing this period',
            );
          await tx.studentInternship.updateMany({
            where: {
              internshipPeriodId: id,
              status: {
                in: [
                  StudentInternshipStatus.READY,
                  StudentInternshipStatus.APPLYING,
                ],
              },
            },
            data: { status: StudentInternshipStatus.NOT_ASSIGNED },
          });
        }
      }

      const data: Prisma.InternshipPeriodUpdateInput = {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.periodNumber !== undefined && {
          periodNumber: dto.periodNumber,
        }),
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

      return await tx.internshipPeriod.update({
        where: { id, universityId },
        data,
      });
    });
  }

  async registerStudent(
    user: CurrentUserData,
    id: string,
    dto: CreateInternshipRegistrationDto,
  ) {
    const universityId = getPlacementUniversityId(user);
    return this.mutate(async (tx) => {
      const period = await this.findInternshipPeriodInUniversity(
        id,
        universityId,
        tx,
      );
      const now = new Date();
      if (
        period.status !== InternshipPeriodStatus.OPEN ||
        (period.applyStartDate && now < period.applyStartDate) ||
        (period.applyEndDate && now > period.applyEndDate) ||
        now >= period.startDate
      )
        throw new BadRequestException(
          'This period is not accepting registrations',
        );
      const student = await tx.student.findFirst({
        where: {
          id: dto.studentId,
          universityId,
          status: 'ACTIVE',
          account: {
            status: 'ACTIVE',
            deletedAt: null,
            emailVerifiedAt: { not: null },
          },
          university: { status: { notIn: ['INACTIVE', 'SUSPENDED'] } },
        },
        select: { id: true },
      });
      if (!student)
        throw new NotFoundException(
          'An active, verified student was not found in your university',
        );
      const registration = await tx.studentInternship.create({
        data: {
          studentId: student.id,
          internshipPeriodId: period.id,
          status: StudentInternshipStatus.READY,
        },
        select: registrationSelect,
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'INTERNSHIP_REGISTRATION_CREATED',
          entityType: 'StudentInternship',
          entityId: registration.id,
          metadata: { internshipPeriodId: id, studentId: student.id },
        },
      });
      await this.notificationEvents.internshipRegistration(
        tx,
        user.id,
        student.id,
        period.id,
        registration.id,
      );
      return registration;
    }, 'This student is already registered for this period');
  }

  async listRegistrations(
    user: CurrentUserData,
    id: string,
    query: QueryInternshipRegistrationsDto,
  ) {
    const universityId = getPlacementUniversityId(user);
    return this.prisma.$transaction(
      async (tx) => {
        await this.findInternshipPeriodInUniversity(id, universityId, tx);
        const where: Prisma.StudentInternshipWhereInput = {
          internshipPeriodId: id,
          student: { universityId },
        };
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const data = await tx.studentInternship.findMany({
          where,
          select: registrationSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        });
        const total = await tx.studentInternship.count({ where });
        return { data, total, page, limit };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async mutate<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    duplicate = 'Internship period already exists in this academic year',
  ): Promise<T> {
    try {
      return await this.notificationEvents.transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      handlePrismaError(error, {
        duplicate,
        notFound: 'Internship period or related record was not found',
      });
    }
  }

  async remove(currentUser: CurrentUserData, id: string): Promise<void> {
    const universityId = this.getUniversityId(currentUser);

    await this.findInternshipPeriodInUniversity(id, universityId);

    try {
      await this.prisma.internshipPeriod.delete({
        where: { id, universityId },
      });
    } catch (error) {
      handlePrismaError(error, {
        notFound: `Internship Period with id "${id}" was not found`,
      });
    }
  }

  private async findInternshipPeriodInUniversity(
    id: string,
    universityId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const internshipPeriod = await tx.internshipPeriod.findFirst({
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
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const academicYear = await tx.academicYear.findFirst({
      where: {
        id: academicYearId,
        universityId,
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!academicYear) {
      throw new NotFoundException(
        'Academic Year was not found in your university',
      );
    }

    return academicYear;
  }

  /** Kỳ thực tập nằm trong năm học, đăng ký kết thúc chậm nhất lúc bắt đầu kỳ. */
  private assertPeriodSchedule(
    start: Date,
    end: Date,
    applyEnd: Date | null,
    year: { startDate: Date; endDate: Date },
  ): void {
    if (start < year.startDate || end > year.endDate) {
      throw new BadRequestException(
        'Internship dates must be within the academic year',
      );
    }
    if (applyEnd && applyEnd > start) {
      throw new BadRequestException(
        'Application must close no later than the internship start',
      );
    }
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
