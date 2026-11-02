import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { MediaSeriesService } from './media-series.service';
import { MediaPresenceService } from './media-presence.service';
import { MediaStudioDay } from './schemas/media-studio-day.schema';
import { MediaPublication, MediaDeliveryStatus } from './schemas/media-publication.schema';
import { MediaMetricSnapshot, MetricSnapshotPeriod } from './schemas/media-metric-snapshot.schema';
import { MediaAccountMetricSnapshot } from './schemas/media-account-metric-snapshot.schema';
import { MediaAudienceInsight } from './schemas/media-audience-insight.schema';
import { MediaPlatform } from './schemas/media-post.schema';
import { StudioPost, StudioSlot, studioAddDays, studioBuildSlots, studioFingerprint, studioLocalDate, studioSimilar } from './media-studio-policy';
import { reviewStudioPost } from './media-studio-editorial';
import { matchVerifiedCreatorTrend } from './media-creator-tags';

type Draft = {
  slotId: string; title:string; hook:string; hookAlternatives:string[];
  copy:string; script:string; shotLocation:string;
  shotList: Array<{time:string;shot:string;direction:string;spokenLine:string}>;
  slides: Array<{headline:string;copy:string;visual:string}>;
  cover:string;caption:string;hashtags:string[];pinnedComment:string;
  evidenceId:string; storyArc:string;
};
const isText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const trim = (v: unknown, max = 5000) => typeof v === 'string' ? v.trim().slice(0,max) : '';
const VIDEO = new Set(['reel','short','long_video']);
const visualOnly = new Set(['image','carousel','story']);
const STUDIO_OUTPUT_CAPS: Record<StudioSlot['format'], number> = {
  story: 1650, image: 1650, text: 1900, reel: 2900,
  short: 2900, carousel: 4000, long_video: 7600,
};
const envBound = (name:string, fallback:number, low:number, high:number):number => {
  const value=Number(process.env[name]);
  return Number.isInteger(value) && value>=low && value<=high ? value : fallback;
};
const hasFinishedWriting=(post:StudioPost | undefined):boolean => {
  if (!post || !post.title || !post.hook || !post.hookAlternatives?.length) return false;
  if (post.platform !== 'x' && post.platform !== 'linkedin' && !post.caption) return false;
  if (VIDEO.has(post.format)) return (post.script||'').trim().split(/\s+/).length >= (post.format==='long_video'?350:55)
    && Boolean(post.shotLocation) && (post.shotList?.length??0)>=3;
  if (post.format==='carousel') return (post.slides?.length??0)>=4;
  if (post.format==='text') return (post.copy||'').trim().length>=65;
  return Boolean((post.copy||post.caption).trim()) && Boolean(post.shotLocation || post.slides?.length);
};

@Injectable()
export class MediaStudioService {
  private readonly logger = new Logger(MediaStudioService.name);
  private readonly generationJobs = new Set<string>();
  constructor(
    @InjectModel(MediaStudioDay.name) private readonly days: Model<MediaStudioDay>,
    @InjectModel(MediaPublication.name) private readonly publications: Model<MediaPublication>,
    @InjectModel(MediaMetricSnapshot.name) private readonly metrics: Model<MediaMetricSnapshot>,
    @InjectModel(MediaAccountMetricSnapshot.name) private readonly accounts: Model<MediaAccountMetricSnapshot>,
    @InjectModel(MediaAudienceInsight.name) private readonly audience: Model<MediaAudienceInsight>,
    private readonly ai: AiService,
    private readonly series: MediaSeriesService,
    private readonly presence: MediaPresenceService,
  ) {}

  private ensureDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        new Date(`${date}T00:00:00.000Z`).toISOString().slice(0,10) !== date)
      throw new BadRequestException('Use a valid YYYY-MM-DD date');
    const today = studioLocalDate();
    if (date < today || date > studioAddDays(today, 14))
      throw new BadRequestException('Only today and the next fourteen days can be generated');
  }

  async overview() {
    const today = studioLocalDate();
    const dates = Array.from({length:8},(_,i)=>studioAddDays(today,i));
    const [active, records] = await Promise.all([
      this.series.activePortfolio(),
      this.days.find({date:{$in:dates}}).lean(),
    ]);
    const byDate = new Map(records.map(x=>[x.date,x]));
    const inWindow=(records.flatMap(x=>((x.posts??[]) as unknown as StudioPost[])))
      .filter(p=>p.title&&p.hook);
    const requiredChannels=['instagram','youtube','linkedin','x'];
    const missingChannels=requiredChannels.filter(ch=>!active.some(s=>s.channels.includes(ch)));
    return {
      today, through: dates[7], activeSeriesCount: active.length,
      seriesReady: active.length>=5 && active.length<=8 && missingChannels.length===0,
      missingRequiredChannels:missingChannels,
      minActive:5, maxActive:8,
      series:active,
      days:dates.map(date=>{
        const item = byDate.get(date);
        const posts = ((item?.posts ?? []) as unknown as StudioPost[]).map(post=>{
          if(!post.title || post.status==='writing_failed')return post;
          const historical=inWindow.filter(p=>p.id!==post.id && p.title && p.hook);
          const editorial=reviewStudioPost(post,historical);
          // Re-evaluate legacy 'ready' records from older versions on read. Do not
          // mutate the database during GET or hide writing already completed.
          return {...post,editorial,status:post.status==='ready'&&!editorial.pass?'needs_review':post.status,
            reason:post.status==='ready'&&!editorial.pass?
              `Independent editorial review required: ${editorial.issues.slice(0,3).join('; ')}`:post.reason};
        });
        return {date, status:item?.status ?? 'pending', error:item?.lastError ?? null, posts,
          usage:item?.generationUsage??null,
          counts:{total:posts.length, ready:posts.filter(x=>x.status==='ready').length,
            needsInput:posts.filter(x=>x.status==='needs_input').length,
            needsReview:posts.filter(x=>x.status==='needs_review').length,
            writingFailed:posts.filter(x=>x.status==='writing_failed').length}};
      }),
    };
  }

  private async context() {
    const data = await this.presence.directorContext();
    const world = data.worldContext;
    // Context is not consent to publish; exclude sensitive sources even if a
    // legacy ingestion path incorrectly labeled them public-safe.
    const evidence = (world.publicSafe ?? []).filter(item=>{
      const source = String(item.source).toLowerCase();
      const kind = String(item.kind).toLowerCase();
      return item.privacy === 'public_safe' && item.publishable === true &&
        !/(health|medical|sexual|therapy|people|memory|finance|password|journal|brain)/i.test(`${source} ${kind}`);
    }).slice(0,25).map(item=>({id:item.id,source:item.source,title:item.title,
      summary:trim(item.summary,300),occurredAt:item.occurredAt}));
    return {
      evidence,
      hobbies:(world.hobbies ?? []).slice(0,12).map(h=>({
        name:h.name,currentStage:h.currentStageTitle,nextFocus:h.nextFocus,
      })),
      companies:(world.companies ?? []).slice(0,6).map(c=>({
        name:c.name,products:c.products,currentFocus:c.currentFocus,priorities:c.currentPriorities,
      })),
      voice:data.voiceProfile ? JSON.stringify(data.voiceProfile).slice(0,900) : '',
    };
  }

  private async recentCopy(date: string) {
    const since = studioAddDays(date,-90);
    const through = studioAddDays(date, 7);
    const records = await this.days.find({date:{$gte:since,$lte:through,$ne:date}})
      .select('posts').sort({date:-1}).limit(90).lean();
    const publishedSince = new Date(Date.now()-90*86_400_000);
    const published = await this.publications.find({
      deliveryStatus: MediaDeliveryStatus.PUBLISHED,
      $or:[{publishedAt:{$gte:publishedSince}},{manualPublishCompletedAt:{$gte:publishedSince}}],
    }).select('title hook caption script platform').limit(150).lean();
    const planned = records.flatMap(x=>((x.posts ?? []) as unknown as StudioPost[]).map(p=>({
      title:p.title,hook:p.hook,copy:trim(p.copy,300),
      fingerprint:p.fingerprint,seriesKey:p.seriesKey,
    })));
    const shipped = published.map(p=>({
      title:trim(p.title,180),hook:trim(p.hook,200),copy:trim(p.caption||p.script,300),
      fingerprint:studioFingerprint(`${p.title} ${p.hook}`),seriesKey:'',
    }));
    return [...planned,...shipped].slice(0,180);
  }

  private focusedContext(ctx:Awaited<ReturnType<MediaStudioService['context']>>,
    slot:StudioSlot, selected:{topicKeywords?:string[];sourceTopics?:string[]}|undefined) {
    // Prioritize relevant, approved evidence instead of repeating all of Personal OS
    // in every individual model call. Full IDs remain available for validation.
    const keywords=[slot.seriesName,...(selected?.topicKeywords??[]),...(selected?.sourceTopics??[])]
      .join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>3);
    const evidence=[...ctx.evidence].sort((a,b)=>{
      const score=(item:typeof a)=>keywords.filter(word=>
        `${item.title} ${item.summary} ${item.source}`.toLowerCase().includes(word)).length;
      return score(b)-score(a);
    }).slice(0,8);
    return {evidence,hobbies:ctx.hobbies.slice(0,6),companies:ctx.companies.slice(0,4),voice:ctx.voice};
  }

  private instructions() {
    return [
      'You are a top-tier English-language creator writer, scriptwriter, creative director and exact shot-list producer.',
      'Create immediately usable final content. No templates, placeholder speech, motivational filler, or phrases like "stay with the moment".',
      'Every post has its own concrete, specific subject and satisfying change/insight, not a generic founder lesson.',
      'Start with a vivid true detail, unexpected fact, specific contradiction, comedic observation, or a real question with stakes.',
      'Prioritize meaningful entertainment over rhetorical hooks. Never promise outcomes you cannot substantiate.',
      'Choose pacing and creative language natural to each platform: Instagram visual/personality, YouTube story/retention, LinkedIn experience + insight, X sharp and concise, WhatsApp informal short story.',
      'Write fully spoken, word-for-word scripts for all video formats. Reel/Short 75-140 spoken words where appropriate; YouTube long 700-1200 spoken words. No instructions inside script.',
      'For text platform, copy is final publishable copy. For carousel, slides are complete slide-by-slide texts; for story, frames and overlay words must be clear.',
      'Return shoot location, specific shot timeline, what to photograph or film and how, cover headline, caption, meaningful CTA, optional hashtags.',
      'Avoid clickbait, no invented first-person memories, invented quotes, invented trips, invented metrics, invented accomplishments or pretend research.',
      'If evidence is insufficient for a personal story, select a clearly labeled prospective experiment or thoughtful commentary and flag evidenceId as empty.',
      'Select one actual supplied evidence id only when supported. Never fabricate source ids. Do not disclose private health or identifying personal details.',
      'Use selected series direction and platforms; do not override owner-defined channel choices.',
      'For each story show an ACTUAL grounded scene/attempt, a changed circumstance, tension, and an earned payoff. Keep the hook as the very first spoken line.',
      'Separate spoken dialogue from shot instructions. Never use second-person production instructions as script dialogue.',
      'If no grounded scene exists, write an explicitly framed analytical opinion/experiment instead of pretending that something happened.',
      'Avoid reusing the same argument, emotional payoff or hook shape even when titles differ.',
      'Never claim that a topic is trending unless a source and timestamp are supplied in verifiedTrends. No hashtag implying a trend without verification.',
      'No near-duplicates of titles, opening hooks, subjects or content across previous days or same day.',
      'Exactly one returned entry for each requested slot id. All text is in ENGLISH.',
    ].join('\n');
  }

  private schema() {
    const str = {type:'string'} as const;
    const strings = {type:'array',items:str} as const;
    return {type:'object',additionalProperties:false,required:['posts'],
      properties:{posts:{type:'array',items:{type:'object',additionalProperties:false,
        required:['slotId','title','hook','hookAlternatives','copy','script','shotLocation','shotList','slides','cover','caption','hashtags','pinnedComment','evidenceId','storyArc'],
        properties:{
          slotId:str,title:str,hook:str,hookAlternatives:strings,copy:str,script:str,
          shotLocation:str,shotList:{type:'array',items:{type:'object',additionalProperties:false,
            required:['time','shot','direction','spokenLine'],
            properties:{time:str,shot:str,direction:str,spokenLine:str}}},
          slides:{type:'array',items:{type:'object',additionalProperties:false,
            required:['headline','copy','visual'],properties:{headline:str,copy:str,visual:str}}},
          cover:str,caption:str,hashtags:strings,pinnedComment:str,evidenceId:str,storyArc:str,
        }}}}};
  }

  private normalize(slot: StudioSlot, draft: Draft|undefined, evidenceIds: Set<string>, seen: string[]): StudioPost {
    const base: StudioPost = {
      ...slot,title:trim(draft?.title,150),hook:trim(draft?.hook,240),
      hookAlternatives:Array.isArray(draft?.hookAlternatives)?draft!.hookAlternatives.map(x=>trim(x,220)).filter(Boolean).slice(0,3):[],
      copy:trim(draft?.copy,3500),script:trim(draft?.script,15000),
      shotLocation:trim(draft?.shotLocation,240),
      shotList:Array.isArray(draft?.shotList)?draft!.shotList.slice(0,25).map(x=>({
        time:trim(x.time,40),shot:trim(x.shot,300),direction:trim(x.direction,500),spokenLine:trim(x.spokenLine,500)})):[],
      slides:Array.isArray(draft?.slides)?draft!.slides.slice(0,12).map(x=>({
        headline:trim(x.headline,200),copy:trim(x.copy,800),visual:trim(x.visual,450)})):[],
      cover:trim(draft?.cover,250),caption:trim(draft?.caption,2500),
      hashtags:Array.isArray(draft?.hashtags)?draft!.hashtags.map(x=>trim(x,80)).filter(Boolean).slice(0,10):[],
      pinnedComment:trim(draft?.pinnedComment,500),evidenceId:trim(draft?.evidenceId,200),
      fingerprint:'',status:'needs_review',reason:'',source:'ai',
      storyArc:trim(draft?.storyArc,1100),trend:{status:'evergreen'},
    };
    base.fingerprint=studioFingerprint(`${base.title} ${base.hook} ${base.script||base.copy}`);
    const reasons:string[]=[];
    if (!draft || !base.title) reasons.push('AI did not complete this slot');
    if (!base.hook || base.hook.length<12 || !base.hookAlternatives.length)
      reasons.push('Needs a concrete opening hook with alternatives');
    if (base.hook && VIDEO.has(slot.format) && base.script &&
        !studioFingerprint(base.script).startsWith(studioFingerprint(base.hook).slice(0,25)))
      reasons.push('Chosen hook must be the spoken first line');
    if (VIDEO.has(slot.format)) {
      const words=base.script.split(/\s+/).filter(Boolean).length;
      if (words<(slot.format==='long_video'?350:55)) reasons.push('Incomplete word-for-word video script');
      if (!base.shotLocation || base.shotList.length<3) reasons.push('Incomplete location and shot-by-shot filming direction');
    } else if (slot.format==='carousel' && base.slides.length<4) reasons.push('Carousel requires at least four fully written slides');
    else if (visualOnly.has(slot.format) && !base.shotLocation && !base.slides.length) reasons.push('Missing visual/story production instructions');
    else if (slot.format==='text' && base.copy.length<65) reasons.push('Text not ready to publish');
    if (!base.caption && slot.platform!=='x' && slot.platform!=='linkedin') reasons.push('Missing final caption');
    if (base.evidenceId && !evidenceIds.has(base.evidenceId)) reasons.push('Unverified evidence reference');
    // A personal story must be verifiable; commentary without an evidence id
    // is permitted only as owner-reviewed, not silently publication-ready.
    if (!base.evidenceId) reasons.push('Owner to verify personal facts and any external research');
    const candidate=studioFingerprint(`${base.title} ${base.hook}`);
    if (seen.some(v=>studioSimilar(v,candidate)>=0.76))
      reasons.push('Too close to previously planned story or opening hook');
    if (/stay with the concrete moment|here's the problem|turn one disagreement into an observable question|editorial completion|write a script|capture one real moment/i.test(`${base.script} ${base.copy}`))
      reasons.push('Contains AI writing instructions or generic filler');
    const previousHistory=seen.map(v=>({title:v,hook:''}));
    base.editorial=reviewStudioPost(base,previousHistory);
    if(!base.editorial.pass) reasons.push(...base.editorial.issues.slice(0,5));
    if(base.evidenceId && !evidenceIds.has(base.evidenceId)) {
      base.editorial={...base.editorial,pass:false,score:Math.min(base.editorial.score,6),
        issues:[...base.editorial.issues,'Source evidence ID is not approved']};
    }
    base.status=reasons.length?'needs_review':'ready';
    base.reason=[...new Set(reasons)].join('; ');
    if (!draft) {base.status='writing_failed';base.reason='Writing was interrupted; retry this asset. No additional personal information is required.';base.source='not_generated';}
    seen.push(candidate);
    return base;
  }

  /** One AI request per asset, with durable checkpoints and a bounded retry budget.
   * Never turn an AI transport/token failure into a request for user evidence.
   */
  async generateDate(date: string, replace = false) {
    this.ensureDate(date);
    if (this.generationJobs.has(date)) return {date,status:'generating',message:'Already generating'};
    const series=await this.series.activePortfolio();
    if (series.length<5 || series.length>8)
      throw new BadRequestException('Activate 5–8 series in Series Studio before generating content');
    const slots=studioBuildSlots(date,series);
    if (!slots.length) throw new BadRequestException('No selected series can publish on the supported platforms');
    const missingChannels=['instagram','youtube','linkedin','x'].filter(ch=>!series.some(s=>s.channels.includes(ch)));
    if (missingChannels.length) throw new BadRequestException(`Required weekly platforms have no active series: ${missingChannels.join(', ')}. Enable these platforms on an active series.`);
    this.generationJobs.add(date);
    try {
      const previous=await this.days.findOne({date}).lean();
      const previousById=new Map(((previous?.posts??[]) as unknown as StudioPost[]).map(p=>[p.id,p]));
      const [ctx,recent,trends]=await Promise.all([this.context(),this.recentCopy(date),
        typeof this.series.trendSignals==='function' ? this.series.trendSignals().catch(()=>({available:false,entries:[]})) : Promise.resolve({available:false,entries:[]})]);
      const evidenceIds=new Set(ctx.evidence.map(e=>e.id));
      const historical=recent.map(x=>studioFingerprint(`${x.title} ${x.hook}`));
      const posts=slots.map(slot=>previousById.get(slot.id)??this.normalize(slot,undefined,evidenceIds,[]));
      const pending=slots.filter(slot=>{
        const post=previousById.get(slot.id);
        // Default fills only unfinished writing, preserving review-only and ready packs.
        // An explicit Rewrite Day may rewrite reviewed content as well.
        return replace || !hasFinishedWriting(post);
      });
      if (!pending.length) {
        const ready=posts.filter(p=>p.status==='ready').length;
        return {date,status:ready===posts.length?'complete':'needs_attention',
          total:posts.length,ready,needsAttention:posts.length-ready,skippedAi:true};
      }
      const maxCalls=envBound('HSAKAA_MEDIA_STUDIO_MAX_CALLS_PER_DAY',6,1,12);
      const maxBudget=envBound('HSAKAA_MEDIA_STUDIO_OUTPUT_TOKEN_BUDGET',19000,2500,100000);
      let calls=0,outputReserved=0,inputTokens=0,outputTokens=0,reasoningTokens=0;
      let lastError='';
      const checkpoint=async(error='')=>{
        const ready=posts.filter(p=>p.status==='ready').length;
        await this.days.updateOne({date},{$set:{posts,generatedAt:new Date(),
          status:ready===posts.length?'complete':'needs_attention',lastError:error,
          generationUsage:{calls,inputTokens,outputTokens,reasoningTokens,outputReserved,
            maxCalls,maxOutputBudget:maxBudget}}},{upsert:true});
      };
      await this.days.updateOne({date},{$set:{posts,status:'generating',lastError:''}}, {upsert:true});
      for (const slot of pending) {
        const index=posts.findIndex(p=>p.id===slot.id);
        if (index<0) continue;
        const limit=STUDIO_OUTPUT_CAPS[slot.format];
        if(calls>=maxCalls || outputReserved+limit>maxBudget){
          if(!hasFinishedWriting(posts[index])) posts[index]={...posts[index],status:'writing_failed',source:'not_generated',
            reason:'Writing budget reached. Resume this asset with Fill Missing Days.'};
          await checkpoint('Writing budget reached; completed packs were saved.');
          continue;
        }
        const selected=series.find(x=>x.key===slot.seriesKey);
        const slotInstructions={...slot,angle:selected?.angle,audience:selected?.audience,
          creativeDirection:selected?.creativeDirection,sourceTopics:selected?.sourceTopics,
          topicKeywords:selected?.topicKeywords};
        const references=recent.slice(0,16).map(({title,hook,seriesKey})=>({title,hook,seriesKey}));
        const seen=[...historical,...posts.filter((p,i)=>i!==index&&hasFinishedWriting(p))
          .map(p=>studioFingerprint(`${p.title} ${p.hook}`))];
        let draft:Draft | undefined;
        let failure='';
        // Retry ONLY truncated or empty structured responses, and never more than once.
        for(let attempt=0;attempt<2;attempt++) {
          if(calls>=maxCalls || outputReserved+limit>maxBudget) break;
          calls++;outputReserved+=limit;
          try {
            const answer=await this.ai.generateStructuredResponse<{posts:Draft[]}>({
              name:'hsakaa_media_studio_v7_asset',
              model:process.env.HSAKAA_MEDIA_STUDIO_MODEL || process.env.HSAKAA_MEDIA_MODEL || 'gpt-5.4-mini',
              maxOutputTokens:limit,reasoningEffort:'low',verbosity:'low',
              instructions:this.instructions()+`\nWRITE EXACTLY ONE ${slot.platform} ${slot.format} ASSET. Return exactly one posts[] element with the requested slotId. Do not write other slots. The text must be usable verbatim. ${attempt?'Previous attempt was truncated; keep nonessential arrays concise while preserving the complete spoken script.':''}`,
              schema:this.schema(),
              input:JSON.stringify({date,slot:slotInstructions,approvedContext:this.focusedContext(ctx,slot,selected),
                previousPosts:references,verifiedTrends:trends.available?trends.entries.slice(0,6):[],
                otherCurrentDayHooks:posts.filter((p,i)=>i!==index&&p.hook).map(p=>p.hook).slice(0,7)}),
            });
            inputTokens+=answer.usage.inputTokens;outputTokens+=answer.usage.outputTokens;
            reasoningTokens+=answer.usage.reasoningTokens;
            draft=answer.data?.posts?.find(p=>p.slotId===slot.id);
            if (!draft) throw new Error('AI did not return the requested slotId');
            failure='';break;
          } catch(error) {
            failure=error instanceof Error?error.message:String(error);
            this.logger.warn(`Media Studio ${date} ${slot.id} (attempt ${attempt+1}): ${failure}`);
            // Most invalid responses are not recoverable by repeating the same prompt.
            if(!/max_output_tokens|was empty|did not return the requested slotId/i.test(failure))break;
          }
        }
        if (draft) {
          const next=this.normalize(slot,draft,evidenceIds,seen);
          const matchedTrend=matchVerifiedCreatorTrend(next.title, `${next.script} ${next.copy}`, trends);
          next.trend=matchedTrend?{status:'verified_signal',...matchedTrend}:{status:'evergreen'};
          // A bad AI response should not destroy an existing complete pack.
          if(!hasFinishedWriting(next) && hasFinishedWriting(posts[index])) {
            posts[index]={...posts[index],reason:'Existing completed copy retained; replacement did not pass completeness checks'};
          } else {posts[index]=next;}
        } else if(!hasFinishedWriting(posts[index])) {
          posts[index]={...posts[index],status:'writing_failed',source:'not_generated',
            reason:failure?`Technical writing failure (retry this asset): ${failure.slice(0,220)}`:
              'Writing was limited by the per-day budget. Resume this asset.'};
        }
        if(failure)lastError=failure;
        await checkpoint(failure ? 'Some writing remains unfinished. Completed packages were saved.':'');
      }
      const ready=posts.filter(p=>p.status==='ready').length;
      await checkpoint(lastError?`Some assets could not be written: ${lastError.slice(0,300)}`:'');
      return {date,status:ready===posts.length?'complete':'needs_attention',
        total:posts.length,ready,needsAttention:posts.length-ready,calls,
        ...(lastError?{error:lastError}:{})};
    } finally {this.generationJobs.delete(date);}
  }

  async generateRolling() {
    const today=studioLocalDate();
    const results: Array<{date:string;status:string}>=[];
    for(let i=0;i<8;i++){
      const date=studioAddDays(today,i);
      try {
        const result=await this.generateDate(date);
        results.push({date,status:result.status});
      } catch(error) {
        this.logger.error(`Media Studio ${date}: ${error instanceof Error ?error.message:String(error)}`);
        results.push({date,status:'error'});
      }
    }
    return results;
  }

  /** One bounded rewrite request. Retains the original unless an independent
   * assessment finds a meaningful editorial improvement. Never regenerates a day.
   */
  async improvePost(date:string,id:string) {
    this.ensureDate(date);
    if(this.generationJobs.has(date))throw new BadRequestException('This date is already being written. Retry after it finishes.');
    this.generationJobs.add(date);
    try {
      const original=await this.days.findOne({date}).lean();
      const old=((original?.posts??[]) as unknown as StudioPost[]).find(p=>p.id===id);
      if(!old)throw new NotFoundException('Writing package not found');
      if(!hasFinishedWriting(old))throw new BadRequestException('Complete missing writing with Retry Unfinished before editorial improvement.');
      const [ctx,history]=await Promise.all([this.context(),this.recentCopy(date)]);
      const eligible=history;
      const before=reviewStudioPost(old,eligible);
      if(before.pass)return {improved:false,post:old,editorial:before,reason:'Already meets independent editorial gate; no AI call made.'};
      const slot:StudioSlot={id:old.id,date:old.date,platform:old.platform,format:old.format,seriesKey:old.seriesKey,seriesName:old.seriesName};
      const selected=(await this.series.activePortfolio()).find(x=>x.key===old.seriesKey);
      if(!selected || !selected.channels.includes(old.platform))throw new BadRequestException('Series is not active on this platform. Review the series assignment before rewriting.');
      const output=await this.ai.generateStructuredResponse<{posts:Draft[]}>({
        name:'hsakaa_media_studio_v7_editorial_single_rewrite',
        model:process.env.HSAKAA_MEDIA_STUDIO_MODEL||process.env.HSAKAA_MEDIA_MODEL||'gpt-5.4-mini',
        reasoningEffort:'low',verbosity:'low',maxOutputTokens:STUDIO_OUTPUT_CAPS[slot.format],
        instructions:this.instructions()+`\nRevise ONLY this single package to fix these independent reviewer issues: ${before.issues.join(' | ')}. Maintain the factual evidence, intended series, and exactly one slotId. Return one complete package; no placeholder text.`,
        schema:this.schema(),
        input:JSON.stringify({date,slot,previous:old,approvedContext:this.focusedContext(ctx,slot,selected),
          conflictingHistory:eligible.slice(0,12).map(h=>({title:h.title,hook:h.hook}))}),
      });
      const draft=output.data?.posts?.find(p=>p.slotId===id);
      if(!draft)return {improved:false,post:old,editorial:before,reason:'Rewrite returned no usable package; original retained.'};
      const rewritten=this.normalize(slot,draft,new Set(ctx.evidence.map(e=>e.id)),eligible.map(h=>studioFingerprint(`${h.title} ${h.hook}`)));
      const after=reviewStudioPost(rewritten,eligible);
      rewritten.editorial=after;
      if(!hasFinishedWriting(rewritten)||after.score<before.score+0.2 || after.dimensions.originality<6)
        return {improved:false,post:old,editorial:before,reason:'Rewrite did not measurably improve independent quality; original retained.'};
      // Re-read immediately before writing so a concurrent update cannot silently
      // replace a more recent edit or an approved package.
      const record=await this.days.findOne({date});
      if(!record)throw new NotFoundException('Media day no longer exists');
      const posts=record.posts as unknown as StudioPost[];
      const index=posts.findIndex(p=>p.id===id);
      if(index<0||posts[index].fingerprint!==old.fingerprint)
        throw new BadRequestException('This package changed during rewrite; the new draft was not applied.');
      posts[index]=rewritten;
      record.markModified('posts');
      await record.save();
      return {improved:true,post:rewritten,editorial:after,previousScore:before.score,
        usage:output.usage,reason:after.pass?'Passed independent editorial preflight':'Improved, but still needs editorial review'};
    } finally {this.generationJobs.delete(date);}
  }

  async updatePost(date:string, id:string, change: { status?:string; title?:string; hook?:string; script?:string; copy?:string; caption?:string }) {
    this.ensureDate(date);
    const record=await this.days.findOne({date});
    if(!record) throw new NotFoundException('Media day not found');
    const posts=record.posts as unknown as StudioPost[];
    const post=posts.find(p=>p.id===id);
    if(!post) throw new NotFoundException('Post not found');
    for(const field of ['title','hook','script','copy','caption'] as const) {
      if(typeof change[field]==='string') post[field]=trim(change[field],field==='script'?15000:4000);
    }
    if(change.status){
      if(!['ready','needs_review','needs_input'].includes(change.status))
        throw new BadRequestException('Invalid editorial status');
      // Manual approval, not auto-publishing. The owner must still approve publication elsewhere.
      if(change.status==='ready'&&!hasFinishedWriting(post))
        throw new BadRequestException('This writing pack is incomplete. Finish its script, caption, hook and production directions before marking ready.');
      if(change.status==='ready') {
        const [history,ctx]=await Promise.all([this.recentCopy(date),this.context()]);
        if(post.evidenceId && !ctx.evidence.some(e=>e.id===post.evidenceId))
          throw new BadRequestException('Source evidence is not currently approved; cannot mark writing ready.');
        const editorial=reviewStudioPost(post,history);
        post.editorial=editorial;
        if(!editorial.pass) throw new BadRequestException(`Editorial gate ${editorial.score}/10: ${editorial.issues.slice(0,3).join('; ')}. Improve the script first.`);
      }
      post.status=change.status as StudioPost['status'];
      post.reason=change.status==='ready'?'Owner marked writing ready; publishing still requires approval':post.reason;
    }
    post.fingerprint=studioFingerprint(`${post.title} ${post.hook} ${post.script||post.copy}`);
    if(change.status!=='ready'){
      post.editorial=reviewStudioPost(post);
      if(post.status==='ready'&&!post.editorial.pass){post.status='needs_review';post.reason=post.editorial.issues.join('; ');}
    }
    record.markModified('posts');
    await record.save();
    return post;
  }

  async growth() {
    const now=new Date();
    const since=new Date(now.getTime()-7*86_400_000);
    const [accountSnapshots,posts,snapshots,audienceSignals]=await Promise.all([
      this.accounts.find({capturedAt:{$gte:new Date(now.getTime()-35*86_400_000)}}).sort({capturedAt:-1}).lean(),
      this.publications.find({deliveryStatus:MediaDeliveryStatus.PUBLISHED,
        $or:[{publishedAt:{$gte:since}},{manualPublishCompletedAt:{$gte:since}}]})
        .select('_id platform publishedAt manualPublishCompletedAt').lean(),
      this.metrics.find({capturedAt:{$gte:since}}).sort({capturedAt:-1}).lean(),
      this.audience.find({generatedAt:{$gte:since},isActive:true}).sort({occurrences:-1,confidence:-1}).limit(8).lean(),
    ]);
    const byPlatform = ['instagram','youtube','linkedin','x'].map(platform=>{
      const accountData=accountSnapshots.filter(x=>x.platform===platform);
      const latest=accountData[0];
      const prior=accountData.find(x=>x.capturedAt<new Date(now.getTime()-7*86_400_000));
      const latestCount=latest?platform==='youtube'?latest.subscribers:latest.followers:null;
      const previousCount=prior?platform==='youtube'?prior.subscribers:prior.followers:null;
      return {platform,followers:latestCount??null,weeklyChange:latestCount!=null&&previousCount!=null?latestCount-previousCount:null,
        target:1000,remaining:latestCount!=null?Math.max(0,1000-latestCount):null,
        note:latest?'Latest connected/manual account snapshot':'No account metric data'};
    });
    const metricsByPub=new Map<string,typeof snapshots>();
    for(const snapshot of snapshots){
      const id=String(snapshot.mediaPublicationId??'');
      if(!id)continue;
      const values=metricsByPub.get(id)??[];values.push(snapshot);metricsByPub.set(id,values);
    }
    const reviews=posts.map(post=>{
      const age=(now.getTime()-new Date(post.publishedAt??post.manualPublishCompletedAt??now).getTime())/3_600_000;
      const all=metricsByPub.get(String(post._id))??[];
      const select=(period:MetricSnapshotPeriod)=>all.find(x=>x.period===period);
      const data=(snap?:MediaMetricSnapshot|null)=>snap?{views:snap.views,reach:snap.reach,likes:snap.likes,
        comments:snap.comments,shares:snap.shares,saves:snap.saves,followersGained:snap.followersGained}:null;
      return {publicationId:String(post._id),platform:post.platform,ageHours:Math.floor(age),
        review24:age<24?{status:'not_due'}:select(MetricSnapshotPeriod.TWENTY_FOUR_HOURS)?
          {status:'available',metrics:data(select(MetricSnapshotPeriod.TWENTY_FOUR_HOURS))}:{status:'awaiting_metrics'},
        review72:age<72?{status:'not_due'}:select(MetricSnapshotPeriod.SEVENTY_TWO_HOURS)?
          {status:'available',metrics:data(select(MetricSnapshotPeriod.SEVENTY_TWO_HOURS))}:{status:'awaiting_metrics'}};
    });
    return {generatedAt:now.toISOString(),goal:'First 1,000 genuine followers/subscribers per network',
      platforms:byPlatform,weeklyAudienceNote:'These are observed questions and engagement themes, not inferred personal traits. Demographics require provider-level audience data and permissions.',
      audienceSignals:audienceSignals.map(x=>({type:x.type,topic:x.topic,summary:x.summary,occurrences:x.occurrences,
        platforms:x.platforms,recommendedContentAngle:x.recommendedContentAngle,confidence:x.confidence})),
      publications:reviews,available24:reviews.filter(x=>x.review24.status==='available').length,
      available72:reviews.filter(x=>x.review72.status==='available').length};
  }
}
