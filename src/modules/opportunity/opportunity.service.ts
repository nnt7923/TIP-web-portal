import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OpportunityStatus, Prisma } from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { getCompanyId } from '../../common/utils/company-scope.util';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { normalizeOptionalText } from '../../common/utils/text.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';

@Injectable()
export class OpportunityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: CurrentUserData, dto: CreateOpportunityDto) {
    const companyId = getCompanyId(user);
    const applicationDeadline = dto.applicationDeadline
      ? new Date(dto.applicationDeadline)
      : undefined;

    this.assertDeadlineIsValid(applicationDeadline, dto.status);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const opportunity = await transaction.opportunity.create({
          data: {
            companyId,
            title: dto.title.trim(),
            type: dto.type,
            description: dto.description.trim(),
            location: normalizeOptionalText(dto.location) || undefined,
            vacancies: dto.vacancies,
            applicationDeadline,
            status: dto.status,
          },
        });

        await transaction.auditLog.create({
          data: {
            actorId: user.id,
            action: 'OPPORTUNITY_CREATED',
            entityType: 'Opportunity',
            entityId: opportunity.id,
            metadata: { companyId, status: opportunity.status },
          },
        });

        return opportunity;
      });
    } catch (error) {
      handlePrismaError(error);
    }
  }

  findAll(user: CurrentUserData, query: QueryOpportunityDto) {
    const companyId = getCompanyId(user);
    const keyword = query.keyword?.trim();
    const where: Prisma.OpportunityWhereInput = {
      companyId,
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
      ...(keyword && {
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
          { location: { contains: keyword, mode: 'insensitive' } },
        ],
      }),
    };

    return this.prisma.opportunity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(user: CurrentUserData, id: string) {
    const companyId = getCompanyId(user);
    const opportunity = await this.findOneInCompany(id, companyId);

    return opportunity;
  }

  async update(user: CurrentUserData, id: string, dto: UpdateOpportunityDto) {
    const companyId = getCompanyId(user);
    const currentOpportunity = await this.findOneInCompany(id, companyId);
    const applicationDeadline =
      dto.applicationDeadline === undefined
        ? currentOpportunity.applicationDeadline
        : dto.applicationDeadline === null
          ? null
          : new Date(dto.applicationDeadline);
    const status = dto.status ?? currentOpportunity.status;

    this.assertDeadlineIsValid(applicationDeadline, status);

    const data: Prisma.OpportunityUpdateInput = {
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.description !== undefined && {
        description: dto.description.trim(),
      }),
      ...(dto.location !== undefined && {
        location: normalizeOptionalText(dto.location ?? undefined) || null,
      }),
      ...(dto.vacancies !== undefined && { vacancies: dto.vacancies }),
      ...(dto.applicationDeadline !== undefined && { applicationDeadline }),
      ...(dto.status !== undefined && { status: dto.status }),
    };

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field must be updated');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const opportunity = await transaction.opportunity.update({
          where: { id, companyId },
          data,
        });

        await transaction.auditLog.create({
          data: {
            actorId: user.id,
            action: 'OPPORTUNITY_UPDATED',
            entityType: 'Opportunity',
            entityId: id,
            metadata: { changedFields: Object.keys(data), companyId },
          },
        });

        return opportunity;
      });
    } catch (error) {
      handlePrismaError(error, {
        notFound: `Opportunity with id "${id}" was not found`,
      });
    }
  }

  async remove(user: CurrentUserData, id: string): Promise<void> {
    const companyId = getCompanyId(user);
    const opportunity = await this.findOneInCompany(id, companyId);

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.opportunity.delete({ where: { id, companyId } });
        await transaction.auditLog.create({
          data: {
            actorId: user.id,
            action: 'OPPORTUNITY_DELETED',
            entityType: 'Opportunity',
            entityId: id,
            metadata: { companyId, title: opportunity.title },
          },
        });
      });
    } catch (error) {
      handlePrismaError(error, {
        notFound: `Opportunity with id "${id}" was not found`,
      });
    }
  }

  /** Finds an opportunity only when it belongs to the current company. */
  private async findOneInCompany(id: string, companyId: string) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id, companyId },
    });

    if (!opportunity) {
      throw new NotFoundException(
        `Opportunity with id "${id}" was not found in your company`,
      );
    }

    return opportunity;
  }

  /** Open opportunities must have an application deadline in the future. */
  private assertDeadlineIsValid(
    deadline: Date | null | undefined,
    status: OpportunityStatus | undefined,
  ): void {
    if (deadline && Number.isNaN(deadline.getTime())) {
      throw new BadRequestException('applicationDeadline is invalid');
    }

    if (status === OpportunityStatus.OPEN) {
      if (!deadline) {
        throw new BadRequestException(
          'An OPEN opportunity must have an application deadline',
        );
      }
      if (deadline <= new Date()) {
        throw new BadRequestException(
          'applicationDeadline must be in the future for an OPEN opportunity',
        );
      }
    }
  }
}
