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

  it('supports structured-response token and reasoning overrides', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'resp-1',
      model: 'gpt-test',
      status: 'completed',
      output_text: '{"ok":true}',
      incomplete_details: null,
      error: null,
      usage: null,
    });
    const openai = (
      service as unknown as {
        openai: { responses: { create: typeof create } };
      }
    ).openai;
    openai.responses.create = create;

    const result = await service.generateStructuredResponse<{ ok: boolean }>({
      name: 'test_schema',
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      },
      instructions: 'Return the test object.',
      input: '{}',
      reasoningEffort: 'low',
      maxOutputTokens: 12000,
    });

    expect(result.data).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: { effort: 'low' },
        max_output_tokens: 12000,
      }),
    );
  });

  it('reports incomplete structured output before attempting JSON parsing', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'resp-truncated',
      model: 'gpt-test',
      status: 'incomplete',
      output_text: '{"candidates":[{',
      incomplete_details: { reason: 'max_output_tokens' },
      error: null,
      usage: {
        input_tokens: 100,
        output_tokens: 2400,
        total_tokens: 2500,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 500 },
      },
    });
    const openai = (
      service as unknown as {
        openai: { responses: { create: typeof create } };
      }
    ).openai;
    openai.responses.create = create;

    await expect(
      service.generateStructuredResponse({
        name: 'test_schema',
        schema: { type: 'object' },
        instructions: 'Return JSON.',
        input: '{}',
      }),
    ).rejects.toThrow(
      'AI structured response did not complete: max_output_tokens.',
    );
  });
});
