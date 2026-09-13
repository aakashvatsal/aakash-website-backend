import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { HsakaaAiUsageService } from '../hsakaa-observability/hsakaa-ai-usage.service';
import {
  HsakaaAiUsageFeature,
  HsakaaAiUsageStatus,
} from '../hsakaa-observability/schemas/hsakaa-ai-usage.schema';

export type HealthMarketCandidate = {
  key: string;
  domain: 'skincare' | 'haircare' | 'bodycare' | 'supplement';
  productName: string;
  brand: string;
};

export type HealthMarketAvailability = {
  key: string;
  status: 'verified_local' | 'verified_india' | 'unverified' | 'not_checked';
  summary: string;
  sources: string[];
};

const AVAILABILITY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'status', 'summary', 'sources'],
        properties: {
          key: { type: 'string' },
          status: {
            type: 'string',
            enum: ['verified_local', 'verified_india', 'unverified'],
          },
          summary: { type: 'string' },
          sources: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
          },
        },
      },
    },
  },
};

@Injectable()
export class HealthMarketResearchService {
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly aiUsage: HsakaaAiUsageService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });
    this.model = this.config.get<string>('OPENAI_MODEL') || 'gpt-5.6-sol';
  }

  async verifyCandidates(input: {
    location?: Record<string, unknown>;
    candidates: HealthMarketCandidate[];
  }): Promise<HealthMarketAvailability[]> {
    const candidates = input.candidates
      .filter((item) => item.productName.trim())
      .slice(0, 24);
    if (!candidates.length) return [];

    const city = this.text(input.location?.city);
    const region = this.text(input.location?.region);
    const country = this.text(input.location?.country);
    const countryCode = this.text(input.location?.countryCode).toUpperCase();
    const timezone = this.text(input.location?.timezone) || 'Asia/Kolkata';
    if (!city && !country) {
      return candidates.map((item) => ({
        key: item.key,
        status: 'not_checked',
        summary: 'Add your current city/country to verify local availability.',
        sources: [],
      }));
    }

    const startedAt = Date.now();
    try {
      await this.aiUsage.assertBudget(HsakaaAiUsageFeature.HEALTH_PLANNER);
      const response = await this.openai.responses.create({
        model: this.model,
        instructions: [
          'Verify current retail availability only. Do not provide medical, nutrition or supplement advice.',
          'Use web search and public retailer/brand pages. Do not use private health context.',
          'verified_local means there is current evidence of purchase/delivery/retail availability in the supplied city.',
          'verified_india means there is current India availability but city-level availability is not clearly supported.',
          'unverified means current availability could not be supported.',
          'Only place URLs actually surfaced by web search in sources. Never invent a URL.',
          'Keep summaries short and factual.',
        ].join('\n'),
        input: JSON.stringify({
          location: { city, region, country, countryCode },
          candidates,
        }),
        tools: [
          {
            type: 'web_search',
            search_context_size: 'medium',
            user_location: {
              type: 'approximate',
              ...(city ? { city } : {}),
              ...(region ? { region } : {}),
              ...(countryCode ? { country: countryCode } : {}),
              timezone,
            },
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'health_local_product_availability',
            schema: AVAILABILITY_SCHEMA,
            strict: true,
          },
          verbosity: 'low',
        },
        reasoning: { effort: 'low' },
        max_output_tokens: 2400,
        store: false,
      });
      const parsed = JSON.parse(response.output_text) as {
        items?: HealthMarketAvailability[];
      };
      const byKey = new Map(
        (parsed.items ?? []).map((item) => [item.key, item]),
      );
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: HsakaaAiUsageStatus.SUCCESS,
        startedAt,
        model: response.model || this.model,
        responseId: response.id,
        usage: response.usage,
        metadata: {
          operation: 'health_market_availability',
          candidateCount: candidates.length,
          city: city || null,
          country: country || null,
        },
      });
      return candidates.map(
        (item) =>
          byKey.get(item.key) ?? {
            key: item.key,
            status: 'unverified',
            summary: 'Current local availability could not be verified.',
            sources: [],
          },
      );
    } catch (error) {
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: this.aiUsage.isBudgetExceeded(error)
          ? HsakaaAiUsageStatus.BLOCKED
          : HsakaaAiUsageStatus.FALLBACK,
        startedAt,
        metadata: {
          operation: 'health_market_availability',
          candidateCount: candidates.length,
          city: city || null,
          country: country || null,
        },
        error,
      });
      return candidates.map((item) => ({
        key: item.key,
        status: 'unverified',
        summary:
          'Availability verification was unavailable; verify before buying.',
        sources: [],
      }));
    }
  }

  private text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }
}
