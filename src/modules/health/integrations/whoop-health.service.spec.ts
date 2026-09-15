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

describe('WhoopHealthService WHOOP upsert safety', () => {
  it('does not update isActive or isArchived through conflicting operators', async () => {
    const findOneAndUpdate = jest.fn().mockResolvedValue({});
    const service = new WhoopHealthService({ findOneAndUpdate } as never);
    const internals = service as unknown as {
      fetchAll: (endpoint: string) => Promise<unknown[]>;
      fetchBodyMeasurement: () => Promise<null>;
    };

    internals.fetchAll = jest.fn((endpoint: string) => {
      if (endpoint === '/cycle') {
        return Promise.resolve([
          {
            id: 123,
            user_id: 1,
            created_at: '2026-09-15T00:00:00.000Z',
            updated_at: '2026-09-15T00:00:00.000Z',
            start: '2026-09-15T00:00:00.000Z',
            timezone_offset: '+05:30',
            score_state: 'PENDING_SCORE',
          },
        ]);
      }

      return Promise.resolve([]);
    });
    internals.fetchBodyMeasurement = jest.fn().mockResolvedValue(null);

    await service.sync('test-access-token');

    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [, update, options] = findOneAndUpdate.mock.calls[0] as [
      unknown,
      {
        $set: Record<string, unknown>;
        $setOnInsert: Record<string, unknown>;
      },
      Record<string, unknown>,
    ];

    expect(update.$set.isActive).toBe(true);
    expect(update.$set.isArchived).toBe(false);
    expect(update.$setOnInsert).not.toHaveProperty('isActive');
    expect(update.$setOnInsert).not.toHaveProperty('isArchived');
    expect(options).toMatchObject({
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
    });
    expect(options).not.toHaveProperty('new');
  });
});
