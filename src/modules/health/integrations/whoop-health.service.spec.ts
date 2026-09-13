import { WhoopHealthService } from './whoop-health.service';

describe('WhoopHealthService daily date mapping', () => {
  const service = new WhoopHealthService({} as never);

  it('associates recovery and main sleep with the wake-up calendar day in India', () => {
    const dateKey = (
      service as unknown as {
        getWhoopDailyDateKey: (
          cycle: { start: string },
          sleep?: { end: string },
        ) => string;
      }
    ).getWhoopDailyDateKey(
      {
        start: '2026-09-09T18:00:00.000Z',
      },
      {
        end: '2026-09-10T01:30:00.000Z',
      },
    );

    expect(dateKey).toBe('2026-09-10');
  });

  it('falls back to the cycle start date when no main sleep is available', () => {
    const dateKey = (
      service as unknown as {
        getWhoopDailyDateKey: (cycle: { start: string }) => string;
      }
    ).getWhoopDailyDateKey({
      start: '2026-09-10T02:00:00.000Z',
    });

    expect(dateKey).toBe('2026-09-10');
  });
});
