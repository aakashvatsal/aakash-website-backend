import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MediaSeries } from './schemas/media-series.schema';
import { MediaContentItem } from './schemas/media-content-item.schema';
import { MediaDeliveryStatus, MediaPublication } from './schemas/media-publication.schema';
import { MediaMetricSnapshot } from './schemas/media-metric-snapshot.schema';
import { MEDIA_SERIES_CREATOR_POLICY } from './media-storytelling-policy';
import { AiService } from '../ai/ai.service';
import { SeriesPitch, SeriesDesignReview, normalizePitch, localSeriesDesign } from './media-series-design';
import { assessSeriesHealth } from './media-series-evaluation';

@Injectable()
export class MediaSeriesService {
  constructor(
    @InjectModel(MediaSeries.name) private readonly series: Model<MediaSeries>,
    @InjectModel(MediaContentItem.name) private readonly content: Model<MediaContentItem>,
    @InjectModel(MediaPublication.name) private readonly publications: Model<MediaPublication>,
    @InjectModel(MediaMetricSnapshot.name) private readonly metrics: Model<MediaMetricSnapshot>,
    private readonly aiService: AiService,
  ) {}

  /** Explicit on-demand AI review; never call the model during normal generation.
   * A failed/expensive AI response falls back to a free deterministic design. */
  async designSeries(raw: SeriesPitch): Promise<SeriesDesignReview> {
    let pitch: SeriesPitch;
    try { pitch = normalizePitch(raw); }
    catch (e) { throw new BadRequestException(e instanceof Error ? e.message : 'Invalid series pitch'); }
    await this.seed();
    const peers = await this.series.find().select('name angle').lean();
    const baseline = localSeriesDesign(pitch, peers);
    if (peers.some(p => p.name.toLowerCase() === pitch.name.toLowerCase()))
      return { ...baseline, score: 2, verdict: 'weak', warning: 'Series name already exists; choose a different name' };
    if (process.env.HSAKAA_MEDIA_SERIES_AI_REVIEW === 'false') return baseline;
    try {
      const response = await this.aiService.generateStructuredResponse<{
        score: number; strengths: string[]; risks: string[]; improvements: string[];
        hookPatterns: string[]; episodeIdeas: string[]; visualIdentity: string;
      }>({ name: 'media_series_review_v1',
        model: process.env.HSAKAA_MEDIA_MODEL || 'gpt-5.4-mini',
        maxOutputTokens: 950, reasoningEffort: 'none', verbosity: 'low',
        instructions: 'Review a proposed recurring personal creator series as an editor. Evaluate specificity, recognizable identity, repeatable real episodes, channel fit, distinctness from current series. Do not invent incidents, analytics or claims. Concise JSON only. Score 1–10. A fresh concept is NOT guaranteed to perform.',
        input: JSON.stringify({ pitch, existingSeries: peers.map(p => ({ name:p.name, angle:p.angle })).slice(0,25) }),
        schema: { type: 'object', additionalProperties: false, required: ['score','strengths','risks','improvements','hookPatterns','episodeIdeas','visualIdentity'], properties: {
          score: { type:'integer' }, strengths: {type:'array', items:{type:'string'}}, risks:{type:'array',items:{type:'string'}},
          improvements:{type:'array',items:{type:'string'}}, hookPatterns:{type:'array',items:{type:'string'}}, episodeIdeas:{type:'array',items:{type:'string'}}, visualIdentity:{type:'string'},
        } },
      });
      const ai = response.data;
      const score = Math.max(1, Math.min(10, Math.round((baseline.score + Math.max(1, Math.min(10, ai.score)))/2)));
      return { ...baseline, score, verdict: score >= 8 ? 'strong' : score >= 5 ? 'refine' : 'weak',
        strengths: ai.strengths.slice(0,4).map(x => x.slice(0,200)), risks: [...baseline.risks,...ai.risks.slice(0,3).map(x=>x.slice(0,200))],
        improvements: ai.improvements.slice(0,5).map(x => x.slice(0,200)),
        creativeKit: { ...baseline.creativeKit, hookPatterns: ai.hookPatterns.slice(0,5).map(x=>x.slice(0,160)),
          episodeIdeas: ai.episodeIdeas.slice(0,8).map(x=>x.slice(0,200)), visualIdentity: ai.visualIdentity.slice(0,550) },
        aiAssisted: true };
    } catch (e) { return { ...baseline, warning: 'AI critique unavailable; deterministic editorial assessment used instead. No repeated AI retries.' }; }
  }

  /** One on-demand suggestion, no periodic background AI spend. */
  async suggestSeries(direction = ''): Promise<{ pitch: SeriesPitch; review: SeriesDesignReview }> {
    await this.seed();
    const rows = await this.series.find().select('name angle channels').lean();
    const existing = new Set(rows.map(r => r.name.toLowerCase()));
    const bench = MEDIA_SERIES_CREATOR_POLICY.bench.find(x => !existing.has(x.name.toLowerCase()));
    const fallback: SeriesPitch = bench ? {name: bench.name, angle: bench.angle, channels: [...bench.channels]} : {
      name: 'Curiosity in the Wild',
      angle: 'One honest, public-safe experiment beyond work each week: the surprise, the awkward moment and what remains unfinished.',
      channels: ['instagram','youtube'],
    };
    const prompt = typeof direction === 'string' ? direction.trim().slice(0,300) : '';
    if (process.env.HSAKAA_MEDIA_SERIES_AI_REVIEW === 'false') return { pitch: fallback, review: localSeriesDesign(fallback,rows) };
    try {
      const generated = await this.aiService.generateStructuredResponse<SeriesPitch & {hookPatterns:string[]; episodeIdeas:string[]; visualIdentity:string}>({
        name: 'media_series_suggestion_v1', model: process.env.HSAKAA_MEDIA_MODEL || 'gpt-5.4-mini',
        maxOutputTokens: 900, reasoningEffort: 'none', verbosity: 'low',
        instructions: 'Suggest ONE new original, repeatable creator series for Aakash who builds software companies and enjoys books, dogs, guitar, Spanish, chess, self-improvement, travel and everyday humor. It must be distinguishable from current series, preserve a max 6 active series, never invent real achievements, include plausible episode hooks and creative style. Do not claim it will go viral. Return valid JSON.',
        input: JSON.stringify({ direction: prompt, existingSeries: rows.slice(0,30).map(x=>({name:x.name,angle:x.angle})) }),
        schema: { type:'object', additionalProperties:false, required:['name','angle','channels','audience','hookPatterns','episodeIdeas','visualIdentity'], properties:{
          name:{type:'string'},angle:{type:'string'},channels:{type:'array',items:{type:'string'}},audience:{type:'string'},
          hookPatterns:{type:'array',items:{type:'string'}},episodeIdeas:{type:'array',items:{type:'string'}},visualIdentity:{type:'string'},
        } },
      });
      const pitch = normalizePitch(generated.data);
      if (existing.has(pitch.name.toLowerCase())) return { pitch:fallback, review:localSeriesDesign(fallback,rows) };
      const review = localSeriesDesign(pitch,rows);
      return { pitch, review: { ...review, aiAssisted:true,
        creativeKit: { ...review.creativeKit,
          hookPatterns: generated.data.hookPatterns.slice(0,5).map(x=>x.slice(0,160)),
          episodeIdeas: generated.data.episodeIdeas.slice(0,8).map(x=>x.slice(0,200)),
          visualIdentity: generated.data.visualIdentity.slice(0,550) } } };
    } catch { return { pitch: fallback, review: { ...localSeriesDesign(fallback,rows),
      warning:'AI suggestions unavailable; a zero-cost paused-bench concept was proposed instead' } }; }
  }

  async createSeries(raw: SeriesPitch & { design?: SeriesDesignReview }) {
    let pitch: SeriesPitch;
    try { pitch = normalizePitch(raw); }
    catch (e) { throw new BadRequestException(e instanceof Error ? e.message : 'Invalid series pitch'); }
    await this.seed();
    const key = pitch.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g,'').slice(0,65);
    if (!key) throw new BadRequestException('Name must contain Latin characters for a URL key');
    const existing = await this.series.findOne({ $or: [{key},{name: pitch.name}] }).lean();
    if (existing) throw new BadRequestException('A series with this name/key already exists');
    // Saving a series NEVER silently activates a seventh series. Evaluate and
    // design are suggestions, not a permission to fabricate a published episode.
    const design = localSeriesDesign(pitch);
    // The authenticated owner explicitly approves a returned series kit. Validate
    // and size-limit before persisting. Never spend another AI call on saving.
    const proposed = raw.design;
    const kit = proposed?.creativeKit;
    const safeList = (value: unknown, max: number) => Array.isArray(value) ? value
      .filter(x => typeof x === 'string').slice(0,max).map(x => x.slice(0,240)) : [];
    const creativeKit = kit && typeof kit.premise === 'string' && kit.premise.includes(pitch.name)
      ? { ...design.creativeKit,
          visualIdentity: String(kit.visualIdentity || design.creativeKit.visualIdentity).slice(0,550),
          hookPatterns: safeList(kit.hookPatterns,5),
          episodeIdeas: safeList(kit.episodeIdeas,8),
          episodeStructure: safeList(kit.episodeStructure,6),
          targetAudience: String(kit.targetAudience || design.creativeKit.targetAudience).slice(0,150),
          voice: String(kit.voice || design.creativeKit.voice).slice(0,250),
          suggestedCadence: String(kit.suggestedCadence || design.creativeKit.suggestedCadence).slice(0,200),
        } : design.creativeKit;
    try { return await this.series.create({ ...pitch, key, status: 'paused',
      creativeKit, designReview: { score: proposed?.score ?? design.score,
        verdict: proposed?.verdict ?? design.verdict, aiAssisted: proposed?.aiAssisted === true },
      createdFrom: proposed?.aiAssisted ? 'ai-suggested' : 'owner', rationale: 'Owner-created; activate after a series slot is available' }); }
    catch (e) { if ((e as {code?:number})?.code === 11000) throw new BadRequestException('Series already exists'); throw e; }
  }

  async seed() {
    // Preserve administrative decisions and never seed above the six-series cap.
    for (const item of MEDIA_SERIES_CREATOR_POLICY.active) {
      const existing = await this.series.findOne({ key: item.key }).select('_id').lean();
      if (existing) continue;
      const active = await this.series.countDocuments({ status: 'active' });
      await this.series.updateOne({ key: item.key }, { $setOnInsert: {
        ...item, status: active < MEDIA_SERIES_CREATOR_POLICY.maxActive ? 'active' : 'paused',
        ...(active < MEDIA_SERIES_CREATOR_POLICY.maxActive ? { activatedAt: new Date() } : {}),
      } }, { upsert: true });
    }
    // Non-active bench is never activated just because an API endpoint ran.
    // This keeps the active portfolio capped at the six explicit launch series.
    for (const item of MEDIA_SERIES_CREATOR_POLICY.bench) {
      await this.series.updateOne({ key: item.key }, { $setOnInsert: {
        ...item, status: 'paused',
      } }, { upsert: true });
    }
  }

  async activePortfolio() {
    await this.seed();
    return this.series.find({ status: 'active' }).select('key name channels angle creativeKit').lean();
  }

  async setStatus(key: string, status: string, rationale?: string) {
    if (!['active', 'paused', 'retired'].includes(status)) throw new BadRequestException('Invalid series status');
    const existing = await this.series.findOne({ key });
    if (!existing) throw new NotFoundException('Series not found');
    if (status === 'active' && existing.status !== 'active' &&
        await this.series.countDocuments({ status: 'active' }) >= 6) {
      throw new BadRequestException('Pause or retire an active series before activating another');
    }
    existing.status = status as MediaSeries['status'];
    existing.rationale = rationale?.trim().slice(0, 500) || existing.rationale;
    if (status === 'active') existing.activatedAt = new Date();
    if (status === 'retired') existing.retiredAt = new Date();
    await existing.save();
    return existing.toObject();
  }

  async assign(contentId: string, seriesKey: string) {
    if (!Types.ObjectId.isValid(contentId)) throw new BadRequestException('Invalid content ID');
    const series = await this.series.findOne({ key: seriesKey, status: 'active' }).lean();
    if (!series) throw new BadRequestException('Series must exist and be active');
    // Series is stored on the canonical content item, shared by derivative publications.
    const content = await this.content.findById(contentId);
    if (!content) throw new NotFoundException('Content not found');
    content.metadata = { ...(content.metadata || {}), seriesKey };
    content.markModified('metadata');
    await content.save();
    return { contentId, seriesKey };
  }

  // Deterministic assignment at the canonical content boundary. A caller-provided
  // series is authoritative only if it is active; never silently tag a paused series.
  async resolveSeries(title: string, body = '', requested?: unknown): Promise<string | null> {
    const portfolio = await this.activePortfolio();
    const keys = new Set(portfolio.map((item) => item.key));
    if (typeof requested === 'string' && requested.trim()) {
      if (!keys.has(requested)) throw new BadRequestException('Series must be active');
      return requested;
    }
    const text = `${title} ${body}`.toLowerCase();
    const rules: Array<[string, RegExp]> = [
      ['dogs-and-me', /\b(dog|dogs|puppy|puppies|pet)\b/],
      ['small-adventures', /\b(explor|adventure|wandering|museum|market|city walk|new place)\b/],
      ['one-week-experiments', /\b(experiment|seven.day challenge|one.week test|tried for a week)\b/],
      ['questions-i-cant-shake', /\b(question i|keep wondering|one question|curious why)\b/],
      ['learning-at-30', /\b(guitar|spanish|chess|book|read|learn|storytelling|voice practice)\b/],
      ['life-without-work', /\b(travel|trip|holiday|weekend|food|friend|beach|walk|hobby|life outside)\b/],
      ['things-i-changed-my-mind-about', /\b(changed my mind|i was wrong|used to believe|rethink|disagree)\b/],
      ['me-vs-me', /\b(me vs me|yesterday me|today me|myself|discipline|habits|self-doubt)\b/],
      ['founder-unfiltered', /\b(founder|startup|8lete|frayto|customer|product|team|business|building)\b/],
    ];
    for (const [key, re] of rules) if (keys.has(key) && re.test(text)) return key;
    // Never fabricate a series attribution for ambiguous historical/manual content.
    return null;
  }

  /**
   * 56-day conservative performance review using the latest snapshot of each
   * actual published item. Same-platform peer medians, NOT raw channel reach.
   */
  private async performanceHealth() {
    await this.seed();
    const since = new Date(Date.now() - 56 * 86400000);
    const [active, items, publications] = await Promise.all([
      this.series.find({ status: 'active' }).select('key channels activatedAt').lean(),
      this.content.find({ 'metadata.seriesKey': { $exists: true } }).select('_id metadata').lean(),
      this.publications.find({
        deliveryStatus: MediaDeliveryStatus.PUBLISHED,
        $or: [ { publishedAt: { $gte: since } }, { manualPublishCompletedAt: { $gte: since } } ],
      }).select('_id contentItemId platform publishedAt manualPublishCompletedAt').lean(),
    ]);
    const keysByContentId = new Map(items.map(item => [String(item._id), String(item.metadata?.seriesKey ?? '')]));
    const tagged = publications.filter(pub => keysByContentId.has(String(pub.contentItemId)));
    const snapshots = tagged.length ? await this.metrics.find({
      mediaPublicationId: { $in: tagged.map(pub => pub._id) },
    }).sort({ capturedAt: -1 }).select('mediaPublicationId impressions saves shares followersGained capturedAt').lean() : [];
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const snapshot of snapshots) {
      const key = String(snapshot.mediaPublicationId);
      if (!latest.has(key)) latest.set(key, snapshot);
    }
    const measuredPosts = tagged.flatMap(pub => {
      const metric = latest.get(String(pub._id));
      const publishedAt = pub.publishedAt ?? pub.manualPublishCompletedAt;
      if (!metric || !publishedAt || !Number.isFinite(metric.impressions) || metric.impressions <= 0) return [];
      return [{ seriesKey: keysByContentId.get(String(pub.contentItemId))!,
        platform: String(pub.platform), publishedAt, impressions: metric.impressions,
        saves: metric.saves ?? 0, shares: metric.shares ?? 0,
        followersGained: metric.followersGained ?? 0 }];
    });
    return assessSeriesHealth(active.map(series => ({key: series.key, channels: series.channels, activatedAt: series.activatedAt})), measuredPosts);
  }

  async recommendations(days = 90) {
    const [overview, health] = await Promise.all([this.overview(days), this.performanceHealth()]);
    const byKey = new Map(health.map(row => [row.key, row]));
    return overview.groups.map(s => {
      const metrics = Object.values(s.byPlatform);
      const impressions = metrics.reduce((n, m) => n + m.impressions, 0);
      const actions = metrics.reduce((n, m) => n + m.shares + m.saves + m.followersGained, 0);
      const assessment = byKey.get(s.key);
      const engagementPerThousand = impressions > 0 ? Math.round(actions * 100000 / impressions) / 100 : null;
      return { key: s.key, name: s.name, reviewStatus: s.reviewStatus,
        engagementPerThousand, measured: s.measured,
        recommendation: assessment?.recommendation ?? 'collect_more_data',
        underperformingPlatforms: assessment?.underperformingPlatforms ?? [],
        comparablePlatforms: assessment?.peerComparablePlatforms ?? 0,
        note: assessment?.note ?? 'Paused or retired series are not candidates for automatic performance retirement.' };
    });
  }

  /** At most one cautious rotation per weekly review, only if peer data is mature. */
  async reviewPortfolio(apply = false) {
    const evaluations = await this.performanceHealth();
    const weak = evaluations.find(row => row.recommendation === 'consider_rotation');
    const active = await this.series.find({ status: 'active' }).select('key channels').lean();
    const existing = weak ? active.find(row => row.key === weak.key) : undefined;
    const bench = await this.series.find({ status: 'paused' }).sort({ key: 1 }).lean();
    const candidate = existing ? bench.find(row => row.channels.some(channel => existing.channels.includes(channel))) : undefined;
    if (!weak || !candidate || !existing) {
      return { applied: false, reason: weak ? 'No appropriate paused replacement series' : 'No series has enough consistent evidence to retire',
        assessments: evaluations, proposed: null };
    }
    const proposed = { retire: weak.key, activate: candidate.key, rationale: weak.note };
    if (!apply) return { applied: false, reason: 'Preview only', assessments: evaluations, proposed };
    // Compare-and-set blocks repeated runs from retiring the same series twice.
    const result = await this.series.updateOne({ key: weak.key, status: 'active' }, { $set: {
      status: 'retired', retiredAt: new Date(), rationale: `Automated 56-day review: ${weak.note}`,
    } });
    if (result.modifiedCount !== 1) return { applied: false, reason: 'Series status changed during review', assessments: evaluations, proposed };
    try {
      await this.setStatus(candidate.key, 'active', `Replaced ${weak.key} after two weak 28-day review windows`);
    } catch (error) {
      // Restore series rather than leave the entire portfolio short if activation fails.
      await this.series.updateOne({ key: weak.key, status: 'retired' }, { $set: { status: 'active' }, $unset: { retiredAt: '' } });
      throw error;
    }
    return { applied: true, reason: 'Conservative evidence-based weekly rotation', assessments: evaluations, proposed };
  }

  private cachedCreatorTrends: { expiresAt: number; value: {
    available: boolean; retrievedAt: string; entries: Array<{ title: string; publishedAt: string; source: string; url: string }>; instruction?: string; error?: string;
  } } | null = null;

  // Source is a time-stamped Google Trends RSS feed, not an invented trend claim.
  // Failure is explicit and non-blocking: planning falls back to evergreen topics.
  async trendSignals() {
    if (this.cachedCreatorTrends && Date.now() < this.cachedCreatorTrends.expiresAt)
      return this.cachedCreatorTrends.value;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch('https://trends.google.com/trending/rss?geo=IN',
        { signal: controller.signal, headers: { 'User-Agent': 'HSAKAA-Media/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      const entries = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 25).map(match => {
        const body = match[1];
        const value = (tag: string) => {
          const found = body.match(new RegExp(String.raw`<${tag}>([\s\S]*?)<\/${tag}>`));
          return (found?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').trim();
        };
        return { title: value('title'), publishedAt: value('pubDate'), source: 'Google Trends India RSS', url: value('link') };
      }).filter(entry => entry.title && entry.publishedAt);
      const result = { available: entries.length > 0, retrievedAt: new Date().toISOString(), entries,
        instruction: 'Only select trends directly relevant to a real Aakash story, and never imply personal participation without evidence.' };
      this.cachedCreatorTrends = { expiresAt: Date.now() + 15 * 60000, value: result };
      return result;
    } catch (e) {
      const result = { available: false, retrievedAt: new Date().toISOString(), entries: [],
        error: e instanceof Error ? e.message : 'Trend feed unavailable' };
      this.cachedCreatorTrends = { expiresAt: Date.now() + 2 * 60000, value: result };
      return result;
    } finally { clearTimeout(timeout); }
  }

  async overview(days = 90) {
    await this.seed();
    const boundedDays = Math.min(365, Math.max(14, Math.trunc(Number(days) || 90)));
    const since = new Date(Date.now() - boundedDays * 86400000);
    const [series, contentItems, publications] = await Promise.all([
      this.series.find().sort({ status: 1, name: 1 }).lean(),
      this.content.find({ 'metadata.seriesKey': { $exists: true } }).select('_id metadata title').lean(),
      this.publications.find({ deliveryStatus: MediaDeliveryStatus.PUBLISHED, $or: [{ publishedAt: { $gte: since } }, { manualPublishCompletedAt: { $gte: since } }] }).select('_id contentItemId platform format publishedAt').lean(),
    ]);
    const contentToSeries = new Map(contentItems.map(item => [String(item._id), String(item.metadata?.seriesKey || '')]));
    const eligible = publications.filter(pub => contentToSeries.has(String(pub.contentItemId)));
    const ids = eligible.map(pub => pub._id);
    const snapshots = ids.length ? await this.metrics.find({ mediaPublicationId: { $in: ids }, capturedAt: { $gte: since } })
      .sort({ capturedAt: -1 }).lean() : [];
    // Latest per publication only; do not sum multiple 48/96h snapshots of the same post.
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const snap of snapshots) {
      const id = String(snap.mediaPublicationId);
      if (!latest.has(id)) latest.set(id, snap);
    }
    const groups = series.map(s => {
      const posts = eligible.filter(pub => contentToSeries.get(String(pub.contentItemId)) === s.key);
      const byPlatform: Record<string, { posts: number; measured: number; impressions: number; views: number; shares: number; saves: number; followersGained: number; averageWatchPercentage: number | null }> = {};
      const watchCounts = new Map<string, number>();
      for (const pub of posts) {
        const platform = String(pub.platform);
        const row = byPlatform[platform] ||= { posts: 0, measured: 0, impressions: 0, views: 0, shares: 0, saves: 0, followersGained: 0, averageWatchPercentage: null };
        row.posts++;
        const metric = latest.get(String(pub._id));
        if (!metric) continue;
        row.measured++;
        row.impressions += metric.impressions || 0;
        row.views += metric.views || 0;
        row.shares += metric.shares || 0;
        row.saves += metric.saves || 0;
        row.followersGained += metric.followersGained || 0;
        if (typeof metric.averageWatchPercentage === 'number') {
          const previousCount = watchCounts.get(platform) ?? 0;
          const previously = (row.averageWatchPercentage ?? 0) * previousCount;
          row.averageWatchPercentage = Math.round((previously + metric.averageWatchPercentage) / (previousCount + 1) * 10) / 10;
          watchCounts.set(platform, previousCount + 1);
        }
      }
      const measured = Object.values(byPlatform).reduce((n, x) => n + x.measured, 0);
      const published = posts.length;
      const ageDays = s.activatedAt ? (Date.now() - new Date(s.activatedAt).getTime()) / 86400000 : 0;
      const status = published < 4 || measured < 4 || ageDays < 14 ? 'insufficient_data' : 'review_ready';
      return { key: s.key, name: s.name, status: s.status, angle: s.angle, audience: s.audience, creativeKit: s.creativeKit, channels: s.channels,
        published, measured, reviewStatus: status, byPlatform, rationale: s.rationale || null };
    });
    return { periodDays: boundedDays, activeCount: groups.filter(g => g.status === 'active').length,
      activeLimit: 6, weeklyMinimums: MEDIA_SERIES_CREATOR_POLICY.weeklyMinimums,
      groups, untaggedPublished: publications.length - eligible.length,
      note: 'Metrics are the latest available snapshot per publication. Missing snapshots are not interpreted as zero engagement. Compare channels separately before retiring a series.' };
  }
}
