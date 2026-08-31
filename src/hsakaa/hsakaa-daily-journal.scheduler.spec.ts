import { HsakaaDailyJournalScheduler } from './hsakaa-daily-journal.scheduler';

describe('HsakaaDailyJournalScheduler', () => {
  it('automatically prepares the previous day draft when enabled', async () => {
    const dailyJournalService = {
      ensureScheduledPreviousDay: jest
        .fn()
        .mockResolvedValue({ generated: true }),
    };
    const configService = { get: jest.fn(() => 'true') };
    const scheduler = new HsakaaDailyJournalScheduler(
      dailyJournalService as never,
      configService as never,
    );

    await scheduler.generatePreviousDayDraft();
    expect(
      dailyJournalService.ensureScheduledPreviousDay,
    ).toHaveBeenCalledTimes(1);
  });

  it('does nothing when automatic daily journals are disabled', async () => {
    const dailyJournalService = {
      ensureScheduledPreviousDay: jest.fn(),
    };
    const configService = { get: jest.fn(() => 'false') };
    const scheduler = new HsakaaDailyJournalScheduler(
      dailyJournalService as never,
      configService as never,
    );

    await scheduler.generatePreviousDayDraft();
    expect(
      dailyJournalService.ensureScheduledPreviousDay,
    ).not.toHaveBeenCalled();
  });
});
