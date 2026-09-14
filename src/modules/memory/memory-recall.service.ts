import { Injectable } from '@nestjs/common';

import { tokenizeUnicodeText } from '../../common/utils/text-search.util';

import { MemoryRecallIntent } from './dto/memory-recall-query.dto';
import { MemoryType, MemoryVerificationStatus } from './schemas/memory.schema';

export interface MemoryRecallCandidate {
  _id: unknown;
  content: string;
  type: MemoryType;
  source?: string;
  tags?: string[];
  categories?: string[];
  entities?: Array<{ name?: string; type?: string }>;
  importance?: number;
  confidence?: number;
  verificationStatus?: MemoryVerificationStatus;
  capturedAt?: Date | string;
  happenedAt?: Date | string;
  createdAt?: Date | string;
}

export interface MemoryRecallPlan {
  query: string;
  intent: MemoryRecallIntent;
  explicitType?: MemoryType;
  inferredType?: MemoryType;
  includeHistorical: boolean;
  tokens: string[];
  exactPhrase?: string;
  recencyHalfLifeDays: number;
}

export interface MemoryRecallScoreBreakdown {
  lexical: number;
  phrase: number;
  metadata: number;
  type: number;
  recency: number;
  importance: number;
  confidence: number;
  verification: number;
}

export interface RankedMemoryRecall<T extends MemoryRecallCandidate> {
  memory: T;
  retrievalScore: number;
  matchedFields: string[];
  scoreBreakdown: MemoryRecallScoreBreakdown;
  effectiveDate?: string;
}

@Injectable()
export class MemoryRecallService {
  buildPlan(input: {
    query?: string;
    intent?: MemoryRecallIntent;
    type?: MemoryType;
    includeHistorical?: boolean;
  }): MemoryRecallPlan {
    const query = input.query?.trim() ?? '';
    const tokens = this.tokenize(query);
    const inferredIntent = input.intent ?? this.inferIntent(query);
    const inferredType = input.type ? undefined : this.inferType(query);
    const historicalLanguage = this.hasHistoricalLanguage(query);

    return {
      query,
      intent: inferredIntent,
      explicitType: input.type,
      inferredType,
      includeHistorical:
        Boolean(input.includeHistorical) ||
        inferredIntent === MemoryRecallIntent.HISTORICAL ||
        historicalLanguage,
      tokens,
      exactPhrase: query.length >= 4 ? query.toLowerCase() : undefined,
      recencyHalfLifeDays:
        inferredIntent === MemoryRecallIntent.RECENT ? 21 : 180,
    };
  }

  rank<T extends MemoryRecallCandidate>(
    memories: T[],
    plan: MemoryRecallPlan,
    limit: number,
  ): Array<RankedMemoryRecall<T>> {
    const safeLimit = Math.min(Math.max(limit, 1), 20);

    return memories
      .map((memory) => this.scoreMemory(memory, plan))
      .sort((first, second) => {
        if (second.retrievalScore !== first.retrievalScore) {
          return second.retrievalScore - first.retrievalScore;
        }

        const secondImportance = second.memory.importance ?? 0.5;
        const firstImportance = first.memory.importance ?? 0.5;
        if (secondImportance !== firstImportance) {
          return secondImportance - firstImportance;
        }

        return this.toTimestamp(second.memory) - this.toTimestamp(first.memory);
      })
      .slice(0, safeLimit);
  }

  private scoreMemory<T extends MemoryRecallCandidate>(
    memory: T,
    plan: MemoryRecallPlan,
  ): RankedMemoryRecall<T> {
    const content = memory.content.toLowerCase();
    const tagText = (memory.tags ?? []).join(' ').toLowerCase();
    const categoryText = (memory.categories ?? []).join(' ').toLowerCase();
    const entityText = (memory.entities ?? [])
      .map((entity) => `${entity.type ?? ''} ${entity.name ?? ''}`)
      .join(' ')
      .toLowerCase();
    const metadataText = [
      memory.type,
      memory.source ?? '',
      tagText,
      categoryText,
      entityText,
    ]
      .join(' ')
      .toLowerCase();

    const contentMatches = plan.tokens.filter((token) =>
      content.includes(token),
    );
    const metadataMatches = plan.tokens.filter((token) =>
      metadataText.includes(token),
    );

    const lexical = plan.tokens.length
      ? contentMatches.length / plan.tokens.length
      : 0;
    const metadata = plan.tokens.length
      ? metadataMatches.length / plan.tokens.length
      : 0;
    const phrase =
      plan.exactPhrase && content.includes(plan.exactPhrase) ? 1 : 0;

    const targetType = plan.explicitType ?? plan.inferredType;
    const type = targetType ? (memory.type === targetType ? 1 : 0) : 0.5;
    const recency = this.getRecencyScore(memory, plan.recencyHalfLifeDays);
    const importance = this.clamp(memory.importance ?? 0.5);
    const confidence = this.clamp(memory.confidence ?? 0.5);
    const verification = this.getVerificationScore(memory.verificationStatus);

    const weights = this.getWeights(plan.intent, plan.tokens.length > 0);
    const retrievalScore = this.clamp(
      lexical * weights.lexical +
        phrase * weights.phrase +
        metadata * weights.metadata +
        type * weights.type +
        recency * weights.recency +
        importance * weights.importance +
        confidence * weights.confidence +
        verification * weights.verification,
    );

    const matchedFields: string[] = [];
    if (contentMatches.length) matchedFields.push('content');
    if (metadataMatches.some((token) => tagText.includes(token))) {
      matchedFields.push('tags');
    }
    if (metadataMatches.some((token) => categoryText.includes(token))) {
      matchedFields.push('categories');
    }
    if (metadataMatches.some((token) => entityText.includes(token))) {
      matchedFields.push('entities');
    }
    if (targetType && memory.type === targetType) matchedFields.push('type');
    if (phrase) matchedFields.push('exact_phrase');
    if (!matchedFields.length && !plan.tokens.length) {
      matchedFields.push(
        plan.intent === MemoryRecallIntent.RECENT ? 'recency' : 'importance',
      );
    }

    return {
      memory,
      retrievalScore: Number(retrievalScore.toFixed(4)),
      matchedFields: [...new Set(matchedFields)],
      scoreBreakdown: {
        lexical: Number(lexical.toFixed(4)),
        phrase: Number(phrase.toFixed(4)),
        metadata: Number(metadata.toFixed(4)),
        type: Number(type.toFixed(4)),
        recency: Number(recency.toFixed(4)),
        importance: Number(importance.toFixed(4)),
        confidence: Number(confidence.toFixed(4)),
        verification: Number(verification.toFixed(4)),
      },
      effectiveDate: this.getEffectiveDate(memory)?.toISOString(),
    };
  }

  private getWeights(intent: MemoryRecallIntent, hasQueryTokens: boolean) {
    if (intent === MemoryRecallIntent.RECENT) {
      return {
        lexical: hasQueryTokens ? 0.27 : 0.05,
        phrase: 0.06,
        metadata: hasQueryTokens ? 0.1 : 0.03,
        type: 0.09,
        recency: 0.28,
        importance: 0.1,
        confidence: 0.05,
        verification: 0.05,
      };
    }

    if (intent === MemoryRecallIntent.IMPORTANT) {
      return {
        lexical: hasQueryTokens ? 0.27 : 0.05,
        phrase: 0.06,
        metadata: hasQueryTokens ? 0.1 : 0.03,
        type: 0.08,
        recency: 0.08,
        importance: 0.25,
        confidence: 0.08,
        verification: 0.08,
      };
    }

    if (intent === MemoryRecallIntent.CURRENT_STATE) {
      return {
        lexical: hasQueryTokens ? 0.3 : 0.05,
        phrase: 0.07,
        metadata: hasQueryTokens ? 0.1 : 0.03,
        type: 0.12,
        recency: 0.14,
        importance: 0.1,
        confidence: 0.08,
        verification: 0.09,
      };
    }

    return {
      lexical: hasQueryTokens ? 0.34 : 0.06,
      phrase: 0.07,
      metadata: hasQueryTokens ? 0.12 : 0.04,
      type: 0.1,
      recency: 0.1,
      importance: 0.11,
      confidence: 0.08,
      verification: 0.08,
    };
  }

  private inferIntent(query: string) {
    const normalized = query.toLowerCase();
    if (this.hasHistoricalLanguage(normalized)) {
      return MemoryRecallIntent.HISTORICAL;
    }
    if (
      /\b(today|recent|recently|latest|this week|last few days)\b/.test(
        normalized,
      )
    ) {
      return MemoryRecallIntent.RECENT;
    }
    if (/\b(current|currently|now|still true|right now)\b/.test(normalized)) {
      return MemoryRecallIntent.CURRENT_STATE;
    }
    if (
      /\b(important|important memories|most important|key memories)\b/.test(
        normalized,
      )
    ) {
      return MemoryRecallIntent.IMPORTANT;
    }
    return MemoryRecallIntent.RELEVANT;
  }

  private inferType(query: string): MemoryType | undefined {
    const normalized = query.toLowerCase();
    const rules: Array<[RegExp, MemoryType]> = [
      [
        /\b(commitment|commitments|committed|promise|promised|agreed to|owe)\b/,
        MemoryType.COMMITMENT,
      ],
      [/\b(goal|goals|target|targets|want to achieve|aim)\b/, MemoryType.GOAL],
      [
        /\b(preference|preferences|prefer|prefers|like|likes|dislike|dislikes)\b/,
        MemoryType.PREFERENCE,
      ],
      [
        /\b(belief|beliefs|believe|believes|working assumption)\b/,
        MemoryType.BELIEF,
      ],
      [
        /\b(lesson|lessons|learned|learnt|takeaway|takeaways)\b/,
        MemoryType.LESSON,
      ],
      [
        /\b(routine|routines|habit|habits|regularly|every day|daily routine)\b/,
        MemoryType.ROUTINE,
      ],
      [
        /\b(unresolved|open question|open questions|unanswered|still need to answer)\b/,
        MemoryType.UNRESOLVED_QUESTION,
      ],
      [/\b(opinion|opinions|viewpoint|viewpoints)\b/, MemoryType.OPINION],
      [
        /\b(relationship|relationships|connected to|connection with)\b/,
        MemoryType.RELATIONSHIP,
      ],
      [
        /\b(project context|project constraint|project constraints|workstream context)\b/,
        MemoryType.PROJECT_CONTEXT,
      ],
      [/\b(event|events|what happened|happened when)\b/, MemoryType.EVENT],
      [/\b(fact|facts|know for sure|confirmed fact)\b/, MemoryType.FACT],
    ];

    return rules.find(([pattern]) => pattern.test(normalized))?.[1];
  }

  private hasHistoricalLanguage(query: string) {
    return /\b(historical|history|old|older|previous|previously|used to|before|changed|superseded|contradicted|archived|expired)\b/i.test(
      query,
    );
  }

  private getRecencyScore(memory: MemoryRecallCandidate, halfLifeDays: number) {
    const effectiveDate = this.getEffectiveDate(memory);
    if (!effectiveDate) return 0.35;

    const ageDays = Math.max(
      0,
      (Date.now() - effectiveDate.getTime()) / (24 * 60 * 60 * 1000),
    );

    return this.clamp(Math.pow(0.5, ageDays / halfLifeDays));
  }

  private getEffectiveDate(memory: MemoryRecallCandidate) {
    const raw = memory.happenedAt ?? memory.capturedAt ?? memory.createdAt;
    if (!raw) return undefined;
    const date = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private toTimestamp(memory: MemoryRecallCandidate) {
    return this.getEffectiveDate(memory)?.getTime() ?? 0;
  }

  private getVerificationScore(status?: MemoryVerificationStatus) {
    switch (status) {
      case MemoryVerificationStatus.CONFIRMED:
        return 1;
      case MemoryVerificationStatus.INFERRED:
        return 0.7;
      case MemoryVerificationStatus.UNVERIFIED:
        return 0.5;
      case MemoryVerificationStatus.DISPUTED:
        return 0.1;
      default:
        return 0.5;
    }
  }

  private tokenize(value: string) {
    const stopWords = new Set([
      'aakash',
      'about',
      'after',
      'again',
      'also',
      'because',
      'does',
      'from',
      'have',
      'hsakaa',
      'into',
      'just',
      'most',
      'remember',
      'remembered',
      'right',
      'that',
      'this',
      'what',
      'when',
      'where',
      'which',
      'with',
      'would',
      'your',
    ]);

    return tokenizeUnicodeText(value, {
      stopWords,
      minimumLength: 2,
    });
  }

  private clamp(value: number) {
    return Math.min(Math.max(value, 0), 1);
  }
}
