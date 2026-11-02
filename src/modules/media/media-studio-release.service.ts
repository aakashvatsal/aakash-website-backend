import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MediaStudioDay } from './schemas/media-studio-day.schema';
import { MediaContentItem, MediaContentItemStatus, MediaContentOrigin } from './schemas/media-content-item.schema';
import { MediaPublication, MediaDeliveryStatus, MediaProductionStatus } from './schemas/media-publication.schema';
import { MediaMetricSnapshot, MetricSnapshotPeriod } from './schemas/media-metric-snapshot.schema';
import { MediaPlatform, MediaPostType, MediaPostStatus } from './schemas/media-post.schema';
import { StudioPost, studioAddDays, studioLocalDate } from './media-studio-policy';
import { reviewStudioPost } from './media-studio-editorial';

/**
 * Explicit, idempotent boundary from Studio writing to existing production.
 * This service NEVER approves, schedules or publishes: the core production,
 * preflight and calendar services remain the only authorization paths.
 */
@Injectable()
export class MediaStudioReleaseService {
  constructor(
    @InjectModel(MediaStudioDay.name) private readonly days: Model<MediaStudioDay>,
    @InjectModel(MediaContentItem.name) private readonly content: Model<MediaContentItem>,
    @InjectModel(MediaPublication.name) private readonly publications: Model<MediaPublication>,
    @InjectModel(MediaMetricSnapshot.name) private readonly metrics: Model<MediaMetricSnapshot>,
  ) {}

  static key(date: string, id: string): string { return `studio-v7:${date}:${id}`; }

  async handoff(date: string, id: string) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !id || id.length>250)
      throw new BadRequestException('Invalid Studio date or asset ID');
    const day=await this.days.findOne({date}).lean();
    const post=((day?.posts??[]) as unknown as StudioPost[]).find(p=>p.id===id);
    if(!post) throw new NotFoundException('Studio writing package not found');
    const review=reviewStudioPost(post);
    if(post.status!=='ready' || !review.pass || !post.title || !post.hook)
      throw new BadRequestException('Complete and pass editorial review before creating a production draft.');
    const studioKey=MediaStudioReleaseService.key(date,id);
    // Upserts plus unique indexes make retries safe, including interrupted handoffs.
    // Do not mutate a publication after production has started: new writing must be
    // explicitly reviewed instead of silently overwriting filming/publishing work.
    const body=post.script || post.copy || post.caption;
    const content=await this.content.findOneAndUpdate(
      {'metadata.studioKey':studioKey},
      {$setOnInsert:{title:post.title,thesis:post.hook,canonicalBody:body,
        story:post.storyArc||'',evidence:post.evidenceId?[post.evidenceId]:[],
        contentPillars:[post.seriesName],status:MediaContentItemStatus.READY,
        origin:MediaContentOrigin.HSAKAA,isActive:true,
        metadata:{studioKey,studioDate:date,studioPostId:id,seriesKey:post.seriesKey,
          editorialScore:review.score,studioFingerprint:post.fingerprint,trend:post.trend??{status:'evergreen'},source:'media-studio'}}},
      {upsert:true,new:true},
    );
    if(!content) throw new BadRequestException('Could not prepare the production content item');
    if(content.metadata?.studioFingerprint && content.metadata.studioFingerprint !== post.fingerprint)
      throw new BadRequestException('Writing changed after production handoff. Review changes in Media Production before releasing; existing publication was not overwritten.');
    const format=post.format==='long_video'?MediaPostType.VIDEO:post.format as MediaPostType;
    const publication=await this.publications.findOneAndUpdate(
      {'metadata.studioKey':studioKey},
      {$setOnInsert:{contentItemId:content._id,platform:post.platform as MediaPlatform,format,
        status:MediaPostStatus.SCRIPT_READY,productionStatus:MediaProductionStatus.NOT_STARTED,
        deliveryStatus:MediaDeliveryStatus.NOT_SCHEDULED,autoPublish:false,isActive:true,
        title:post.title,hook:post.hook,caption:post.caption||post.copy,
        script:post.script||undefined,description:post.copy||undefined,
        cta:post.pinnedComment||undefined,hashtags:post.hashtags??[],
        slides:post.slides?.map(s=>[s.headline,s.copy].filter(Boolean).join('\n'))??[],
        metadata:{studioKey,studioPostId:id,studioDate:date,seriesKey:post.seriesKey,
          source:'media-studio',editorialScore:review.score,studioFingerprint:post.fingerprint}}},
      {upsert:true,new:true},
    );
    if(!publication) throw new BadRequestException('Could not create production publication');
    if(publication.metadata?.studioFingerprint && publication.metadata.studioFingerprint !== post.fingerprint)
      throw new BadRequestException('Writing changed after production handoff. The production record was preserved without overwriting approved media.');
    return {studioKey,date,id,contentItemId:String(content._id),publicationId:String(publication._id),
      platform:publication.platform,seriesKey:post.seriesKey,
      writingStatus:post.status,productionStatus:publication.productionStatus,
      deliveryStatus:publication.deliveryStatus,status:publication.status,
      next:'Complete production assets, request preflight approval, then schedule through Media Production.'};
  }

  async overview() {
    const today=studioLocalDate();
    const dates=Array.from({length:8},(_,i)=>studioAddDays(today,i));
    const days=await this.days.find({date:{$in:dates}}).select('date posts').lean();
    const slots=days.flatMap(d=>((d.posts??[]) as unknown as StudioPost[])
      .map(p=>({key:MediaStudioReleaseService.key(d.date,p.id),date:d.date,id:p.id,
        title:p.title,platform:p.platform,seriesKey:p.seriesKey,writingStatus:p.status})));
    const keys=slots.map(s=>s.key);
    const publications=keys.length?await this.publications.find({'metadata.studioKey':{$in:keys}})
      .select('_id metadata status productionStatus deliveryStatus scheduledAt publishedAt manualPublishCompletedAt externalPostUrl').lean():[];
    const linked=new Map(publications.map(p=>[String(p.metadata?.studioKey),p]));
    return {today,through:dates[7],packages:slots.map(slot=>{
      const pub=linked.get(slot.key);
      return {...slot,publicationId:pub?String(pub._id):null,
        productionStatus:pub?.productionStatus??'not_started',
        deliveryStatus:pub?.deliveryStatus??'not_scheduled',
        scheduledAt:pub?.scheduledAt??null,
        publishedAt:pub?.publishedAt??pub?.manualPublishCompletedAt??null,
        externalPostUrl:pub?.externalPostUrl??null};
    })};
  }

  async analytics() {
    const since=new Date(Date.now()-35*86_400_000);
    const published=await this.publications.find({
      'metadata.source':'media-studio',deliveryStatus:MediaDeliveryStatus.PUBLISHED,
      $or:[{publishedAt:{$gte:since}},{manualPublishCompletedAt:{$gte:since}}],
    }).select('_id platform metadata publishedAt manualPublishCompletedAt').lean();
    const ids=published.map(p=>p._id);
    const snapshots=ids.length?await this.metrics.find({mediaPublicationId:{$in:ids},
      period:{$in:[MetricSnapshotPeriod.FORTY_EIGHT_HOURS,MetricSnapshotPeriod.NINETY_SIX_HOURS]}})
      .select('mediaPublicationId period source capturedAt views reach likes shares saves followersGained averageWatchPercentage averageViewDurationSeconds rawMetrics').lean():[];
    const lookup=new Map(snapshots.map(s=>[`${String(s.mediaPublicationId)}:${s.period}`,s]));
    const perSeries=new Map<string,{seriesKey:string;published:number;measured48:number;measured96:number;views48:number;views96:number;shares96:number;saves96:number}>();
    const results=published.map(p=>{
      const seriesKey=String(p.metadata?.seriesKey||'untagged');
      const row=perSeries.get(seriesKey)??{seriesKey,published:0,measured48:0,measured96:0,
        views48:0,views96:0,shares96:0,saves96:0};
      row.published++;
      const p48=lookup.get(`${String(p._id)}:${MetricSnapshotPeriod.FORTY_EIGHT_HOURS}`);
      const p96=lookup.get(`${String(p._id)}:${MetricSnapshotPeriod.NINETY_SIX_HOURS}`);
      if(p48){row.measured48++;row.views48+=(p48.views||0);}
      if(p96){row.measured96++;row.views96+=(p96.views||0);row.shares96+=(p96.shares||0);row.saves96+=(p96.saves||0);}
      perSeries.set(seriesKey,row);
      const start=new Date(p.publishedAt??p.manualPublishCompletedAt??new Date());
      const ageHours=Math.max(0,Math.floor((Date.now()-start.getTime())/3_600_000));
      const summary=(snap:typeof p48)=>snap?{status:'available',source:snap.source,
        capturedAt:snap.capturedAt,views:snap.views,shares:snap.shares,saves:snap.saves,
        averageWatchPercentage:snap.averageWatchPercentage??null,
        averageViewDurationSeconds:snap.averageViewDurationSeconds??null}:
        {status:'awaiting_metrics'};
      return {publicationId:String(p._id),platform:p.platform,seriesKey,ageHours,
        review48:ageHours<48?{status:'not_due'}:summary(p48),
        review96:ageHours<96?{status:'not_due'}:summary(p96)};
    });
    return {generatedAt:new Date().toISOString(),posts:results,series:[...perSeries.values()],
      note:'Only recorded metric snapshots. Missing metrics are not zero performance; provider sync or manual entry is required.'};
  }
}
