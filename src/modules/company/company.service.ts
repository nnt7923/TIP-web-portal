import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { normalizeOptionalText } from '../../common/utils/text.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { QueryCompanyDto } from './dto/query-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(
    actorId: string,
    dto: CreateCompanyDto,
    file?: { buffer: Buffer },
  ) {
    let logoUrl = normalizeOptionalText(dto.logoUrl) || undefined;
    let logoPublicId: string | undefined;

    if (file) {
      const uploadedLogo = await this.cloudinaryService.uploadBuffer(
        file.buffer,
        { folder: 'companies/logos' },
      );
      logoUrl = uploadedLogo.secure_url;
      logoPublicId = uploadedLogo.public_id;
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const company = await transaction.company.create({
          data: {
            name: dto.name.trim(),
            website: normalizeOptionalText(dto.website) || undefined,
            address: normalizeOptionalText(dto.address) || undefined,
            industry: normalizeOptionalText(dto.industry) || undefined,
            logoUrl,
            logoPublicId,
          },
        });

        await transaction.auditLog.create({
          data: {
            actorId,
            action: 'COMPANY_CREATED',
            entityType: 'Company',
            entityId: company.id,
          },
        });

        return company;
      });
    } catch (error) {
      if (logoPublicId) {
        await this.cloudinaryService.destroySafely(logoPublicId);
      }
      handlePrismaError(error);
    }
  }

  findAll(query: QueryCompanyDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.CompanyWhereInput = {
      ...(query.status && { status: query.status }),
      ...(keyword && {
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { industry: { contains: keyword, mode: 'insensitive' } },
          { address: { contains: keyword, mode: 'insensitive' } },
        ],
      }),
    };

    return this.prisma.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });

    if (!company) {
      throw new NotFoundException(`Company with id "${id}" was not found`);
    }

    return company;
  }

  async update(
    actorId: string,
    id: string,
    dto: UpdateCompanyDto,
    file?: { buffer: Buffer },
  ) {
    const currentCompany = await this.findOne(id);
    const data: Prisma.CompanyUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.website !== undefined && {
        website: normalizeOptionalText(dto.website) || null,
      }),
      ...(dto.address !== undefined && {
        address: normalizeOptionalText(dto.address) || null,
      }),
      ...(dto.industry !== undefined && {
        industry: normalizeOptionalText(dto.industry) || null,
      }),
      ...(dto.status !== undefined && { status: dto.status }),
    };
    let uploadedLogoPublicId: string | undefined;

    if (file) {
      const uploadedLogo = await this.cloudinaryService.uploadBuffer(
        file.buffer,
        { folder: 'companies/logos' },
      );
      data.logoUrl = uploadedLogo.secure_url;
      data.logoPublicId = uploadedLogo.public_id;
      uploadedLogoPublicId = uploadedLogo.public_id;
    } else if (
      dto.logoUrl !== undefined &&
      normalizeOptionalText(dto.logoUrl) !== currentCompany.logoUrl
    ) {
      data.logoUrl = normalizeOptionalText(dto.logoUrl) || null;
      data.logoPublicId = null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field must be updated');
    }

    try {
      const updatedCompany = await this.prisma.$transaction(
        async (transaction) => {
          const company = await transaction.company.update({
            where: { id },
            data,
          });

          await transaction.auditLog.create({
            data: {
              actorId,
              action: 'COMPANY_UPDATED',
              entityType: 'Company',
              entityId: id,
              metadata: {
                changedFields: Object.keys(data),
                status: {
                  from: currentCompany.status,
                  to: company.status,
                },
              },
            },
          });

          return company;
        },
      );

      const logoWasReplaced =
        data.logoUrl !== undefined && data.logoUrl !== currentCompany.logoUrl;
      if (logoWasReplaced && currentCompany.logoPublicId) {
        await this.cloudinaryService.destroySafely(currentCompany.logoPublicId);
      }

      return updatedCompany;
    } catch (error) {
      if (uploadedLogoPublicId) {
        await this.cloudinaryService.destroySafely(uploadedLogoPublicId);
      }
      handlePrismaError(error, {
        notFound: `Company with id "${id}" was not found`,
      });
    }
  }

  async remove(actorId: string, id: string): Promise<void> {
    const company = await this.findOne(id);

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.company.delete({ where: { id } });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: 'COMPANY_DELETED',
            entityType: 'Company',
            entityId: id,
            metadata: { name: company.name },
          },
        });
      });
    } catch (error) {
      handlePrismaError(error, {
        notFound: `Company with id "${id}" was not found`,
      });
    }

    if (company.logoPublicId) {
      await this.cloudinaryService.destroySafely(company.logoPublicId);
    }
  }
}
