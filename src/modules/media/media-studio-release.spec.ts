import { MediaStudioReleaseService } from './media-studio-release.service';
import { MediaDeliveryStatus } from './schemas/media-publication.schema';
import { MetricSnapshotPeriod } from './schemas/media-metric-snapshot.schema';

jest.mock('./media-studio-editorial',()=>({reviewStudioPost:jest.fn(()=>({pass:true,score:9.0,issues:[],dimensions:{}}))}));
describe('Media Studio production handoff and measured analytics',()=>{
  const date='2026-11-02', id='2026-11-02:instagram:reel:0';
  const post:any={id,date,platform:'instagram',format:'reel',seriesKey:'me-vs-me',seriesName:'Me vs Me',
    title:'A meaningful tested story',hook:'One surprising decision',script:'One surprising decision. This is the full, already-reviewed script.',
    caption:'Full caption',copy:'Final copy',storyArc:'Setup, tension and resolution',pinnedComment:'What is next?',
    shotLocation:'Desk',shotList:[],slides:[],hashtags:[],status:'ready',fingerprint:'real-fingerprint',editorial:{pass:true}};
  const docs=new Map<string,any>();
  const pubs=new Map<string,any>();
  const query:any={findOne:jest.fn(()=>({lean:async()=>({posts:[post]})})),find:jest.fn()};
  const content:any={findOneAndUpdate:jest.fn(async(filter:any,update:any)=>{
    const k=filter['metadata.studioKey'];
    if(!docs.has(k))docs.set(k,{_id:'content-1',...update.$setOnInsert});
    return docs.get(k);
  })};
  const publications:any={findOneAndUpdate:jest.fn(async(filter:any,update:any)=>{
    const k=filter['metadata.studioKey'];
    if(!pubs.has(k))pubs.set(k,{_id:'pub-1',...update.$setOnInsert});
    return pubs.get(k);
  }),find:jest.fn()};
  const metrics:any={find:jest.fn()};
  let service:MediaStudioReleaseService;
  beforeEach(()=>{
    post.status='ready';post.fingerprint='real-fingerprint';
    docs.clear();pubs.clear();jest.clearAllMocks();
    service=new MediaStudioReleaseService(query,content,publications,metrics);
  });
  it('creates exactly one draft, does not schedule, approve or publish, and safely reuses it',async()=>{
    const a=await service.handoff(date,id);
    const b=await service.handoff(date,id);
    expect(a.publicationId).toBe('pub-1');expect(a).toEqual(b);
    expect(docs.size).toBe(1);expect(pubs.size).toBe(1);
    const saved=[...pubs.values()][0];
    expect(saved.autoPublish).toBe(false);
    expect(saved.deliveryStatus).toBe(MediaDeliveryStatus.NOT_SCHEDULED);
    expect(saved.metadata.seriesKey).toBe('me-vs-me');
    expect(saved.script).toContain('surprising decision');
  });
  it('refuses incomplete writing',async()=>{
    post.status='needs_review';
    await expect(service.handoff(date,id)).rejects.toThrow('Complete and pass editorial review');
    expect(content.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('protects production drafts against silent changes after handoff',async()=>{
    await service.handoff(date,id);
    post.fingerprint='edited-new-writing';
    await expect(service.handoff(date,id)).rejects.toThrow('Writing changed after production handoff');
    expect([...pubs.values()][0].script).toContain('surprising decision');
  });
  it('does not confuse absent 48/96 snapshots with zero performance',async()=>{
    publications.find.mockReturnValue({select:()=>({lean:async()=>[{
      _id:'pub-1',platform:'instagram',deliveryStatus:MediaDeliveryStatus.PUBLISHED,
      publishedAt:new Date(Date.now()-6*86_400_000),metadata:{seriesKey:'me-vs-me'},
    }]})});
    metrics.find.mockReturnValue({select:()=>({lean:async()=>[{
      mediaPublicationId:'pub-1',period:MetricSnapshotPeriod.FORTY_EIGHT_HOURS,
      views:250,shares:6,saves:12,source:'manual',capturedAt:new Date(),
    }]})});
    const result=await service.analytics();
    expect(result.posts[0].review48.status).toBe('available');
    expect(result.posts[0].review96.status).toBe('awaiting_metrics');
    expect(result.series[0]).toMatchObject({published:1,measured48:1,measured96:0,views48:250});
  });
});
