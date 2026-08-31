import { Test, TestingModule } from '@nestjs/testing';
import { HaircareService } from './haircare.service';

describe('HaircareService', () => {
  let service: HaircareService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HaircareService],
    })
      .useMocker(() => ({ get: jest.fn() }))
      .compile();

    service = module.get<HaircareService>(HaircareService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
