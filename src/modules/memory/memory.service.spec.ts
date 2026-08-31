import { Test, TestingModule } from '@nestjs/testing';
import { MemoryService } from './memory.service';

describe('MemoryService', () => {
  let service: MemoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MemoryService],
    })
      .useMocker(() => ({ get: jest.fn() }))
      .compile();

    service = module.get<MemoryService>(MemoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
