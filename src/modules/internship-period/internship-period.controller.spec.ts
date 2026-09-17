import { Test, TestingModule } from '@nestjs/testing';
import { InternshipPeriodController } from './internship-period.controller';

describe('InternshipPeriodController', () => {
  let controller: InternshipPeriodController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternshipPeriodController],
    }).compile();

    controller = module.get<InternshipPeriodController>(
      InternshipPeriodController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
