import { Test, TestingModule } from '@nestjs/testing';
import { HealthReportsService } from './health-reports.service';

describe('HealthReportsService', () => {
  let service: HealthReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthReportsService],
    }).compile();

    service = module.get<HealthReportsService>(HealthReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
