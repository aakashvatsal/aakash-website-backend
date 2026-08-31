/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';

import { AiService } from '../ai/ai.service';
import { AskKnowledgeGraphDto } from './dto/knowledge-graph.dto';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { KnowledgeGraphNodeType } from './schemas/knowledge-graph-node.schema';

type GraphAnswer = {
  answer: string;
  findings: Array<{
    statement: string;
    confidence: 'high' | 'medium' | 'low';
    nodeKeys: string[];
    edgeKeys: string[];
  }>;
  caveats: string[];
  followUps: string[];
};

const ANSWER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'findings', 'caveats', 'followUps'],
  properties: {
    answer: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['statement', 'confidence', 'nodeKeys', 'edgeKeys'],
        properties: {
          statement: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          nodeKeys: { type: 'array', items: { type: 'string' } },
          edgeKeys: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    caveats: { type: 'array', items: { type: 'string' } },
    followUps: { type: 'array', items: { type: 'string' } },
  },
};

@Injectable()
export class KnowledgeGraphReasoningService {
  constructor(
    private readonly graphService: KnowledgeGraphService,
    private readonly aiService: AiService,
  ) {}

  async ask(dto: AskKnowledgeGraphDto) {
    const maxEvidence = dto.maxEvidence ?? 30;
    const evidence = await this.graphService.getEvidenceGraph(
      dto.question,
      maxEvidence,
    );
    const signals = this.buildSignals(evidence);

    if (!evidence.nodes.length) {
      return {
        question: dto.question,
        answer:
          'The Personal Knowledge Graph does not contain enough connected evidence to answer this yet.',
        findings: [],
        caveats: [
          'Run a graph sync after adding relevant Personal OS data, then ask again.',
        ],
        followUps: [],
        evidence: this.toPublicEvidence(evidence),
        ai: null,
        generatedAt: new Date(),
      };
    }

    try {
      const result =
        await this.aiService.generateStructuredResponse<GraphAnswer>({
          name: 'hsakaa_personal_knowledge_graph_answer_v1',
          schema: ANSWER_SCHEMA,
          verbosity: 'medium',
          instructions: [
            "You are HSAKAA reasoning over Aakash's owner-only Personal Knowledge Graph.",
            'Use ONLY the supplied graph nodes, edges, evidence and deterministic signals.',
            'Do not infer private facts that are not represented in the evidence.',
            'Every material finding must cite nodeKeys and/or edgeKeys exactly as supplied.',
            'Prefer temporal and explicit relationships over weak text mentions.',
            'If evidence is incomplete, conflicting, indirect, or merely a text mention, say so clearly.',
            'Do not claim causation from co-occurrence alone. Distinguish influence, mention, association and direct linkage.',
            'Keep the answer concise but useful, with the strongest evidence first.',
          ].join('\n'),
          input: JSON.stringify({
            question: dto.question,
            timeWindow: evidence.timeWindow,
            inferredTypes: evidence.inferredTypes,
            signals,
            nodes: evidence.nodes.map((node: any) => ({
              nodeKey: node.nodeKey,
              type: node.type,
              label: node.label,
              summary: node.summary,
              importance: node.importance,
              occurredAt: node.occurredAt,
              metadata: node.metadata,
            })),
            edges: evidence.edges.map((edge: any) => ({
              edgeKey: edge.edgeKey,
              sourceNodeKey: edge.sourceNodeKey,
              targetNodeKey: edge.targetNodeKey,
              type: edge.type,
              label: edge.label,
              strength: edge.strength,
              occurredAt: edge.occurredAt,
              evidence: edge.evidence,
            })),
          }),
        });

      return {
        question: dto.question,
        ...result.data,
        evidence: this.toPublicEvidence(evidence),
        signals,
        ai: {
          model: result.model,
          responseId: result.responseId,
          usage: result.usage,
        },
        generatedAt: new Date(),
      };
    } catch {
      const fallback = this.fallbackAnswer(dto.question, evidence, signals);
      return {
        question: dto.question,
        ...fallback,
        evidence: this.toPublicEvidence(evidence),
        signals,
        ai: null,
        generatedAt: new Date(),
      };
    }
  }

  private buildSignals(evidence: any) {
    const nodesByKey = new Map<string, any>(
      evidence.nodes.map((node: any) => [node.nodeKey, node]),
    );
    const peopleAroundDecisions = new Map<
      string,
      { nodeKey: string; label: string; decisions: Set<string>; score: number }
    >();
    const companyDecisions = new Map<
      string,
      { nodeKey: string; label: string; decisions: Set<string> }
    >();
    const bookInfluence = new Map<
      string,
      { nodeKey: string; label: string; targets: Set<string> }
    >();

    for (const edge of evidence.edges) {
      const source = nodesByKey.get(edge.sourceNodeKey);
      const target = nodesByKey.get(edge.targetNodeKey);
      if (!source || !target) continue;

      const decision =
        source.type === KnowledgeGraphNodeType.DECISION
          ? source
          : target.type === KnowledgeGraphNodeType.DECISION
            ? target
            : null;
      const person =
        source.type === KnowledgeGraphNodeType.PERSON
          ? source
          : target.type === KnowledgeGraphNodeType.PERSON
            ? target
            : null;
      const company =
        source.type === KnowledgeGraphNodeType.COMPANY
          ? source
          : target.type === KnowledgeGraphNodeType.COMPANY
            ? target
            : null;
      const book =
        source.type === KnowledgeGraphNodeType.BOOK
          ? source
          : target.type === KnowledgeGraphNodeType.BOOK
            ? target
            : null;

      if (decision && person) {
        const current = peopleAroundDecisions.get(person.nodeKey) ?? {
          nodeKey: person.nodeKey,
          label: person.label,
          decisions: new Set<string>(),
          score: 0,
        };
        current.decisions.add(decision.nodeKey);
        current.score += Number(edge.strength ?? 0.5);
        peopleAroundDecisions.set(person.nodeKey, current);
      }

      if (decision && company) {
        const current = companyDecisions.get(company.nodeKey) ?? {
          nodeKey: company.nodeKey,
          label: company.label,
          decisions: new Set<string>(),
        };
        current.decisions.add(decision.nodeKey);
        companyDecisions.set(company.nodeKey, current);
      }

      if (book && edge.type === 'influenced_idea') {
        const other = source.nodeKey === book.nodeKey ? target : source;
        const current = bookInfluence.get(book.nodeKey) ?? {
          nodeKey: book.nodeKey,
          label: book.label,
          targets: new Set<string>(),
        };
        current.targets.add(other.nodeKey);
        bookInfluence.set(book.nodeKey, current);
      }
    }

    return {
      peopleAroundDecisions: [...peopleAroundDecisions.values()]
        .map((item) => ({
          ...item,
          decisionCount: item.decisions.size,
          decisions: [...item.decisions],
        }))
        .sort((a, b) => b.decisionCount - a.decisionCount || b.score - a.score)
        .slice(0, 12),
      companyDecisions: [...companyDecisions.values()]
        .map((item) => ({
          ...item,
          decisionCount: item.decisions.size,
          decisions: [...item.decisions],
        }))
        .sort((a, b) => b.decisionCount - a.decisionCount)
        .slice(0, 12),
      bookInfluence: [...bookInfluence.values()]
        .map((item) => ({
          ...item,
          targetCount: item.targets.size,
          targets: [...item.targets],
        }))
        .sort((a, b) => b.targetCount - a.targetCount)
        .slice(0, 12),
    };
  }

  private fallbackAnswer(
    question: string,
    evidence: any,
    signals: any,
  ): GraphAnswer {
    const findings: GraphAnswer['findings'] = [];

    for (const item of signals.companyDecisions.slice(0, 4)) {
      findings.push({
        statement: `${item.label} is connected to ${item.decisionCount} decision${item.decisionCount === 1 ? '' : 's'} in the current evidence set.`,
        confidence: 'medium',
        nodeKeys: [item.nodeKey, ...item.decisions],
        edgeKeys: [],
      });
    }
    for (const item of signals.peopleAroundDecisions.slice(0, 4)) {
      findings.push({
        statement: `${item.label} appears around ${item.decisionCount} connected decision${item.decisionCount === 1 ? '' : 's'}.`,
        confidence: 'medium',
        nodeKeys: [item.nodeKey, ...item.decisions],
        edgeKeys: [],
      });
    }
    for (const item of signals.bookInfluence.slice(0, 4)) {
      findings.push({
        statement: `${item.label} has ${item.targetCount} explicit reading-to-idea connection${item.targetCount === 1 ? '' : 's'}.`,
        confidence: 'high',
        nodeKeys: [item.nodeKey, ...item.targets],
        edgeKeys: [],
      });
    }

    if (!findings.length) {
      findings.push(
        ...evidence.nodes.slice(0, 5).map((node: any) => ({
          statement: `${node.label} is a relevant ${node.type} node for this question.`,
          confidence: 'low' as const,
          nodeKeys: [node.nodeKey],
          edgeKeys: [],
        })),
      );
    }

    return {
      answer: `I found ${evidence.nodes.length} relevant graph nodes and ${evidence.edges.length} connected relationships for: “${question}”. The strongest grounded patterns are listed below.`,
      findings,
      caveats: [
        'AI synthesis was unavailable, so this response uses deterministic graph signals only.',
      ],
      followUps: [],
    };
  }

  private toPublicEvidence(evidence: any) {
    return {
      timeWindow: evidence.timeWindow,
      inferredTypes: evidence.inferredTypes,
      nodes: evidence.nodes.map((node: any) => ({
        nodeKey: node.nodeKey,
        type: node.type,
        label: node.label,
        summary: node.summary,
        importance: node.importance,
        occurredAt: node.occurredAt,
        sourceCollection: node.sourceCollection,
        sourceId: node.sourceId,
      })),
      edges: evidence.edges.map((edge: any) => ({
        edgeKey: edge.edgeKey,
        sourceNodeKey: edge.sourceNodeKey,
        targetNodeKey: edge.targetNodeKey,
        type: edge.type,
        label: edge.label,
        strength: edge.strength,
        occurredAt: edge.occurredAt,
        evidence: edge.evidence,
      })),
    };
  }
}
