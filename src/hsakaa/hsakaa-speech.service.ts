import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_MODEL = 'eleven_flash_v2_5';
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';
const MAX_SPEECH_CHARACTERS = 4000;

@Injectable()
export class HsakaaSpeechService {
  constructor(private readonly configService: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.configService.get<string>('ELEVENLABS_API_KEY')?.trim() &&
      this.configService.get<string>('ELEVENLABS_VOICE_ID')?.trim(),
    );
  }

  async synthesize(rawText: string) {
    const apiKey = this.configService.get<string>('ELEVENLABS_API_KEY')?.trim();
    const voiceId = this.configService
      .get<string>('ELEVENLABS_VOICE_ID')
      ?.trim();

    if (!apiKey || !voiceId) {
      throw new ServiceUnavailableException(
        'Aakash voice is not configured yet.',
      );
    }

    const text = this.prepareText(rawText);
    if (!text) {
      throw new ServiceUnavailableException(
        'There is no spoken text available for this message.',
      );
    }

    const modelId =
      this.configService.get<string>('ELEVENLABS_MODEL_ID')?.trim() ||
      DEFAULT_MODEL;
    const configuredOutput =
      this.configService.get<string>('ELEVENLABS_OUTPUT_FORMAT')?.trim() ||
      DEFAULT_OUTPUT_FORMAT;
    const outputFormat = configuredOutput.startsWith('mp3_')
      ? configuredOutput
      : DEFAULT_OUTPUT_FORMAT;

    const endpoint = new URL(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`,
    );
    endpoint.searchParams.set('output_format', outputFormat);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
        }),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Aakash voice is temporarily unavailable.',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Aakash voice is temporarily unavailable.',
      );
    }

    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) {
      throw new ServiceUnavailableException(
        'Aakash voice returned an empty audio response.',
      );
    }

    return Buffer.from(bytes);
  }

  private prepareText(value: string) {
    return value
      .normalize('NFKC')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+[.)]\s+/gm, '')
      .replace(/[*_~>#]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_SPEECH_CHARACTERS);
  }
}
