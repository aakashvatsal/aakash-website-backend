import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { HsakaaAiUsageService } from '../hsakaa-observability/hsakaa-ai-usage.service';
import {
  HsakaaAiUsageFeature,
  HsakaaAiUsageStatus,
} from '../hsakaa-observability/schemas/hsakaa-ai-usage.schema';
import { HsakaaRuntimeLeaseService } from '../hsakaa-runtime/hsakaa-runtime-lease.service';
import { ContextEngineService } from '../context-engine/context-engine.service';
import {
  ContextAssemblyMode,
  ContextPrivacyBoundary,
} from '../context-engine/dto/context-engine.dto';
import { KnowledgeGraphNodeType } from '../knowledge-graph/schemas/knowledge-graph-node.schema';
import {
  DecideProactiveActionDto,
  GenerateProactiveReviewDto,
  ProactiveActionDecision,
  ProactiveReviewPeriod,
  ProactiveReviewQueryDto,
  ProactiveScanDto,
  ProactiveSignalCategory,
  ProactiveSignalQueryDto,
  ProactiveSignalSeverity,
  ProactiveSignalStatus,
  UpdateProactiveSignalStatusDto,
} from './dto/proactive.dto';
import {
  ProactiveReview,
  ProactiveReviewDocument,
  ProactiveReviewItem,
} from './schemas/proactive-review.schema';
import {
  ProactiveProposedAction,
  ProactiveSignal,
  ProactiveSignalDocument,
  ProactiveSignalEvidence,
} from './schemas/proactive-signal.schema';

type ContextPacket = Awaited<ReturnType<ContextEngineService['assemble']>>;
type ContextEvidence = ContextPacket['evidence'][number];

type AiSignal = {
  category: ProactiveSignalCategory;
  title: string;
  summary: string;
  whyNow: string;
  severity: ProactiveSignalSeverity;
  confidence: number;
  priorityScore: number;
  citations: string[];
  proposedAction: {
    label: string;
    kind: string;
    targetDomain: string;
    reason: string;
    consequential: boolean;
  };
};

type AiScan = {
  signals: AiSignal[];
  scanSummary: string;
};

type AiReviewItem = {
  title: string;
  detail: string;
  signalId?: string;
  citations: string[];
};

type AiReview = {
  title: string;
  summary: string;
  priorities: AiReviewItem[];
  wins: AiReviewItem[];
  patterns: AiReviewItem[];
  watchlist: AiReviewItem[];
  recommendations: AiReviewItem[];
};

const ALL_GRAPH_TYPES = Object.values(KnowledgeGraphNodeType);
const DEFAULT_LOOKBACK_DAYS = 120;
const DEFAULT_MAX_EVIDENCE = 60;
const IST_OFFSET_MS = 330 * 60 * 1000;

const ACTIVE_SIGNAL_STATUSES = [
  ProactiveSignalStatus.OPEN,
  ProactiveSignalStatus.ACKNOWLEDGED,
  ProactiveSignalStatus.SNOOZED,
];

const SCAN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['signals', 'scanSummary'],
  properties: {
    scanSummary: { type: 'string' },
    signals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'category',
          'title',
          'summary',
          'whyNow',
          'severity',
          'confidence',
          'priorityScore',
          'citations',
          'proposedAction',
        ],
        properties: {
          category: {
            type: 'string',
            enum: Object.values(ProactiveSignalCategory),
          },
          title: { type: 'string' },
          summary: { type: 'string' },
          whyNow: { type: 'string' },
          severity: {
            type: 'string',
            enum: Object.values(ProactiveSignalSeverity),
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          priorityScore: { type: 'number', minimum: 0, maximum: 1 },
          citations: { type: 'array', items: { type: 'string' } },
          proposedAction: {
            type: 'object',
            additionalProperties: false,
            required: [
              'label',
              'kind',
              'targetDomain',
              'reason',
              'consequential',
            ],
            properties: {
              label: { type: 'string' },
              kind: { type: 'string' },
              targetDomain: { type: 'string' },
              reason: { type: 'string' },
              consequential: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
};

const REVIEW_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'summary',
    'priorities',
    'wins',
    'patterns',
    'watchlist',
    'recommendations',
  ],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    priorities: { type: 'array', items: reviewItemSchema() },
    wins: { type: 'array', items: reviewItemSchema() },
    patterns: { type: 'array', items: reviewItemSchema() },
    watchlist: { type: 'array', items: reviewItemSchema() },
    recommendations: { type: 'array', items: reviewItemSchema() },
  },
};

function reviewItemSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'detail', 'citations'],
    properties: {
      title: { type: 'string' },
      detail: { type: 'string' },
      signalId: { type: 'string' },
      citations: { type: 'array', items: { type: 'string' } },
    },
  };
}

@Injectable()
export class ProactiveService {
  constructor(
    @InjectModel(ProactiveSignal.name)
    private readonly signalModel: Model<ProactiveSignalDocument>,
    @InjectModel(ProactiveReview.name)
    private readonly reviewModel: Model<ProactiveReviewDocument>,
    private readonly contextEngine: ContextEngineService,
    private readonly aiService: AiService,
    private readonly aiUsage: HsakaaAiUsageService,
    private readonly runtimeLeases: HsakaaRuntimeLeaseService,
  ) {}

  getPolicy() {
    return {
      version: 'phase-11-v1',
      engine: 'proactive_personal_os',
      timezone: 'Asia/Kolkata',
      scope: ALL_GRAPH_TYPES,
      categories: Object.values(ProactiveSignalCategory),
      schedules: {
        scan: 'Every 6 hours',
        dailyReview: '07:30 Asia/Kolkata',
        weeklyReview: 'Monday 07:45 Asia/Kolkata',
        monthlyReview: '1st day 08:00 Asia/Kolkata',
      },
      autonomy: {
        detection: 'automatic',
        briefingGeneration: 'automatic',
        signalLifecycleWrites: 'owner-controlled',
        consequentialCrossDomainActions: 'confirmation_required',
        automaticExternalExecution: false,
      },
      safeguards: [
        'Every AI signal must cite evidence from the Phase 10 Context Engine.',
        'Signals with invalid or missing citations are discarded.',
        'Repeated detections are fingerprinted and upserted instead of duplicated.',
        'Dismissed and resolved signals are never silently reopened by a scan.',
        'Consequential proposed actions can be approved or rejected, but this engine never executes them automatically.',
        'Snoozed signals stay out of the active briefing until their snooze expires.',
      ],
    };
  }

  async getDashboard() {
    const now = new Date();
    const activeQuery = {
      status: { $in: ACTIVE_SIGNAL_STATUSES },
      $or: [
        { snoozedUntil: { $exists: false } },
        { snoozedUntil: null },
        { snoozedUntil: { $lte: now } },
      ],
    };
    const [active, latestReviews, totalOpen, highPriority, activeEligible] =
      await Promise.all([
        this.signalModel
          .find(activeQuery)
          .sort({ priorityScore: -1, lastDetectedAt: -1 })
          .limit(12)
          .exec(),
        this.reviewModel.find().sort({ periodStart: -1 }).limit(6).exec(),
        this.signalModel.countDocuments({ status: ProactiveSignalStatus.OPEN }),
        this.signalModel.countDocuments({
          status: { $in: ACTIVE_SIGNAL_STATUSES },
          severity: {
            $in: [
              ProactiveSignalSeverity.HIGH,
              ProactiveSignalSeverity.CRITICAL,
            ],
          },
        }),
        this.signalModel.countDocuments(activeQuery),
      ]);

    const categoryCounts = await this.signalModel.aggregate<{
      _id: ProactiveSignalCategory;
      count: number;
    }>([
      { $match: { status: { $in: ACTIVE_SIGNAL_STATUSES } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return {
      summary: {
        totalOpen,
        highPriority,
        activeNow: activeEligible,
        categories: categoryCounts.reduce<
          Partial<Record<ProactiveSignalCategory, number>>
        >((accumulator, item) => {
          accumulator[item._id] = item.count;
          return accumulator;
        }, {}),
      },
      attention: active,
      reviews: latestReviews,
      generatedAt: now,
    };
  }

  async getSignals(query: ProactiveSignalQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    if (query.severity) filter.severity = query.severity;
    const limit = query.limit ?? 80;
    const items = await this.signalModel
      .find(filter)
      .sort({ priorityScore: -1, lastDetectedAt: -1 })
      .limit(limit)
      .exec();
    return { items, count: items.length, generatedAt: new Date() };
  }

  async runScan(dto: ProactiveScanDto = {}) {
    const lease = await this.runtimeLeases.acquire(
      'proactive-scan',
      30 * 60_000,
      {
        engine: 'proactive_os',
        lookbackDays: dto.lookbackDays ?? DEFAULT_LOOKBACK_DAYS,
      },
    );
    if (!lease) {
      return {
        detected: 0,
        persisted: 0,
        scanSummary:
          'Skipped because another proactive scan is already running.',
        signals: [],
        semantic: null,
        contextConfidence: null,
        ai: null,
        skipped: true,
        skipReason: 'scan_already_running',
        generatedAt: new Date(),
      };
    }

    try {
      return await this.performScan(dto);
    } finally {
      await this.runtimeLeases.release(lease);
    }
  }

  private async performScan(dto: ProactiveScanDto = {}) {
    const now = new Date();
    const lookbackDays = dto.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    const maxEvidence = dto.maxEvidence ?? DEFAULT_MAX_EVIDENCE;
    const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const packet = await this.contextEngine.assemble({
      question: [
        'Across everything in my Personal OS, identify only the items that genuinely deserve proactive attention now.',
        'Look for forgotten commitments, people or relationships going quiet, unresolved decisions, repeatedly deferred tasks, health trends, reading ideas worth resurfacing, company risks, company opportunities, journal patterns, media/content issues, and other unresolved or time-sensitive loops.',
        'Prioritize changes, repeated patterns, risks, opportunities, deadlines, stale commitments, and follow-ups. Do not create generic productivity advice.',
      ].join(' '),
      boundary: ContextPrivacyBoundary.PRIVATE,
      mode: ContextAssemblyMode.FRESH,
      types: ALL_GRAPH_TYPES,
      from: from.toISOString(),
      to: now.toISOString(),
      maxEvidence,
      contextBudgetChars: 55_000,
    });

    if (!packet.evidence.length) {
      return {
        detected: 0,
        persisted: 0,
        scanSummary:
          'No eligible Personal OS evidence was available for proactive analysis.',
        semantic: packet.retrieval.semantic,
        generatedAt: now,
      };
    }

    let candidates: AiSignal[] = [];
    let scanSummary = '';
    let generatedBy: 'ai' | 'fallback' = 'ai';
    let ai: Record<string, unknown> | null = null;

    const aiStartedAt = Date.now();
    try {
      await this.aiUsage.assertBudget(HsakaaAiUsageFeature.PROACTIVE_SCAN);
      const result = await this.aiService.generateStructuredResponse<AiScan>({
        name: 'hsakaa_proactive_scan_v1',
        schema: SCAN_SCHEMA,
        verbosity: 'medium',
        instructions: [
          'You are HSAKAA running the proactive attention layer for a single-owner Personal OS.',
          'Use ONLY the supplied Context Engine evidence. Never infer personal facts that are not present.',
          'Return only items that deserve attention now; zero signals is valid.',
          'Every signal MUST include at least one valid E# citation from the supplied packet.',
          'Do not treat mere mentions, graph proximity, or old history as an active problem by themselves.',
          'Prefer specific unresolved loops, meaningful trends, risks, opportunities, and follow-ups over generic advice.',
          'Use critical severity only for clearly urgent, high-impact evidence. Most signals should be low, medium, or high.',
          'A proposed action is a suggestion only. Mark consequential true whenever it would write to another domain, contact a person, publish content, alter health behavior, make a company decision, spend money, or otherwise change the real world.',
          'Do not claim that a proposed action has been executed.',
          'Avoid duplicate signals that point to the same underlying evidence and issue.',
        ].join('\n'),
        input: JSON.stringify({
          generatedAt: now,
          lookbackDays,
          contextConfidence: packet.confidence,
          contradictions: packet.contradictions,
          evidence: packet.evidence,
          context: packet.context,
        }),
      });
      candidates = result.data.signals;
      scanSummary = result.data.scanSummary;
      ai = {
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
      };
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.PROACTIVE_SCAN,
        status: HsakaaAiUsageStatus.SUCCESS,
        startedAt: aiStartedAt,
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
        metadata: {
          lookbackDays,
          evidenceCount: packet.evidence.length,
          detected: result.data.signals.length,
        },
      });
    } catch (error) {
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.PROACTIVE_SCAN,
        status: this.aiUsage.isBudgetExceeded(error)
          ? HsakaaAiUsageStatus.BLOCKED
          : HsakaaAiUsageStatus.FALLBACK,
        startedAt: aiStartedAt,
        metadata: { lookbackDays, evidenceCount: packet.evidence.length },
        error,
      });
      generatedBy = 'fallback';
      candidates = this.fallbackSignals(packet.evidence);
      scanSummary = candidates.length
        ? 'AI synthesis was unavailable, so HSAKAA used conservative evidence-based fallback detectors.'
        : 'AI synthesis was unavailable and the conservative fallback detectors found no sufficiently explicit attention signals.';
      ai = { error: this.errorMessage(error) };
    }

    const sanitized = this.sanitizeSignals(candidates, packet.evidence);
    const persisted: ProactiveSignalDocument[] = [];
    for (const candidate of sanitized) {
      const signal = await this.upsertSignal(candidate, generatedBy, now, {
        lookbackDays,
        contextConfidence: packet.confidence,
      });
      persisted.push(signal);
    }

    return {
      detected: sanitized.length,
      persisted: persisted.length,
      scanSummary,
      signals: persisted,
      semantic: packet.retrieval.semantic,
      contextConfidence: packet.confidence,
      ai,
      generatedAt: now,
    };
  }

  async updateSignalStatus(id: string, dto: UpdateProactiveSignalStatusDto) {
    const signal = await this.requireSignal(id);
    signal.status = dto.status;
    if (dto.status === ProactiveSignalStatus.SNOOZED) {
      const days = dto.snoozeDays ?? 1;
      signal.snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    } else {
      signal.snoozedUntil = undefined;
    }
    await signal.save();
    return signal;
  }

  async decideAction(id: string, dto: DecideProactiveActionDto) {
    const signal = await this.requireSignal(id);
    if (!signal.proposedAction) {
      throw new BadRequestException(
        'This signal does not have a proposed action.',
      );
    }
    signal.proposedAction = {
      ...signal.proposedAction,
      status:
        dto.decision === ProactiveActionDecision.APPROVE
          ? 'approved'
          : 'rejected',
      decidedAt: new Date(),
    };
    await signal.save();
    return {
      signal,
      execution: {
        executed: false,
        reason:
          'Phase 11 never executes consequential cross-domain actions automatically. Approval records explicit owner consent; execution must still happen through the relevant domain-specific action surface.',
      },
    };
  }

  async generateReview(dto: GenerateProactiveReviewDto) {
    const reference = dto.referenceDate
      ? new Date(dto.referenceDate)
      : new Date();
    if (Number.isNaN(reference.getTime())) {
      throw new BadRequestException('Invalid reference date.');
    }
    const window = this.periodWindow(dto.period, reference);
    if (!dto.force) {
      const existing = await this.reviewModel
        .findOne({ periodKey: window.key })
        .exec();
      if (existing) return existing;
    }

    const lease = await this.runtimeLeases.acquire(
      `proactive-review:${window.key}`,
      30 * 60_000,
      {
        engine: 'proactive_review',
        period: dto.period,
        periodKey: window.key,
      },
    );
    if (!lease) {
      const existing = await this.reviewModel
        .findOne({ periodKey: window.key })
        .exec();
      if (existing) return existing;
      throw new ConflictException(
        'This proactive review is already being generated.',
      );
    }

    try {
      const now = new Date();
      const activeSignals = await this.signalModel
        .find({
          status: { $in: ACTIVE_SIGNAL_STATUSES },
          $or: [
            { snoozedUntil: { $exists: false } },
            { snoozedUntil: null },
            { snoozedUntil: { $lte: now } },
          ],
        })
        .sort({ priorityScore: -1, lastDetectedAt: -1 })
        .limit(40)
        .exec();

      const context = await this.contextEngine.assemble({
        question: this.reviewQuestion(dto.period),
        boundary: ContextPrivacyBoundary.PRIVATE,
        mode:
          dto.period === ProactiveReviewPeriod.DAILY
            ? ContextAssemblyMode.FRESH
            : ContextAssemblyMode.BALANCED,
        types: ALL_GRAPH_TYPES,
        from: window.start.toISOString(),
        to: window.end.toISOString(),
        maxEvidence: dto.period === ProactiveReviewPeriod.DAILY ? 36 : 60,
        contextBudgetChars:
          dto.period === ProactiveReviewPeriod.DAILY ? 36_000 : 55_000,
      });

      let output: AiReview;
      let ai: Record<string, unknown> = {};
      const aiStartedAt = Date.now();
      try {
        await this.aiUsage.assertBudget(HsakaaAiUsageFeature.PROACTIVE_REVIEW);
        const result =
          await this.aiService.generateStructuredResponse<AiReview>({
            name: `hsakaa_proactive_${dto.period}_review_v1`,
            schema: REVIEW_SCHEMA,
            verbosity: 'medium',
            instructions: [
              `Create a ${dto.period} Personal OS review for the owner.`,
              'Use ONLY the supplied signals and Context Engine evidence.',
              'Priorities are what deserves attention next. Wins are meaningful progress or closed loops. Patterns require repeated or cross-domain evidence. Watchlist contains risks or unresolved items worth monitoring. Recommendations must be concrete and restrained.',
              'Every factual item must cite valid E# evidence where available. If an item is based only on a stored proactive signal, include its signalId and do not invent an E# citation.',
              'Do not convert a weak association into causation.',
              'Do not create fake achievements, health claims, relationship states, business risks, or deadlines.',
              'Recommendations are suggestions only; do not imply they were executed.',
            ].join('\n'),
            input: JSON.stringify({
              period: dto.period,
              periodStart: window.start,
              periodEnd: window.end,
              activeSignals: activeSignals.map((signal) =>
                this.signalForReview(signal),
              ),
              contextConfidence: context.confidence,
              contradictions: context.contradictions,
              evidence: context.evidence,
              context: context.context,
            }),
          });
        output = this.sanitizeReview(
          result.data,
          context.evidence,
          activeSignals,
        );
        ai = {
          model: result.model,
          responseId: result.responseId,
          usage: result.usage,
        };
        await this.aiUsage.record({
          feature: HsakaaAiUsageFeature.PROACTIVE_REVIEW,
          status: HsakaaAiUsageStatus.SUCCESS,
          startedAt: aiStartedAt,
          model: result.model,
          responseId: result.responseId,
          usage: result.usage,
          metadata: {
            period: dto.period,
            activeSignals: activeSignals.length,
            evidenceCount: context.evidence.length,
          },
        });
      } catch (error) {
        await this.aiUsage.record({
          feature: HsakaaAiUsageFeature.PROACTIVE_REVIEW,
          status: this.aiUsage.isBudgetExceeded(error)
            ? HsakaaAiUsageStatus.BLOCKED
            : HsakaaAiUsageStatus.FALLBACK,
          startedAt: aiStartedAt,
          metadata: {
            period: dto.period,
            activeSignals: activeSignals.length,
            evidenceCount: context.evidence.length,
          },
          error,
        });
        output = this.fallbackReview(
          dto.period,
          activeSignals,
          context.evidence,
        );
        ai = { error: this.errorMessage(error), fallback: true };
      }

      const review = await this.reviewModel.findOneAndUpdate(
        { periodKey: window.key },
        {
          $set: {
            period: dto.period,
            periodStart: window.start,
            periodEnd: window.end,
            title: output.title,
            summary: output.summary,
            priorities: output.priorities,
            wins: output.wins,
            patterns: output.patterns,
            watchlist: output.watchlist,
            recommendations: output.recommendations,
            signalIds: activeSignals.map((signal) => String(signal._id)),
            evidenceCitationIds: [
              ...new Set(
                [
                  ...output.priorities,
                  ...output.wins,
                  ...output.patterns,
                  ...output.watchlist,
                  ...output.recommendations,
                ].flatMap((item) => item.citations),
              ),
            ],
            status: 'draft',
            reviewedAt: null,
            generatedAt: new Date(),
            ai,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      return review;
    } finally {
      await this.runtimeLeases.release(lease);
    }
  }

  async getReviews(query: ProactiveReviewQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.period) filter.period = query.period;
    const items = await this.reviewModel
      .find(filter)
      .sort({ periodStart: -1 })
      .limit(query.limit ?? 30)
      .exec();
    return { items, count: items.length, generatedAt: new Date() };
  }

  async markReviewReviewed(id: string) {
    if (!isValidObjectId(id))
      throw new BadRequestException('Invalid review identifier.');
    const review = await this.reviewModel.findById(id).exec();
    if (!review) throw new NotFoundException('Proactive review not found.');
    review.status = 'reviewed';
    review.reviewedAt = new Date();
    await review.save();
    return review;
  }

  @Cron('0 15 */6 * * *', { timeZone: 'Asia/Kolkata' })
  async scheduledScan() {
    try {
      await this.runScan({});
    } catch {
      return;
    }
  }

  @Cron('0 30 7 * * *', { timeZone: 'Asia/Kolkata' })
  async scheduledDailyReview() {
    try {
      await this.generateReview({
        period: ProactiveReviewPeriod.DAILY,
        force: true,
      });
    } catch {
      return;
    }
  }

  @Cron('0 45 7 * * 1', { timeZone: 'Asia/Kolkata' })
  async scheduledWeeklyReview() {
    try {
      await this.generateReview({
        period: ProactiveReviewPeriod.WEEKLY,
        force: true,
      });
    } catch {
      return;
    }
  }

  @Cron('0 0 8 1 * *', { timeZone: 'Asia/Kolkata' })
  async scheduledMonthlyReview() {
    try {
      await this.generateReview({
        period: ProactiveReviewPeriod.MONTHLY,
        force: true,
      });
    } catch {
      return;
    }
  }

  private sanitizeSignals(candidates: AiSignal[], evidence: ContextEvidence[]) {
    const evidenceByCitation = new Map(
      evidence.map((item) => [item.citationId, item]),
    );
    const fingerprints = new Set<string>();
    const result: Array<{
      candidate: AiSignal;
      evidence: ProactiveSignalEvidence[];
      fingerprint: string;
    }> = [];

    for (const candidate of candidates.slice(0, 30)) {
      const citations = [...new Set(candidate.citations)]
        .map((citation) => evidenceByCitation.get(citation))
        .filter((item): item is ContextEvidence => Boolean(item));
      if (!citations.length) continue;
      const fingerprint = this.signalFingerprint(candidate.category, citations);
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      result.push({
        candidate: {
          ...candidate,
          title: this.truncate(candidate.title.trim(), 240),
          summary: this.truncate(candidate.summary.trim(), 4000),
          whyNow: this.truncate(candidate.whyNow.trim(), 4000),
          confidence: this.clamp(candidate.confidence),
          priorityScore: this.clamp(candidate.priorityScore),
          citations: citations.map((item) => item.citationId),
          proposedAction: {
            ...candidate.proposedAction,
            label: this.truncate(candidate.proposedAction.label.trim(), 240),
            kind: this.truncate(candidate.proposedAction.kind.trim(), 120),
            targetDomain: this.truncate(
              candidate.proposedAction.targetDomain.trim(),
              120,
            ),
            reason: this.truncate(candidate.proposedAction.reason.trim(), 2000),
          },
        },
        evidence: citations.map((item) => this.signalEvidence(item)),
        fingerprint,
      });
    }
    return result;
  }

  private async upsertSignal(
    item: ReturnType<ProactiveService['sanitizeSignals']>[number],
    generatedBy: 'ai' | 'fallback',
    now: Date,
    metadata: Record<string, unknown>,
  ) {
    const existing = await this.signalModel
      .findOne({ fingerprint: item.fingerprint })
      .exec();
    if (existing) {
      existing.lastDetectedAt = now;
      existing.timesDetected =
        Math.max(1, Number(existing.timesDetected ?? 0)) + 1;

      if (
        [
          ProactiveSignalStatus.DISMISSED,
          ProactiveSignalStatus.RESOLVED,
        ].includes(existing.status)
      ) {
        await existing.save();
        return existing;
      }

      const previousAction = existing.proposedAction;
      const preserveDecision =
        previousAction &&
        ['approved', 'rejected'].includes(previousAction.status) &&
        previousAction.kind === item.candidate.proposedAction.kind &&
        previousAction.targetDomain ===
          item.candidate.proposedAction.targetDomain;

      existing.category = item.candidate.category;
      existing.title = item.candidate.title;
      existing.summary = item.candidate.summary;
      existing.whyNow = item.candidate.whyNow;
      existing.severity = item.candidate.severity;
      existing.confidence = item.candidate.confidence;
      existing.priorityScore = this.adjustedPriority(
        item.candidate.priorityScore,
        item.candidate.severity,
      );
      existing.evidence = item.evidence;
      existing.proposedAction = preserveDecision
        ? previousAction
        : this.proposedAction(item);
      existing.generatedBy = generatedBy;
      existing.metadata = metadata;
      await existing.save();
      return existing;
    }

    try {
      return await this.signalModel.create({
        fingerprint: item.fingerprint,
        category: item.candidate.category,
        title: item.candidate.title,
        summary: item.candidate.summary,
        whyNow: item.candidate.whyNow,
        severity: item.candidate.severity,
        status: ProactiveSignalStatus.OPEN,
        confidence: item.candidate.confidence,
        priorityScore: this.adjustedPriority(
          item.candidate.priorityScore,
          item.candidate.severity,
        ),
        evidence: item.evidence,
        proposedAction: this.proposedAction(item),
        firstDetectedAt: now,
        lastDetectedAt: now,
        timesDetected: 1,
        generatedBy,
        metadata,
      });
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;

      // A scheduled scan and a manual scan can discover the same fingerprint at
      // the same time. The unique index is the lock; reload and apply this
      // detection instead of surfacing an avoidable 500 to the owner.
      const raced = await this.signalModel
        .findOne({ fingerprint: item.fingerprint })
        .exec();
      if (!raced) throw error;

      raced.lastDetectedAt = now;
      raced.timesDetected = Math.max(1, Number(raced.timesDetected ?? 0)) + 1;
      if (
        ![
          ProactiveSignalStatus.DISMISSED,
          ProactiveSignalStatus.RESOLVED,
        ].includes(raced.status)
      ) {
        const previousAction = raced.proposedAction;
        const preserveDecision =
          previousAction &&
          ['approved', 'rejected'].includes(previousAction.status) &&
          previousAction.kind === item.candidate.proposedAction.kind &&
          previousAction.targetDomain ===
            item.candidate.proposedAction.targetDomain;
        raced.category = item.candidate.category;
        raced.title = item.candidate.title;
        raced.summary = item.candidate.summary;
        raced.whyNow = item.candidate.whyNow;
        raced.severity = item.candidate.severity;
        raced.confidence = item.candidate.confidence;
        raced.priorityScore = this.adjustedPriority(
          item.candidate.priorityScore,
          item.candidate.severity,
        );
        raced.evidence = item.evidence;
        raced.proposedAction = preserveDecision
          ? previousAction
          : this.proposedAction(item);
        raced.generatedBy = generatedBy;
        raced.metadata = metadata;
      }
      await raced.save();
      return raced;
    }
  }

  private proposedAction(
    item: ReturnType<ProactiveService['sanitizeSignals']>[number],
  ): ProactiveProposedAction {
    return {
      label: item.candidate.proposedAction.label,
      kind: item.candidate.proposedAction.kind,
      targetDomain: item.candidate.proposedAction.targetDomain,
      targetNodeKey: item.evidence[0]?.nodeKey,
      reason: item.candidate.proposedAction.reason,
      consequential: item.candidate.proposedAction.consequential,
      requiresConfirmation: item.candidate.proposedAction.consequential,
      status: item.candidate.proposedAction.consequential
        ? 'pending_confirmation'
        : 'not_required',
    };
  }

  private isDuplicateKeyError(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) return false;
    return (error as { code?: unknown }).code === 11000;
  }

  private fallbackSignals(evidence: ContextEvidence[]): AiSignal[] {
    const result: AiSignal[] = [];
    for (const item of evidence.slice(0, 40)) {
      const text = this.normalize(
        `${item.label} ${item.summary ?? ''} ${item.snippet}`,
      );
      const mapped = this.fallbackCategory(item.type, text);
      if (!mapped) continue;
      result.push({
        category: mapped.category,
        title: this.truncate(`${mapped.title}: ${item.label}`, 240),
        summary: item.summary ?? item.snippet,
        whyNow: mapped.whyNow,
        severity: mapped.severity,
        confidence: Math.max(0.45, item.contextScore),
        priorityScore: Math.max(0.4, item.contextScore),
        citations: [item.citationId],
        proposedAction: {
          label: mapped.action,
          kind: 'review_evidence',
          targetDomain: item.type,
          reason:
            'Review the underlying evidence before deciding whether any real-world action is needed.',
          consequential: false,
        },
      });
      if (result.length >= 12) break;
    }
    return result;
  }

  private fallbackCategory(type: KnowledgeGraphNodeType, text: string) {
    if (
      type === KnowledgeGraphNodeType.TASK &&
      /\b(overdue|defer|deferred|pending|deadline|late|blocked|stuck|follow up)\b/.test(
        text,
      )
    ) {
      return {
        category: /defer/.test(text)
          ? ProactiveSignalCategory.REPEATEDLY_DEFERRED_TASK
          : ProactiveSignalCategory.FORGOTTEN_COMMITMENT,
        title: 'Task needs attention',
        whyNow:
          'The task evidence explicitly contains an unresolved or time-sensitive state.',
        severity: ProactiveSignalSeverity.MEDIUM,
        action: 'Review the task and decide the next action',
      };
    }
    if (
      type === KnowledgeGraphNodeType.DECISION &&
      /\b(unresolved|pending|revisit|undecided|decide|decision needed|open question)\b/.test(
        text,
      )
    ) {
      return {
        category: ProactiveSignalCategory.UNRESOLVED_DECISION,
        title: 'Decision loop remains open',
        whyNow:
          'The decision evidence explicitly suggests an unresolved choice or revisit.',
        severity: ProactiveSignalSeverity.MEDIUM,
        action: 'Review the decision evidence',
      };
    }
    if (
      type === KnowledgeGraphNodeType.PERSON &&
      /\b(follow up|no response|quiet|reconnect|waiting|reply|check in)\b/.test(
        text,
      )
    ) {
      return {
        category: ProactiveSignalCategory.QUIET_RELATIONSHIP,
        title: 'Relationship follow-up may be due',
        whyNow:
          'The person evidence explicitly references a missing or pending follow-up.',
        severity: ProactiveSignalSeverity.LOW,
        action: 'Review whether a follow-up is appropriate',
      };
    }
    if (
      type === KnowledgeGraphNodeType.HEALTH &&
      /\b(declin|pain|low recovery|poor sleep|worse|trend|fatigue|injury|unusual|drop)\b/.test(
        text,
      )
    ) {
      return {
        category: ProactiveSignalCategory.HEALTH_TREND,
        title: 'Health trend deserves review',
        whyNow:
          'The health evidence contains an explicit negative change or trend signal.',
        severity: ProactiveSignalSeverity.MEDIUM,
        action: 'Review the health trend and source data',
      };
    }
    if (
      [KnowledgeGraphNodeType.BOOK, KnowledgeGraphNodeType.HIGHLIGHT].includes(
        type,
      ) &&
      /\b(revisit|apply|idea|lesson|influenc|use this|remember)\b/.test(text)
    ) {
      return {
        category: ProactiveSignalCategory.READING_RESURFACE,
        title: 'Reading idea worth resurfacing',
        whyNow:
          'The reading evidence explicitly suggests an idea or lesson with possible present relevance.',
        severity: ProactiveSignalSeverity.LOW,
        action: 'Revisit the source idea',
      };
    }
    if (type === KnowledgeGraphNodeType.COMPANY) {
      if (
        /\b(risk|blocker|problem|churn|delay|miss|declin|threat|issue)\b/.test(
          text,
        )
      ) {
        return {
          category: ProactiveSignalCategory.COMPANY_RISK,
          title: 'Company risk needs attention',
          whyNow:
            'The company evidence contains an explicit risk, blocker, decline, or issue signal.',
          severity: ProactiveSignalSeverity.HIGH,
          action: 'Review the company risk and choose a response',
        };
      }
      if (
        /\b(opportunity|lead|demo|growth|customer|partnership|expand|chance)\b/.test(
          text,
        )
      ) {
        return {
          category: ProactiveSignalCategory.COMPANY_OPPORTUNITY,
          title: 'Company opportunity worth reviewing',
          whyNow:
            'The company evidence contains an explicit opportunity or growth signal.',
          severity: ProactiveSignalSeverity.MEDIUM,
          action: 'Review whether the opportunity deserves action',
        };
      }
    }
    if (
      type === KnowledgeGraphNodeType.JOURNAL &&
      /\b(pattern|again|repeated|keep|stress|procrast|focus|recurring|consistently)\b/.test(
        text,
      )
    ) {
      return {
        category: ProactiveSignalCategory.JOURNAL_PATTERN,
        title: 'Journal pattern worth noticing',
        whyNow:
          'The journal evidence explicitly describes something recurring or patterned.',
        severity: ProactiveSignalSeverity.LOW,
        action: 'Review the repeated journal pattern',
      };
    }
    if (
      type === KnowledgeGraphNodeType.MEDIA &&
      /\b(overdue|miss|declin|failed|stuck|pending|engagement|publish|calendar gap)\b/.test(
        text,
      )
    ) {
      return {
        category: ProactiveSignalCategory.MEDIA_ATTENTION,
        title: 'Media workflow needs attention',
        whyNow:
          'The media evidence contains an explicit pending, failed, declining, or schedule-related signal.',
        severity: ProactiveSignalSeverity.MEDIUM,
        action: 'Review the media workflow',
      };
    }
    return null;
  }

  private sanitizeReview(
    input: AiReview,
    evidence: ContextEvidence[],
    signals: ProactiveSignalDocument[],
  ): AiReview {
    const validCitations = new Set(evidence.map((item) => item.citationId));
    const validSignalIds = new Set(signals.map((item) => String(item._id)));
    const sanitizeItems = (items: AiReviewItem[]): ProactiveReviewItem[] =>
      items.slice(0, 12).map((item) => ({
        title: this.truncate(item.title.trim(), 240),
        detail: this.truncate(item.detail.trim(), 3000),
        signalId:
          item.signalId && validSignalIds.has(item.signalId)
            ? item.signalId
            : undefined,
        citations: [...new Set(item.citations)].filter((citation) =>
          validCitations.has(citation),
        ),
      }));
    return {
      title: this.truncate(input.title.trim(), 240),
      summary: this.truncate(input.summary.trim(), 6000),
      priorities: sanitizeItems(input.priorities),
      wins: sanitizeItems(input.wins),
      patterns: sanitizeItems(input.patterns),
      watchlist: sanitizeItems(input.watchlist),
      recommendations: sanitizeItems(input.recommendations),
    };
  }

  private fallbackReview(
    period: ProactiveReviewPeriod,
    signals: ProactiveSignalDocument[],
    evidence: ContextEvidence[],
  ): AiReview {
    const priorities = signals.slice(0, 5).map((signal) => ({
      title: signal.title,
      detail: signal.whyNow,
      signalId: String(signal._id),
      citations: signal.evidence.map((item) => item.citationId).slice(0, 3),
    }));
    const topEvidence = evidence.slice(0, 3).map((item) => ({
      title: item.label,
      detail: item.summary ?? item.snippet,
      citations: [item.citationId],
    }));
    return {
      title: `${this.label(period)} Personal OS review`,
      summary: priorities.length
        ? `${priorities.length} active attention item${priorities.length === 1 ? '' : 's'} currently deserve review.`
        : 'No active proactive signals currently require attention.',
      priorities,
      wins: [],
      patterns: [],
      watchlist: topEvidence,
      recommendations: priorities.slice(0, 3).map((item) => ({
        ...item,
        title: `Review: ${item.title}`,
      })),
    };
  }

  private signalForReview(signal: ProactiveSignalDocument) {
    return {
      id: String(signal._id),
      category: signal.category,
      title: signal.title,
      summary: signal.summary,
      whyNow: signal.whyNow,
      severity: signal.severity,
      status: signal.status,
      confidence: signal.confidence,
      priorityScore: signal.priorityScore,
      firstDetectedAt: signal.firstDetectedAt,
      lastDetectedAt: signal.lastDetectedAt,
      timesDetected: signal.timesDetected,
      proposedAction: signal.proposedAction ?? null,
      evidence: signal.evidence,
    };
  }

  private periodWindow(period: ProactiveReviewPeriod, reference: Date) {
    const local = new Date(reference.getTime() + IST_OFFSET_MS);
    let year = local.getUTCFullYear();
    let month = local.getUTCMonth();
    let day = local.getUTCDate();

    if (period === ProactiveReviewPeriod.WEEKLY) {
      const weekday = local.getUTCDay();
      const daysSinceMonday = (weekday + 6) % 7;
      const startLocal = new Date(Date.UTC(year, month, day - daysSinceMonday));
      year = startLocal.getUTCFullYear();
      month = startLocal.getUTCMonth();
      day = startLocal.getUTCDate();
    } else if (period === ProactiveReviewPeriod.MONTHLY) {
      day = 1;
    }

    const start = new Date(Date.UTC(year, month, day) - IST_OFFSET_MS);
    const endLocal = new Date(start.getTime() + IST_OFFSET_MS);
    if (period === ProactiveReviewPeriod.DAILY) {
      endLocal.setUTCDate(endLocal.getUTCDate() + 1);
    } else if (period === ProactiveReviewPeriod.WEEKLY) {
      endLocal.setUTCDate(endLocal.getUTCDate() + 7);
    } else {
      endLocal.setUTCMonth(endLocal.getUTCMonth() + 1);
    }
    const end = new Date(endLocal.getTime() - IST_OFFSET_MS - 1);
    const key =
      period === ProactiveReviewPeriod.MONTHLY
        ? `${period}:${year}-${String(month + 1).padStart(2, '0')}`
        : `${period}:${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { key, start, end };
  }

  private reviewQuestion(period: ProactiveReviewPeriod) {
    if (period === ProactiveReviewPeriod.DAILY) {
      return 'What changed today across my entire Personal OS, what deserves attention next, what moved forward, and what unresolved loops should I not forget?';
    }
    if (period === ProactiveReviewPeriod.WEEKLY) {
      return 'Across this week in my entire Personal OS, what materially changed, what did I make progress on, what patterns repeated, what risks or opportunities emerged, and what deserves attention next week?';
    }
    return 'Across this month in my entire Personal OS, what materially changed, what progress compounded, what patterns repeated, what decisions or relationships mattered, what risks or opportunities emerged, and what should shape the next month?';
  }

  private async requireSignal(id: string) {
    if (!isValidObjectId(id))
      throw new BadRequestException('Invalid signal identifier.');
    const signal = await this.signalModel.findById(id).exec();
    if (!signal) throw new NotFoundException('Proactive signal not found.');
    return signal;
  }

  private signalFingerprint(
    category: ProactiveSignalCategory,
    evidence: ContextEvidence[],
  ) {
    const keys = evidence
      .map((item) => item.nodeKey)
      .sort()
      .slice(0, 5);
    return createHash('sha256')
      .update(`${category}|${keys.join('|')}`)
      .digest('hex');
  }

  private signalEvidence(item: ContextEvidence): ProactiveSignalEvidence {
    return {
      citationId: item.citationId,
      nodeKey: item.nodeKey,
      type: item.type,
      label: item.label,
      sourceCollection: item.source.collection,
      sourceId: item.source.id,
      occurredAt: item.occurredAt ? new Date(item.occurredAt) : null,
    };
  }

  private adjustedPriority(score: number, severity: ProactiveSignalSeverity) {
    const boost =
      severity === ProactiveSignalSeverity.CRITICAL
        ? 0.15
        : severity === ProactiveSignalSeverity.HIGH
          ? 0.08
          : severity === ProactiveSignalSeverity.MEDIUM
            ? 0.03
            : 0;
    return this.clamp(score + boost);
  }

  private normalize(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private truncate(value: string, max: number) {
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  }

  private clamp(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  private label(period: ProactiveReviewPeriod) {
    return period.charAt(0).toUpperCase() + period.slice(1);
  }

  private errorMessage(error: unknown) {
    return error instanceof Error
      ? error.message
      : 'Unknown proactive engine error.';
  }
}
