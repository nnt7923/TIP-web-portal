import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyStatus,
  OpportunityStatus,
  Prisma,
  StudentStatus,
} from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { getCompanyId } from '../../common/utils/company-scope.util';
import { handlePrismaError } from '../../common/utils/prisma-error.util';
import { normalizeOptionalText } from '../../common/utils/text.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { QueryPublicOpportunityDto } from './dto/query-public-opportunity.dto';

const opportunityInclude = {
  company: { select: { id: true, name: true, logoUrl: true, status: true } },
} satisfies Prisma.OpportunityInclude;

@Injectable()
export class OpportunityService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublic(query: QueryPublicOpportunityDto) {
    const { page = 1, limit = 6 } = query;
    const where: Prisma.OpportunityWhereInput = {
      status: OpportunityStatus.OPEN,
      company: { status: CompanyStatus.VERIFIED },
      OR: [
        { applicationDeadline: null },
        { applicationDeadline: { gte: new Date() } },
      ],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.opportunity.findMany({
        where,
        select: {
          id: true,
          title: true,
          type: true,
          description: true,
          location: true,
          vacancies: true,
          applicationDeadline: true,
          company: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async create(user: CurrentUserData, dto: CreateOpportunityDto) {
    const companyId = getCompanyId(user);
    const applicationDeadline = dto.applicationDeadline
      ? new Date(dto.applicationDeadline)
      : undefined;

    this.assertDeadlineIsValid(applicationDeadline, dto.status);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const opportunity = await transaction.opportunity.create({
          include: opportunityInclude,
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
    const keyword = query.keyword?.trim();
    if (user.student?.status === StudentStatus.ACTIVE) {
      const where: Prisma.OpportunityWhereInput = {
        AND: [
          { status: OpportunityStatus.OPEN },
          {
            OR: [
              { applicationDeadline: null },
              { applicationDeadline: { gte: new Date() } },
            ],
          },
          { company: { status: CompanyStatus.VERIFIED } },
        ],
        ...(query.type && { type: query.type }),
        ...(keyword && {
          AND: [
            { status: OpportunityStatus.OPEN },
            {
              OR: [
                { applicationDeadline: null },
                { applicationDeadline: { gte: new Date() } },
              ],
            },
            { company: { status: CompanyStatus.VERIFIED } },
            {
              OR: [
                { title: { contains: keyword, mode: 'insensitive' } },
                { description: { contains: keyword, mode: 'insensitive' } },
                { location: { contains: keyword, mode: 'insensitive' } },
              ],
            },
          ],
        }),
      };
      return this.prisma.opportunity.findMany({
        where,
        include: opportunityInclude,
        orderBy: { createdAt: 'desc' },
      });
    }
    const companyId = getCompanyId(user);
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
      include: opportunityInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(user: CurrentUserData, id: string) {
    if (user.student?.status === StudentStatus.ACTIVE) {
      const opportunity = await this.prisma.opportunity.findFirst({
        where: {
          id,
          status: OpportunityStatus.OPEN,
          OR: [
            { applicationDeadline: null },
            { applicationDeadline: { gte: new Date() } },
          ],
          company: { status: CompanyStatus.VERIFIED },
        },
        include: opportunityInclude,
      });
      if (!opportunity)
        throw new NotFoundException('Opportunity is not available');
      return opportunity;
    }
    const companyId = getCompanyId(user);
    const opportunity = await this.findOneInCompany(id, companyId);

    return opportunity;
  }

  async update(user: CurrentUserData, id: string, dto: UpdateOpportunityDto) {
    const companyId = getCompanyId(user);
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const currentOpportunity = await transaction.opportunity.findFirst({
            where: { id, companyId },
          });
          if (!currentOpportunity)
            throw new NotFoundException(
              'Opportunity was not found in your company',
            );
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
              location:
                normalizeOptionalText(dto.location ?? undefined) || null,
            }),
            ...(dto.vacancies !== undefined && { vacancies: dto.vacancies }),
            ...(dto.applicationDeadline !== undefined && {
              applicationDeadline,
            }),
            ...(dto.status !== undefined && { status: dto.status }),
          };

          if (Object.keys(data).length === 0) {
            throw new BadRequestException('At least one field must be updated');
          }

          if (
            (dto.type !== undefined && dto.type !== currentOpportunity.type) ||
            (dto.status !== undefined &&
              dto.status !== OpportunityStatus.OPEN &&
              dto.status !== OpportunityStatus.CLOSED)
          ) {
            const linked = await transaction.placement.findFirst({
              where: { opportunityId: id, status: { not: 'CANCELLED' } },
              select: { id: true },
            });
            if (linked)
              throw new BadRequestException(
                'Cannot change the type or withdraw an opportunity linked to a non-cancelled placement',
              );
          }
          if (dto.vacancies !== undefined && dto.vacancies !== null) {
            const accepted = await transaction.application.count({
              where: { opportunityId: id, status: 'ACCEPTED' },
            });
            if (dto.vacancies < accepted)
              throw new BadRequestException(
                'Vacancies cannot be lower than the number of accepted applications',
              );
          }
          const opportunity = await transaction.opportunity.update({
            where: { id, companyId },
            data,
            include: opportunityInclude,
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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
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
      include: opportunityInclude,
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
