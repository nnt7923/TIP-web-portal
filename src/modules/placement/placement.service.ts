import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  ApplicationStatus,
  CompanyStatus,
  CompanyUserStatus,
  InternshipPeriodStatus,
  OpportunityStatus,
  OpportunityType,
  PlacementStatus,
  Prisma,
  SchoolUserRole,
  SchoolUserStatus,
  StudentInternshipStatus,
  StudentStatus,
  UniversityStatus,
} from '@prisma/client';
import type { Placement } from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../database/prisma.service';
import { AssignCompanySupervisorDto } from './dto/assign-company-supervisor.dto';
import { ConfirmPlacementDto } from './dto/confirm-placement.dto';
import { CreatePlacementDto } from './dto/create-placement.dto';
import { QueryPlacementDto } from './dto/query-placement.dto';
import { UpdatePlacementDto } from './dto/update-placement.dto';
import { UpdatePlacementStatusDto } from './dto/update-placement-status.dto';
import {
  getPlacementCompanyId,
  getPlacementReadScope,
  getPlacementUniversityId,
} from './placement.policy';
import { placementInclude } from './placement.select';
import type { PlacementDetail } from './placement.select';

type PlacementContext = Omit<Placement, 'id' | 'createdAt' | 'updatedAt'>;
const activeAccount = {
  status: AccountStatus.ACTIVE,
  deletedAt: null,
  emailVerifiedAt: { not: null },
} satisfies Prisma.AccountWhereInput;
const activeUniversity = {
  status: { notIn: [UniversityStatus.INACTIVE, UniversityStatus.SUSPENDED] },
} satisfies Prisma.UniversityWhereInput;
const terminalStatuses: PlacementStatus[] = [
  PlacementStatus.COMPLETED,
  PlacementStatus.CANCELLED,
];
const transitions: Record<PlacementStatus, PlacementStatus[]> = {
  PENDING: [PlacementStatus.CANCELLED],
  CONFIRMED: [PlacementStatus.IN_PROGRESS, PlacementStatus.CANCELLED],
  IN_PROGRESS: [PlacementStatus.COMPLETED, PlacementStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class PlacementService {
  constructor(private readonly prisma: PrismaService) {}

  /** Trường tạo hồ sơ PENDING từ đơn ACCEPTED hoặc tạo trực tiếp cho sinh viên của mình. */
  async create(user: CurrentUserData, dto: CreatePlacementDto) {
    const universityId = getPlacementUniversityId(user);
    return this.mutate(async (tx) => {
      const source = await this.resolveSource(tx, universityId, dto);
      const data: PlacementContext = {
        ...source,
        universityId,
        positionTitle: dto.positionTitle.trim(),
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        universitySupervisorId: dto.universitySupervisorId ?? null,
        companySupervisorId: null,
        studentInternshipId: dto.studentInternshipId ?? null,
        status: PlacementStatus.PENDING,
      };
      await this.validateContext(tx, data);
      const placement = await tx.placement.create({
        data,
        include: placementInclude,
      });
      await this.audit(tx, user.id, placement.id, 'PLACEMENT_CREATED', {
        studentId: placement.studentId,
        companyId: placement.companyId,
        universityId,
        applicationId: placement.applicationId,
      });
      return placement;
    });
  }

  /** Query chỉ thu hẹp phạm vi của người đăng nhập; danh sách có phân trang. */
  async findAll(user: CurrentUserData, query: QueryPlacementDto) {
    const keyword = query.keyword?.trim();
    const filters: Prisma.PlacementWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.companyId && { companyId: query.companyId }),
      ...(query.universityId && { universityId: query.universityId }),
      ...(query.studentInternshipId && {
        studentInternshipId: query.studentInternshipId,
      }),
      ...(keyword && {
        OR: [
          { positionTitle: { contains: keyword, mode: 'insensitive' } },
          {
            student: {
              studentCode: { contains: keyword, mode: 'insensitive' },
            },
          },
          {
            student: {
              account: { fullName: { contains: keyword, mode: 'insensitive' } },
            },
          },
          { company: { name: { contains: keyword, mode: 'insensitive' } } },
        ],
      }),
    };
    const where: Prisma.PlacementWhereInput = {
      AND: [getPlacementReadScope(user), filters],
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await this.prisma.$transaction(
      [
        this.prisma.placement.findMany({
          where,
          include: placementInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.placement.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Trả 404 cho hồ sơ không tồn tại hoặc ngoài phạm vi được phép. */
  findOne(user: CurrentUserData, id: string) {
    return this.findInScope(this.prisma, id, getPlacementReadScope(user));
  }

  /** Trường sửa lịch/vị trí/kỳ khi PENDING; có thể đổi giảng viên trước khi hồ sơ kết thúc. */
  async update(user: CurrentUserData, id: string, dto: UpdatePlacementDto) {
    const scope = { universityId: getPlacementUniversityId(user) };
    return this.mutate(async (tx) => {
      const current = await this.findInScope(tx, id, scope);
      this.assertEditable(current.status);
      const changesSchedule =
        dto.positionTitle !== undefined ||
        dto.startDate !== undefined ||
        dto.endDate !== undefined ||
        dto.studentInternshipId !== undefined;
      if (changesSchedule && current.status !== PlacementStatus.PENDING)
        throw new BadRequestException(
          'Position, dates and internship registration can only change while PENDING',
        );
      const data = {
        ...(dto.positionTitle !== undefined && {
          positionTitle: dto.positionTitle.trim(),
        }),
        ...(dto.startDate !== undefined && {
          startDate: new Date(dto.startDate),
        }),
        ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
        ...(dto.studentInternshipId !== undefined && {
          studentInternshipId: dto.studentInternshipId,
        }),
        ...(dto.universitySupervisorId !== undefined && {
          universitySupervisorId: dto.universitySupervisorId,
        }),
      } satisfies Prisma.PlacementUncheckedUpdateManyInput;
      if (!Object.keys(data).length)
        throw new BadRequestException('At least one field must be updated');
      await this.validateContext(tx, { ...current, ...data }, current.id);
      return this.save(tx, user.id, current, scope, data, 'PLACEMENT_UPDATED');
    });
  }

  /** COMPANY_ADMIN xác nhận hồ sơ của công ty mình, không có ngoại lệ cho SYSTEM_ADMIN. */
  async confirm(
    user: CurrentUserData,
    id: string,
    dto: ConfirmPlacementDto = {},
  ) {
    const scope = { companyId: getPlacementCompanyId(user) };
    return this.mutate(async (tx) => {
      const current = await this.findInScope(tx, id, scope);
      if (current.status !== PlacementStatus.PENDING)
        throw new BadRequestException(
          'Only PENDING placements can be confirmed',
        );
      const companySupervisorId =
        dto.companySupervisorId ?? current.companySupervisorId;
      await this.validateContext(
        tx,
        { ...current, companySupervisorId },
        current.id,
      );
      await this.syncInternship(tx, current, PlacementStatus.CONFIRMED);
      return this.save(
        tx,
        user.id,
        current,
        scope,
        { status: PlacementStatus.CONFIRMED, companySupervisorId },
        'PLACEMENT_CONFIRMED',
      );
    });
  }

  /** Công ty phân công/gỡ người hướng dẫn của mình, không sửa giảng viên của trường. */
  async assignCompanySupervisor(
    user: CurrentUserData,
    id: string,
    dto: AssignCompanySupervisorDto,
  ) {
    const scope = { companyId: getPlacementCompanyId(user) };
    return this.mutate(async (tx) => {
      const current = await this.findInScope(tx, id, scope);
      this.assertEditable(current.status);
      if (dto.companySupervisorId === undefined)
        throw new BadRequestException(
          'companySupervisorId is required; use null to unassign',
        );
      await this.validateContext(
        tx,
        { ...current, companySupervisorId: dto.companySupervisorId },
        current.id,
      );
      return this.save(
        tx,
        user.id,
        current,
        scope,
        { companySupervisorId: dto.companySupervisorId },
        'PLACEMENT_COMPANY_SUPERVISOR_UPDATED',
      );
    });
  }

  /** Trường quản lý tiến độ/hủy hồ sơ; không nhảy trạng thái hoặc sửa hồ sơ đã kết thúc. */
  async updateStatus(
    user: CurrentUserData,
    id: string,
    dto: UpdatePlacementStatusDto,
  ) {
    const scope = { universityId: getPlacementUniversityId(user) };
    return this.mutate(async (tx) => {
      const current = await this.findInScope(tx, id, scope);
      if (!transitions[current.status].includes(dto.status))
        throw new BadRequestException(
          `Cannot change placement from ${current.status} to ${dto.status}`,
        );
      if (dto.status !== PlacementStatus.CANCELLED) {
        await this.validateContext(tx, current, current.id);
        const now = new Date();
        if (
          dto.status === PlacementStatus.IN_PROGRESS &&
          now < current.startDate
        )
          throw new BadRequestException(
            'The placement start date has not been reached',
          );
        if (dto.status === PlacementStatus.COMPLETED && now < current.endDate)
          throw new BadRequestException(
            'The placement end date has not been reached',
          );
      }
      await this.syncInternship(tx, current, dto.status);
      return this.save(
        tx,
        user.id,
        current,
        scope,
        { status: dto.status },
        'PLACEMENT_STATUS_UPDATED',
      );
    });
  }

  /** Dẫn xuất các ID từ đơn ứng tuyển; ngăn ghép đơn của người/trường/công ty khác. */
  private async resolveSource(
    tx: Prisma.TransactionClient,
    universityId: string,
    dto: CreatePlacementDto,
  ) {
    if (dto.applicationId) {
      const application = await tx.application.findFirst({
        where: { id: dto.applicationId, universityId },
        include: { opportunity: { select: { companyId: true } } },
      });
      if (!application)
        throw new NotFoundException(
          'Application was not found in your university',
        );
      if (application.status !== ApplicationStatus.ACCEPTED)
        throw new BadRequestException(
          'Only ACCEPTED applications can become placements',
        );
      if (
        (dto.studentId && dto.studentId !== application.studentId) ||
        (dto.companyId &&
          dto.companyId !== application.opportunity.companyId) ||
        (dto.opportunityId && dto.opportunityId !== application.opportunityId)
      )
        throw new BadRequestException(
          'Student, company and opportunity must match the application',
        );
      return {
        applicationId: application.id,
        studentId: application.studentId,
        companyId: application.opportunity.companyId,
        opportunityId: application.opportunityId,
      };
    }
    if (!dto.studentId || !dto.companyId)
      throw new BadRequestException(
        'studentId and companyId are required when applicationId is omitted',
      );
    return {
      applicationId: null,
      studentId: dto.studentId,
      companyId: dto.companyId,
      opportunityId: dto.opportunityId ?? null,
    };
  }

  /** Kiểm tra lịch, tổ chức, nguồn tuyển dụng, người hướng dẫn và kỳ thực tập trong transaction. */
  private async validateContext(
    tx: Prisma.TransactionClient,
    data: PlacementContext,
    excludeId?: string,
  ) {
    if (!data.positionTitle.trim())
      throw new BadRequestException('positionTitle cannot be blank');
    if (
      !Number.isFinite(data.startDate.getTime()) ||
      !Number.isFinite(data.endDate.getTime()) ||
      data.startDate >= data.endDate
    )
      throw new BadRequestException(
        'startDate must be a valid date before endDate',
      );
    const student = await tx.student.findFirst({
      where: {
        id: data.studentId,
        universityId: data.universityId,
        status: StudentStatus.ACTIVE,
        account: activeAccount,
        university: activeUniversity,
      },
      select: { id: true },
    });
    if (!student)
      throw new NotFoundException(
        'An active, verified student was not found in this university',
      );
    const company = await tx.company.findFirst({
      where: { id: data.companyId, status: CompanyStatus.VERIFIED },
      select: { id: true },
    });
    if (!company)
      throw new NotFoundException('A verified company was not found');
    if (data.applicationId) {
      const application = await tx.application.findFirst({
        where: {
          id: data.applicationId,
          studentId: data.studentId,
          universityId: data.universityId,
          opportunityId: data.opportunityId ?? '',
          status: ApplicationStatus.ACCEPTED,
        },
        select: { id: true },
      });
      if (!application)
        throw new BadRequestException(
          'The placement must match an ACCEPTED application',
        );
    }
    if (data.opportunityId) {
      const opportunity = await tx.opportunity.findFirst({
        where: {
          id: data.opportunityId,
          companyId: data.companyId,
          status: { in: [OpportunityStatus.OPEN, OpportunityStatus.CLOSED] },
        },
        select: { type: true },
      });
      if (!opportunity)
        throw new NotFoundException(
          'An OPEN or CLOSED opportunity was not found in this company',
        );
      if (data.studentInternshipId && opportunity.type === OpportunityType.JOB)
        throw new BadRequestException(
          'JOB opportunities cannot be linked to an internship period',
        );
    }
    if (data.universitySupervisorId) {
      const supervisor = await tx.schoolUser.findFirst({
        where: {
          id: data.universitySupervisorId,
          universityId: data.universityId,
          role: SchoolUserRole.UNIVERSITY_SUPERVISOR,
          status: SchoolUserStatus.ACTIVE,
          account: activeAccount,
        },
        select: { id: true },
      });
      if (!supervisor)
        throw new NotFoundException(
          'An active UNIVERSITY_SUPERVISOR was not found in this university',
        );
    }
    if (data.companySupervisorId) {
      const supervisor = await tx.companyUser.findFirst({
        where: {
          id: data.companySupervisorId,
          companyId: data.companyId,
          status: CompanyUserStatus.ACTIVE,
          account: activeAccount,
        },
        select: { id: true },
      });
      if (!supervisor)
        throw new NotFoundException(
          'An active company supervisor was not found in this company',
        );
    }
    if (data.studentInternshipId) {
      const registration = await tx.studentInternship.findFirst({
        where: {
          id: data.studentInternshipId,
          studentId: data.studentId,
          internshipPeriod: { universityId: data.universityId },
        },
        include: { internshipPeriod: true },
      });
      if (!registration)
        throw new NotFoundException(
          'Internship registration was not found for this student and university',
        );
      if (
        (
          [
            StudentInternshipStatus.COMPLETED,
            StudentInternshipStatus.FAILED,
            StudentInternshipStatus.NOT_ASSIGNED,
          ] as StudentInternshipStatus[]
        ).includes(registration.status)
      )
        throw new BadRequestException(
          'Internship registration is not eligible for a placement',
        );
      if (
        (
          [
            InternshipPeriodStatus.CANCELLED,
            InternshipPeriodStatus.COMPLETED,
          ] as InternshipPeriodStatus[]
        ).includes(registration.internshipPeriod.status)
      )
        throw new BadRequestException(
          'The internship period is no longer active',
        );
      if (
        data.startDate < registration.internshipPeriod.startDate ||
        data.endDate > registration.internshipPeriod.endDate
      )
        throw new BadRequestException(
          'Placement dates must be within the internship period',
        );
      const other = await tx.placement.findFirst({
        where: {
          studentInternshipId: data.studentInternshipId,
          status: { not: PlacementStatus.CANCELLED },
          ...(excludeId && { id: { not: excludeId } }),
        },
        select: { id: true },
      });
      if (other)
        throw new ConflictException(
          'This internship registration already has a non-cancelled placement',
        );
    }
  }

  /** Đồng bộ trạng thái đăng ký thực tập với tiến độ placement, trong cùng transaction. */
  private async syncInternship(
    tx: Prisma.TransactionClient,
    current: Placement,
    next: PlacementStatus,
  ) {
    if (
      !current.studentInternshipId ||
      (next === PlacementStatus.CANCELLED &&
        current.status === PlacementStatus.PENDING)
    )
      return;
    const target: Partial<Record<PlacementStatus, StudentInternshipStatus>> = {
      CONFIRMED: StudentInternshipStatus.PLACED,
      IN_PROGRESS: StudentInternshipStatus.IN_PROGRESS,
      COMPLETED: StudentInternshipStatus.COMPLETED,
      CANCELLED: StudentInternshipStatus.READY,
    };
    const status = target[next];
    if (!status) return;
    const expected =
      current.status === PlacementStatus.PENDING
        ? [StudentInternshipStatus.READY, StudentInternshipStatus.APPLYING]
        : current.status === PlacementStatus.CONFIRMED
          ? [StudentInternshipStatus.PLACED]
          : [StudentInternshipStatus.IN_PROGRESS];
    const result = await tx.studentInternship.updateMany({
      where: {
        id: current.studentInternshipId,
        studentId: current.studentId,
        status: { in: expected },
      },
      data: { status },
    });
    if (result.count !== 1)
      throw new ConflictException(
        'Internship registration changed or has an inconsistent status',
      );
  }

  /** Ghi có điều kiện để không ghi đè thay đổi đồng thời; audit được commit cùng dữ liệu. */
  private async save(
    tx: Prisma.TransactionClient,
    actorId: string,
    current: PlacementDetail,
    scope: Prisma.PlacementWhereInput,
    data: Prisma.PlacementUncheckedUpdateManyInput,
    action: string,
  ) {
    const result = await tx.placement.updateMany({
      where: {
        AND: [
          {
            id: current.id,
            status: current.status,
            updatedAt: current.updatedAt,
          },
          scope,
        ],
      },
      data,
    });
    if (result.count !== 1)
      throw new ConflictException('Placement changed. Reload and try again');
    await this.audit(tx, actorId, current.id, action, {
      changedFields: Object.keys(data),
      previousStatus: current.status,
    });
    return this.findInScope(tx, current.id, scope);
  }

  /** Dùng chung phạm vi truy cập cho thao tác đọc và ghi. */
  private async findInScope(
    tx: Prisma.TransactionClient,
    id: string,
    scope: Prisma.PlacementWhereInput,
  ) {
    const placement = await tx.placement.findFirst({
      where: { AND: [{ id }, scope] },
      include: placementInclude,
    });
    if (!placement)
      throw new NotFoundException('Placement was not found in your scope');
    return placement;
  }

  /** Giữ nguyên lịch sử sau khi hồ sơ đã hoàn thành hoặc bị hủy. */
  private assertEditable(status: PlacementStatus): void {
    if (terminalStatuses.includes(status))
      throw new BadRequestException(
        'Completed or cancelled placements cannot be edited',
      );
  }

  /** Ghi dấu vết thao tác và dữ liệu thay đổi trong transaction hiện tại. */
  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    id: string,
    action: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId,
        action,
        entityType: 'Placement',
        entityId: id,
        metadata,
      },
    });
  }

  /** SERIALIZABLE bảo vệ kiểm tra trùng kỳ/trạng thái; lỗi cạnh tranh được trả 409. */
  private async mutate<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      handlePrismaError(error, {
        duplicate: 'This application is already linked to a placement',
        notFound: 'Placement or related record was not found',
      });
    }
  }
}
