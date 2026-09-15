import { Test, TestingModule } from '@nestjs/testing';
import { MajorController } from './major.controller';

describe('MajorController', () => {
  let controller: MajorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MajorController],
    }).compile();

    controller = module.get<MajorController>(MajorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
