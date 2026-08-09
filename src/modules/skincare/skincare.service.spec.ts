import { Test, TestingModule } from '@nestjs/testing';
import { SkincareService } from './skincare.service';

describe('SkincareService', () => {
  let service: SkincareService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SkincareService],
    }).compile();

    service = module.get<SkincareService>(SkincareService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
