import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MediaSeriesService } from './media-series.service';
import { normalizePitch } from './media-series-design';
import { selectCreatorSeries } from './media-creator-tags';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';
import { authoredCreatorFallback } from './media-creator-asset-fallback';

const pitch = {
  name: 'Weekly Guitar Stories',
  angle: 'Every week I share an honest guitar practice problem, my attempts and what actually changed.',
  audience: 'People learning an instrument',
  channels: ['instagram','youtube'],
  sourceTopics: ['hobbies','books'],
  topicKeywords: ['guitar','guitar practice'],
  creativeDirection: 'Start with a visible mistake, use warm humour, and finish with the real sound.',
};

describe('owner-defined media series and source topics', () => {
  it('normalizes and bounds approved source discovery and precise hobby keywords', () => {
    const clean = normalizePitch({ ...pitch, channels:['instagram','tiktok'],
      sourceTopics:['hobbies','hobbies','secret-health-records'], topicKeywords:['guitar','guitar','chess'] });
    expect(clean.sourceTopics).toEqual(['hobbies']);
    expect(clean.topicKeywords).toEqual(['guitar','chess']);
    expect(clean.channels).toEqual(['instagram']);
    expect(clean.creativeDirection).toContain('visible mistake');
  });

  it('matches an owner-created active hobby series by its exact keyword, not a hard-coded name', () => {
    const custom = [{key:'weekly-guitar-stories',name:pitch.name,channels:pitch.channels,topicKeywords:pitch.topicKeywords}];
    expect(selectCreatorSeries('Today my guitar sounded terrible',MediaPlatform.INSTAGRAM,custom)?.key).toBe('weekly-guitar-stories');
    expect(selectCreatorSeries('Today my guitar sounded terrible',MediaPlatform.LINKEDIN,custom)).toBeNull();
    expect(selectCreatorSeries('My private reflection',MediaPlatform.INSTAGRAM,custom)).toBeNull();
  });

  it('does not invent a series attribution when two custom series share the same keyword', () => {
    const custom = [
      {key:'guitar-one',name:'Guitar One',channels:['instagram'],topicKeywords:['guitar']},
      {key:'guitar-two',name:'Guitar Two',channels:['instagram'],topicKeywords:['guitar']},
    ];
    expect(selectCreatorSeries('A real guitar practice moment',MediaPlatform.INSTAGRAM,custom)).toBeNull();
  });

  it('keeps offline drafts tied to a new owner series instead of inventing unrelated founder stories', () => {
    const portfolio = [{key:'world-a-z',name:'World A to Z',channels:['youtube'],
      topicKeywords:['Afghanistan'],sourceTopics:['world-cultures']}];
    const script = authoredCreatorFallback({action:'skip', platform:MediaPlatform.YOUTUBE} as never,
      '2026-11-03',1,MediaPostType.SHORT,MediaPlatform.YOUTUBE,undefined,new Set(),portfolio);
    expect(script.seriesKey).toBe('world-a-z');
    expect(script.title.toLowerCase()).toContain('afghanistan');
    expect(script.requiresApproval).toBe(true);
  });

  function fixture(status: 'active' | 'paused' | 'deleted' = 'active') {
    const series = { key:'weekly-guitar-stories', name:'Old name', angle:'Original recurring premise that can be improved.',
      audience:'', channels:['instagram'], status, creativeKit:{ premise:'Original' },
      sourceTopics:['hobbies'], topicKeywords:[], creativeDirection:'',
      save:jest.fn().mockResolvedValue(undefined), toObject:jest.fn().mockImplementation(function(this:any){return { ...this };}) };
    const model = { findOne:jest.fn().mockImplementation((query: any) => {
      if (query?.key === series.key) return Promise.resolve(status === 'deleted' ? null : series);
      return { lean:jest.fn().mockResolvedValue(null) };
    }), countDocuments:jest.fn().mockResolvedValue(8), };
    const service = Object.create(MediaSeriesService.prototype) as any;
    service.series = model;
    return { series, model, service };
  }

  it('edits the series in place with its stable key and owner creative direction', async () => {
    const {service,series} = fixture();
    const result = await service.updateSeries(series.key,pitch);
    expect(result.name).toBe(pitch.name);
    expect(series.key).toBe('weekly-guitar-stories');
    expect(series.sourceTopics).toEqual(['hobbies','books']);
    expect(series.creativeDirection).toBe(pitch.creativeDirection);
    expect(series.save).toHaveBeenCalledTimes(1);
  });

  it('removes a series by tombstoning rather than erasing old published metrics', async () => {
    const {service,series} = fixture();
    expect(await service.removeSeries(series.key)).toMatchObject({removed:true,historicalPostsPreserved:true});
    expect(series.status).toBe('deleted');
    expect(series.save).toHaveBeenCalledTimes(1);
  });

  it('will not resurrect a removed series using activation or editing', async () => {
    const {service} = fixture('deleted');
    await expect(service.updateSeries('weekly-guitar-stories',pitch)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeSeries('weekly-guitar-stories')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setStatus('weekly-guitar-stories','active')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows a seventh or eighth active series when a slot is open', async () => {
    const {service,model,series} = fixture('paused');
    model.countDocuments.mockResolvedValue(7);
    const result = await service.setStatus('weekly-guitar-stories','active');
    expect(result.status).toBe('active');
    expect(series.save).toHaveBeenCalled();
  });

  it('keeps an eight-active-series cap', async () => {
    const {service} = fixture('paused');
    await expect(service.setStatus('weekly-guitar-stories','active')).rejects.toBeInstanceOf(BadRequestException);
  });
});
