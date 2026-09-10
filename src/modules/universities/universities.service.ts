import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import {
  normalizeCode,
  normalizeOptionalText,
} from '../../common/utils/text.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateUniversityDto } from './dto/create-university.dto';
import { QueryUniversityDto } from './dto/query-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';

@Injectable()
export class UniversitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(
    createUniversityDto: CreateUniversityDto,
    file?: { buffer: Buffer },
  ) {
    let logoUrl = normalizeOptionalText(createUniversityDto.logoUrl);
    let logoPublicId: string | undefined;

    if (file) {
      const result = await this.cloudinaryService.uploadBuffer(file.buffer, {
        folder: 'universities/logos',
      });
      logoUrl = result.secure_url;
      logoPublicId = result.public_id;
    }

    try {
      return await this.prisma.university.create({
        data: {
          ...createUniversityDto,
          name: createUniversityDto.name.trim(),
          code: normalizeCode(createUniversityDto.code),
          website: normalizeOptionalText(createUniversityDto.website),
          address: normalizeOptionalText(createUniversityDto.address),
          logoUrl,
          logoPublicId,
        },
      });
    } catch (error) {
      if (logoPublicId) {
        await this.cloudinaryService.destroySafely(logoPublicId);
      }
      handlePrismaError(error, {
        duplicate: 'University code already exists',
      });
    }
  }

  findAll(query: QueryUniversityDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.UniversityWhereInput = {
      ...(query.status && { status: query.status }),
      ...(keyword && {
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { code: { contains: keyword, mode: 'insensitive' } },
        ],
      }),
    };

    return this.prisma.university.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const university = await this.prisma.university.findUnique({
      where: { id },
    });

    if (!university) {
      throw new NotFoundException(`University with id "${id}" was not found`);
    }

    return university;
  }

  async update(
    id: string,
    updateUniversityDto: UpdateUniversityDto,
    file?: { buffer: Buffer },
  ) {
    const currentUniversity = await this.findOne(id);
    const { logoUrl: requestedLogoUrl, ...universityData } =
      updateUniversityDto;
    let uploadedLogoPublicId: string | undefined;

    const data: Prisma.UniversityUpdateInput = {
      ...universityData,
      ...(updateUniversityDto.name !== undefined && {
        name: updateUniversityDto.name.trim(),
      }),
      ...(updateUniversityDto.code !== undefined && {
        code: normalizeCode(updateUniversityDto.code),
      }),
      ...(updateUniversityDto.website !== undefined && {
        website: normalizeOptionalText(updateUniversityDto.website),
      }),
      ...(updateUniversityDto.address !== undefined && {
        address: normalizeOptionalText(updateUniversityDto.address),
      }),
    };

    if (file) {
      const uploadedLogo = await this.cloudinaryService.uploadBuffer(
        file.buffer,
        { folder: 'universities/logos' },
      );
      data.logoUrl = uploadedLogo.secure_url;
      data.logoPublicId = uploadedLogo.public_id;
      uploadedLogoPublicId = uploadedLogo.public_id;
    } else if (requestedLogoUrl !== undefined) {
      data.logoUrl = normalizeOptionalText(requestedLogoUrl);
      data.logoPublicId = null;
    }

    try {
      const updatedUniversity = await this.prisma.university.update({
        where: { id },
        data,
      });

      const logoWasReplaced = file || requestedLogoUrl !== undefined;
      if (logoWasReplaced && currentUniversity.logoPublicId) {
        await this.cloudinaryService.destroySafely(
          currentUniversity.logoPublicId,
        );
      }

      return updatedUniversity;
    } catch (error) {
      if (uploadedLogoPublicId) {
        await this.cloudinaryService.destroySafely(uploadedLogoPublicId);
      }
      handlePrismaError(error, {
        duplicate: 'University code already exists',
        notFound: `University with id "${id}" was not found`,
      });
    }
  }

  async remove(id: string) {
    const university = await this.findOne(id);

    try {
      const deletedUniversity = await this.prisma.university.delete({
        where: { id },
      });

      if (university.logoPublicId) {
        await this.cloudinaryService.destroySafely(university.logoPublicId);
      }

      return deletedUniversity;
    } catch (error) {
      handlePrismaError(error, {
        notFound: `University with id "${id}" was not found`,
      });
    }
  }
}
