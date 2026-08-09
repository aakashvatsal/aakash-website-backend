import { Test, TestingModule } from '@nestjs/testing';
import { NowService } from './now.service';

describe('NowService', () => {
  let service: NowService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NowService],
    }).compile();

    service = module.get<NowService>(NowService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
