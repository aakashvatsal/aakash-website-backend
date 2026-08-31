import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  HsakaaAiUsage,
  HsakaaAiUsageFeature,
  HsakaaAiUsageMeasurement,
  HsakaaAiUsageStatus,
} from './schemas/hsakaa-ai-usage.schema';

type UsageNumbers = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  measurement: HsakaaAiUsageMeasurement;
};

type RecordAiUsageInput = {
  feature: HsakaaAiUsageFeature;
  status: HsakaaAiUsageStatus;
  startedAt: number;
  model?: string | null;
  responseId?: string | null;
  usage?: unknown;
  estimatedInputTokens?: number;
  requestUnits?: number;
  metadata?: Record<string, unknown>;
  error?: unknown;
};

const DEFAULT_RETENTION_DAYS = 180;
const MAX_ERROR_LENGTH = 800;

export class HsakaaAiBudgetExceededError extends Error {
  constructor() {
    super('HSAKAA AI hard daily budget has been reached.');
    this.name = 'HsakaaAiBudgetExceededError';
  }
}

@Injectable()
export class HsakaaAiUsageService {
  constructor(
    @InjectModel(HsakaaAiUsage.name)
    private readonly usageModel: Model<HsakaaAiUsage>,
    private readonly config: ConfigService,
  ) {}

  getPolicy() {
    return {
      version: 'hsakaa-ai-usage-v1',
      retentionDays: this.retentionDays(),
      budgets: {
        softDailyTokens: this.optionalNumber('HSAKAA_AI_SOFT_DAILY_TOKENS'),
        hardDailyTokens: this.optionalNumber('HSAKAA_AI_HARD_DAILY_TOKENS'),
        softDailyUsd: this.optionalNumber('HSAKAA_AI_SOFT_DAILY_USD'),
        hardDailyUsd: this.optionalNumber('HSAKAA_AI_HARD_DAILY_USD'),
      },
      pricing: {
        inputUsdPerMillion: this.optionalNumber(
          'HSAKAA_AI_INPUT_USD_PER_MILLION',
        ),
        outputUsdPerMillion: this.optionalNumber(
          'HSAKAA_AI_OUTPUT_USD_PER_MILLION',
        ),
        embeddingUsdPerMillion: this.optionalNumber(
          'HSAKAA_AI_EMBEDDING_USD_PER_MILLION',
        ),
        configured:
          this.optionalNumber('HSAKAA_AI_INPUT_USD_PER_MILLION') !== null ||
          this.optionalNumber('HSAKAA_AI_OUTPUT_USD_PER_MILLION') !== null ||
          this.optionalNumber('HSAKAA_AI_EMBEDDING_USD_PER_MILLION') !== null,
      },
      behavior: {
        softBudgetBlocksRequests: false,
        hardBudgetBlocksNewAiRequests: true,
        blockedStructuredRequestsFallBackToEvidenceOnly: true,
        blockedSemanticRequestsFallBackToLexicalSearch: true,
      },
    };
  }

  async assertBudget(feature: HsakaaAiUsageFeature): Promise<void> {
    void feature;
    const budget = await this.getBudgetStatus();
    if (!budget.hardExceeded) return;
    throw new HsakaaAiBudgetExceededError();
  }

  isBudgetExceeded(error: unknown): boolean {
    return error instanceof HsakaaAiBudgetExceededError;
  }

  async record(input: RecordAiUsageInput): Promise<void> {
    const usage =
      input.status === HsakaaAiUsageStatus.BLOCKED
        ? this.extractUsage(undefined)
        : this.extractUsage(input.usage, input.estimatedInputTokens);
    const estimatedCostUsd = this.estimateCost(input.feature, usage);
    const occurredAt = new Date();
    const expiresAt = new Date(
      occurredAt.getTime() + this.retentionDays() * 24 * 60 * 60 * 1000,
    );

    try {
      await this.usageModel.create({
        feature: input.feature,
        status: input.status,
        measurement: usage.measurement,
        aiModel: input.model ?? null,
        responseId: input.responseId ?? null,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd,
        durationMs: Math.max(0, Date.now() - input.startedAt),
        requestUnits: Math.max(1, Math.round(input.requestUnits ?? 1)),
        metadata: input.metadata ?? {},
        error: input.error ? this.errorMessage(input.error) : null,
        occurredAt,
        expiresAt,
      });
    } catch {
      // Observability must never turn a successful Personal OS operation into a 500.
    }
  }

  async getBudgetStatus() {
    const start = this.startOfTodayIst();
    const [totals] = await this.usageModel.aggregate<{
      totalTokens: number;
      estimatedCostUsd: number;
      requests: number;
    }>([
      { $match: { occurredAt: { $gte: start } } },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: '$totalTokens' },
          estimatedCostUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
          requests: { $sum: '$requestUnits' },
        },
      },
    ]);

    const today = {
      totalTokens: totals?.totalTokens ?? 0,
      estimatedCostUsd: Number((totals?.estimatedCostUsd ?? 0).toFixed(6)),
      requests: totals?.requests ?? 0,
    };
    const policy = this.getPolicy().budgets;
    const hardExceeded =
      (policy.hardDailyTokens !== null &&
        today.totalTokens >= policy.hardDailyTokens) ||
      (policy.hardDailyUsd !== null &&
        today.estimatedCostUsd >= policy.hardDailyUsd);
    const softExceeded =
      hardExceeded ||
      (policy.softDailyTokens !== null &&
        today.totalTokens >= policy.softDailyTokens) ||
      (policy.softDailyUsd !== null &&
        today.estimatedCostUsd >= policy.softDailyUsd);

    return { today, softExceeded, hardExceeded, policy };
  }

  async getSummary(days = 30) {
    const safeDays = Math.min(90, Math.max(1, Math.round(days)));
    const from = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const [totals, byFeature, recent, budget] = await Promise.all([
      this.usageModel.aggregate<{
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        estimatedCostUsd: number;
        requestUnits: number;
        success: number;
        fallback: number;
        errors: number;
        blocked: number;
      }>([
        { $match: { occurredAt: { $gte: from } } },
        {
          $group: {
            _id: null,
            totalTokens: { $sum: '$totalTokens' },
            inputTokens: { $sum: '$inputTokens' },
            outputTokens: { $sum: '$outputTokens' },
            estimatedCostUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
            requestUnits: { $sum: '$requestUnits' },
            success: {
              $sum: {
                $cond: [
                  { $eq: ['$status', HsakaaAiUsageStatus.SUCCESS] },
                  1,
                  0,
                ],
              },
            },
            fallback: {
              $sum: {
                $cond: [
                  { $eq: ['$status', HsakaaAiUsageStatus.FALLBACK] },
                  1,
                  0,
                ],
              },
            },
            errors: {
              $sum: {
                $cond: [{ $eq: ['$status', HsakaaAiUsageStatus.ERROR] }, 1, 0],
              },
            },
            blocked: {
              $sum: {
                $cond: [
                  { $eq: ['$status', HsakaaAiUsageStatus.BLOCKED] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      this.usageModel.aggregate<{
        feature: HsakaaAiUsageFeature;
        totalTokens: number;
        estimatedCostUsd: number;
        requestUnits: number;
      }>([
        { $match: { occurredAt: { $gte: from } } },
        {
          $group: {
            _id: '$feature',
            totalTokens: { $sum: '$totalTokens' },
            estimatedCostUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
            requestUnits: { $sum: '$requestUnits' },
          },
        },
        { $sort: { totalTokens: -1 } },
        {
          $project: {
            _id: 0,
            feature: '$_id',
            totalTokens: 1,
            estimatedCostUsd: 1,
            requestUnits: 1,
          },
        },
      ]),
      this.usageModel.find({}).sort({ occurredAt: -1 }).limit(30).lean().exec(),
      this.getBudgetStatus(),
    ]);

    const total = totals[0];
    const attempts =
      (total?.success ?? 0) +
      (total?.fallback ?? 0) +
      (total?.errors ?? 0) +
      (total?.blocked ?? 0);

    return {
      days: safeDays,
      from,
      totals: {
        totalTokens: total?.totalTokens ?? 0,
        inputTokens: total?.inputTokens ?? 0,
        outputTokens: total?.outputTokens ?? 0,
        estimatedCostUsd: Number((total?.estimatedCostUsd ?? 0).toFixed(6)),
        requestUnits: total?.requestUnits ?? 0,
        success: total?.success ?? 0,
        fallback: total?.fallback ?? 0,
        errors: total?.errors ?? 0,
        blocked: total?.blocked ?? 0,
        fallbackRate: attempts
          ? Number(((total?.fallback ?? 0) / attempts).toFixed(4))
          : 0,
        errorRate: attempts
          ? Number(((total?.errors ?? 0) / attempts).toFixed(4))
          : 0,
      },
      byFeature: byFeature.map((item) => ({
        ...item,
        estimatedCostUsd: Number((item.estimatedCostUsd ?? 0).toFixed(6)),
      })),
      recent: recent.map((item) => {
        const { aiModel, ...rest } = item;
        return {
          ...rest,
          model: aiModel ?? null,
        };
      }),
      budget,
      generatedAt: new Date(),
    };
  }

  private extractUsage(
    usage: unknown,
    estimatedInputTokens?: number,
  ): UsageNumbers {
    const inputTokens = this.firstNumber(usage, [
      'input_tokens',
      'inputTokens',
      'prompt_tokens',
      'promptTokens',
    ]);
    const outputTokens = this.firstNumber(usage, [
      'output_tokens',
      'outputTokens',
      'completion_tokens',
      'completionTokens',
    ]);
    const totalTokens = this.firstNumber(usage, [
      'total_tokens',
      'totalTokens',
    ]);

    if (inputTokens !== null || outputTokens !== null || totalTokens !== null) {
      const input = inputTokens ?? 0;
      const output = outputTokens ?? 0;
      return {
        inputTokens: input,
        outputTokens: output,
        totalTokens: totalTokens ?? input + output,
        measurement: HsakaaAiUsageMeasurement.PROVIDER,
      };
    }

    if (estimatedInputTokens !== undefined) {
      const estimate = Math.max(0, Math.round(estimatedInputTokens));
      return {
        inputTokens: estimate,
        outputTokens: 0,
        totalTokens: estimate,
        measurement: HsakaaAiUsageMeasurement.ESTIMATED,
      };
    }

    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      measurement: HsakaaAiUsageMeasurement.NONE,
    };
  }

  private estimateCost(
    feature: HsakaaAiUsageFeature,
    usage: UsageNumbers,
  ): number | null {
    const isEmbedding =
      feature === HsakaaAiUsageFeature.SEARCH_INDEX_EMBEDDING ||
      feature === HsakaaAiUsageFeature.SEARCH_QUERY_EMBEDDING;
    if (isEmbedding) {
      const rate = this.optionalNumber('HSAKAA_AI_EMBEDDING_USD_PER_MILLION');
      return rate === null
        ? null
        : Number(((usage.inputTokens / 1_000_000) * rate).toFixed(8));
    }

    const inputRate = this.optionalNumber('HSAKAA_AI_INPUT_USD_PER_MILLION');
    const outputRate = this.optionalNumber('HSAKAA_AI_OUTPUT_USD_PER_MILLION');
    if (inputRate === null && outputRate === null) return null;
    return Number(
      (
        (usage.inputTokens / 1_000_000) * (inputRate ?? 0) +
        (usage.outputTokens / 1_000_000) * (outputRate ?? 0)
      ).toFixed(8),
    );
  }

  private firstNumber(value: unknown, keys: string[]): number | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return Math.max(0, Math.round(candidate));
      }
    }
    return null;
  }

  private optionalNumber(key: string): number | null {
    const raw = this.config.get<string | number>(key);
    if (raw === undefined || raw === null || raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  private retentionDays(): number {
    const configured = this.optionalNumber('HSAKAA_AI_USAGE_RETENTION_DAYS');
    return configured === null
      ? DEFAULT_RETENTION_DAYS
      : Math.min(730, Math.max(30, Math.round(configured)));
  }

  private startOfTodayIst(): Date {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(now).map((part) => [part.type, part.value]),
    );
    return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`);
  }

  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, MAX_ERROR_LENGTH);
  }
}
