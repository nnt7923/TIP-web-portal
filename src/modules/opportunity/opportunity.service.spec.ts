import { NotFoundException } from '@nestjs/common';
import { OpportunityType } from '@prisma/client';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { OpportunityService } from './opportunity.service';

describe('Opportunity company information', () => {
  const user = {
    id: 'account-1',
    companyUser: { companyId: 'company-1' },
  } as CurrentUserData;
  const record = {
    id: 'opportunity-1',
    companyId: 'company-1',
    title: 'Intern BA',
    company: {
      id: 'company-1',
      name: 'AgileTech',
      logoUrl: null,
      status: 'VERIFIED',
    },
  };
  const include = {
    company: { select: { id: true, name: true, logoUrl: true, status: true } },
  };
  let service: OpportunityService;
  let opportunity: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    opportunity = {
      findMany: jest.fn().mockResolvedValue([record]),
      findFirst: jest.fn().mockResolvedValue(record),
      create: jest.fn().mockResolvedValue(record),
      update: jest.fn().mockResolvedValue(record),
    };
    const transaction = { opportunity, auditLog: { create: jest.fn() } };
    service = new OpportunityService({
      opportunity,
      $transaction: (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaService);
  });

  it('lists company names while restricting results to the current company', async () => {
    expect(await service.findAll(user, {})).toEqual([record]);
    expect(opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-1' },
        include,
      }),
    );
  });

  it('includes company information in create and update responses', async () => {
    expect(
      await service.create(user, {
        title: 'Intern BA',
        description: 'Requirements',
        type: OpportunityType.JOB,
      }),
    ).toEqual(record);
    expect(opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'company-1' }) as unknown,
        include,
      }),
    );
    expect(
      await service.update(user, record.id, { title: 'Updated title' }),
    ).toEqual(record);
    expect(opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: record.id, companyId: 'company-1' },
        include,
      }),
    );
  });

  it('returns company names for details and rejects records outside the company', async () => {
    expect(await service.findOne(user, record.id)).toEqual(record);
    expect(opportunity.findFirst).toHaveBeenCalledWith({
      where: { id: record.id, companyId: 'company-1' },
      include,
    });
    opportunity.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.findOne(user, 'another-company-record'),
    ).rejects.toThrow(NotFoundException);
  });

  it('publishes only open, unexpired jobs of verified companies with public fields', async () => {
    const findMany = jest
      .fn<
        Promise<unknown[]>,
        [
          {
            where: Record<string, unknown>;
            select: Record<string, unknown>;
            skip: number;
            take: number;
          },
        ]
      >()
      .mockResolvedValue([record]);
    const count = jest.fn().mockResolvedValue(7);
    const publicService = new OpportunityService({
      opportunity: { findMany, count },
      $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    } as unknown as PrismaService);

    expect(await publicService.findPublic({ page: 2, limit: 6 })).toEqual({
      data: [record],
      total: 7,
      page: 2,
      limit: 6,
    });
    const options = findMany.mock.calls[0][0];
    expect(options.where).toEqual({
      status: 'OPEN',
      company: { status: 'VERIFIED' },
      OR: [
        { applicationDeadline: null },
        { applicationDeadline: { gte: expect.any(Date) as unknown } },
      ],
    });
    expect(options).toMatchObject({ skip: 6, take: 6 });
    expect(options.select.company).toEqual({ select: { name: true } });
    expect(options.select).not.toHaveProperty('applications');
    expect(options.select).not.toHaveProperty('placements');
    expect(count).toHaveBeenCalledWith({ where: options.where });
  });
});
