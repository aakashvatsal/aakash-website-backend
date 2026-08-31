import { Injectable } from '@nestjs/common';

import { AiService } from '../ai/ai.service';
import { HsakaaAiUsageService } from '../hsakaa-observability/hsakaa-ai-usage.service';
import {
  HsakaaAiUsageFeature,
  HsakaaAiUsageStatus,
} from '../hsakaa-observability/schemas/hsakaa-ai-usage.schema';
import { KnowledgeGraphNodeType } from '../knowledge-graph/schemas/knowledge-graph-node.schema';
import {
  UniversalSearchMode,
  UniversalSearchSort,
} from '../universal-search/dto/universal-search.dto';
import { UniversalSearchService } from '../universal-search/universal-search.service';
import {
  AnswerWithContextDto,
  AssembleContextDto,
  ContextAssemblyMode,
  ContextPrivacyBoundary,
} from './dto/context-engine.dto';

type SearchResultItem = Awaited<
  ReturnType<UniversalSearchService['search']>
>['results'][number];

type DomainRoute = {
  type: KnowledgeGraphNodeType;
  score: number;
  reason: string;
  explicit: boolean;
};

type RankedEvidence = {
  item: SearchResultItem;
  contextScore: number;
  routeScore: number;
  routeReason: string;
};

type ContextEvidence = {
  citationId: string;
  nodeKey: string;
  type: KnowledgeGraphNodeType;
  label: string;
  summary: string | null;
  snippet: string;
  importance: number;
  privacy: string;
  occurredAt: string | Date | null;
  contextScore: number;
  searchScore: number;
  matchReasons: string[];
  source: SearchResultItem['source'];
  relatedEntities: SearchResultItem['relatedEntities'];
};

type Contradiction = {
  id: string;
  severity: 'low' | 'medium';
  reason: string;
  citationIds: string[];
  labels: string[];
};

type ContextAnswer = {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  citations: string[];
  caveats: string[];
  contradictions: Array<{
    contradictionId: string;
    handling: string;
  }>;
  followUps: string[];
};

const DEFAULT_CONTEXT_BUDGET = 18_000;
const DEFAULT_MAX_EVIDENCE = 24;
const MAX_SEARCH_CANDIDATES = 100;

const ANSWER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'answer',
    'confidence',
    'citations',
    'caveats',
    'contradictions',
    'followUps',
  ],
  properties: {
    answer: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    citations: { type: 'array', items: { type: 'string' } },
    caveats: { type: 'array', items: { type: 'string' } },
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['contradictionId', 'handling'],
        properties: {
          contradictionId: { type: 'string' },
          handling: { type: 'string' },
        },
      },
    },
    followUps: { type: 'array', items: { type: 'string' } },
  },
};

const DOMAIN_TERMS: Record<KnowledgeGraphNodeType, string[]> = {
  [KnowledgeGraphNodeType.PERSON]: [
    'person',
    'people',
    'who',
    'relationship',
    'contact',
    'spoke',
    'conversation',
    'meeting',
    'friend',
    'founder',
  ],
  [KnowledgeGraphNodeType.COMPANY]: [
    'company',
    'business',
    'startup',
    '8lete',
    'frayto',
    'product',
    'customer',
    'sales',
    'gtm',
    'market',
  ],
  [KnowledgeGraphNodeType.DECISION]: [
    'decision',
    'decide',
    'decided',
    'choice',
    'tradeoff',
    'why',
    'changed',
    'priority',
  ],
  [KnowledgeGraphNodeType.JOURNAL]: [
    'journal',
    'reflection',
    'felt',
    'feeling',
    'learned',
    'lesson',
    'today',
    'yesterday',
    'week',
    'month',
  ],
  [KnowledgeGraphNodeType.MEMORY]: [
    'memory',
    'remember',
    'principle',
    'belief',
    'preference',
    'pattern',
    'know about me',
  ],
  [KnowledgeGraphNodeType.BOOK]: [
    'book',
    'reading',
    'read',
    'author',
    'library',
    'influenced',
  ],
  [KnowledgeGraphNodeType.HIGHLIGHT]: [
    'highlight',
    'quote',
    'note',
    'passage',
    'idea from',
  ],
  [KnowledgeGraphNodeType.HEALTH]: [
    'health',
    'sleep',
    'workout',
    'training',
    'run',
    'gym',
    'diet',
    'supplement',
    'pain',
    'whoop',
    'recovery',
  ],
  [KnowledgeGraphNodeType.MEDIA]: [
    'media',
    'content',
    'post',
    'linkedin',
    'instagram',
    'youtube',
    'audience',
    'caption',
    'video',
  ],
  [KnowledgeGraphNodeType.TASK]: [
    'task',
    'todo',
    'commitment',
    'deadline',
    'overdue',
    'deferred',
    'next action',
    'plan',
    'pending',
  ],
};

@Injectable()
export class ContextEngineService {
  constructor(
    private readonly searchService: UniversalSearchService,
    private readonly aiService: AiService,
    private readonly aiUsage: HsakaaAiUsageService,
  ) {}

  async assemble(dto: AssembleContextDto) {
    const boundary = dto.boundary ?? ContextPrivacyBoundary.PRIVATE;
    const mode = dto.mode ?? ContextAssemblyMode.BALANCED;
    const maxEvidence = dto.maxEvidence ?? DEFAULT_MAX_EVIDENCE;
    const contextBudgetChars =
      dto.contextBudgetChars ??
      (mode === ContextAssemblyMode.COMPACT ? 9_000 : DEFAULT_CONTEXT_BUDGET);
    const routes = this.routeQuestion(dto.question, dto.types);
    const selectedTypes = routes.map((route) => route.type);
    const candidateLimit = Math.min(
      MAX_SEARCH_CANDIDATES,
      Math.max(maxEvidence * 3, 30),
    );

    const search = await this.searchService.search({
      q: dto.question,
      mode: UniversalSearchMode.HYBRID,
      sort: UniversalSearchSort.RELEVANCE,
      types: selectedTypes,
      from: dto.from,
      to: dto.to,
      limit: candidateLimit,
      offset: 0,
    });

    const privacyFiltered = search.results.filter((item) =>
      this.allowedByBoundary(item.privacy, boundary),
    );
    const ranked = this.rankEvidence(privacyFiltered, routes, mode);
    const deduped = this.dedupe(ranked);
    const balanced = this.balanceDomains(deduped, routes, maxEvidence);
    const packed = this.packContext(
      dto.question,
      balanced,
      contextBudgetChars,
      maxEvidence,
    );
    const contradictions = this.detectContradictions(packed.evidence);
    const coverage = this.coverage(routes, packed.evidence);
    const confidence = this.contextConfidence(
      packed.evidence,
      contradictions,
      coverage,
    );

    return {
      question: dto.question,
      boundary,
      mode,
      routing: {
        selectedTypes,
        domains: routes,
        automatic: !dto.types?.length,
      },
      retrieval: {
        semantic: search.semantic,
        candidates: search.results.length,
        privacyEligible: privacyFiltered.length,
        afterDeduplication: deduped.length,
        selectedEvidence: packed.evidence.length,
        omittedByBudget: packed.omittedByBudget,
        omittedByLimit: Math.max(0, deduped.length - balanced.length),
      },
      budget: {
        maxChars: contextBudgetChars,
        usedChars: packed.context.length,
        remainingChars: Math.max(0, contextBudgetChars - packed.context.length),
        estimatedTokens: Math.ceil(packed.context.length / 4),
        utilization: Number(
          (packed.context.length / contextBudgetChars).toFixed(4),
        ),
      },
      coverage,
      confidence,
      contradictions,
      evidence: packed.evidence,
      context: packed.context,
      instruction: this.buildInstruction(boundary, contradictions),
      generatedAt: new Date(),
    };
  }

  async answer(dto: AnswerWithContextDto) {
    const packet = await this.assemble(dto);
    if (!packet.evidence.length) {
      return {
        ...packet,
        answer: {
          answer:
            'The Unified Context Engine could not find enough eligible Personal OS evidence to answer this question.',
          confidence: 'low' as const,
          citations: [],
          caveats: [
            'Add or sync relevant Personal OS data, or broaden the selected domains and time range.',
          ],
          contradictions: [],
          followUps: [],
        },
        ai: null,
      };
    }

    const aiStartedAt = Date.now();
    try {
      await this.aiUsage.assertBudget(HsakaaAiUsageFeature.CONTEXT_ANSWER);
      const result =
        await this.aiService.generateStructuredResponse<ContextAnswer>({
          name: 'hsakaa_unified_context_answer_v1',
          schema: ANSWER_SCHEMA,
          verbosity: 'medium',
          instructions: [
            'You are HSAKAA answering through the Unified Personal OS Context Engine.',
            'Use ONLY the supplied context packet. Never add personal facts from model memory or assumptions.',
            'Every material factual claim must cite one or more supplied evidence IDs such as E1 or E4.',
            'Use only citation IDs that exist in the packet. Do not invent citations.',
            'If the packet marks contradictions, acknowledge them and do not silently choose a side unless the evidence clearly resolves the conflict.',
            'Distinguish direct evidence from association. Do not claim causation from co-occurrence or graph proximity alone.',
            'Respect the supplied privacy boundary. Public-safe answers must never imply omitted owner-only evidence.',
            'If evidence is thin, stale, indirect, or incomplete, lower confidence and say what is missing.',
            dto.answerStyle?.trim()
              ? `Requested answer style: ${dto.answerStyle.trim()}`
              : 'Prefer a concise, useful answer with the strongest evidence first.',
          ].join('\n'),
          input: JSON.stringify({
            question: packet.question,
            boundary: packet.boundary,
            mode: packet.mode,
            routing: packet.routing,
            confidenceBeforeGeneration: packet.confidence,
            contradictions: packet.contradictions,
            evidence: packet.evidence,
            context: packet.context,
          }),
        });

      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.CONTEXT_ANSWER,
        status: HsakaaAiUsageStatus.SUCCESS,
        startedAt: aiStartedAt,
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
        metadata: {
          boundary: packet.boundary,
          mode: packet.mode,
          evidenceCount: packet.evidence.length,
        },
      });

      return {
        ...packet,
        answer: this.sanitizeAnswer(result.data, packet),
        ai: {
          model: result.model,
          responseId: result.responseId,
          usage: result.usage,
        },
      };
    } catch (error) {
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.CONTEXT_ANSWER,
        status: this.aiUsage.isBudgetExceeded(error)
          ? HsakaaAiUsageStatus.BLOCKED
          : HsakaaAiUsageStatus.FALLBACK,
        startedAt: aiStartedAt,
        metadata: {
          boundary: packet.boundary,
          mode: packet.mode,
          evidenceCount: packet.evidence.length,
        },
        error,
      });
      return {
        ...packet,
        answer: this.fallbackAnswer(packet),
        ai: null,
        aiError: this.errorMessage(error),
      };
    }
  }

  getPolicy() {
    return {
      version: 'phase-10-v1',
      canonicalAssembler: true,
      boundaries: {
        private: 'May use owner_only and public_safe graph evidence.',
        public: 'May use only public_safe graph evidence.',
      },
      defaults: {
        mode: ContextAssemblyMode.BALANCED,
        boundary: ContextPrivacyBoundary.PRIVATE,
        maxEvidence: DEFAULT_MAX_EVIDENCE,
        contextBudgetChars: DEFAULT_CONTEXT_BUDGET,
      },
      scoring: {
        balanced:
          'search relevance + importance + recency + graph relationship + domain routing',
        fresh: 'increases recency weight',
        authoritative: 'increases importance and exact/lexical evidence weight',
        compact: 'uses a smaller default context budget',
      },
      safeguards: [
        'hard context character budget',
        'domain routing before retrieval',
        'privacy filtering before context packing',
        'cross-domain evidence balancing',
        'near-duplicate evidence removal',
        'potential contradiction surfacing',
        'source attribution for every evidence block',
        'citation-only grounded answer instruction',
      ],
    };
  }

  private routeQuestion(
    question: string,
    explicitTypes?: KnowledgeGraphNodeType[],
  ): DomainRoute[] {
    if (explicitTypes?.length) {
      return [...new Set(explicitTypes)].map((type) => ({
        type,
        score: 1,
        reason: 'Explicitly selected by the caller.',
        explicit: true,
      }));
    }

    const normalized = this.normalize(question);
    const tokens = new Set(normalized.split(/\s+/).filter(Boolean));
    const broadQuestion =
      /\b(across|everything|overall|personal os|whole|all areas)\b/.test(
        normalized,
      );
    const scored = Object.values(KnowledgeGraphNodeType).map((type) => {
      const matches = DOMAIN_TERMS[type].filter((term) =>
        term.includes(' ')
          ? normalized.includes(term)
          : tokens.has(this.normalize(term)),
      );
      const score = matches.length
        ? Math.min(1, 0.45 + matches.length * 0.16)
        : broadQuestion
          ? 0.42
          : 0;
      return {
        type,
        score,
        reason: matches.length
          ? `Question signal${matches.length === 1 ? '' : 's'}: ${matches.slice(0, 4).join(', ')}.`
          : broadQuestion
            ? 'Broad cross-domain question.'
            : '',
        explicit: false,
      };
    });

    const matched = scored
      .filter((route) => route.score > 0)
      .sort((a, b) => b.score - a.score);
    if (matched.length) {
      const topScore = matched[0].score;
      return matched
        .filter((route, index) => index < 5 && route.score >= topScore - 0.35)
        .map((route) => ({
          ...route,
          score: Number(route.score.toFixed(4)),
        }));
    }

    return [
      KnowledgeGraphNodeType.MEMORY,
      KnowledgeGraphNodeType.JOURNAL,
      KnowledgeGraphNodeType.DECISION,
      KnowledgeGraphNodeType.COMPANY,
      KnowledgeGraphNodeType.TASK,
    ].map((type, index) => ({
      type,
      score: Number((0.6 - index * 0.05).toFixed(4)),
      reason: 'Default Personal OS reasoning domain.',
      explicit: false,
    }));
  }

  private rankEvidence(
    items: SearchResultItem[],
    routes: DomainRoute[],
    mode: ContextAssemblyMode,
  ) {
    const routeByType = new Map(routes.map((route) => [route.type, route]));
    return items
      .map((item): RankedEvidence => {
        const route = routeByType.get(item.type);
        const routeScore = route?.score ?? 0.25;
        const parts = item.scoreBreakdown;
        const weights = this.modeWeights(mode);
        const contextScore =
          item.score * weights.search +
          item.importance * weights.importance +
          parts.recency * weights.recency +
          parts.relationship * weights.relationship +
          routeScore * weights.routing;
        return {
          item,
          contextScore: this.clamp(contextScore),
          routeScore,
          routeReason: route?.reason ?? 'Retrieved as related evidence.',
        };
      })
      .sort((a, b) => b.contextScore - a.contextScore);
  }

  private modeWeights(mode: ContextAssemblyMode) {
    if (mode === ContextAssemblyMode.FRESH) {
      return {
        search: 0.4,
        importance: 0.12,
        recency: 0.25,
        relationship: 0.08,
        routing: 0.15,
      };
    }
    if (mode === ContextAssemblyMode.AUTHORITATIVE) {
      return {
        search: 0.46,
        importance: 0.24,
        recency: 0.07,
        relationship: 0.08,
        routing: 0.15,
      };
    }
    return {
      search: 0.44,
      importance: 0.17,
      recency: 0.12,
      relationship: 0.1,
      routing: 0.17,
    };
  }

  private dedupe(items: RankedEvidence[]) {
    const nodeKeys = new Set<string>();
    const fingerprints = new Set<string>();
    const result: RankedEvidence[] = [];
    for (const ranked of items) {
      if (nodeKeys.has(ranked.item.nodeKey)) continue;
      const fingerprint = this.evidenceFingerprint(ranked.item);
      if (fingerprints.has(fingerprint)) continue;
      nodeKeys.add(ranked.item.nodeKey);
      fingerprints.add(fingerprint);
      result.push(ranked);
    }
    return result;
  }

  private balanceDomains(
    items: RankedEvidence[],
    routes: DomainRoute[],
    maxEvidence: number,
  ) {
    if (!items.length) return [];
    const routeOrder = routes.map((route) => route.type);
    const buckets = new Map<KnowledgeGraphNodeType, RankedEvidence[]>();
    for (const item of items) {
      const bucket = buckets.get(item.item.type) ?? [];
      bucket.push(item);
      buckets.set(item.item.type, bucket);
    }

    const selected: RankedEvidence[] = [];
    const used = new Set<string>();
    let cursor = 0;
    while (selected.length < Math.min(maxEvidence, items.length)) {
      let added = false;
      for (const type of routeOrder) {
        const bucket = buckets.get(type) ?? [];
        const candidate = bucket[cursor];
        if (!candidate || used.has(candidate.item.nodeKey)) continue;
        selected.push(candidate);
        used.add(candidate.item.nodeKey);
        added = true;
        if (selected.length >= maxEvidence) break;
      }
      cursor += 1;
      if (!added || cursor > maxEvidence) break;
    }

    if (selected.length < maxEvidence) {
      for (const item of items) {
        if (used.has(item.item.nodeKey)) continue;
        selected.push(item);
        used.add(item.item.nodeKey);
        if (selected.length >= maxEvidence) break;
      }
    }
    return selected;
  }

  private packContext(
    question: string,
    ranked: RankedEvidence[],
    budget: number,
    maxEvidence: number,
  ) {
    const evidence: ContextEvidence[] = [];
    const blocks: string[] = [];
    const header = `QUESTION\n${question}\n\nEVIDENCE`;
    let used = header.length;
    let omittedByBudget = 0;

    for (const rankedItem of ranked.slice(0, maxEvidence)) {
      const citationId = `E${evidence.length + 1}`;
      const item = rankedItem.item;
      const evidenceItem: ContextEvidence = {
        citationId,
        nodeKey: item.nodeKey,
        type: item.type,
        label: item.label,
        summary: item.summary,
        snippet: item.snippet,
        importance: item.importance,
        privacy: item.privacy,
        occurredAt: item.occurredAt,
        contextScore: Number(rankedItem.contextScore.toFixed(6)),
        searchScore: item.score,
        matchReasons: item.matchReasons,
        source: item.source,
        relatedEntities: item.relatedEntities,
      };
      const block = this.evidenceBlock(evidenceItem, rankedItem.routeReason);
      if (used + block.length + 2 > budget) {
        omittedByBudget += 1;
        continue;
      }
      evidence.push(evidenceItem);
      blocks.push(block);
      used += block.length + 2;
    }

    return {
      evidence,
      context: `${header}\n\n${blocks.join('\n\n')}`.slice(0, budget),
      omittedByBudget,
    };
  }

  private evidenceBlock(item: ContextEvidence, routeReason: string) {
    const related = item.relatedEntities
      .slice(0, 4)
      .map((entity) => `${entity.relationship}: ${entity.label}`)
      .join('; ');
    return [
      `[${item.citationId}] ${item.type.toUpperCase()} — ${item.label}`,
      item.summary ? `Summary: ${this.truncate(item.summary, 900)}` : null,
      item.snippet && item.snippet !== item.summary
        ? `Preview: ${this.truncate(item.snippet, 700)}`
        : null,
      item.occurredAt
        ? `Occurred: ${new Date(item.occurredAt).toISOString()}`
        : null,
      `Importance: ${item.importance.toFixed(2)} | Context score: ${item.contextScore.toFixed(3)}`,
      `Source: ${item.source.collection}/${item.source.id}`,
      `Routing: ${routeReason}`,
      related ? `Related: ${related}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private detectContradictions(evidence: ContextEvidence[]) {
    const contradictions: Contradiction[] = [];
    for (let firstIndex = 0; firstIndex < evidence.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < evidence.length;
        secondIndex += 1
      ) {
        const first = evidence[firstIndex];
        const second = evidence[secondIndex];
        if (first.type !== second.type) continue;
        const similarity = this.topicSimilarity(first, second);
        if (similarity < 0.48) continue;
        const polarityConflict =
          this.hasNegation(this.evidenceText(first)) !==
          this.hasNegation(this.evidenceText(second));
        const numberConflict = this.hasNumericConflict(first, second);
        if (!polarityConflict && !numberConflict) continue;
        contradictions.push({
          id: `C${contradictions.length + 1}`,
          severity: numberConflict && polarityConflict ? 'medium' : 'low',
          reason: numberConflict
            ? polarityConflict
              ? 'Closely related evidence differs in both polarity and numeric details.'
              : 'Closely related evidence contains different numeric details that may reflect a change over time or a conflict.'
            : 'Closely related evidence uses opposing affirmative/negative language and may need temporal or source reconciliation.',
          citationIds: [first.citationId, second.citationId],
          labels: [first.label, second.label],
        });
        if (contradictions.length >= 8) return contradictions;
      }
    }
    return contradictions;
  }

  private topicSimilarity(first: ContextEvidence, second: ContextEvidence) {
    const firstTokens = this.topicTokens(
      `${first.label} ${first.summary ?? ''}`,
    );
    const secondTokens = this.topicTokens(
      `${second.label} ${second.summary ?? ''}`,
    );
    if (!firstTokens.size || !secondTokens.size) return 0;
    const intersection = [...firstTokens].filter((token) =>
      secondTokens.has(token),
    ).length;
    const union = new Set([...firstTokens, ...secondTokens]).size;
    return union ? intersection / union : 0;
  }

  private topicTokens(value: string) {
    const stop = new Set([
      'the',
      'and',
      'for',
      'with',
      'that',
      'this',
      'from',
      'was',
      'were',
      'are',
      'has',
      'have',
      'had',
      'about',
      'into',
      'your',
    ]);
    return new Set(
      this.normalize(value)
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !stop.has(token)),
    );
  }

  private hasNegation(value: string) {
    return /\b(no|not|never|without|cannot|can't|didn't|doesn't|won't|failed|stopped|declined)\b/i.test(
      value,
    );
  }

  private hasNumericConflict(first: ContextEvidence, second: ContextEvidence) {
    const firstNumbers = this.numbers(this.evidenceText(first));
    const secondNumbers = this.numbers(this.evidenceText(second));
    if (!firstNumbers.length || !secondNumbers.length) return false;
    const shared = firstNumbers.some((number) =>
      secondNumbers.some((other) => Math.abs(number - other) < 0.0001),
    );
    return !shared;
  }

  private numbers(value: string) {
    return [...value.matchAll(/\b\d+(?:\.\d+)?\b/g)]
      .map((match) => Number(match[0]))
      .filter(Number.isFinite)
      .slice(0, 12);
  }

  private coverage(routes: DomainRoute[], evidence: ContextEvidence[]) {
    const evidenceTypes = new Set(evidence.map((item) => item.type));
    const covered = routes.filter((route) => evidenceTypes.has(route.type));
    return {
      requestedDomains: routes.length,
      coveredDomains: covered.length,
      ratio: routes.length
        ? Number((covered.length / routes.length).toFixed(4))
        : 0,
      missingDomains: routes
        .filter((route) => !evidenceTypes.has(route.type))
        .map((route) => route.type),
    };
  }

  private contextConfidence(
    evidence: ContextEvidence[],
    contradictions: Contradiction[],
    coverage: { ratio: number },
  ) {
    if (!evidence.length) return 'low' as const;
    const averageScore =
      evidence.reduce((sum, item) => sum + item.contextScore, 0) /
      evidence.length;
    const contradictionPenalty = Math.min(0.25, contradictions.length * 0.05);
    const score =
      averageScore * 0.55 +
      Math.min(1, evidence.length / 10) * 0.2 +
      coverage.ratio * 0.25 -
      contradictionPenalty;
    if (score >= 0.72) return 'high' as const;
    if (score >= 0.48) return 'medium' as const;
    return 'low' as const;
  }

  private buildInstruction(
    boundary: ContextPrivacyBoundary,
    contradictions: Contradiction[],
  ) {
    return [
      'Answer using only the evidence blocks in this context packet.',
      'Cite material claims with their [E#] evidence IDs.',
      'Do not infer causation from related-entity links alone.',
      contradictions.length
        ? 'Potential contradictions are present; acknowledge them instead of silently resolving them.'
        : 'No deterministic contradiction signal was found, but still state uncertainty where evidence is indirect.',
      boundary === ContextPrivacyBoundary.PUBLIC
        ? 'This is a public-safe context boundary. Do not imply or reference private evidence that is not present.'
        : 'This is an owner-only private context boundary.',
    ].join(' ');
  }

  private allowedByBoundary(privacy: string, boundary: ContextPrivacyBoundary) {
    if (boundary === ContextPrivacyBoundary.PRIVATE) return true;
    return privacy === 'public_safe';
  }

  private sanitizeAnswer(
    answer: ContextAnswer,
    packet: Awaited<ReturnType<ContextEngineService['assemble']>>,
  ) {
    const validCitations = new Set(
      packet.evidence.map((evidence) => evidence.citationId),
    );
    const validContradictions = new Set(
      packet.contradictions.map((contradiction) => contradiction.id),
    );
    return {
      ...answer,
      citations: [...new Set(answer.citations)].filter((citation) =>
        validCitations.has(citation),
      ),
      contradictions: answer.contradictions.filter((item) =>
        validContradictions.has(item.contradictionId),
      ),
    };
  }

  private fallbackAnswer(
    packet: Awaited<ReturnType<ContextEngineService['assemble']>>,
  ): ContextAnswer {
    const top = packet.evidence.slice(0, 5);
    return {
      answer: top.length
        ? `The strongest available context is: ${top
            .map((item) => `${item.label} [${item.citationId}]`)
            .join(
              '; ',
            )}. The AI synthesis step was unavailable, so this is an evidence-first fallback rather than a generated conclusion.`
        : 'No eligible evidence was available.',
      confidence: packet.confidence,
      citations: top.map((item) => item.citationId),
      caveats: [
        'AI synthesis was unavailable; review the cited evidence directly.',
      ],
      contradictions: packet.contradictions.map((item) => ({
        contradictionId: item.id,
        handling: item.reason,
      })),
      followUps: [],
    };
  }

  private evidenceFingerprint(item: SearchResultItem) {
    return this.normalize(
      `${item.type}|${item.label}|${item.summary ?? item.snippet}`,
    ).slice(0, 1200);
  }

  private evidenceText(item: ContextEvidence) {
    return `${item.label} ${item.summary ?? ''} ${item.snippet}`;
  }

  private normalize(value: string) {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private truncate(value: string, max: number) {
    return value.length <= max
      ? value
      : `${value.slice(0, max - 1).trimEnd()}…`;
  }

  private clamp(value: number) {
    return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
