import { ConfigService } from '@nestjs/config';

import { AiService } from '../ai/ai.service';
import { MediaEngagementService } from './media-engagement.service';
import {
  MediaEngagementIntent,
  MediaEngagementSentiment,
} from './schemas/media-engagement-item.schema';
import { MediaPlatform } from './schemas/media-post.schema';

type CredentialProbe = {
  resolveReadCredentialFromLean(account: {
    platform: MediaPlatform;
    credentialRef?: string;
  }): string | undefined;
  resolveWriteCredentialFromLean(account: {
    platform: MediaPlatform;
    credentialRef?: string;
  }): string | undefined;
  fallbackAnalysis(text: string): {
    intent: MediaEngagementIntent;
    sentiment: MediaEngagementSentiment;
    needsResponse: boolean;
    suggestedReply: string;
  };
};

function makeService(values: Record<string, string | undefined> = {}) {
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;

  return new MediaEngagementService(
    config,
    {} as AiService,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('MediaEngagementService', () => {
  it('keeps an X bearer token read-only', () => {
    const service = makeService({ X_BEARER_TOKEN: 'read-token' });
    const probe = service as unknown as CredentialProbe;
    const account = { platform: MediaPlatform.X };

    expect(probe.resolveReadCredentialFromLean(account)).toBe('read-token');
    expect(probe.resolveWriteCredentialFromLean(account)).toBeUndefined();
  });

  it('uses X user-context access token for both reading and replying', () => {
    const service = makeService({ X_ACCESS_TOKEN: 'write-token' });
    const probe = service as unknown as CredentialProbe;
    const account = { platform: MediaPlatform.X };

    expect(probe.resolveReadCredentialFromLean(account)).toBe('write-token');
    expect(probe.resolveWriteCredentialFromLean(account)).toBe('write-token');
  });

  it('does not treat a YouTube API key as a reply credential', () => {
    const service = makeService({ YOUTUBE_API_KEY: 'public-api-key' });
    const probe = service as unknown as CredentialProbe;
    const account = { platform: MediaPlatform.YOUTUBE };

    expect(probe.resolveWriteCredentialFromLean(account)).toBeUndefined();
  });

  it('classifies obvious spam without recommending a reply', () => {
    const service = makeService();
    const probe = service as unknown as CredentialProbe;
    const result = probe.fallbackAnalysis(
      'DM me for promotion and guaranteed followers',
    );

    expect(result.intent).toBe(MediaEngagementIntent.SPAM);
    expect(result.sentiment).toBe(MediaEngagementSentiment.NEUTRAL);
    expect(result.needsResponse).toBe(false);
    expect(result.suggestedReply).toBe('');
  });

  it('requires the configured webhook verification token', () => {
    const service = makeService({
      MEDIA_ENGAGEMENT_WEBHOOK_VERIFY_TOKEN: 'secret',
    });

    expect(service.verifyWebhook('subscribe', 'secret', '12345')).toBe('12345');
    expect(() => service.verifyWebhook('subscribe', 'wrong', '12345')).toThrow(
      'Invalid webhook verification request.',
    );
  });
});
