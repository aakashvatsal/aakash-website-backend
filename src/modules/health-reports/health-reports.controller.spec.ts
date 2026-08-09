import { Test, TestingModule } from '@nestjs/testing';
import { HealthReportsController } from './health-reports.controller';

describe('HealthReportsController', () => {
  let controller: HealthReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthReportsController],
    }).compile();

    controller = module.get<HealthReportsController>(HealthReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
