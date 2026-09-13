import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';

import { HobbiesService } from '../hobbies/hobbies.service';

import {
  HsakaaDailyContext,
  HsakaaDailyContextDocument,
  HsakaaDailyContextItem,
  HsakaaDailyContextPrivacy,
  HsakaaDailyContextSource,
} from '../../hsakaa/schemas/hsakaa-daily-context.schema';
import {
  HsakaaWeeklyReview,
  HsakaaWeeklyReviewDocument,
} from '../../hsakaa/schemas/hsakaa-weekly-review.schema';
import {
  HsakaaBrief,
  HsakaaBriefDocument,
} from '../../hsakaa/schemas/hsakaa-brief.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import {
  MediaContentItem,
  MediaContentItemDocument,
} from './schemas/media-content-item.schema';

export interface MediaWorldContextItem {
  id: string;
  source: HsakaaDailyContextSource;
  kind: string;
  title: string;
  summary: string;
  occurredAt: string;
  privacy: HsakaaDailyContextPrivacy;
  significantChange: boolean;
  publishable: boolean;
}

export interface MediaWorldPresenceSignal {
  id: string;
  category: 'routine' | 'learning' | 'hobby' | 'work' | 'human';
  kind: 'whole_life_signal';
  title: string;
  summary: string;
  occurredAt: string;
  source: HsakaaDailyContextSource;
  privacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE;
  sourceEvidenceId?: string;
  significantChange: boolean;
}

export interface MediaWorldHobbyContext {
  id: string;
  name: string;
  status: string;
  intensity: string;
  currentStageKey?: string;
  currentStageTitle?: string;
  nextFocus?: string;
  weeklyTargetMinutes: number;
  weeklyMinutes: number;
  sessionsThisWeek: number;
  pace?: string;
  recommendedTodayMinutes: number;
  updatedAt?: string;
}

export interface MediaWorldSectionContext {
  source: HsakaaDailyContextSource;
  totalItems: number;
  publicSafe: number;
  internalSafe: number;
  needsReview: number;
  privateOnly: number;
  latestSafeItems: Array<{
    id: string;
    kind: string;
    title: string;
    occurredAt: string;
    privacy: HsakaaDailyContextPrivacy;
  }>;
}

export interface MediaWorldCompanyContext {
  id: string;
  name: string;
  roles: string[];
  industries: string[];
  products: string[];
  markets: string[];
  currentFocus?: string;
  currentPriorities: string[];
  principles: string[];
  targetCustomer?: string;
  status?: string;
  stage?: string;
}

export interface MediaWorldContext {
  generatedAt: string;
  windowDays: number;
  fingerprint: string;
  coverage: {
    capturedDays: number;
    totalItems: number;
    publicSafe: number;
    internalSafe: number;
    needsReview: number;
    privateOnly: number;
    sourceCounts: Record<string, number>;
    missingSources: string[];
  };
  companies: MediaWorldCompanyContext[];
  publicSafe: MediaWorldContextItem[];
  internalSafe: MediaWorldContextItem[];
  needsReview: MediaWorldContextItem[];
  wholeLifeSignals: MediaWorldPresenceSignal[];
  hobbies: MediaWorldHobbyContext[];
  personalOsSections: MediaWorldSectionContext[];
  privateOnlyCount: number;
  hsakaa: {
    latestBrief?: {
      headline: string;
      summary: string;
      opportunities: string[];
      generatedAt: string;
    };
    latestWeeklyReview?: {
      headline: string;
      summary: string;
      lessons: string[];
      nextWeekPriorities: string[];
      generatedAt: string;
    };
  };
  recentMedia: Array<{
    id: string;
    title: string;
    thesis?: string;
    origin: string;
    contentPillars: string[];
    createdAt?: string;
  }>;
  policy: {
    privateOnlyDetailsExposedToMedia: false;
    peopleAndMemoryExcludedFromMedia: true;
    allOtherPersonalOsSourcesTreatedPublicSafe: true;
    internalSafeMayInspireButNotBePublishedAsFact: false;
    needsReviewRequiresOwnerApprovalBeforePublicUse: false;
    publicSafeMayBeUsedAsEvidence: true;
    sourceGroundingRequiredForPublicClaims: true;
    companyContextIsPublicSafe: true;
    healthContextIsPublicSafe: true;
    companyMetricsExcludedUnlessSeparatelyVerifiedPublicSafe: false;
    wholeLifeSignalsAreSanitizedInternalSafeCues: false;
    wholeLifeSignalsArePublicSafe: true;
    directHobbiesAreFirstClassContext: true;
    personalOsSectionsAreInspectedWithoutPrivateDetails: true;
  };
}

const EXPECTED_SOURCES = Object.values(HsakaaDailyContextSource);
const MEDIA_EXCLUDED_SOURCES = new Set<HsakaaDailyContextSource>([
  HsakaaDailyContextSource.MEMORY,
  HsakaaDailyContextSource.PEOPLE,
]);

@Injectable()
export class MediaWorldContextService {
  constructor(
    @InjectModel(HsakaaDailyContext.name)
    private readonly dailyContextModel: Model<HsakaaDailyContextDocument>,
    @InjectModel(HsakaaWeeklyReview.name)
    private readonly weeklyReviewModel: Model<HsakaaWeeklyReviewDocument>,
    @InjectModel(HsakaaBrief.name)
    private readonly briefModel: Model<HsakaaBriefDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(MediaContentItem.name)
    private readonly contentModel: Model<MediaContentItemDocument>,
    private readonly hobbiesService: HobbiesService,
  ) {}

  async build(windowDays = 120): Promise<MediaWorldContext> {
    const safeDays = Math.min(Math.max(Math.trunc(windowDays || 120), 7), 120);
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const [
      dailyContexts,
      companies,
      latestBrief,
      latestWeeklyReview,
      recentMedia,
      hobbiesOverview,
    ] = await Promise.all([
      this.dailyContextModel
        .find({ dayStart: { $gte: since } })
        .sort({ dayStart: -1 })
        .limit(safeDays + 3)
        .lean(),
      this.companyModel
        .find({ isActive: true, isArchived: false })
        .sort({ isFeatured: -1, name: 1 })
        .select(
          'name roles industries products markets currentFocus currentPriorities principles targetCustomer status stage',
        )
        .lean(),
      this.briefModel.findOne({}).sort({ generatedAt: -1 }).lean(),
      this.weeklyReviewModel.findOne({}).sort({ generatedAt: -1 }).lean(),
      this.contentModel
        .find({ isActive: true })
        .sort({ createdAt: -1 })
        .limit(30)
        .select('title thesis origin contentPillars createdAt')
        .lean(),
      this.hobbiesService.getOverview().catch(() => ({ active: [] })),
    ]);

    const capturedItems = this.dedupeItems(
      dailyContexts.flatMap((context) => [
        ...(context.items ?? []),
        ...(context.changes ?? []).map((item) => ({
          ...item,
          significantChange: true,
        })),
      ]),
    );
    const excludedItems = capturedItems.filter((item) =>
      MEDIA_EXCLUDED_SOURCES.has(item.source),
    );
    const allItems = capturedItems
      .filter((item) => !MEDIA_EXCLUDED_SOURCES.has(item.source))
      .map((item) => this.asMediaPublicSafe(item));
    const publicSafe = allItems.map((item) => this.toContextItem(item, true));
    // Media privacy policy is explicit: People + Memory are excluded entirely;
    // every other Personal OS source is public-safe context for Aakash media.
    // These arrays remain for backwards-compatible API shape only.
    const internalSafe: MediaWorldContextItem[] = [];
    const needsReview: MediaWorldContextItem[] = [];
    const privateOnlyCount = excludedItems.length;
    const directHobbies = this.sanitizeHobbiesOverview(hobbiesOverview);
    const wholeLifeSignals = this.mergePresenceSignals(
      this.buildDirectHobbySignals(directHobbies),
      this.buildWholeLifeSignals(allItems),
    );
    const personalOsSections = this.buildPersonalOsSections(capturedItems);

    const sourceCounts = capturedItems.reduce<Record<string, number>>(
      (counts, item) => {
        counts[item.source] = (counts[item.source] ?? 0) + 1;
        return counts;
      },
      {},
    );

    const companyContext: MediaWorldCompanyContext[] = companies.map(
      (company) => ({
        id: String(company._id),
        name: company.name,
        roles: company.roles ?? [],
        industries: company.industries ?? [],
        products: company.products ?? [],
        markets: company.markets ?? [],
        currentFocus: company.currentFocus,
        currentPriorities: company.currentPriorities ?? [],
        principles: company.principles ?? [],
        targetCustomer: company.targetCustomer,
        status: company.status,
        stage: company.stage,
      }),
    );

    const hsakaa: MediaWorldContext['hsakaa'] = {};
    if (latestBrief?.content) {
      hsakaa.latestBrief = {
        headline: latestBrief.content.headline ?? '',
        summary: latestBrief.content.summary ?? '',
        opportunities: (latestBrief.content.opportunities ?? []).map(
          (item) => item.title,
        ),
        generatedAt: new Date(latestBrief.generatedAt).toISOString(),
      };
    }
    if (latestWeeklyReview?.content) {
      hsakaa.latestWeeklyReview = {
        headline: latestWeeklyReview.content.headline ?? '',
        summary: latestWeeklyReview.content.summary ?? '',
        lessons: (latestWeeklyReview.content.lessons ?? []).map(
          (item) => item.lesson,
        ),
        nextWeekPriorities: (
          latestWeeklyReview.content.nextWeekPriorities ?? []
        ).map((item) => item.title),
        generatedAt: new Date(latestWeeklyReview.generatedAt).toISOString(),
      };
    }

    const recentMediaContext = recentMedia.map((item) => ({
      id: String(item._id),
      title: item.title,
      thesis: item.thesis,
      origin: item.origin,
      contentPillars: item.contentPillars ?? [],
      createdAt: this.dateString(
        (item as unknown as { createdAt?: Date }).createdAt,
      ),
    }));

    const fingerprintPayload = {
      companies: companyContext,
      publicSafe: publicSafe.slice(0, 80),
      internalSafe: internalSafe.slice(0, 80),
      needsReview: needsReview.slice(0, 40),
      wholeLifeSignals: wholeLifeSignals.slice(0, 40),
      hobbies: directHobbies,
      personalOsSections,
      privateOnlyCount,
      hsakaa,
      recentMedia: recentMediaContext,
    };

    return {
      generatedAt: new Date().toISOString(),
      windowDays: safeDays,
      fingerprint: createHash('sha256')
        .update(JSON.stringify(fingerprintPayload))
        .digest('hex'),
      coverage: {
        capturedDays: dailyContexts.length,
        totalItems: capturedItems.length,
        publicSafe: publicSafe.length,
        internalSafe: internalSafe.length,
        needsReview: needsReview.length,
        privateOnly: privateOnlyCount,
        sourceCounts,
        missingSources: EXPECTED_SOURCES.filter(
          (source) => !sourceCounts[source],
        ),
      },
      companies: companyContext,
      publicSafe: publicSafe.slice(0, 100),
      internalSafe: internalSafe.slice(0, 100),
      needsReview: needsReview.slice(0, 60),
      wholeLifeSignals: wholeLifeSignals.slice(0, 60),
      hobbies: directHobbies,
      personalOsSections,
      privateOnlyCount,
      hsakaa,
      recentMedia: recentMediaContext,
      policy: {
        privateOnlyDetailsExposedToMedia: false,
        peopleAndMemoryExcludedFromMedia: true,
        allOtherPersonalOsSourcesTreatedPublicSafe: true,
        internalSafeMayInspireButNotBePublishedAsFact: false,
        needsReviewRequiresOwnerApprovalBeforePublicUse: false,
        publicSafeMayBeUsedAsEvidence: true,
        sourceGroundingRequiredForPublicClaims: true,
        companyContextIsPublicSafe: true,
        healthContextIsPublicSafe: true,
        companyMetricsExcludedUnlessSeparatelyVerifiedPublicSafe: false,
        wholeLifeSignalsAreSanitizedInternalSafeCues: false,
        wholeLifeSignalsArePublicSafe: true,
        directHobbiesAreFirstClassContext: true,
        personalOsSectionsAreInspectedWithoutPrivateDetails: true,
      },
    };
  }

  private sanitizeHobbiesOverview(value: unknown): MediaWorldHobbyContext[] {
    const overview =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
    const active = Array.isArray(overview.active) ? overview.active : [];
    const hobbies: MediaWorldHobbyContext[] = [];

    for (const raw of active) {
      const hobby =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const stage =
        hobby.currentStage && typeof hobby.currentStage === 'object'
          ? (hobby.currentStage as Record<string, unknown>)
          : {};
      const review =
        hobby.latestReview && typeof hobby.latestReview === 'object'
          ? (hobby.latestReview as Record<string, unknown>)
          : {};
      const id =
        this.objectIdString(hobby._id) ?? this.optionalString(hobby.id);
      const name = this.optionalString(hobby.name);
      if (!id || !name) continue;

      hobbies.push({
        id,
        name,
        status: this.optionalString(hobby.status) ?? '',
        intensity: this.optionalString(hobby.intensity) ?? '',
        currentStageKey: this.optionalString(hobby.currentStageKey),
        currentStageTitle: this.optionalString(stage.title),
        nextFocus:
          this.optionalString(review.nextFocus) ??
          this.optionalString(hobby.coachedNextAction) ??
          this.optionalString(hobby.nextAction),
        weeklyTargetMinutes: this.safeNumber(hobby.weeklyTargetMinutes),
        weeklyMinutes: this.safeNumber(hobby.weeklyMinutes),
        sessionsThisWeek: this.safeNumber(hobby.sessionsThisWeek),
        pace: this.optionalString(hobby.pace),
        recommendedTodayMinutes: this.safeNumber(hobby.recommendedTodayMinutes),
        updatedAt: this.optionalDateString(hobby.updatedAt),
      });
    }

    return hobbies;
  }

  private buildDirectHobbySignals(
    hobbies: MediaWorldHobbyContext[],
  ): MediaWorldPresenceSignal[] {
    return hobbies.map((hobby) => ({
      id: `hobby:${hobby.id}`,
      category: 'hobby',
      kind: 'whole_life_signal',
      title: `${hobby.name} · active practice`,
      summary: [
        `${hobby.name} is an active HSAKAA Hobbies track.`,
        hobby.currentStageTitle
          ? `Current stage: ${hobby.currentStageTitle}.`
          : '',
        hobby.nextFocus ? `Current coaching focus: ${hobby.nextFocus}.` : '',
        `This week: ${hobby.sessionsThisWeek} recorded session(s), ${hobby.weeklyMinutes}/${hobby.weeklyTargetMinutes || 0} target minutes.`,
        hobby.pace ? `Pace: ${hobby.pace}.` : '',
        'Use only genuine practice/progress as content; do not invent a session and do not force a business analogy.',
      ]
        .filter(Boolean)
        .join(' '),
      occurredAt: hobby.updatedAt ?? '1970-01-01T00:00:00.000Z',
      source: HsakaaDailyContextSource.HOBBY,
      privacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
      significantChange: false,
    }));
  }

  private mergePresenceSignals(
    primary: MediaWorldPresenceSignal[],
    secondary: MediaWorldPresenceSignal[],
  ) {
    const seen = new Set<string>();
    return [...primary, ...secondary]
      .filter((signal) => {
        const key = `${signal.category}:${signal.title.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 60);
  }

  private buildPersonalOsSections(
    items: HsakaaDailyContextItem[],
  ): MediaWorldSectionContext[] {
    return EXPECTED_SOURCES.map((source) => {
      const sourceItems = items.filter((item) => item.source === source);
      const excluded = MEDIA_EXCLUDED_SOURCES.has(source);
      const latestSafeItems = excluded
        ? []
        : sourceItems.slice(0, 5).map((item) => ({
            id: item.id,
            kind: item.kind,
            title: item.title,
            occurredAt: item.occurredAt,
            privacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
          }));
      return {
        source,
        totalItems: sourceItems.length,
        publicSafe: excluded ? 0 : sourceItems.length,
        internalSafe: 0,
        needsReview: 0,
        privateOnly: excluded ? sourceItems.length : 0,
        latestSafeItems,
      };
    });
  }

  private objectIdString(value: unknown) {
    if (value instanceof Types.ObjectId) return value.toHexString();
    return this.optionalString(value);
  }

  private optionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private safeNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private optionalDateString(value: unknown) {
    if (!value) return undefined;
    const date = new Date(value as string | number | Date);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private buildWholeLifeSignals(
    items: HsakaaDailyContextItem[],
  ): MediaWorldPresenceSignal[] {
    const signals: MediaWorldPresenceSignal[] = [];
    const seen = new Set<string>();

    const add = (signal: MediaWorldPresenceSignal) => {
      const key = `${signal.category}:${signal.title.toLowerCase()}:${signal.occurredAt.slice(0, 10)}`;
      if (seen.has(key)) return;
      seen.add(key);
      signals.push(signal);
    };

    for (const item of items) {
      if (MEDIA_EXCLUDED_SOURCES.has(item.source)) continue;
      const category = this.wholeLifeCategory(item);
      if (!category) continue;
      add({
        id: `presence:${item.id}`,
        category,
        kind: 'whole_life_signal',
        title: item.title || this.defaultPresenceTitle(category),
        summary: this.safeWholeLifeSummary(item, category),
        occurredAt: item.occurredAt,
        source: item.source,
        privacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
        sourceEvidenceId: item.id,
        significantChange: item.significantChange,
      });
    }

    return signals
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 60);
  }

  private wholeLifeCategory(
    item: HsakaaDailyContextItem,
  ): MediaWorldPresenceSignal['category'] | null {
    if (
      item.source === HsakaaDailyContextSource.LIBRARY ||
      item.source === HsakaaDailyContextSource.HIGHLIGHT
    ) {
      return 'learning';
    }

    const text = `${item.kind} ${item.title} ${item.summary}`.toLowerCase();
    if (
      /\b(hobby|practice|guitar|chess|singing|voice|music|skill)\b/.test(text)
    ) {
      return 'hobby';
    }
    if (
      /\b(gym|workout|training|walk|walking|run|running|mobility|recovery|fitness)\b/.test(
        text,
      )
    ) {
      return 'routine';
    }
    if (
      /\b(read|reading|book|learn|learning|study|course|experiment)\b/.test(
        text,
      )
    ) {
      return 'learning';
    }
    if (item.source === HsakaaDailyContextSource.TASK) return 'work';
    if (
      /\b(moment|observation|photo|travel|food|coffee|tea|place|weekend)\b/.test(
        text,
      )
    ) {
      return 'human';
    }
    return null;
  }

  private defaultPresenceTitle(category: MediaWorldPresenceSignal['category']) {
    if (category === 'routine') return 'Routine';
    if (category === 'hobby') return 'Hobby / practice';
    if (category === 'learning') return 'Learning';
    if (category === 'work') return 'Current work';
    return 'Human moment';
  }

  private safeWholeLifeSummary(
    item: HsakaaDailyContextItem,
    category: MediaWorldPresenceSignal['category'],
  ) {
    if (
      category === 'learning' &&
      item.source === HsakaaDailyContextSource.LIBRARY
    ) {
      return `Learning activity around “${item.title}” may support a conditional reading/learning moment. Do not claim progress or completion unless the capture itself confirms it.`;
    }
    if (category === 'hobby') {
      return `${item.title || 'A hobby/practice signal'} may support a small learning-in-public moment. Prefer the actual practice, difficulty, progress or curiosity; do not force a business analogy.`;
    }
    if (category === 'routine') {
      return `${item.title || 'A routine signal'} may support a lightweight routine/health moment. Health context is public-safe by owner policy; use a metric or result only when the supplied source contains it, and never imply completion before it happens.`;
    }
    if (category === 'work') {
      return `${item.title || 'A current-work signal'} may support a behind-the-scenes builder moment. Supplied company context is public-safe; use only source-grounded facts and never invent a customer, metric, capability or outcome.`;
    }
    return `${item.title || 'A human moment'} may support a lightweight personality-led post if it is genuinely happening.`;
  }

  private asMediaPublicSafe(
    item: HsakaaDailyContextItem,
  ): HsakaaDailyContextItem {
    return {
      ...item,
      privacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
      defaultPrivacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
    };
  }

  private dedupeItems(items: HsakaaDailyContextItem[]) {
    const seen = new Map<string, HsakaaDailyContextItem>();
    for (const item of items) {
      const key = `${item.source}:${item.sourceId || item.id}`;
      const existing = seen.get(key);
      if (!existing || item.occurredAt > existing.occurredAt)
        seen.set(key, item);
    }
    return [...seen.values()].sort((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt),
    );
  }

  private toContextItem(
    item: HsakaaDailyContextItem,
    publishable: boolean,
  ): MediaWorldContextItem {
    return {
      id: item.id,
      source: item.source,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      occurredAt: item.occurredAt,
      privacy: item.privacy,
      significantChange: item.significantChange,
      publishable,
    };
  }

  private dateString(value?: Date) {
    return value ? new Date(value).toISOString() : undefined;
  }
}
