import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { HealthPhotoCategory } from './schemas/health-progress-photo.schema';

export const HEALTH_PHOTO_ANALYSIS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'observations',
    'improvementOpportunities',
    'safetyFlags',
    'comparisonGuidance',
    'comparison',
  ],
  properties: {
    summary: { type: 'string' },
    observations: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 8,
    },
    improvementOpportunities: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 8,
    },
    safetyFlags: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 6,
    },
    comparisonGuidance: { type: 'string' },
    comparison: {
      type: 'object',
      additionalProperties: false,
      required: [
        'hasPrevious',
        'comparedToPhotoId',
        'changeSummary',
        'visibleChanges',
        'consistencyNotes',
        'confidence',
      ],
      properties: {
        hasPrevious: { type: 'boolean' },
        comparedToPhotoId: { type: 'string' },
        changeSummary: { type: 'string' },
        visibleChanges: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 8,
        },
        consistencyNotes: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 6,
        },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
    },
  },
};

export const HEALTH_SOURCE_REPORT_ANALYSIS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'findings',
    'measurements',
    'structuredMeasurements',
    'planningImplications',
    'professionalInstructions',
    'safetyFlags',
    'followUpTests',
  ],
  properties: {
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    measurements: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    structuredMeasurements: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'value', 'unit', 'referenceRange', 'flag'],
        properties: {
          name: { type: 'string' },
          value: { type: 'string' },
          unit: { type: 'string' },
          referenceRange: { type: 'string' },
          flag: { type: 'string', enum: ['low', 'normal', 'high', 'unknown'] },
        },
      },
    },
    planningImplications: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 10,
    },
    professionalInstructions: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 10,
    },
    safetyFlags: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    followUpTests: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'testName',
          'timingText',
          'explicitDate',
          'intervalValue',
          'intervalUnit',
          'reason',
        ],
        properties: {
          testName: { type: 'string' },
          timingText: { type: 'string' },
          explicitDate: { type: 'string' },
          intervalValue: { type: 'number', minimum: 0, maximum: 120 },
          intervalUnit: {
            type: 'string',
            enum: ['days', 'weeks', 'months', 'unknown'],
          },
          reason: { type: 'string' },
        },
      },
    },
  },
};

export type HealthSourceReportAnalysisResult = {
  summary: string;
  findings: string[];
  measurements: string[];
  structuredMeasurements: Array<{
    name: string;
    value: string;
    unit: string;
    referenceRange: string;
    flag: 'low' | 'normal' | 'high' | 'unknown';
  }>;
  planningImplications: string[];
  professionalInstructions: string[];
  safetyFlags: string[];
  followUpTests: Array<{
    testName: string;
    timingText: string;
    explicitDate: string;
    intervalValue: number;
    intervalUnit: 'days' | 'weeks' | 'months' | 'unknown';
    reason: string;
  }>;
};

export type HealthPhotoAnalysisResult = {
  summary: string;
  observations: string[];
  improvementOpportunities: string[];
  safetyFlags: string[];
  comparisonGuidance: string;
  comparison: {
    hasPrevious: boolean;
    comparedToPhotoId: string;
    changeSummary: string;
    visibleChanges: string[];
    consistencyNotes: string[];
    confidence: 'low' | 'medium' | 'high';
  };
};

@Injectable()
export class HealthVisionService {
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });
    this.model = this.config.get<string>('OPENAI_MODEL') || 'gpt-5.6-sol';
  }

  async analyzePhoto(input: {
    category: HealthPhotoCategory;
    angle: string;
    mimeType: string;
    data: Buffer;
    baselineContext: string;
    previous?: {
      id: string;
      takenAt: Date;
      mimeType: string;
      data: Buffer;
    } | null;
  }): Promise<{
    data: HealthPhotoAnalysisResult;
    model: string;
    responseId: string;
    usage: unknown;
  }> {
    const categoryRules = this.categoryRules(input.category);
    const imageUrl = `data:${input.mimeType};base64,${input.data.toString('base64')}`;
    const previousImageUrl = input.previous
      ? `data:${input.previous.mimeType};base64,${input.previous.data.toString('base64')}`
      : null;

    const response = await this.openai.responses.create({
      model: this.model,
      instructions: [
        'You are HSAKAA reviewing a private owner-only progress photo for longitudinal wellbeing tracking.',
        'Describe only visible, non-diagnostic observations. Never identify a disease or make a medical diagnosis from an image.',
        'Do not infer age, ethnicity, attractiveness, personality, hormones, or medical conditions from appearance.',
        'Improvement opportunities must be conservative routine/tracking suggestions, not prescriptions.',
        'If something visibly concerning could warrant professional evaluation, state that as a safety flag without diagnosing it.',
        'Use the supplied baseline only as context. Do not invent facts that are not visible or recorded.',
        'When a previous same-angle checkpoint is supplied, compare only visible repeatable changes and explicitly account for lighting, distance, pose and grooming differences. Never claim a biological cause from the comparison.',
        categoryRules,
      ].join('\n'),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                category: input.category,
                angle: input.angle,
                baselineContext: input.baselineContext,
              }),
            },
            ...(previousImageUrl
              ? [
                  {
                    type: 'input_text' as const,
                    text: JSON.stringify({
                      previousCheckpoint: {
                        id: input.previous?.id ?? '',
                        takenAt: input.previous?.takenAt ?? null,
                      },
                    }),
                  },
                  {
                    type: 'input_image' as const,
                    image_url: previousImageUrl,
                    detail: 'high' as const,
                  },
                ]
              : []),
            {
              type: 'input_text',
              text: 'Current checkpoint follows.',
            },
            {
              type: 'input_image',
              image_url: imageUrl,
              detail: 'high',
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'hsakaa_health_progress_photo_analysis',
          schema: HEALTH_PHOTO_ANALYSIS_SCHEMA,
          strict: true,
        },
        verbosity: 'low',
      },
      reasoning: { effort: 'low' },
      max_output_tokens: 2400,
      store: false,
    });

    if (response.status && response.status !== 'completed') {
      throw new Error(
        `Health photo analysis did not complete: ${
          response.incomplete_details?.reason ?? response.status
        }. responseId=${response.id}`,
      );
    }

    const raw = response.output_text.trim();
    if (!raw) {
      throw new Error(
        `Health photo analysis was empty. responseId=${response.id}`,
      );
    }

    return {
      data: JSON.parse(raw) as HealthPhotoAnalysisResult,
      model: response.model || this.model,
      responseId: response.id,
      usage: response.usage ?? null,
    };
  }

  async analyzeSourceReport(input: {
    label: string;
    mimeType: string;
    filename: string;
    data: Buffer;
    baselineContext: string;
    previous?: {
      id: string;
      takenAt: Date;
      mimeType: string;
      data: Buffer;
    } | null;
  }): Promise<{
    data: HealthSourceReportAnalysisResult;
    model: string;
    responseId: string;
    usage: unknown;
  }> {
    const base64 = input.data.toString('base64');
    const documentContent =
      input.mimeType === 'application/pdf'
        ? {
            type: 'input_file' as const,
            filename: input.filename,
            file_data: `data:${input.mimeType};base64,${base64}`,
            detail: 'high' as const,
          }
        : {
            type: 'input_image' as const,
            image_url: `data:${input.mimeType};base64,${base64}`,
            detail: 'high' as const,
          };

    const response = await this.openai.responses.create({
      model: this.model,
      instructions: [
        'You are HSAKAA extracting planning evidence from a private owner-only health report.',
        'Summarize what the report explicitly states. Do not invent missing values and do not diagnose new conditions.',
        'Preserve numeric measurements, units, dates and reference ranges when clearly present.',
        'For each clearly readable numeric lab/measurement value, also populate structuredMeasurements. Keep value and referenceRange as the exact compact strings shown in the report; use flag=unknown if the report does not clearly mark or support low/normal/high.',
        'Professional instructions should only repeat or conservatively paraphrase instructions that are actually written in the report.',
        'Planning implications may explain how explicitly documented findings should constrain routine health planning, but must not change medication or medically significant supplement doses.',
        'If the report contains a finding that clearly calls for clinician follow-up, put that in safetyFlags without independently diagnosing anything.',
        'Extract repeat-test/recheck/follow-up timing into followUpTests ONLY when the report or clinician instruction explicitly states it. Never infer a retest interval from an abnormal value, guideline knowledge, or model memory.',
        'For an explicit calendar date, set explicitDate to YYYY-MM-DD and intervalValue=0, intervalUnit=unknown. For an explicit interval such as repeat in 3 months, keep explicitDate empty and set intervalValue + intervalUnit. If a follow-up is requested but no timing is stated, set both date/interval empty or zero/unknown so the owner can confirm timing.',
        'The output is evidence extraction for longitudinal planning, not medical advice.',
      ].join('\n'),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                label: input.label,
                filename: input.filename,
                baselineContext: input.baselineContext,
              }),
            },
            documentContent,
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'hsakaa_health_source_report_analysis',
          schema: HEALTH_SOURCE_REPORT_ANALYSIS_SCHEMA,
          strict: true,
        },
        verbosity: 'low',
      },
      reasoning: { effort: 'low' },
      max_output_tokens: 3200,
      store: false,
    });

    if (response.status && response.status !== 'completed') {
      throw new Error(
        `Health source report analysis did not complete: ${
          response.incomplete_details?.reason ?? response.status
        }. responseId=${response.id}`,
      );
    }

    const raw = response.output_text.trim();
    if (!raw) {
      throw new Error(
        `Health source report analysis was empty. responseId=${response.id}`,
      );
    }

    return {
      data: JSON.parse(raw) as HealthSourceReportAnalysisResult,
      model: response.model || this.model,
      responseId: response.id,
      usage: response.usage ?? null,
    };
  }

  private categoryRules(category: HealthPhotoCategory): string {
    switch (category) {
      case HealthPhotoCategory.BODY:
        return 'For body photos, focus on repeatable visual progress markers such as posture, symmetry, broad body-composition presentation and photo consistency. Do not estimate body-fat percentage from the image.';
      case HealthPhotoCategory.SKIN:
        return 'For skin photos, focus on visible texture, dryness/oiliness appearance, redness appearance, blemish distribution, tone evenness and photo consistency. Do not diagnose acne, dermatitis, infection or other conditions.';
      case HealthPhotoCategory.HAIR:
        return 'For hair photos, focus on visible density presentation, hairline/crown coverage, scalp visibility, breakage/frizz appearance and photo consistency. Do not diagnose hair-loss causes or scalp disease.';
    }
  }
}
