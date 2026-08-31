import { Test, TestingModule } from '@nestjs/testing';
import { SupplementsService } from './supplements.service';

describe('SupplementsService', () => {
  let service: SupplementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupplementsService],
    })
      .useMocker(() => ({ get: jest.fn() }))
      .compile();

    service = module.get<SupplementsService>(SupplementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
