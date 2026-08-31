import { ConfigService } from '@nestjs/config';

import { HsakaaBriefScheduler } from './hsakaa-brief.scheduler';
import { HsakaaBriefService } from './hsakaa-brief.service';

describe('HsakaaBriefScheduler', () => {
  it('does nothing when automatic briefing is disabled', async () => {
    const ensureScheduledTodayMock = jest.fn();
    const briefService = {
      ensureScheduledToday: ensureScheduledTodayMock,
    } as unknown as HsakaaBriefService;
    const configService = {
      get: jest.fn().mockReturnValue('false'),
    } as unknown as ConfigService;

    const scheduler = new HsakaaBriefScheduler(briefService, configService);

    await scheduler.generateMorningBrief();

    expect(ensureScheduledTodayMock).not.toHaveBeenCalled();
  });

  it('generates the morning brief when explicitly enabled', async () => {
    const ensureScheduledTodayMock = jest
      .fn()
      .mockResolvedValue({ id: 'brief-id' });
    const briefService = {
      ensureScheduledToday: ensureScheduledTodayMock,
    } as unknown as HsakaaBriefService;
    const configService = {
      get: jest.fn().mockReturnValue('true'),
    } as unknown as ConfigService;

    const scheduler = new HsakaaBriefScheduler(briefService, configService);

    await scheduler.generateMorningBrief();

    expect(ensureScheduledTodayMock).toHaveBeenCalledTimes(1);
  });
});
