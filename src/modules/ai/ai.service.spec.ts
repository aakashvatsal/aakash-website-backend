import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiService],
    })
      .useMocker((token) =>
        token === ConfigService
          ? {
              getOrThrow: jest.fn(() => 'test-openai-key'),
              get: jest.fn(() => undefined),
            }
          : { get: jest.fn() },
      )
      .compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
