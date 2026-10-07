import { NotificationEventsService } from '../notifications/notification-events.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { normalizeCode } from '../../common/utils/text.util';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateEnrollmentDto,
  EnrollmentQueryDto,
  ReviewEnrollmentDto,
} from './enrollment.dto';

const include = {
  account: { select: { id: true, fullName: true, email: true, phone: true } },
  university: { select: { id: true, name: true, code: true } },
  major: { select: { id: true, name: true, code: true } },
} satisfies Prisma.StudentEnrollmentInclude;

@Injectable()
export class EnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEvents: NotificationEventsService,
  ) {}

  universities(query: EnrollmentQueryDto) {
    const keyword = query.keyword?.trim();
    return this.prisma.university.findMany({
      where: {
        status: 'VERIFIED',
        ...(keyword && {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' as const } },
            { code: { contains: keyword, mode: 'insensitive' as const } },
          ],
        }),
      },
      select: { id: true, name: true, code: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 50,
    });
  }

  async majors(universityId: string) {
    if (
      !(await this.prisma.university.findFirst({
        where: { id: universityId, status: 'VERIFIED' },
        select: { id: true },
      }))
    )
      throw new NotFoundException(
        'Nhà trường chưa được xác minh hoặc đã ngừng hoạt động.',
      );
    return this.prisma.major.findMany({
      where: { universityId },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  async mine(user: CurrentUserData) {
    return this.prisma.studentEnrollment.findMany({
      where: { accountId: user.id },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
  }

  async submit(user: CurrentUserData, dto: CreateEnrollmentDto) {
    return this.mutate(async (tx) => {
      await this.assertPersonalAccount(tx, user.id);
      if (
        await tx.studentEnrollment.findFirst({
          where: { accountId: user.id, status: 'PENDING' },
          select: { id: true },
        })
      )
        throw new ConflictException(
          'Bạn đã có yêu cầu đang chờ duyệt. Hãy hủy yêu cầu cũ trước khi gửi lại.',
        );
      await this.assertSchoolAndMajor(tx, dto.universityId, dto.majorId);
      const studentCode = normalizeCode(dto.studentCode);
      await this.assertCodeAvailable(tx, dto.universityId, studentCode);
      const row = await tx.studentEnrollment.create({
        data: {
          accountId: user.id,
          universityId: dto.universityId,
          majorId: dto.majorId,
          studentCode,
          className: dto.className.trim(),
          semester: dto.semester,
        },
        include,
      });
      await this.audit(tx, user.id, row.id, 'STUDENT_ENROLLMENT_SUBMITTED');
      return row;
    });
  }

  async cancel(user: CurrentUserData, id: string) {
    return this.mutate(async (tx) => {
      const result = await tx.studentEnrollment.updateMany({
        where: { id, accountId: user.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'Không tìm thấy yêu cầu chờ duyệt của bạn. Hãy tải lại danh sách.',
        );
      await this.audit(tx, user.id, id, 'STUDENT_ENROLLMENT_CANCELLED');
      return { message: 'Đã hủy yêu cầu.' };
    });
  }

  async list(user: CurrentUserData, query: EnrollmentQueryDto) {
    const universityId = this.adminUniversity(user);
    const keyword = query.keyword?.trim();
    const where: Prisma.StudentEnrollmentWhereInput = {
      universityId,
      ...(query.status && { status: query.status }),
      ...(keyword && {
        OR: [
          { studentCode: { contains: keyword, mode: 'insensitive' } },
          { account: { fullName: { contains: keyword, mode: 'insensitive' } } },
          { account: { email: { contains: keyword, mode: 'insensitive' } } },
        ],
      }),
    };
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    const [data, total] = await this.prisma.$transaction(
      [
        this.prisma.studentEnrollment.findMany({
          where,
          include,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.studentEnrollment.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { data, total, page, limit };
  }

  async review(user: CurrentUserData, id: string, dto: ReviewEnrollmentDto) {
    const universityId = this.adminUniversity(user);
    return this.mutate(async (tx) => {
      const row = await tx.studentEnrollment.findFirst({
        where: { id, universityId },
      });
      if (!row)
        throw new NotFoundException(
          'Không tìm thấy yêu cầu thuộc trường của bạn.',
        );
      if (row.status !== 'PENDING')
        throw new ConflictException(
          'Yêu cầu đã được xử lý. Hãy tải lại danh sách.',
        );
      if (dto.decision === 'APPROVED') {
        await this.assertPersonalAccount(tx, row.accountId);
        await this.assertSchoolAndMajor(tx, universityId, row.majorId);
        await this.assertCodeAvailable(tx, universityId, row.studentCode);
        await tx.student.create({
          data: {
            accountId: row.accountId,
            universityId,
            majorId: row.majorId,
            studentCode: row.studentCode,
            className: row.className,
            semester: row.semester,
            status: 'ACTIVE',
          },
        });
      } else if (!dto.reason?.trim())
        throw new BadRequestException('Vui lòng nhập lý do từ chối.');
      const updated = await tx.studentEnrollment.updateMany({
        where: { id, universityId, status: 'PENDING' },
        data: {
          status: dto.decision,
          reason: dto.decision === 'REJECTED' ? dto.reason!.trim() : null,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Yêu cầu vừa thay đổi. Hãy tải lại danh sách.',
        );
      await this.audit(tx, user.id, id, `STUDENT_ENROLLMENT_${dto.decision}`);
      return tx.studentEnrollment.findUniqueOrThrow({ where: { id }, include });
    });
  }

  private adminUniversity(user: CurrentUserData) {
    if (
      user.schoolUser?.role !== 'UNIVERSITY_ADMIN' ||
      user.schoolUser.status !== 'ACTIVE'
    )
      throw new ForbiddenException(
        'Chỉ quản trị viên nhà trường được duyệt hồ sơ.',
      );
    return user.schoolUser.universityId;
  }

  private async assertPersonalAccount(
    tx: Prisma.TransactionClient,
    id: string,
  ) {
    const account = await tx.account.findUnique({
      where: { id },
      select: {
        status: true,
        globalRole: true,
        emailVerifiedAt: true,
        deletedAt: true,
        student: { select: { id: true } },
        schoolUser: { select: { id: true } },
        companyUser: { select: { id: true } },
      },
    });
    if (
      !account ||
      account.status !== 'ACTIVE' ||
      account.deletedAt ||
      !account.emailVerifiedAt ||
      account.globalRole !== 'USER' ||
      account.student ||
      account.schoolUser ||
      account.companyUser
    )
      throw new ForbiddenException(
        'Cần tài khoản cá nhân đã xác thực email và chưa có hồ sơ tổ chức/sinh viên.',
      );
  }

  private async assertSchoolAndMajor(
    tx: Prisma.TransactionClient,
    universityId: string,
    majorId: string,
  ) {
    const major = await tx.major.findFirst({
      where: { id: majorId, universityId, university: { status: 'VERIFIED' } },
      select: { id: true },
    });
    if (!major)
      throw new BadRequestException(
        'Ngành học không thuộc trường đã chọn hoặc trường chưa được xác minh.',
      );
  }

  private async assertCodeAvailable(
    tx: Prisma.TransactionClient,
    universityId: string,
    studentCode: string,
  ) {
    if (
      await tx.student.findFirst({
        where: { universityId, studentCode },
        select: { id: true },
      })
    )
      throw new ConflictException(
        'Mã sinh viên đã được sử dụng tại trường này.',
      );
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    entityId: string,
    action: string,
  ) {
    await tx.auditLog.create({
      data: { actorId, entityId, action, entityType: 'StudentEnrollment' },
    });
    await this.notificationEvents.enrollment(tx, actorId, entityId, action);
  }

  private async mutate<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.notificationEvents.transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      handlePrismaError(error, {
        duplicate:
          'Yêu cầu đang chờ duyệt, tài khoản hoặc mã sinh viên đã tồn tại. Hãy tải lại dữ liệu.',
      });
    }
  }
}
