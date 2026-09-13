import { NowService } from './now.service';

function createService() {
  const model = {
    updateMany: jest.fn(
      (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        void filter;
        void update;
        return Promise.resolve({ acknowledged: true });
      },
    ),
  };

  return {
    model,
    service: new NowService(model as never),
  };
}

describe('NowService temporal freshness', () => {
  it('resolves Asia/Kolkata night from an absolute instant', () => {
    const { service } = createService();
    const context = service.getTemporalContext(
      new Date('2026-09-12T17:30:00.000Z'),
    );

    expect(context).toMatchObject({
      timezone: 'Asia/Kolkata',
      localDate: '2026-09-12',
      localTime: '23:00:00',
      hour24: 23,
      daypart: 'night',
      isNight: true,
    });
  });

  it('resolves Asia/Kolkata morning from an absolute instant', () => {
    const { service } = createService();
    const context = service.getTemporalContext(
      new Date('2026-09-12T02:30:00.000Z'),
    );

    expect(context).toMatchObject({
      localTime: '08:00:00',
      hour24: 8,
      daypart: 'morning',
      isNight: false,
    });
  });

  it('expires explicit and stale current statuses during freshness refresh', async () => {
    const { model, service } = createService();
    const now = new Date('2026-09-12T18:30:00.000Z');

    await service.refreshCurrentState(now);

    expect(model.updateMany).toHaveBeenCalledTimes(3);
    expect(model.updateMany.mock.calls[0][0]).toMatchObject({
      isCurrent: true,
      isActive: true,
      expiresAt: { $lte: now },
    });
    expect(model.updateMany.mock.calls[1][0]).toMatchObject({
      activityType: { $ne: 'sleeping' },
      expiresAt: { $exists: false },
    });
    expect(model.updateMany.mock.calls[2][0]).toMatchObject({
      activityType: 'sleeping',
      expiresAt: { $exists: false },
    });
  });
});
