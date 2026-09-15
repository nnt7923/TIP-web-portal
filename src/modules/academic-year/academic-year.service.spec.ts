import { Test, TestingModule } from '@nestjs/testing';
import { AcademicYearService } from './academic-year.service';

describe('AcademicYearService', () => {
  let service: AcademicYearService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AcademicYearService],
    }).compile();

    service = module.get<AcademicYearService>(AcademicYearService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
