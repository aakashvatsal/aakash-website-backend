import { Test, TestingModule } from '@nestjs/testing';
import { HsakaaService } from './hsakaa.service';

describe('HsakaaService', () => {
  let service: HsakaaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HsakaaService],
    }).compile();

    service = module.get<HsakaaService>(HsakaaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
