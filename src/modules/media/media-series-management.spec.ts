import { MediaSeriesService } from './media-series.service';

describe('owner-created series management', () => {
  const pitch = { name:'Aakash Learns Outdoors', angle:'A recurring real outdoor learning episode where one unexpected challenge changes the next attempt.', channels:['instagram','youtube'] };
  function fixture() {
    const service = Object.create(MediaSeriesService.prototype) as any;
    service.seed = jest.fn().mockResolvedValue(undefined);
    service.series = {
      findOne: jest.fn().mockReturnValue({lean: jest.fn().mockResolvedValue(null)}),
      create: jest.fn().mockImplementation(async (doc: any) => doc),
      find: jest.fn().mockReturnValue({select: jest.fn().mockReturnValue({lean: jest.fn().mockResolvedValue([])})}),
    };
    service.aiService = {generateStructuredResponse: jest.fn()};
    return service;
  }
  it('saves a reviewed creative kit with the new series, PAUSED even with a full active portfolio', async () => {
    const service = fixture();
    const review = await service.designSeries({...pitch});
    const saved = await service.createSeries({...pitch,design:review});
    expect(saved.status).toBe('paused');
    expect(saved.key).toBe('aakash-learns-outdoors');
    expect(saved.creativeKit.hookPatterns).toEqual(review.creativeKit.hookPatterns);
    expect(saved.creativeKit.visualIdentity).toBe(review.creativeKit.visualIdentity);
    expect(service.series.create).toHaveBeenCalledTimes(1);
  });
  it('rejects the duplicate slug before inserting a second series', async () => {
    const service = fixture();
    service.series.findOne.mockReturnValue({lean: jest.fn().mockResolvedValue({key:'aakash-learns-outdoors'})});
    await expect(service.createSeries(pitch)).rejects.toThrow(/already exists/);
  });
  it('returns a designed suggestion without repeated AI requests if model fails', async () => {
    const service = fixture();
    service.aiService.generateStructuredResponse.mockRejectedValue(new Error('AI offline'));
    const result = await service.suggestSeries('I want a light-hearted travel series');
    expect(result.pitch.name).toBeTruthy();
    expect(result.review.creativeKit.hookPatterns.length).toBeGreaterThan(0);
    expect(result.review.aiAssisted).toBe(false);
    expect(service.aiService.generateStructuredResponse).toHaveBeenCalledTimes(1);
  });
});
