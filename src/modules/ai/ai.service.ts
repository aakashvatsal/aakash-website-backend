import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

interface GenerateResponseParams {
  message: string;
  memories?: string[];
  previousMessages?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

@Injectable()
export class AiService {
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
    });

    this.model =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-5.1';
  }

  async generateResponse(params: GenerateResponseParams): Promise<string> {
    const memoryContext = params.memories?.length
      ? params.memories.map((memory, index) => `${index + 1}. ${memory}`).join('\n')
      : 'No relevant memories found.';

    const response = await this.openai.responses.create({
      model: this.model,
      instructions: `
You are HSAKAA, Aakash's AI twin.

Your responsibility is to:
- Think using Aakash's known preferences, principles and historical decisions.
- Clearly distinguish known information from assumptions.
- Be direct and practical.
- Avoid inventing personal memories.
- Use the supplied memory context only when it is relevant.

Relevant memory:
${memoryContext}
      `.trim(),
      input: [
        ...(params.previousMessages || []).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        {
          role: 'user' as const,
          content: params.message,
        },
      ],
    });

    return response.output_text;
  }
}