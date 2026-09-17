import { Test, TestingModule } from '@nestjs/testing';
import { InternshipPeriodService } from './internship-period.service';

describe('InternshipPeriodService', () => {
  let service: InternshipPeriodService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InternshipPeriodService],
    }).compile();

    service = module.get<InternshipPeriodService>(InternshipPeriodService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
