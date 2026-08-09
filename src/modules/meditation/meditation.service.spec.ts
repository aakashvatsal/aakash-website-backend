import { Test, TestingModule } from '@nestjs/testing';
import { MeditationService } from './meditation.service';

describe('MeditationService', () => {
  let service: MeditationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MeditationService],
    }).compile();

    service = module.get<MeditationService>(MeditationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
