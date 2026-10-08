import { assessSeriesHealth, SeriesPerformancePost } from './media-series-evaluation';

const now = new Date('2026-10-08T09:00:00Z');
const series = [
  {key:'weak', channels:['instagram'], activatedAt:new Date('2026-07-01')},
  {key:'peer1', channels:['instagram'], activatedAt:new Date('2026-07-01')},
  {key:'peer2', channels:['instagram'], activatedAt:new Date('2026-07-01')},
];
const sample = (key:string, daysAgo:number, actions:number): SeriesPerformancePost => ({
  seriesKey:key, platform:'instagram', publishedAt:new Date(now.getTime() - daysAgo*86400000),
  impressions:1000, saves:actions, shares:0, followersGained:0,
});
const samples = (key:string, daysAgo:number, actions:number) => Array.from({length:4}, (_,idx) => sample(key,daysAgo+idx,actions));
const observations = [
  ...samples('weak', 4, 1), ...samples('weak', 32, 1),
  ...samples('peer1',4,10), ...samples('peer1',32,10),
  ...samples('peer2',4,10), ...samples('peer2',32,10),
];

describe('conservative series rotation', () => {
  it('flags consistently weak series only after two fully measured windows', () => {
    expect(assessSeriesHealth(series, observations, now).find(s => s.key === 'weak')?.recommendation)
      .toBe('consider_rotation');
  });
  it('does not rotate when a series wins in the latest window', () => {
    const data = observations.map(post => post.seriesKey === 'weak' && post.publishedAt >= new Date(now.getTime() - 28*86400000)
      ? {...post, saves:12} : post);
    expect(assessSeriesHealth(series, data, now).find(s => s.key === 'weak')?.recommendation)
      .toBe('keep');
  });
  it('does not confuse missing metrics with weak performance', () => {
    expect(assessSeriesHealth(series, observations.filter(p => p.seriesKey !== 'weak'), now)[0].recommendation)
      .toBe('collect_more_data');
  });
  it('never compares a series against peers from a different channel', () => {
    const changed = series.map(p => p.key === 'peer2' ? {...p, channels:['youtube']} : p);
    expect(assessSeriesHealth(changed, observations, now)[0].recommendation).toBe('collect_more_data');
  });
});
