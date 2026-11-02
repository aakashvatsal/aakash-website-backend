import { MediaPresenceOsScheduler } from './media-presence-os.scheduler';

describe('MediaPresenceOsScheduler', () => {
  const previous = process.env.HSAKAA_MEDIA_LEGACY_AUTOPILOT;
  afterEach(() => {
    if (previous === undefined) delete process.env.HSAKAA_MEDIA_LEGACY_AUTOPILOT;
    else process.env.HSAKAA_MEDIA_LEGACY_AUTOPILOT = previous;
  });
  it('disables legacy writing jobs by default for Media Studio V7', async () => {
    delete process.env.HSAKAA_MEDIA_LEGACY_AUTOPILOT;
    const adaptationService = {generate: jest.fn()};
    const planningService = {rollForward: jest.fn(),generate: jest.fn()};
    const scheduler = new MediaPresenceOsScheduler(adaptationService as never,planningService as never);
    await scheduler.rollSevenDayPlan();
    await scheduler.adaptWeeklyPresence();
    expect(adaptationService.generate).not.toHaveBeenCalled();
    expect(planningService.rollForward).not.toHaveBeenCalled();
  });
  it('rolls only the missing seventh day when legacy mode explicitly enabled', async () => {
    process.env.HSAKAA_MEDIA_LEGACY_AUTOPILOT = 'true';
    const adaptationService = {
      generate: jest.fn(),
    };
    const planningService = {
      rollForward: jest.fn().mockResolvedValue({}),
      generate: jest.fn(),
    };
    const scheduler = new MediaPresenceOsScheduler(
      adaptationService as never,
      planningService as never,
    );

    await scheduler.rollSevenDayPlan();

    expect(planningService.rollForward).toHaveBeenCalledWith({ mode: 'roll' });
    expect(planningService.generate).not.toHaveBeenCalled();
  });

  it('does not silently rebuild the week after Sunday strategy adaptation in legacy mode', async () => {
    process.env.HSAKAA_MEDIA_LEGACY_AUTOPILOT = 'true';
    const adaptationService = {
      generate: jest.fn().mockResolvedValue({}),
    };
    const planningService = {
      rollForward: jest.fn(),
      generate: jest.fn(),
    };
    const scheduler = new MediaPresenceOsScheduler(
      adaptationService as never,
      planningService as never,
    );

    await scheduler.adaptWeeklyPresence();

    expect(adaptationService.generate).toHaveBeenCalledWith({ force: true });
    expect(planningService.generate).not.toHaveBeenCalled();
    expect(planningService.rollForward).not.toHaveBeenCalled();
  });
});
