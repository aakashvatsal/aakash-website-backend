import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';

import { AiService } from '../ai/ai.service';
import { FundCauseCategory } from './schemas/fund-case.schema';

export type FundContactMethod = 'email' | 'whatsapp' | 'phone' | null;

export interface FundAssessmentContact {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  preferredContactMethod: FundContactMethod;
}

export interface FundAssessmentPayment {
  upi: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  accountHolderName: string | null;
}

export interface FundAssessmentRiskSignal {
  code: string;
  summary: string;
  severity: 'low' | 'medium' | 'high';
}

export interface FundAssessment {
  assistantMessage: string;
  caseConfidence: number;
  evidenceConfidence: number;
  consistency: number;
  requestedAmount: number | null;
  suggestedAmount: number | null;
  causeCategory: FundCauseCategory;
  causeConfidence: number;
  causeSummary: string | null;
  contact: FundAssessmentContact;
  payment: FundAssessmentPayment;
  whyMaySucceed: string[];
  whyMayNot: string[];
  missingVerification: string[];
  riskSignals: FundAssessmentRiskSignal[];
}

export interface FundEvidenceAnalysis {
  summary: string;
  evidenceConfidence: number;
  consistency: number;
  supportsClaims: string[];
  conflicts: string[];
  extractedFacts: string[];
  missingVerification: string[];
  riskSignals: FundAssessmentRiskSignal[];
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

@Injectable()
export class FundAiService {
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
    });
    this.model =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-5.6-sol';
  }

  async assessConversation(params: {
    messages: ConversationMessage[];
    current: {
      caseConfidence: number;
      evidenceConfidence: number;
      consistency: number;
      requestedAmount?: number;
      suggestedAmount?: number;
      causeCategory?: FundCauseCategory;
      causeConfidence?: number;
      causeSummary?: string;
      contact?: FundAssessmentContact;
      payment?: FundAssessmentPayment;
      whyMaySucceed: string[];
      whyMayNot: string[];
      missingVerification: string[];
    };
  }): Promise<FundAssessment> {
    const transcript = params.messages
      .slice(-40)
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n');

    const result =
      await this.aiService.generateStructuredResponse<FundAssessment>({
        name: 'hsakaa_fund_assessment',
        instructions: [
          'You are the assessment layer for HSAKAA Fund, a small human-approved assistance fund in India.',
          'The applicant experience is entirely conversational. Assess the request continuously as facts develop.',
          'A human owner makes every final approval, rejection and payment decision. Never tell the applicant that money has been granted or guaranteed.',
          'caseConfidence is an internal 0 to 100 estimate of whether the request is sufficiently coherent, genuine-looking and verifiable to move to human review. It is not a probability of truth and it must not appear in assistantMessage.',
          'assistantMessage is applicant-facing. Keep it short, direct and conversational: normally 1 sentence, never more than 2 short sentences.',
          'Do not summarize the case back to the applicant. Do not tell them what looks good, what looks bad, what makes the case stronger, or what could prevent approval.',
          'Use assistantMessage only to ask for the single highest-priority fact, clarification, contact detail or evidence needed next. Ask for at most two closely related items when they naturally belong together.',
          'Do not repeat a question, instruction or verification request already asked in the recent transcript unless the applicant answered ambiguously and a clarification is necessary.',
          'When caseConfidence is 60 or higher, prioritize missing full name, phone and preferred contact method. Ask for email only if it is useful and they have one.',
          'When caseConfidence is 70 or higher and contact details are sufficiently complete, you may ask for either UPI or bank details for a possible payment destination. Make clear in a few words that this is not approval.',
          'Keep whyMaySucceed, whyMayNot and missingVerification complete for the private admin dashboard, but never narrate those lists to the applicant.',
          'Never expose confidence scores, fraud scores, duplicate checks, internal risk codes, matching account signals or investigation logic to the applicant.',
          'Treat duplicate-looking identifiers only as investigation signals, never as automatic rejection.',
          'Extract requested and suggested amounts in INR as numbers when known. suggestedAmount should be conservative and may be lower than requestedAmount.',
          'Assign one internal analytics-only causeCategory from: unclassified, medical_health, education_learning, essential_living, livelihood_employment, family_emergency, accessibility_support, tools_equipment, other.',
          'causeCategory is not an eligibility rule and must never influence approval, rejection, caseConfidence or assistantMessage. It exists only so the owner can learn from application patterns later.',
          'Use unclassified when the conversation does not yet contain enough information to categorize the need. Use other only when the situation is clear but does not fit the listed analytics categories.',
          'causeConfidence is 0 to 100 confidence in the internal categorization only. causeSummary is a short neutral internal description of the underlying need, without PII, contact details, payment details or accusation language.',
          'Extract contact and payment details only when the applicant actually supplied them. Do not invent values.',
          'riskSignals are private admin investigation notes. Keep them factual, non-accusatory and specific. Do not repeat raw phone numbers, email addresses, UPI IDs or bank account numbers in riskSignals, whyMaySucceed, whyMayNot or missingVerification.',
          'Use no em dash character in assistantMessage.',
        ].join(' '),
        input: JSON.stringify(
          {
            currentState: params.current,
            transcript,
          },
          null,
          2,
        ),
        schema: this.assessmentSchema(),
        reasoningEffort: 'medium',
        verbosity: 'low',
        maxOutputTokens: 1600,
      });

    return result.data;
  }

  async analyzeEvidence(params: {
    filename: string;
    mimeType: string;
    buffer: Buffer;
    transcript: string;
    requestedAmount?: number;
    suggestedAmount?: number;
  }): Promise<FundEvidenceAnalysis> {
    const uploaded = await this.openai.files.create({
      file: await toFile(params.buffer, params.filename, {
        type: params.mimeType,
      }),
      purpose: 'user_data',
    });

    try {
      const response = await this.openai.responses.create({
        model: this.model,
        instructions: [
          'Analyze this supporting evidence for HSAKAA Fund.',
          'Compare the file against the applicant conversation claims, names, amounts, dates and timeline.',
          'Identify support, conflicts and missing verification without making the final funding decision.',
          'Do not assume a mismatch is fraud. Record it as a factual inconsistency or investigation signal.',
          'Do not use information outside the supplied conversation and file.',
        ].join(' '),
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify(
                  {
                    requestedAmount: params.requestedAmount ?? null,
                    suggestedAmount: params.suggestedAmount ?? null,
                    conversation: params.transcript,
                  },
                  null,
                  2,
                ),
              },
              {
                type: 'input_file',
                file_id: uploaded.id,
                detail: 'auto',
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'hsakaa_fund_evidence_analysis',
            schema: this.evidenceSchema(),
            strict: true,
          },
          verbosity: 'low',
        },
        reasoning: { effort: 'medium' },
        max_output_tokens: 1800,
        store: false,
      });

      if (!response.output_text.trim()) {
        throw new Error('Evidence analysis returned an empty response.');
      }

      return JSON.parse(response.output_text) as FundEvidenceAnalysis;
    } finally {
      await this.openai.files.delete(uploaded.id).catch(() => undefined);
    }
  }

  private assessmentSchema(): Record<string, unknown> {
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'assistantMessage',
        'caseConfidence',
        'evidenceConfidence',
        'consistency',
        'requestedAmount',
        'suggestedAmount',
        'causeCategory',
        'causeConfidence',
        'causeSummary',
        'contact',
        'payment',
        'whyMaySucceed',
        'whyMayNot',
        'missingVerification',
        'riskSignals',
      ],
      properties: {
        assistantMessage: { type: 'string' },
        caseConfidence: { type: 'integer', minimum: 0, maximum: 100 },
        evidenceConfidence: { type: 'integer', minimum: 0, maximum: 100 },
        consistency: { type: 'integer', minimum: 0, maximum: 100 },
        requestedAmount: { type: ['number', 'null'], minimum: 0 },
        suggestedAmount: { type: ['number', 'null'], minimum: 0 },
        causeCategory: {
          type: 'string',
          enum: [
            'unclassified',
            'medical_health',
            'education_learning',
            'essential_living',
            'livelihood_employment',
            'family_emergency',
            'accessibility_support',
            'tools_equipment',
            'other',
          ],
        },
        causeConfidence: { type: 'integer', minimum: 0, maximum: 100 },
        causeSummary: { type: ['string', 'null'] },
        contact: {
          type: 'object',
          additionalProperties: false,
          required: ['fullName', 'phone', 'email', 'preferredContactMethod'],
          properties: {
            fullName: { type: ['string', 'null'] },
            phone: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            preferredContactMethod: {
              type: ['string', 'null'],
              enum: ['email', 'whatsapp', 'phone', null],
            },
          },
        },
        payment: {
          type: 'object',
          additionalProperties: false,
          required: ['upi', 'bankAccount', 'ifsc', 'accountHolderName'],
          properties: {
            upi: { type: ['string', 'null'] },
            bankAccount: { type: ['string', 'null'] },
            ifsc: { type: ['string', 'null'] },
            accountHolderName: { type: ['string', 'null'] },
          },
        },
        whyMaySucceed: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 6,
        },
        whyMayNot: { type: 'array', items: { type: 'string' }, maxItems: 6 },
        missingVerification: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 8,
        },
        riskSignals: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'summary', 'severity'],
            properties: {
              code: { type: 'string' },
              summary: { type: 'string' },
              severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
          },
        },
      },
    };
  }

  private evidenceSchema(): Record<string, unknown> {
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'summary',
        'evidenceConfidence',
        'consistency',
        'supportsClaims',
        'conflicts',
        'extractedFacts',
        'missingVerification',
        'riskSignals',
      ],
      properties: {
        summary: { type: 'string' },
        evidenceConfidence: { type: 'integer', minimum: 0, maximum: 100 },
        consistency: { type: 'integer', minimum: 0, maximum: 100 },
        supportsClaims: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 8,
        },
        conflicts: { type: 'array', items: { type: 'string' }, maxItems: 8 },
        extractedFacts: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 12,
        },
        missingVerification: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 8,
        },
        riskSignals: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'summary', 'severity'],
            properties: {
              code: { type: 'string' },
              summary: { type: 'string' },
              severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
          },
        },
      },
    };
  }
}
