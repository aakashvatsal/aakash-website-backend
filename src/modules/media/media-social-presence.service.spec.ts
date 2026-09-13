import { BadRequestException } from '@nestjs/common';

import { MediaSocialPresenceScheduler } from './media-social-presence.scheduler';
import { MediaSocialPresenceService } from './media-social-presence.service';
import { MediaSocialRecommendationStatus } from './schemas/media-social-recommendation.schema';

function makeService() {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-openai-key'),
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'OPENAI_MODEL') return 'gpt-5.6-sol';
      return undefined;
    }),
  };
  const model = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
  };
  return new MediaSocialPresenceService(
    configService as never,
    { generateStructuredResponse: jest.fn() } as never,
    { overview: jest.fn() } as never,
    model as never,
    model as never,
    model as never,
    model as never,
    model as never,
  );
}

describe('MediaSocialPresenceService', () => {
  it('rejects malformed account ids before touching native social APIs', async () => {
    const service = makeService();
    await expect(
      service.syncAccount('not-an-object-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects malformed recommendation ids before updating recommendation history', async () => {
    const service = makeService();
    await expect(
      service.updateRecommendation(
        'not-an-object-id',
        MediaSocialRecommendationStatus.DISMISSED,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MediaSocialPresenceScheduler', () => {
  it('runs the weekly review in forced mode so Sunday refreshes the current snapshot', async () => {
    const socialPresenceService = {
      runWeeklyReview: jest.fn().mockResolvedValue({ ok: true }),
    };
    const scheduler = new MediaSocialPresenceScheduler(
      socialPresenceService as never,
    );

    await scheduler.runSundaySocialPresenceReview();

    expect(socialPresenceService.runWeeklyReview).toHaveBeenCalledWith(true);
  });
});
