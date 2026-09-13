import { MediaPresenceOsScheduler } from './media-presence-os.scheduler';

describe('MediaPresenceOsScheduler', () => {
  it('rolls only the missing seventh day during the daily planning job', async () => {
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

  it('does not silently rebuild the week after Sunday strategy adaptation', async () => {
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
