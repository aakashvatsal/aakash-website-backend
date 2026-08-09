import { Test, TestingModule } from '@nestjs/testing';
import { IntimateCareService } from './intimate-care.service';

describe('IntimateCareService', () => {
  let service: IntimateCareService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IntimateCareService],
    }).compile();

    service = module.get<IntimateCareService>(IntimateCareService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
