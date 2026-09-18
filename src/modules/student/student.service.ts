import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GlobalRole, Prisma } from '@prisma/client';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import {
  normalizeCode,
  normalizeOptionalText,
} from '../../common/utils/text.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

import { hashPassword } from '../../common/utils/password.util';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';

const safeAccountSelect = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  phone: true,
  status: true,
} satisfies Prisma.AccountSelect;

@Injectable()
export class StudentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(
    currentUser: CurrentUserData,
    dto: CreateStudentDto,
    file?: { buffer: Buffer },
  ) {
    const universityId = this.getUniversityId(currentUser);

    await this.assertMajorInUniversity(dto.majorId, universityId);

    const passwordHash = await hashPassword(dto.password);
    let cvUrl = normalizeOptionalText(dto.cvUrl);
    let cvPublicId: string | undefined;

    if (file) {
      const result = await this.cloudinaryService.uploadBuffer(file.buffer, {
        folder: 'students/cvs',
        resource_type: 'raw',
      });
      cvUrl = result.secure_url;
      cvPublicId = result.public_id;
    }

    try {
      return await this.prisma.student.create({
        data: {
          account: {
            create: {
              username: dto.username.trim(),
              email: dto.email.trim().toLowerCase(),
              fullName: dto.fullName.trim(),
              phone: normalizeOptionalText(dto.phone),
              passwordHash,
              globalRole: GlobalRole.USER,
            },
          },
          university: { connect: { id: universityId } },
          major: { connect: { id: dto.majorId } },
          studentCode: normalizeCode(dto.studentCode),
          semester: dto.semester,
          className: normalizeOptionalText(dto.className),
          cvUrl,
          cvPublicId,
        },
        include: {
          account: { select: safeAccountSelect },
          major: true,
        },
      });
    } catch (error) {
      if (cvPublicId) {
        await this.cloudinaryService.destroySafely(cvPublicId, 'raw');
      }
      handlePrismaError(error, {
        duplicate: 'Student code, username or email already exists',
      });
    }
  }

  findAll(currentUser: CurrentUserData, query: QueryStudentDto) {
    const universityId = this.getUniversityId(currentUser);
    const keyword = query.keyword?.trim();
    const where: Prisma.StudentWhereInput = {
      universityId,
      ...(query.status && { status: query.status }),
      ...(keyword && {
        OR: [
          { studentCode: { contains: keyword, mode: 'insensitive' } },
          { className: { contains: keyword, mode: 'insensitive' } },
          {
            account: {
              OR: [
                { fullName: { contains: keyword, mode: 'insensitive' } },
                { email: { contains: keyword, mode: 'insensitive' } },
              ],
            },
          },
        ],
      }),
    };

    return this.prisma.student.findMany({
      where,
      include: {
        account: { select: safeAccountSelect },
        major: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(currentUser: CurrentUserData, id: string) {
    const universityId = this.getUniversityId(currentUser);

    return this.findOneInUniversity(id, universityId);
  }

  async update(
    currentUser: CurrentUserData,
    id: string,
    dto: UpdateStudentDto,
    file?: { buffer: Buffer },
  ) {
    return this.updateInUniversity(
      this.getUniversityId(currentUser),
      id,
      dto,
      file,
    );
  }

  /** Sinh viên tự xem hồ sơ, không nhận ID tùy ý từ request. */
  findMe(user: CurrentUserData) {
    if (!user.student)
      throw new ForbiddenException('Student profile is required');
    return this.findOneInUniversity(user.student.id, user.student.universityId);
  }

  /** DTO riêng ngăn sinh viên tự đổi mã, ngành, role hoặc status. */
  async updateMe(
    user: CurrentUserData,
    dto: UpdateStudentProfileDto,
    file?: { buffer: Buffer },
  ) {
    if (!user.student)
      throw new ForbiddenException('Student profile is required');
    const accountData: Prisma.AccountUpdateInput = {
      ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
      ...(dto.phone !== undefined && { phone: dto.phone.trim() }),
    };
    return this.updateInUniversity(
      user.student.universityId,
      user.student.id,
      { cvUrl: dto.cvUrl },
      file,
      accountData,
    );
  }

  private async updateInUniversity(
    universityId: string,
    id: string,
    dto: UpdateStudentDto,
    file?: { buffer: Buffer },
    accountData?: Prisma.AccountUpdateInput,
  ) {
    const currentStudent = await this.findOneInUniversity(id, universityId);
    const { cvUrl: requestedCvUrl } = dto;
    let uploadedCvPublicId: string | undefined;

    if (dto.majorId !== undefined) {
      await this.assertMajorInUniversity(dto.majorId, universityId);
    }

    const data: Prisma.StudentUpdateInput = {
      ...(accountData && { account: { update: accountData } }),
      ...(dto.majorId !== undefined && {
        major: { connect: { id: dto.majorId } },
      }),
      ...(dto.studentCode !== undefined && {
        studentCode: normalizeCode(dto.studentCode),
      }),
      ...(dto.semester !== undefined && { semester: dto.semester }),
      ...(dto.className !== undefined && {
        className: normalizeOptionalText(dto.className),
      }),
      ...(dto.status !== undefined && { status: dto.status }),
    };

    if (file) {
      const uploadedCv = await this.cloudinaryService.uploadBuffer(
        file.buffer,
        {
          folder: 'students/cvs',
          resource_type: 'raw',
        },
      );

      data.cvUrl = uploadedCv.secure_url;
      data.cvPublicId = uploadedCv.public_id;
      uploadedCvPublicId = uploadedCv.public_id;
    } else if (
      requestedCvUrl !== undefined &&
      normalizeOptionalText(requestedCvUrl) !== currentStudent.cvUrl
    ) {
      data.cvUrl = normalizeOptionalText(requestedCvUrl) || null;
      data.cvPublicId = null;
    }

    try {
      const updatedStudent = await this.prisma.student.update({
        where: { id, universityId, account: { globalRole: GlobalRole.USER } },
        data,
        include: {
          account: { select: safeAccountSelect },
          university: true,
          major: true,
        },
      });

      const cvWasReplaced =
        data.cvUrl !== undefined && data.cvUrl !== currentStudent.cvUrl;
      if (cvWasReplaced && currentStudent.cvPublicId) {
        await this.cloudinaryService.destroySafely(
          currentStudent.cvPublicId,
          'raw',
        );
      }

      return updatedStudent;
    } catch (error) {
      if (uploadedCvPublicId) {
        await this.cloudinaryService.destroySafely(uploadedCvPublicId, 'raw');
      }

      handlePrismaError(error, {
        duplicate: 'Student code already exists in this university',
        notFound: `Student with id "${id}" was not found`,
      });
    }
  }

  async remove(currentUser: CurrentUserData, id: string): Promise<void> {
    const universityId = this.getUniversityId(currentUser);
    const student = await this.findOneInUniversity(id, universityId);

    try {
      await this.prisma.student.delete({
        where: { id, universityId, account: { globalRole: GlobalRole.USER } },
      });

      if (student.cvPublicId) {
        await this.cloudinaryService.destroySafely(student.cvPublicId, 'raw');
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Student profile cannot be deleted because it is still referenced',
        );
      }

      handlePrismaError(error, {
        notFound: `Student with id "${id}" was not found`,
      });
    }
  }

  private getUniversityId(currentUser: CurrentUserData): string {
    if (!currentUser.schoolUser) {
      throw new ForbiddenException('School user profile was not found');
    }

    return currentUser.schoolUser.universityId;
  }

  private async assertMajorInUniversity(
    majorId: string,
    universityId: string,
  ): Promise<void> {
    const major = await this.prisma.major.findFirst({
      where: { id: majorId, universityId },
      select: { id: true },
    });

    if (!major) {
      throw new NotFoundException('Major was not found in your university');
    }
  }

  private async findOneInUniversity(id: string, universityId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, universityId, account: { globalRole: GlobalRole.USER } },
      include: {
        account: { select: safeAccountSelect },
        university: true,
        major: true,
        internships: {
          include: { internshipPeriod: true },
        },
      },
    });

    if (!student) {
      throw new NotFoundException(
        `Student with id "${id}" was not found in your university`,
      );
    }

    return student;
  }
}
