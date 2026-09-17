import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    await this.assertAccountCanBecomeStudent(dto.accountId);
    await this.assertMajorInUniversity(dto.majorId, universityId);

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
          accountId: dto.accountId,
          universityId,
          majorId: dto.majorId,
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
        await this.cloudinaryService.destroySafely(cvPublicId);
      }
      handlePrismaError(error, {
        duplicate: 'Student code already exists',
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
    const universityId = this.getUniversityId(currentUser);
    const currentStudent = await this.findOneInUniversity(id, universityId);
    const { cvUrl: requestedCvUrl } = dto;
    let uploadedCvPublicId: string | undefined;

    if (dto.majorId !== undefined) {
      await this.assertMajorInUniversity(dto.majorId, universityId);
    }

    const data: Prisma.StudentUpdateInput = {
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
    } else if (requestedCvUrl !== undefined) {
      data.cvUrl = normalizeOptionalText(requestedCvUrl) || null;
      data.cvPublicId = null;
    }

    try {
      const updatedStudent = await this.prisma.student.update({
        where: { id },
        data,
        include: {
          account: { select: safeAccountSelect },
          university: true,
          major: true,
        },
      });

      const cvWasReplaced = file || requestedCvUrl !== undefined;
      if (cvWasReplaced && currentStudent.cvPublicId) {
        await this.cloudinaryService.destroySafely(currentStudent.cvPublicId);
      }

      return updatedStudent;
    } catch (error) {
      if (uploadedCvPublicId) {
        await this.cloudinaryService.destroySafely(uploadedCvPublicId);
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
      await this.prisma.account.delete({
        where: { id: student.accountId },
      });

      if (student.cvPublicId) {
        await this.cloudinaryService.destroySafely(student.cvPublicId);
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Student account cannot be deleted because it is still referenced',
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

  private async assertAccountCanBecomeStudent(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        schoolUser: { select: { id: true } },
        student: { select: { id: true } },
      },
    });

    if (!account) {
      throw new NotFoundException('Account was not found');
    }

    if (account.schoolUser || account.student) {
      throw new ConflictException(
        'Account is already linked to a user profile',
      );
    }
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
      where: { id, universityId },
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
