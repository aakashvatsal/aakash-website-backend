import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AiService } from '../ai/ai.service';
import type { AiGenerationUsage, AiStructuredResponse } from '../ai/ai.service';
import { DietService } from '../diet/diet.service';
import { HaircareService } from '../haircare/haircare.service';
import { HaircareProductStatus } from '../haircare/schemas/haircare-product.schema';
import { HealthReportsService } from '../health-reports/health-reports.service';
import { HsakaaAiUsageService } from '../hsakaa-observability/hsakaa-ai-usage.service';
import {
  HsakaaAiUsageFeature,
  HsakaaAiUsageStatus,
} from '../hsakaa-observability/schemas/hsakaa-ai-usage.schema';
import {
  HsakaaRuntimeLeaseService,
  type RuntimeLeaseHandle,
} from '../hsakaa-runtime/hsakaa-runtime-lease.service';
import { IntimateCareService } from '../intimate-care/intimate-care.service';
import { IntimateCareProductStatus } from '../intimate-care/schemas/intimate-care-product.schema';
import { MeditationService } from '../meditation/meditation.service';
import { ProductsService } from '../products/products.service';
import { SkincareProductStatus } from '../skincare/schemas/skincare-product.schema';
import { SkincareService } from '../skincare/skincare.service';
import { SupplementStatus } from '../supplements/schemas/supplement.schema';
import { SupplementsService } from '../supplements/supplements.service';
import {
  CreateHealthGoalDto,
  UpdateHealthGoalDto,
  ResolveHealthLocationDto,
  UpdateHealthSourceReportFollowUpDto,
  UpsertHealthBaselineDto,
} from './dto/health-planner-setup.dto';
import {
  CreateHealthOwnerUpdateDto,
  HealthOwnerUpdateDomain,
} from './dto/health-owner-update.dto';
import { UpdateHealthPlanDayDto } from './dto/health-plan.dto';
import { HealthIntelligenceService } from './health-intelligence.service';
import { HealthMarketResearchService } from './health-market-research.service';
import { HealthObjectStorageService } from './health-object-storage.service';
import { HealthProgressService } from './health-progress.service';
import { HealthService } from './health.service';
import { HealthVisionService } from './health-vision.service';
import { HealthBaseline } from './schemas/health-baseline.schema';
import {
  HealthEvidenceSettings,
  DEFAULT_HEALTH_AUTONOMY,
  DEFAULT_HEALTH_SOURCE_PRIORITY,
} from './schemas/health-evidence-settings.schema';
import {
  HealthGoal,
  HealthGoalHorizonMode,
  HealthGoalStatus,
} from './schemas/health-goal.schema';
import {
  HealthPlanDay,
  HealthPlanDayDocument,
  HealthPlanIntensity,
  HealthPlanRecoveryMode,
  HealthPlanStatus,
} from './schemas/health-plan-day.schema';
import {
  HealthPhotoCategory,
  HealthProgressPhoto,
  HealthProgressPhotoDocument,
} from './schemas/health-progress-photo.schema';
import {
  HealthSourceReport,
  HealthSourceReportDocument,
  HealthSourceReportFollowUpStatus,
} from './schemas/health-source-report.schema';
import { HealthOwnerUpdate } from './schemas/health-owner-update.schema';
import { HealthStrategy } from './schemas/health-strategy.schema';

const TIMEZONE = 'Asia/Kolkata';
// `aheadDays` is the public API field name for backwards compatibility, but
// Health OS treats it as the total rolling-window length. A value of 7 means
// today + the next 6 calendar days, matching Media's seven-day rolling plan.
const DEFAULT_AHEAD_DAYS = 7;
const MAX_AHEAD_DAYS = 14;
const LEASE_TTL_MS = 12 * 60 * 1000;
const STRATEGY_LEASE_TTL_MS = 6 * 60 * 1000;
const STRATEGY_CONCURRENT_WAIT_MS = 45 * 1000;
const STRATEGY_CONCURRENT_POLL_MS = 1500;
const CONTEXT_LOOKBACK_DAYS = 28;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_REPORT_BYTES = 16 * 1024 * 1024;
const PLANNING_CONTEXT_MAX_CHARS = 55_000;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_SOURCE_REPORT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const HEALTH_STRATEGY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'priorities',
    'trainingStrategy',
    'nutritionStrategy',
    'recoveryStrategy',
    'meditationStrategy',
    'skinStrategy',
    'hairStrategy',
    'bodyCareStrategy',
    'intimateCareStrategy',
    'productRecommendations',
    'supplementRecommendations',
    'measurementPlan',
    'safetyEscalations',
  ],
  properties: {
    summary: { type: 'string' },
    priorities: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    trainingStrategy: { type: 'string' },
    nutritionStrategy: { type: 'string' },
    recoveryStrategy: { type: 'string' },
    meditationStrategy: { type: 'string' },
    skinStrategy: { type: 'string' },
    hairStrategy: { type: 'string' },
    bodyCareStrategy: { type: 'string' },
    intimateCareStrategy: { type: 'string' },
    productRecommendations: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'domain',
          'action',
          'slot',
          'currentProduct',
          'suggestedProductName',
          'suggestedBrand',
          'reason',
          'usageGuidance',
          'concerns',
          'availabilityStatus',
          'availabilitySummary',
          'availabilitySources',
          'requiresApproval',
        ],
        properties: {
          domain: {
            type: 'string',
            enum: ['skincare', 'haircare', 'bodycare'],
          },
          action: {
            type: 'string',
            enum: ['keep', 'add', 'replace', 'review'],
          },
          slot: { type: 'string' },
          currentProduct: { type: 'string' },
          suggestedProductName: { type: 'string' },
          suggestedBrand: { type: 'string' },
          reason: { type: 'string' },
          usageGuidance: { type: 'string' },
          concerns: { type: 'array', items: { type: 'string' }, maxItems: 6 },
          availabilityStatus: {
            type: 'string',
            enum: [
              'verified_local',
              'verified_india',
              'unverified',
              'not_checked',
            ],
          },
          availabilitySummary: { type: 'string' },
          availabilitySources: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
          },
          requiresApproval: { type: 'boolean' },
        },
      },
    },
    supplementRecommendations: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'action',
          'category',
          'currentSupplement',
          'suggestedProductName',
          'suggestedBrand',
          'reason',
          'selectionCriteria',
          'availabilityStatus',
          'availabilitySummary',
          'availabilitySources',
          'requiresApproval',
          'requiresProfessionalReview',
        ],
        properties: {
          action: {
            type: 'string',
            enum: ['keep', 'add', 'replace', 'review', 'review_stop'],
          },
          category: { type: 'string' },
          currentSupplement: { type: 'string' },
          suggestedProductName: { type: 'string' },
          suggestedBrand: { type: 'string' },
          reason: { type: 'string' },
          selectionCriteria: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 8,
          },
          availabilityStatus: {
            type: 'string',
            enum: [
              'verified_local',
              'verified_india',
              'unverified',
              'not_checked',
            ],
          },
          availabilitySummary: { type: 'string' },
          availabilitySources: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
          },
          requiresApproval: { type: 'boolean' },
          requiresProfessionalReview: { type: 'boolean' },
        },
      },
    },
    measurementPlan: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    safetyEscalations: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 10,
    },
  },
};

const EXERCISE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'sets',
    'reps',
    'rir',
    'rpe',
    'restSeconds',
    'tempo',
    'notes',
  ],
  properties: {
    name: { type: 'string' },
    sets: { type: 'number', minimum: 0, maximum: 12 },
    reps: { type: 'string' },
    rir: { type: 'number', minimum: 0, maximum: 5 },
    rpe: { type: 'number', minimum: 0, maximum: 10 },
    restSeconds: { type: 'number', minimum: 0, maximum: 600 },
    tempo: { type: 'string' },
    notes: { type: 'string' },
  },
};

const CARDIO_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'durationMinutes', 'intensity', 'notes'],
  properties: {
    type: { type: 'string' },
    durationMinutes: { type: 'number', minimum: 0, maximum: 180 },
    intensity: { type: 'string' },
    notes: { type: 'string' },
  },
};

const MOVEMENT_SESSION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'durationMinutes', 'intensity', 'when', 'notes'],
  properties: {
    type: { type: 'string' },
    durationMinutes: { type: 'number', minimum: 0, maximum: 180 },
    intensity: { type: 'string' },
    when: { type: 'string' },
    notes: { type: 'string' },
  },
};

const FOOD_ITEM_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'category',
    'quantity',
    'unit',
    'preparation',
    'reason',
    'alternatives',
  ],
  properties: {
    name: { type: 'string' },
    category: {
      type: 'string',
      enum: [
        'vegetable',
        'fruit',
        'grain_flour',
        'rice',
        'protein',
        'dairy_alternative',
        'nuts_seeds',
        'fat',
        'other',
      ],
    },
    quantity: { type: 'number', minimum: 0, maximum: 5000 },
    unit: { type: 'string' },
    preparation: { type: 'string' },
    reason: { type: 'string' },
    alternatives: { type: 'array', items: { type: 'string' }, maxItems: 4 },
  },
};

const MEAL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['time', 'label', 'guidance', 'items', 'proteinGrams'],
  properties: {
    time: { type: 'string' },
    label: { type: 'string' },
    guidance: { type: 'string' },
    items: {
      type: 'array',
      items: FOOD_ITEM_SCHEMA,
      minItems: 1,
      maxItems: 12,
    },
    proteinGrams: { type: 'number', minimum: 0, maximum: 200 },
  },
};

export const HEALTH_PLAN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['days'],
  properties: {
    days: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_AHEAD_DAYS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'dateKey',
          'focus',
          'rationale',
          'recoveryMode',
          'morningConditioning',
          'training',
          'normalWalk',
          'nutrition',
          'meditation',
          'sleep',
          'skincare',
          'bodyCare',
          'haircare',
          'intimateCare',
          'stepsTarget',
          'checkIns',
          'signals',
          'guardrails',
        ],
        properties: {
          dateKey: { type: 'string' },
          focus: { type: 'string' },
          rationale: { type: 'string' },
          recoveryMode: {
            type: 'string',
            enum: Object.values(HealthPlanRecoveryMode),
          },
          morningConditioning: MOVEMENT_SESSION_SCHEMA,
          training: {
            type: 'object',
            additionalProperties: false,
            required: [
              'when',
              'title',
              'type',
              'durationMinutes',
              'intensity',
              'warmup',
              'exercises',
              'cardio',
              'cooldown',
              'progressionRule',
              'deloadNote',
            ],
            properties: {
              when: { type: 'string' },
              title: { type: 'string' },
              type: { type: 'string' },
              durationMinutes: { type: 'number', minimum: 0, maximum: 240 },
              intensity: {
                type: 'string',
                enum: Object.values(HealthPlanIntensity),
              },
              warmup: { type: 'array', items: { type: 'string' }, maxItems: 8 },
              exercises: {
                type: 'array',
                items: EXERCISE_SCHEMA,
                maxItems: 12,
              },
              cardio: CARDIO_SCHEMA,
              cooldown: {
                type: 'array',
                items: { type: 'string' },
                maxItems: 8,
              },
              progressionRule: { type: 'string' },
              deloadNote: { type: 'string' },
            },
          },
          normalWalk: MOVEMENT_SESSION_SCHEMA,
          nutrition: {
            type: 'object',
            additionalProperties: false,
            required: [
              'focus',
              'calorieTarget',
              'proteinGrams',
              'carbsGrams',
              'fatGrams',
              'hydrationLitres',
              'meals',
              'performanceNutrition',
              'notes',
            ],
            properties: {
              focus: { type: 'string' },
              calorieTarget: { type: 'number', minimum: 0, maximum: 10000 },
              proteinGrams: { type: 'number', minimum: 0, maximum: 500 },
              carbsGrams: { type: 'number', minimum: 0, maximum: 1000 },
              fatGrams: { type: 'number', minimum: 0, maximum: 400 },
              hydrationLitres: { type: 'number', minimum: 0.5, maximum: 8 },
              meals: {
                type: 'array',
                items: MEAL_SCHEMA,
                minItems: 1,
                maxItems: 10,
              },
              performanceNutrition: {
                type: 'array',
                minItems: 2,
                maxItems: 8,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'category',
                    'action',
                    'status',
                    'item',
                    'when',
                    'guidance',
                    'approvalRequired',
                  ],
                  properties: {
                    category: {
                      type: 'string',
                      enum: ['creatine', 'protein_powder', 'other'],
                    },
                    action: {
                      type: 'string',
                      enum: [
                        'keep',
                        'add',
                        'replace',
                        'review',
                        'review_stop',
                        'not_needed',
                      ],
                    },
                    status: {
                      type: 'string',
                      enum: [
                        'active',
                        'pending_approval',
                        'review_required',
                        'not_needed_today',
                      ],
                    },
                    item: { type: 'string' },
                    when: { type: 'string' },
                    guidance: { type: 'string' },
                    approvalRequired: { type: 'boolean' },
                  },
                },
              },
              notes: { type: 'array', items: { type: 'string' }, maxItems: 8 },
            },
          },
          meditation: {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'durationMinutes', 'when', 'intention'],
            properties: {
              type: { type: 'string' },
              durationMinutes: { type: 'number', minimum: 0, maximum: 120 },
              when: { type: 'string' },
              intention: { type: 'string' },
            },
          },
          sleep: {
            type: 'object',
            additionalProperties: false,
            required: ['targetHours', 'bedtimeWindow', 'wakeWindow', 'notes'],
            properties: {
              targetHours: { type: 'number', minimum: 4, maximum: 12 },
              bedtimeWindow: { type: 'string' },
              wakeWindow: { type: 'string' },
              notes: { type: 'array', items: { type: 'string' }, maxItems: 8 },
            },
          },
          skincare: {
            type: 'object',
            additionalProperties: false,
            required: ['morning', 'evening', 'other', 'improvementFocus'],
            properties: {
              morning: {
                type: 'array',
                items: { type: 'string' },
                minItems: 3,
                maxItems: 10,
              },
              evening: {
                type: 'array',
                items: { type: 'string' },
                minItems: 2,
                maxItems: 10,
              },
              other: { type: 'array', items: { type: 'string' }, maxItems: 8 },
              improvementFocus: { type: 'string' },
            },
          },
          bodyCare: {
            type: 'object',
            additionalProperties: false,
            required: ['morning', 'evening', 'other', 'improvementFocus'],
            properties: {
              morning: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: 10,
              },
              evening: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: 10,
              },
              other: { type: 'array', items: { type: 'string' }, maxItems: 8 },
              improvementFocus: { type: 'string' },
            },
          },
          haircare: {
            type: 'object',
            additionalProperties: false,
            required: ['routine', 'washDay', 'improvementFocus'],
            properties: {
              routine: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: 10,
              },
              washDay: { type: 'boolean' },
              improvementFocus: { type: 'string' },
            },
          },
          intimateCare: {
            type: 'object',
            additionalProperties: false,
            required: ['routine', 'improvementFocus'],
            properties: {
              routine: {
                type: 'array',
                items: { type: 'string' },
                maxItems: 10,
              },
              improvementFocus: { type: 'string' },
            },
          },
          stepsTarget: { type: 'number', minimum: 0, maximum: 50000 },
          checkIns: { type: 'array', items: { type: 'string' }, maxItems: 10 },
          signals: { type: 'array', items: { type: 'string' }, maxItems: 10 },
          guardrails: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10,
          },
        },
      },
    },
  },
};

type AiHealthStrategy = {
  summary: string;
  priorities: string[];
  trainingStrategy: string;
  nutritionStrategy: string;
  recoveryStrategy: string;
  meditationStrategy: string;
  skinStrategy: string;
  hairStrategy: string;
  bodyCareStrategy: string;
  intimateCareStrategy: string;
  productRecommendations: Array<{
    domain: 'skincare' | 'haircare' | 'bodycare';
    action: 'keep' | 'add' | 'replace' | 'review';
    slot: string;
    currentProduct: string;
    suggestedProductName: string;
    suggestedBrand: string;
    reason: string;
    usageGuidance: string;
    concerns: string[];
    availabilityStatus:
      'verified_local' | 'verified_india' | 'unverified' | 'not_checked';
    availabilitySummary: string;
    availabilitySources: string[];
    requiresApproval: boolean;
  }>;
  supplementRecommendations: Array<{
    action: 'keep' | 'add' | 'replace' | 'review' | 'review_stop';
    category: string;
    currentSupplement: string;
    suggestedProductName: string;
    suggestedBrand: string;
    reason: string;
    selectionCriteria: string[];
    availabilityStatus:
      'verified_local' | 'verified_india' | 'unverified' | 'not_checked';
    availabilitySummary: string;
    availabilitySources: string[];
    requiresApproval: boolean;
    requiresProfessionalReview: boolean;
  }>;
  measurementPlan: string[];
  safetyEscalations: string[];
};

type AiHealthPlan = {
  days: Array<Record<string, unknown> & { dateKey: string }>;
};

type NutritionDiversityDay = {
  dateKey: string;
  meals: Array<{
    label: string;
    signature: string;
  }>;
};

type UploadedHealthPhoto = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

type EnsureOptions = {
  aheadDays?: number;
  forceRefresh?: boolean;
  refreshStale?: boolean;
  reason: string;
};

export function isCurrentHealthPlanDayShape(value: unknown): boolean {
  const asRecord = (candidate: unknown): Record<string, unknown> =>
    candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? (candidate as Record<string, unknown>)
      : {};
  const asText = (candidate: unknown) =>
    typeof candidate === 'string' ? candidate.trim() : '';

  const day = asRecord(value);
  for (const key of ['morningConditioning', 'normalWalk']) {
    const session = asRecord(day[key]);
    if (
      !asText(session.type) ||
      !asText(session.when) ||
      !asText(session.intensity) ||
      typeof session.durationMinutes !== 'number'
    ) {
      return false;
    }
  }

  const training = asRecord(day.training);
  const nutrition = asRecord(day.nutrition);
  const meditation = asRecord(day.meditation);
  const sleep = asRecord(day.sleep);
  const skincare = asRecord(day.skincare);
  const bodyCare = asRecord(day.bodyCare);
  const haircare = asRecord(day.haircare);
  const intimateCare = asRecord(day.intimateCare);

  return Boolean(
    asText(training.title) &&
    asText(training.when) &&
    typeof training.durationMinutes === 'number' &&
    asText(nutrition.focus) &&
    Array.isArray(nutrition.meals) &&
    Array.isArray(nutrition.performanceNutrition) &&
    asText(meditation.type) &&
    typeof meditation.durationMinutes === 'number' &&
    typeof sleep.targetHours === 'number' &&
    Array.isArray(skincare.morning) &&
    Array.isArray(skincare.evening) &&
    Array.isArray(bodyCare.morning) &&
    Array.isArray(bodyCare.evening) &&
    Array.isArray(haircare.routine) &&
    Array.isArray(intimateCare.routine) &&
    typeof day.stepsTarget === 'number' &&
    Array.isArray(day.checkIns) &&
    Array.isArray(day.signals) &&
    Array.isArray(day.guardrails),
  );
}

@Injectable()
export class HealthPlannerService {
  private readonly logger = new Logger(HealthPlannerService.name);

  constructor(
    @InjectModel(HealthPlanDay.name)
    private readonly planModel: Model<HealthPlanDayDocument>,
    @InjectModel(HealthBaseline.name)
    private readonly baselineModel: Model<HealthBaseline>,
    @InjectModel(HealthEvidenceSettings.name)
    private readonly evidenceSettingsModel: Model<HealthEvidenceSettings>,
    @InjectModel(HealthGoal.name)
    private readonly goalModel: Model<HealthGoal>,
    @InjectModel(HealthProgressPhoto.name)
    private readonly photoModel: Model<HealthProgressPhotoDocument>,
    @InjectModel(HealthSourceReport.name)
    private readonly sourceReportModel: Model<HealthSourceReportDocument>,
    @InjectModel(HealthStrategy.name)
    private readonly strategyModel: Model<HealthStrategy>,
    @InjectModel(HealthOwnerUpdate.name)
    private readonly ownerUpdateModel: Model<HealthOwnerUpdate>,
    private readonly healthService: HealthService,
    private readonly healthProgressService: HealthProgressService,
    private readonly healthIntelligenceService: HealthIntelligenceService,
    private readonly marketResearchService: HealthMarketResearchService,
    private readonly objectStorage: HealthObjectStorageService,
    private readonly dietService: DietService,
    private readonly supplementsService: SupplementsService,
    private readonly meditationService: MeditationService,
    private readonly productsService: ProductsService,
    private readonly reportsService: HealthReportsService,
    private readonly skincareService: SkincareService,
    private readonly haircareService: HaircareService,
    private readonly intimateCareService: IntimateCareService,
    private readonly aiService: AiService,
    private readonly visionService: HealthVisionService,
    private readonly aiUsage: HsakaaAiUsageService,
    private readonly runtimeLeases: HsakaaRuntimeLeaseService,
  ) {}

  async resolveLocation(dto: ResolveHealthLocationDto) {
    const latitude = Number(dto.latitude);
    const longitude = Number(dto.longitude);
    const timezone = dto.timezone?.trim() || TIMEZONE;
    const fallback = {
      latitude,
      longitude,
      accuracyMeters: dto.accuracyMeters ?? null,
      timezone,
      capturedAt: new Date().toISOString(),
      source: 'browser_geolocation',
      city: '',
      region: '',
      country: '',
      countryCode: '',
    };

    try {
      const query = new URLSearchParams({
        format: 'jsonv2',
        lat: String(latitude),
        lon: String(longitude),
        addressdetails: '1',
        zoom: '10',
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?${query.toString()}`,
        {
          headers: {
            Accept: 'application/json',
            'Accept-Language': 'en',
            'User-Agent':
              process.env.HEALTH_LOCATION_USER_AGENT?.trim() ||
              'Aakash-Personal-OS/1.0 (private single-owner health location resolver)',
          },
          signal: AbortSignal.timeout(7000),
        },
      );
      if (!response.ok) return fallback;
      const payload = (await response.json()) as {
        address?: Record<string, unknown>;
      };
      const address = payload.address ?? {};
      const text = (value: unknown) =>
        typeof value === 'string' ? value.trim() : '';
      return {
        ...fallback,
        city:
          text(address.city) ||
          text(address.town) ||
          text(address.municipality) ||
          text(address.village) ||
          text(address.county),
        region: text(address.state) || text(address.state_district),
        country: text(address.country),
        countryCode: text(address.country_code).toUpperCase(),
      };
    } catch {
      return fallback;
    }
  }

  async listOwnerUpdates(domain?: HealthOwnerUpdateDomain, limit = 30) {
    const safeLimit = Math.min(100, Math.max(1, Math.round(limit || 30)));
    const filter: Record<string, unknown> = { isActive: true };
    if (domain) filter.domain = domain;
    return this.ownerUpdateModel
      .find(filter)
      .sort({ effectiveAt: -1, createdAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec();
  }

  async createOwnerUpdate(dto: CreateHealthOwnerUpdateDto) {
    const update = dto.update?.trim();
    if (!update) throw new BadRequestException('Health update is required.');
    const created = await this.ownerUpdateModel.create({
      domain: dto.domain,
      update,
      effectiveAt: new Date(),
      isActive: true,
    });

    if (dto.refreshPlan !== false) {
      await this.ensureRollingWindow({
        aheadDays: DEFAULT_AHEAD_DAYS,
        forceRefresh: true,
        refreshStale: true,
        reason: `owner_update:${dto.domain}`,
      });
    }

    return created.toObject();
  }

  getPolicy() {
    return {
      version: 'health-os-v2.6',
      timezone: TIMEZONE,
      coverage: {
        aheadDays: DEFAULT_AHEAD_DAYS,
        definition: 'Today plus the next 6 calendar days (7 total days).',
        minimumFutureCoverageDays: 6,
      },
      automation: {
        dailyAiRefresh: '05:30 Asia/Kolkata',
        coverageRepair: 'Hourly on the hour',
        weeklyStrategyRefresh: 'Monday 06:00 Asia/Kolkata',
        ownerLocksPreserved: true,
      },
      onboarding: {
        baselineRequired: true,
        activeGoalRequired: true,
        targetHorizons: ['exact_date', 'relative', 'ongoing'],
        photoCategories: ['body', 'skin', 'hair'],
        photoHistoryRetained: true,
        sourceReportUploadTypes: ['pdf', 'jpeg', 'png', 'webp'],
        sourceReportHistoryRetained: true,
      },
      storage: this.objectStorage.getStatus(),
      nutrition: {
        exactFoodSelectionRequired: true,
        specificVegetablesFruitsNutsGrainsAndRice: true,
        locationAwareAvailability: true,
      },
      supplements: {
        configuredScheduleAuthoritative: true,
        productLevelRecommendations: true,
        localAvailabilityVerification: true,
        automaticStopAllowed: false,
      },
      gym: {
        hsakaaCanCreateFullProgram: true,
        trainerProgramCanBeFollowed: true,
        dailyStructure: {
          morningConditioning: 'Walk, run or jog session',
          eveningWeights: 'Separate resistance-training session',
          normalWalk: 'Separate easy walk',
        },
        prescriptionIncludes: [
          'exercise',
          'sets',
          'reps',
          'RIR',
          'RPE',
          'rest',
          'tempo',
          'progression',
          'deload',
        ],
      },
      safeguards: [
        'Health photos and uploaded reports are stored as private S3 objects; MongoDB stores metadata/evidence only after migration.',
        'Health photos are owner-only and are never exposed through a public route.',
        'Photo analysis is observational and non-diagnostic.',
        'HSAKAA never changes medication or supplement doses automatically.',
        'Existing supplement schedules remain authoritative; HSAKAA may flag keep/add/replace/review/review-stop but never silently stops or changes a supplement.',
        'Configured skincare/haircare/intimate-care products remain authoritative; AI may recommend specific OTC candidates but never silently adds, replaces or purchases products.',
        'Products OS is the single inventory source for stock, usage, expiry, repurchase and what-to-buy-next.',
        'Lab retest reminders use only explicit report/clinician timing or an owner-confirmed date; HSAKAA never invents a medical retest interval.',
        'Intimate Care is included as private routine/context data, but intimate-area photo upload and visual analysis are intentionally unsupported.',
        'Clinician/dietitian/trainer constraints in the baseline override generic AI suggestions.',
        'Owner-locked plan days are never overwritten automatically.',
      ],
    };
  }

  async getSetup() {
    const [
      baseline,
      goals,
      photos,
      sourceReports,
      strategy,
      products,
      whatToBuyNext,
    ] = await Promise.all([
      this.baselineModel
        .findOne({ key: 'owner', isActive: true })
        .lean()
        .exec(),
      this.goalModel
        .find({ isActive: true })
        .sort({ priority: -1, createdAt: 1 })
        .lean()
        .exec(),
      this.photoModel
        .find({ isActive: true })
        .select('-data')
        .sort({ takenAt: -1 })
        .limit(80)
        .lean()
        .exec(),
      this.sourceReportModel
        .find({ isActive: true })
        .select('-data')
        .sort({ reportDate: -1 })
        .limit(40)
        .lean()
        .exec(),
      this.strategyModel
        .findOne({ key: 'owner', isActive: true })
        .lean()
        .exec(),
      this.productsService.findCurrentProducts(),
      this.productsService.getWhatToBuyNext(),
    ]);
    const storage = await this.getStorageStatus();
    const activeGoals = goals.filter(
      (goal) => goal.status === HealthGoalStatus.ACTIVE,
    );
    const photoCounts = Object.values(HealthPhotoCategory).reduce<
      Record<string, number>
    >((accumulator, category) => {
      accumulator[category] = photos.filter(
        (photo) => photo.category === category,
      ).length;
      return accumulator;
    }, {});

    return {
      policy: this.getPolicy(),
      baseline,
      goals,
      photos,
      sourceReports,
      strategy,
      products: {
        ...products,
        whatToBuyNext,
      },
      storage,
      readiness: {
        baselineSaved: Boolean(baseline),
        onboardingCompleted: Boolean(baseline?.onboardingCompleted),
        activeGoalCount: activeGoals.length,
        planReady: Boolean(baseline?.onboardingCompleted && activeGoals.length),
        photoCounts,
        sourceReportCount: sourceReports.length,
        prompts: this.setupPrompts(
          baseline,
          activeGoals.length,
          photoCounts,
          sourceReports.length,
        ),
      },
    };
  }

  async upsertBaseline(dto: UpsertHealthBaselineDto) {
    const update: Record<string, unknown> = {
      ...dto,
      isActive: true,
      lastReviewedAt: new Date(),
    };
    if (dto.onboardingCompleted) update.onboardingCompletedAt = new Date();
    if (dto.onboardingCompleted === false) update.onboardingCompletedAt = null;
    const baseline = await this.baselineModel
      .findOneAndUpdate(
        { key: 'owner' },
        {
          $set: update,
          $inc: { reviewVersion: 1 },
          $setOnInsert: { key: 'owner' },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      )
      .lean()
      .exec();
    return { baseline, readiness: (await this.getSetup()).readiness };
  }

  async createGoal(dto: CreateHealthGoalDto) {
    this.validateGoalHorizon(
      dto.horizonMode,
      dto.targetDate,
      dto.relativeMonths,
    );
    return this.goalModel.create({
      ...dto,
      targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
      relativeMonths:
        dto.horizonMode === HealthGoalHorizonMode.RELATIVE
          ? dto.relativeMonths
          : null,
      status: HealthGoalStatus.ACTIVE,
      isActive: true,
    });
  }

  async updateGoal(id: string, dto: UpdateHealthGoalDto) {
    this.assertObjectId(id, 'goal ID');
    const current = await this.goalModel
      .findOne({ _id: new Types.ObjectId(id), isActive: true })
      .lean()
      .exec();
    if (!current) throw new NotFoundException('Health goal not found.');
    const mode = dto.horizonMode ?? current.horizonMode;
    const targetDate =
      dto.targetDate ??
      (current.targetDate ? current.targetDate.toISOString() : undefined);
    const relativeMonths =
      dto.relativeMonths ?? current.relativeMonths ?? undefined;
    this.validateGoalHorizon(mode, targetDate, relativeMonths);
    const horizonFields =
      mode === HealthGoalHorizonMode.EXACT_DATE
        ? { targetDate: new Date(targetDate as string), relativeMonths: null }
        : mode === HealthGoalHorizonMode.RELATIVE
          ? { targetDate: null, relativeMonths }
          : { targetDate: null, relativeMonths: null };
    return this.goalModel
      .findByIdAndUpdate(
        new Types.ObjectId(id),
        { $set: { ...dto, ...horizonFields } },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  async removeGoal(id: string) {
    this.assertObjectId(id, 'goal ID');
    const result = await this.goalModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isActive: true },
        { $set: { isActive: false } },
        { new: true },
      )
      .lean()
      .exec();
    if (!result) throw new NotFoundException('Health goal not found.');
    return { removed: true };
  }

  async getStorageStatus() {
    const [legacyPhotos, legacyReports] = await Promise.all([
      this.photoModel.countDocuments({
        isActive: true,
        data: { $exists: true },
      }),
      this.sourceReportModel.countDocuments({
        isActive: true,
        data: { $exists: true },
      }),
    ]);
    return {
      ...this.objectStorage.getStatus(),
      legacyPhotos,
      legacyReports,
      migrationRequired: legacyPhotos + legacyReports > 0,
    };
  }

  async migrateLegacyStorage() {
    if (!this.objectStorage.isConfigured()) {
      throw new ServiceUnavailableException(
        'Health S3 storage is not configured. Configure it before migrating legacy uploads.',
      );
    }
    const lease = await this.runtimeLeases.acquire(
      'health-storage:migrate-legacy',
      20 * 60 * 1000,
      { operation: 'health_storage_migration' },
    );
    if (!lease) {
      throw new ConflictException(
        'Health storage migration is already running.',
      );
    }
    let migratedPhotos = 0;
    let migratedReports = 0;
    try {
      const photos = await this.photoModel
        .find({ isActive: true, data: { $exists: true } })
        .select('+data')
        .exec();
      for (const photo of photos) {
        if (!photo.data?.length) continue;
        const stored = await this.objectStorage.putObject({
          key: this.objectStorage.buildObjectKey('photos', photo.originalName),
          mimeType: photo.mimeType,
          data: Buffer.from(photo.data),
        });
        try {
          const result = await this.photoModel.updateOne(
            { _id: photo._id, isActive: true, data: { $exists: true } },
            {
              $set: {
                storageProvider: stored.provider,
                storageBucket: stored.bucket,
                storageKey: stored.key,
                storageEtag: stored.etag,
                storageUploadedAt: stored.uploadedAt,
              },
              $unset: { data: 1 },
            },
            { runValidators: true },
          );
          if (result.matchedCount !== 1) {
            throw new Error(
              `Legacy Health photo ${String(photo._id)} changed during migration.`,
            );
          }
          migratedPhotos += 1;
        } catch (error) {
          await this.objectStorage
            .deleteObject(stored.key)
            .catch(() => undefined);
          throw error;
        }
      }

      const reports = await this.sourceReportModel
        .find({ isActive: true, data: { $exists: true } })
        .select('+data')
        .exec();
      for (const report of reports) {
        if (!report.data?.length) continue;
        const stored = await this.objectStorage.putObject({
          key: this.objectStorage.buildObjectKey(
            'reports',
            report.originalName,
          ),
          mimeType: report.mimeType,
          data: Buffer.from(report.data),
        });
        try {
          const result = await this.sourceReportModel.updateOne(
            { _id: report._id, isActive: true, data: { $exists: true } },
            {
              $set: {
                storageProvider: stored.provider,
                storageBucket: stored.bucket,
                storageKey: stored.key,
                storageEtag: stored.etag,
                storageUploadedAt: stored.uploadedAt,
              },
              $unset: { data: 1 },
            },
            { runValidators: true },
          );
          if (result.matchedCount !== 1) {
            throw new Error(
              `Legacy Health report ${String(report._id)} changed during migration.`,
            );
          }
          migratedReports += 1;
        } catch (error) {
          await this.objectStorage
            .deleteObject(stored.key)
            .catch(() => undefined);
          throw error;
        }
      }

      return {
        migratedPhotos,
        migratedReports,
        storage: await this.getStorageStatus(),
      };
    } finally {
      await this.runtimeLeases.release(lease);
    }
  }

  async listPhotos(category?: HealthPhotoCategory) {
    return this.photoModel
      .find({ isActive: true, ...(category ? { category } : {}) })
      .select('-data')
      .sort({ takenAt: -1 })
      .lean()
      .exec();
  }

  async uploadPhoto(input: {
    file?: UploadedHealthPhoto;
    category: HealthPhotoCategory;
    angle: string;
    takenAt?: string;
  }) {
    const file = input.file;
    if (!file)
      throw new BadRequestException('A progress photo file is required.');
    if (!ALLOWED_PHOTO_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Progress photos must be JPEG, PNG, or WebP.',
      );
    }
    if (file.size < 1 || file.size > MAX_PHOTO_BYTES) {
      throw new BadRequestException('Progress photos must be 8 MB or smaller.');
    }
    if (!this.objectStorage.isConfigured()) {
      throw new ServiceUnavailableException(
        'Health S3 storage is not configured. Configure private object storage before uploading progress photos.',
      );
    }
    const takenAt = input.takenAt ? new Date(input.takenAt) : new Date();
    if (Number.isNaN(takenAt.getTime()))
      throw new BadRequestException('Invalid photo takenAt date.');

    const normalizedAngle = input.angle.trim();
    const [baseline, reports, previousPhoto] = await Promise.all([
      this.baselineModel
        .findOne({ key: 'owner', isActive: true })
        .lean()
        .exec(),
      this.reportsService.findAll(),
      this.photoModel
        .findOne({
          isActive: true,
          category: input.category,
          angle: {
            $regex: `^${this.escapeRegex(normalizedAngle)}$`,
            $options: 'i',
          },
          takenAt: { $lt: takenAt },
        })
        .select('+data')
        .sort({ takenAt: -1 })
        .exec(),
    ]);
    const previousPhotoData = previousPhoto
      ? await this.readPhotoBytes(previousPhoto)
      : null;
    const startedAt = Date.now();
    let analysis: import('./health-vision.service').HealthPhotoAnalysisResult =
      {
        summary: '',
        observations: [],
        improvementOpportunities: [],
        safetyFlags: [],
        comparisonGuidance: '',
        comparison: {
          hasPrevious: false,
          comparedToPhotoId: '',
          changeSummary: '',
          visibleChanges: [],
          consistencyNotes: [],
          confidence: 'low',
        },
      };
    let aiModel = '';
    let aiResponseId = '';
    let analyzedAt: Date | null = null;

    try {
      await this.aiUsage.assertBudget(HsakaaAiUsageFeature.HEALTH_PLANNER);
      const result = await this.visionService.analyzePhoto({
        category: input.category,
        angle: normalizedAngle,
        mimeType: file.mimetype,
        data: file.buffer,
        baselineContext: this.compactJson(
          {
            baseline: baseline ?? {},
            latestHealthReports: reports.slice(0, 4),
          },
          14000,
        ),
        previous: previousPhoto
          ? {
              id: String(previousPhoto._id),
              takenAt: previousPhoto.takenAt,
              mimeType: previousPhoto.mimeType,
              data: previousPhotoData ?? Buffer.alloc(0),
            }
          : null,
      });
      analysis = result.data;
      aiModel = result.model;
      aiResponseId = result.responseId;
      analyzedAt = new Date();
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: HsakaaAiUsageStatus.SUCCESS,
        startedAt,
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
        metadata: {
          operation: 'progress_photo_analysis',
          category: input.category,
        },
      });
    } catch (error) {
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: this.aiUsage.isBudgetExceeded(error)
          ? HsakaaAiUsageStatus.BLOCKED
          : HsakaaAiUsageStatus.FALLBACK,
        startedAt,
        metadata: {
          operation: 'progress_photo_analysis',
          category: input.category,
        },
        error,
      });
      analysis.safetyFlags = [
        'AI photo analysis was unavailable. The image is still stored privately for future comparison.',
      ];
    }

    const stored = await this.objectStorage.putObject({
      key: this.objectStorage.buildObjectKey('photos', file.originalname),
      mimeType: file.mimetype,
      data: file.buffer,
    });
    try {
      return await this.photoModel.create({
        category: input.category,
        angle: normalizedAngle,
        takenAt,
        mimeType: file.mimetype,
        originalName: file.originalname,
        byteSize: file.size,
        storageProvider: stored.provider,
        storageBucket: stored.bucket,
        storageKey: stored.key,
        storageEtag: stored.etag,
        storageUploadedAt: stored.uploadedAt,
        analysis,
        aiModel,
        aiResponseId,
        analyzedAt,
        isActive: true,
      });
    } catch (error) {
      await this.objectStorage.deleteObject(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async getPhotoContent(id: string) {
    this.assertObjectId(id, 'photo ID');
    const photo = await this.photoModel
      .findOne({ _id: new Types.ObjectId(id), isActive: true })
      .select('+data')
      .exec();
    if (!photo) throw new NotFoundException('Progress photo not found.');
    return { mimeType: photo.mimeType, data: await this.readPhotoBytes(photo) };
  }

  async removePhoto(id: string) {
    this.assertObjectId(id, 'photo ID');
    const photo = await this.photoModel
      .findOne({ _id: new Types.ObjectId(id), isActive: true })
      .select('+data')
      .exec();
    if (!photo) throw new NotFoundException('Progress photo not found.');
    if (photo.storageKey) {
      await this.objectStorage.deleteObject(photo.storageKey);
    }
    await this.photoModel.updateOne(
      { _id: photo._id },
      { $set: { isActive: false }, $unset: { data: 1 } },
    );
    return { removed: true };
  }

  async listSourceReports() {
    return this.sourceReportModel
      .find({ isActive: true })
      .select('-data')
      .sort({ reportDate: -1 })
      .lean()
      .exec();
  }

  async uploadSourceReport(input: {
    file?: UploadedHealthPhoto;
    label?: string;
    reportDate?: string;
  }) {
    const file = input.file;
    if (!file) {
      throw new BadRequestException('A health report file is required.');
    }
    if (!ALLOWED_SOURCE_REPORT_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Health reports must be PDF, JPEG, PNG, or WebP.',
      );
    }
    if (file.size < 1 || file.size > MAX_SOURCE_REPORT_BYTES) {
      throw new BadRequestException('Health reports must be 16 MB or smaller.');
    }
    if (!this.objectStorage.isConfigured()) {
      throw new ServiceUnavailableException(
        'Health S3 storage is not configured. Configure private object storage before uploading Health reports.',
      );
    }
    const reportDate = input.reportDate
      ? new Date(input.reportDate)
      : new Date();
    if (Number.isNaN(reportDate.getTime())) {
      throw new BadRequestException('Invalid health report date.');
    }

    const baseline = await this.baselineModel
      .findOne({ key: 'owner', isActive: true })
      .lean()
      .exec();
    const startedAt = Date.now();
    let analysis = {
      summary: '',
      findings: [] as string[],
      measurements: [] as string[],
      structuredMeasurements: [] as Array<{
        name: string;
        value: string;
        unit: string;
        referenceRange: string;
        flag: 'low' | 'normal' | 'high' | 'unknown';
      }>,
      planningImplications: [] as string[],
      professionalInstructions: [] as string[],
      safetyFlags: [] as string[],
      followUpTests: [] as Array<{
        testName: string;
        timingText: string;
        dueAt: Date | null;
        reason: string;
        source: 'report_explicit' | 'owner_confirmed';
        status: HealthSourceReportFollowUpStatus;
        reminderEnabled: boolean;
      }>,
    };
    let aiModel = '';
    let aiResponseId = '';
    let analyzedAt: Date | null = null;

    try {
      await this.aiUsage.assertBudget(HsakaaAiUsageFeature.HEALTH_PLANNER);
      const result = await this.visionService.analyzeSourceReport({
        label: input.label?.trim() || file.originalname,
        mimeType: file.mimetype,
        filename: file.originalname,
        data: file.buffer,
        baselineContext: this.compactJson({ baseline: baseline ?? {} }, 12000),
      });
      analysis = {
        ...result.data,
        followUpTests: this.normalizeReportFollowUps(
          result.data.followUpTests ?? [],
          reportDate,
        ),
      };
      aiModel = result.model;
      aiResponseId = result.responseId;
      analyzedAt = new Date();
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: HsakaaAiUsageStatus.SUCCESS,
        startedAt,
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
        metadata: { operation: 'health_source_report_analysis' },
      });
    } catch (error) {
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: this.aiUsage.isBudgetExceeded(error)
          ? HsakaaAiUsageStatus.BLOCKED
          : HsakaaAiUsageStatus.FALLBACK,
        startedAt,
        metadata: { operation: 'health_source_report_analysis' },
        error,
      });
      analysis.safetyFlags = [
        'AI report extraction was unavailable. The report is still stored privately and can be reviewed manually.',
      ];
    }

    const stored = await this.objectStorage.putObject({
      key: this.objectStorage.buildObjectKey('reports', file.originalname),
      mimeType: file.mimetype,
      data: file.buffer,
    });
    let saved: HealthSourceReportDocument;
    try {
      saved = await this.sourceReportModel.create({
        label: input.label?.trim() || file.originalname,
        reportDate,
        mimeType: file.mimetype,
        originalName: file.originalname,
        byteSize: file.size,
        storageProvider: stored.provider,
        storageBucket: stored.bucket,
        storageKey: stored.key,
        storageEtag: stored.etag,
        storageUploadedAt: stored.uploadedAt,
        analysis,
        aiModel,
        aiResponseId,
        analyzedAt,
        isActive: true,
      });
    } catch (error) {
      await this.objectStorage.deleteObject(stored.key).catch(() => undefined);
      throw error;
    }
    await this.refreshLabFollowUpsForPlannedWindow();
    return saved;
  }

  async getSourceReportContent(id: string) {
    this.assertObjectId(id, 'health report ID');
    const report = await this.sourceReportModel
      .findOne({ _id: new Types.ObjectId(id), isActive: true })
      .select('+data')
      .exec();
    if (!report) throw new NotFoundException('Health report not found.');
    return {
      mimeType: report.mimeType,
      originalName: report.originalName,
      data: await this.readSourceReportBytes(report),
    };
  }

  async removeSourceReport(id: string) {
    this.assertObjectId(id, 'health report ID');
    const report = await this.sourceReportModel
      .findOne({ _id: new Types.ObjectId(id), isActive: true })
      .select('+data')
      .exec();
    if (!report) throw new NotFoundException('Health report not found.');
    if (report.storageKey) {
      await this.objectStorage.deleteObject(report.storageKey);
    }
    await this.sourceReportModel.updateOne(
      { _id: report._id },
      { $set: { isActive: false }, $unset: { data: 1 } },
    );
    return { removed: true };
  }

  async reanalyzeSourceReport(id: string) {
    this.assertObjectId(id, 'health report ID');
    const report = await this.sourceReportModel
      .findOne({ _id: new Types.ObjectId(id), isActive: true })
      .select('+data')
      .exec();
    if (!report) throw new NotFoundException('Health report not found.');

    const [baseline, reportData] = await Promise.all([
      this.baselineModel
        .findOne({ key: 'owner', isActive: true })
        .lean()
        .exec(),
      this.readSourceReportBytes(report),
    ]);
    const startedAt = Date.now();
    try {
      await this.aiUsage.assertBudget(HsakaaAiUsageFeature.HEALTH_PLANNER);
      const result = await this.visionService.analyzeSourceReport({
        label: report.label || report.originalName,
        mimeType: report.mimeType,
        filename: report.originalName,
        data: reportData,
        baselineContext: this.compactJson({ baseline: baseline ?? {} }, 12000),
      });
      const previous = report.analysis?.followUpTests ?? [];
      const extracted = this.normalizeReportFollowUps(
        result.data.followUpTests ?? [],
        report.reportDate,
      );
      const ownerConfirmed = previous.filter(
        (item) => item.source === 'owner_confirmed',
      );
      report.analysis = {
        ...result.data,
        followUpTests: [...extracted, ...ownerConfirmed],
      };
      report.aiModel = result.model;
      report.aiResponseId = result.responseId;
      report.analyzedAt = new Date();
      await report.save();
      await this.refreshLabFollowUpsForPlannedWindow();
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: HsakaaAiUsageStatus.SUCCESS,
        startedAt,
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
        metadata: { operation: 'health_source_report_reanalysis' },
      });
      return report.toObject();
    } catch (error) {
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: this.aiUsage.isBudgetExceeded(error)
          ? HsakaaAiUsageStatus.BLOCKED
          : HsakaaAiUsageStatus.ERROR,
        startedAt,
        metadata: { operation: 'health_source_report_reanalysis' },
        error,
      });
      throw new ServiceUnavailableException(
        'HSAKAA could not re-analyze this health report. Existing extracted evidence was kept unchanged.',
      );
    }
  }

  async updateSourceReportFollowUp(
    id: string,
    index: number,
    dto: UpdateHealthSourceReportFollowUpDto,
  ) {
    this.assertObjectId(id, 'health report ID');
    if (!Number.isInteger(index) || index < 0) {
      throw new BadRequestException('Invalid follow-up index.');
    }
    const report = await this.sourceReportModel
      .findOne({ _id: new Types.ObjectId(id), isActive: true })
      .exec();
    if (!report) throw new NotFoundException('Health report not found.');
    const followUps = report.analysis?.followUpTests ?? [];
    const current = followUps[index];
    if (!current)
      throw new NotFoundException('Health report follow-up not found.');

    if (dto.dueAt !== undefined) {
      const dueAt = new Date(dto.dueAt);
      if (Number.isNaN(dueAt.getTime())) {
        throw new BadRequestException('Invalid follow-up date.');
      }
      current.dueAt = dueAt;
      current.source = 'owner_confirmed';
      current.status = HealthSourceReportFollowUpStatus.SCHEDULED;
    }
    if (dto.status !== undefined) {
      current.status = dto.status as HealthSourceReportFollowUpStatus;
    }
    if (dto.reminderEnabled !== undefined) {
      current.reminderEnabled = dto.reminderEnabled;
    }
    report.markModified('analysis.followUpTests');
    await report.save();
    await this.refreshLabFollowUpsForPlannedWindow();
    return report.toObject();
  }

  async generateStrategy(force = false) {
    const setup = await this.getSetup();
    if (!setup.readiness.planReady || !setup.baseline) {
      throw new ConflictException(
        'Complete the Health baseline and add at least one active target before generating strategy.',
      );
    }
    const context = await this.buildPlanningContext();
    const contextJson = this.compactJson(context, PLANNING_CONTEXT_MAX_CHARS);
    const contextHash = this.hash(contextJson);
    if (!force && setup.strategy?.contextHash === contextHash)
      return setup.strategy;

    const concurrentWaitStartedAt = new Date();
    let lease = await this.runtimeLeases.acquire(
      'health-planner:strategy',
      STRATEGY_LEASE_TTL_MS,
      { force },
    );
    if (!lease) {
      const concurrentlyGenerated = await this.waitForConcurrentStrategy(
        contextHash,
        concurrentWaitStartedAt,
      );
      if (concurrentlyGenerated) return concurrentlyGenerated;

      lease = await this.runtimeLeases.acquire(
        'health-planner:strategy',
        STRATEGY_LEASE_TTL_MS,
        { force, retryAfterConcurrentWait: true },
      );
    }
    if (!lease)
      throw new ConflictException(
        'HSAKAA is already refreshing the Health strategy. The active refresh has not finished yet; retry shortly.',
      );
    const startedAt = Date.now();
    try {
      await this.aiUsage.assertBudget(HsakaaAiUsageFeature.HEALTH_PLANNER);
      let result =
        await this.aiService.generateStructuredResponse<AiHealthStrategy>({
          name: 'hsakaa_health_strategy_v26',
          schema: HEALTH_STRATEGY_SCHEMA,
          reasoningEffort: 'low',
          verbosity: 'medium',
          maxOutputTokens: 6000,
          instructions: this.strategyInstructions(),
          input: contextJson,
        });
      const strategyValidationIssues = [
        ...this.findSupplementCoverageIssues(
          result.data,
          context.configuredSupplements,
        ),
        ...this.findRecommendationNamingIssues(result.data),
        ...this.findCareRecommendationCoverageIssues(result.data),
      ];
      if (strategyValidationIssues.length) {
        await this.aiUsage.record({
          feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
          status: HsakaaAiUsageStatus.FALLBACK,
          startedAt,
          model: result.model,
          responseId: result.responseId,
          usage: result.usage,
          metadata: {
            operation: 'health_strategy_validation_retry',
            issueCount: strategyValidationIssues.length,
          },
        });
        result =
          await this.aiService.generateStructuredResponse<AiHealthStrategy>({
            name: 'hsakaa_health_strategy_v26_retry',
            schema: HEALTH_STRATEGY_SCHEMA,
            reasoningEffort: 'low',
            verbosity: 'medium',
            maxOutputTokens: 6000,
            instructions: [
              this.strategyInstructions(),
              'The previous strategy failed required recommendation validation. Correct every issue below. Use review when evidence is insufficient; do not invent a need to start or stop anything. ADD/REPLACE rows must state a practical candidate product/form even if Products OS is empty; KEEP/REVIEW/REVIEW_STOP may leave suggestedProductName empty.',
              ...strategyValidationIssues.map((issue) => `- ${issue}`),
            ].join('\n'),
            input: contextJson,
          });
        const retryIssues = [
          ...this.findSupplementCoverageIssues(
            result.data,
            context.configuredSupplements,
          ),
          ...this.findRecommendationNamingIssues(result.data),
          ...this.findCareRecommendationCoverageIssues(result.data),
        ];
        if (retryIssues.length) {
          throw new Error(
            `Health strategy remained incomplete after retry: ${retryIssues.join('; ')}`,
          );
        }
      }
      const current = setup.strategy;
      const enrichedStrategy = await this.enrichMarketAvailability(
        result.data,
        setup.baseline.location,
      );
      const strategy = await this.strategyModel
        .findOneAndUpdate(
          { key: 'owner' },
          {
            $set: {
              ...enrichedStrategy,
              key: 'owner',
              contextHash,
              aiModel: result.model,
              aiResponseId: result.responseId,
              generatedAt: new Date(),
              version: (current?.version ?? 0) + 1,
              isActive: true,
            },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true,
          },
        )
        .lean()
        .exec();
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: HsakaaAiUsageStatus.SUCCESS,
        startedAt,
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
        metadata: { operation: 'health_strategy' },
      });
      return strategy;
    } catch (error) {
      this.logger.error(
        `Health strategy generation failed: ${this.errorMessage(error)}`,
      );
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: this.aiUsage.isBudgetExceeded(error)
          ? HsakaaAiUsageStatus.BLOCKED
          : HsakaaAiUsageStatus.ERROR,
        startedAt,
        metadata: { operation: 'health_strategy' },
        error,
      });
      throw new ServiceUnavailableException(
        process.env.NODE_ENV === 'production'
          ? 'HSAKAA could not generate the Health strategy. Existing strategy was kept unchanged.'
          : {
              message:
                'HSAKAA could not generate the Health strategy. Existing strategy was kept unchanged.',
              detail: this.errorMessage(error),
            },
      );
    } finally {
      await this.runtimeLeases.release(lease);
    }
  }

  private async waitForConcurrentStrategy(
    contextHash: string,
    startedAt: Date,
  ) {
    const deadline = Date.now() + STRATEGY_CONCURRENT_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, STRATEGY_CONCURRENT_POLL_MS),
      );
      const strategy = await this.strategyModel
        .findOne({
          key: 'owner',
          contextHash,
          generatedAt: { $gte: startedAt },
          isActive: true,
        })
        .lean()
        .exec();
      if (strategy) return strategy;
    }
    return null;
  }

  async getWindow(aheadDays = DEFAULT_AHEAD_DAYS) {
    const safeAheadDays = this.normalizeAheadDays(aheadDays);
    const today = this.getIstDateKey();
    const expectedDateKeys = this.buildDateKeys(today, safeAheadDays);
    const throughDateKey = expectedDateKeys[expectedDateKeys.length - 1];
    const [days, setup] = await Promise.all([
      this.planModel
        .find({
          dateKey: { $gte: today, $lte: throughDateKey },
          isActive: true,
        })
        .sort({ dateKey: 1 })
        .lean()
        .exec(),
      this.getSetup(),
    ]);
    const plannedKeys = new Set(days.map((day) => day.dateKey));
    const missingDateKeys = expectedDateKeys.filter(
      (dateKey) => !plannedKeys.has(dateKey),
    );
    return {
      policy: this.getPolicy(),
      setup: setup.readiness,
      strategy: setup.strategy,
      coverage: {
        today,
        throughDateKey,
        aheadDays: safeAheadDays,
        expectedDays: expectedDateKeys.length,
        plannedDays: days.length,
        missingDays: missingDateKeys.length,
        missingDateKeys,
        isCovered: missingDateKeys.length === 0,
        futureCoverageDays: days.filter((day) => day.dateKey > today).length,
      },
      latestGeneratedAt: days.reduce<Date | null>(
        (latest, day) =>
          !day.generatedAt
            ? latest
            : !latest || day.generatedAt > latest
              ? day.generatedAt
              : latest,
        null,
      ),
      days,
    };
  }

  async ensureRollingWindow(options: EnsureOptions) {
    let lease: RuntimeLeaseHandle | null = null;
    let stage = 'setup';
    try {
      const setup = await this.getSetup();
      if (!setup.readiness.planReady) {
        return {
          ...(await this.getWindow(options.aheadDays)),
          generation: { generated: 0, skipped: 'health_onboarding_incomplete' },
        };
      }

      stage = 'lease';
      const safeAheadDays = this.normalizeAheadDays(options.aheadDays);
      lease = await this.runtimeLeases.acquire(
        'health-planner:rolling-window',
        LEASE_TTL_MS,
        { reason: options.reason, aheadDays: safeAheadDays },
      );
      if (!lease)
        return {
          ...(await this.getWindow(safeAheadDays)),
          generation: {
            generated: 0,
            skipped: 'another_planner_run_is_active',
          },
        };

      stage = 'load_existing_days';
      const today = this.getIstDateKey();
      const expectedDateKeys = this.buildDateKeys(today, safeAheadDays);
      const throughDateKey = expectedDateKeys[expectedDateKeys.length - 1];
      const existing = await this.planModel
        .find({
          dateKey: { $gte: today, $lte: throughDateKey },
          isActive: true,
        })
        .sort({ dateKey: 1 })
        .lean()
        .exec();
      stage = 'planning_context';
      const context = await this.buildPlanningContext();
      const contextJson = this.compactJson(context, PLANNING_CONTEXT_MAX_CHARS);
      const contextHash = this.hash(contextJson);
      let strategy = setup.strategy;
      if (!strategy || strategy.contextHash !== contextHash) {
        stage = 'strategy';
        strategy = await this.generateStrategy(false);
      }
      const existingByDate = new Map(existing.map((day) => [day.dateKey, day]));
      const targetDateKeys = expectedDateKeys.filter((dateKey) => {
        const current = existingByDate.get(dateKey);
        if (!current) return true;
        if (
          current.lockedByOwner ||
          current.status !== HealthPlanStatus.PLANNED
        )
          return false;
        if (options.forceRefresh) return true;
        if (!options.refreshStale) return false;
        return (
          !isCurrentHealthPlanDayShape(current) ||
          current.contextHash !== contextHash
        );
      });
      if (!targetDateKeys.length)
        return {
          ...(await this.getWindow(safeAheadDays)),
          generation: { generated: 0, reason: options.reason, contextHash },
        };

      stage = 'plan_generation';
      const generatedBatches = await this.generatePlanDayBatches(
        targetDateKeys,
        contextJson,
        strategy,
        options.reason,
        existing.filter((day) => !targetDateKeys.includes(day.dateKey)),
      );
      const generatedDays = generatedBatches.flatMap(
        (batch) => batch.data.days,
      );
      this.assertGeneratedDates(generatedDays, targetDateKeys);
      const generationMetaByDate = new Map<
        string,
        { model: string; responseId: string }
      >();
      for (const batch of generatedBatches) {
        for (const day of batch.data.days) {
          generationMetaByDate.set(day.dateKey, {
            model: batch.model,
            responseId: batch.responseId,
          });
        }
      }
      const generatedAt = new Date();
      const supplementSchedule = this.configuredSupplementSummary(
        context.configuredSupplements,
      );
      stage = 'plan_persistence';
      await Promise.all(
        generatedDays.map(async (rawDay) => {
          const day = rawDay as Record<string, unknown>;
          const dateKey = String(day.dateKey);
          const current = existingByDate.get(dateKey);
          if (current?.lockedByOwner) return;
          const generationMeta = generationMetaByDate.get(dateKey);
          await this.planModel
            .findOneAndUpdate(
              { dateKey },
              {
                $set: {
                  ...day,
                  dateKey,
                  date: this.dateFromKey(dateKey),
                  supplementSchedule,
                  labFollowUps: await this.labFollowUpsForDate(dateKey),
                  contextHash,
                  generationReason: options.reason,
                  aiModel: generationMeta?.model ?? '',
                  aiResponseId: generationMeta?.responseId ?? '',
                  generatedAt,
                  version: (current?.version ?? 0) + 1,
                  isActive: true,
                },
                $setOnInsert: {
                  status: HealthPlanStatus.PLANNED,
                  lockedByOwner: false,
                  ownerNotes: '',
                },
              },
              {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                runValidators: true,
              },
            )
            .exec();
        }),
      );
      return {
        ...(await this.getWindow(safeAheadDays)),
        generation: {
          generated: generatedDays.length,
          dateKeys: targetDateKeys,
          reason: options.reason,
          contextHash,
          aiModel: [
            ...new Set(generatedBatches.map((item) => item.model)),
          ].join(','),
          responseId: generatedBatches.map((item) => item.responseId).join(','),
          usage: this.sumAiUsage(generatedBatches.map((item) => item.usage)),
          batches: generatedBatches.length,
        },
      };
    } catch (error) {
      const detail = this.errorMessage(error);
      this.logger.error(
        `Health planner generation failed at ${stage}: ${detail}`,
      );
      if (
        process.env.NODE_ENV !== 'production' &&
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException(
        process.env.NODE_ENV === 'production'
          ? 'HSAKAA could not refresh the rolling Health plan. Existing plan days were kept unchanged.'
          : {
              message:
                'HSAKAA could not refresh the rolling Health plan. Existing plan days were kept unchanged.',
              stage,
              detail,
            },
      );
    } finally {
      if (lease) await this.runtimeLeases.release(lease);
    }
  }

  async regenerateDay(dateKey: string) {
    this.assertDateKey(dateKey);
    const today = this.getIstDateKey();
    const maximum = this.addDays(today, MAX_AHEAD_DAYS);
    if (dateKey < today || dateKey > maximum)
      throw new BadRequestException(
        `Health plan regeneration is limited to ${today} through ${maximum}.`,
      );
    const current = await this.planModel
      .findOne({ dateKey, isActive: true })
      .lean()
      .exec();
    if (current?.lockedByOwner)
      throw new BadRequestException(
        'This Health plan day is owner-locked. Unlock it before regenerating.',
      );
    const context = await this.buildPlanningContext();
    const contextJson = this.compactJson(context, PLANNING_CONTEXT_MAX_CHARS);
    const contextHash = this.hash(contextJson);
    const strategy = await this.generateStrategy(false);
    const generated = await this.generatePlanDays(
      [dateKey],
      contextJson,
      strategy,
      'owner_day_regenerate',
    );
    this.assertGeneratedDates(generated.data.days, [dateKey]);
    const day = generated.data.days[0] as Record<string, unknown>;
    await this.planModel
      .findOneAndUpdate(
        { dateKey },
        {
          $set: {
            ...day,
            dateKey,
            date: this.dateFromKey(dateKey),
            supplementSchedule: this.configuredSupplementSummary(
              context.configuredSupplements,
            ),
            contextHash,
            generationReason: 'owner_day_regenerate',
            aiModel: generated.model,
            aiResponseId: generated.responseId,
            generatedAt: new Date(),
            version: (current?.version ?? 0) + 1,
            isActive: true,
          },
          $setOnInsert: {
            status: HealthPlanStatus.PLANNED,
            lockedByOwner: false,
            ownerNotes: '',
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      )
      .exec();
    return this.getWindow(DEFAULT_AHEAD_DAYS);
  }

  async updateDay(dateKey: string, dto: UpdateHealthPlanDayDto) {
    this.assertDateKey(dateKey);
    const update: Record<string, unknown> = {};
    if (dto.lockedByOwner !== undefined)
      update.lockedByOwner = dto.lockedByOwner;
    if (dto.status !== undefined) update.status = dto.status;
    if (dto.ownerNotes !== undefined) update.ownerNotes = dto.ownerNotes.trim();
    const result = await this.planModel
      .findOneAndUpdate(
        { dateKey, isActive: true },
        { $set: update },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
    if (!result) throw new NotFoundException('Health plan day not found.');
    return result;
  }

  @Cron('0 0 * * * *', { timeZone: TIMEZONE })
  async repairCoverageCron() {
    try {
      const setup = await this.getSetup();
      if (!setup.readiness.planReady) return;
      await this.ensureRollingWindow({
        aheadDays: DEFAULT_AHEAD_DAYS,
        forceRefresh: false,
        refreshStale: false,
        reason: 'hourly_coverage_repair',
      });
    } catch (error) {
      this.logger.warn(
        `Hourly Health coverage repair skipped: ${this.errorMessage(error)}`,
      );
    }
  }

  @Cron('0 30 5 * * *', { timeZone: TIMEZONE })
  async dailyRefreshCron() {
    try {
      const setup = await this.getSetup();
      if (!setup.readiness.planReady) return;
      await this.ensureRollingWindow({
        aheadDays: DEFAULT_AHEAD_DAYS,
        forceRefresh: false,
        refreshStale: false,
        reason: 'daily_health_roll',
      });
    } catch (error) {
      this.logger.warn(
        `Daily Health roll skipped: ${this.errorMessage(error)}`,
      );
    }
  }

  @Cron('0 0 6 * * 1', { timeZone: TIMEZONE })
  async weeklyStrategyCron() {
    try {
      const setup = await this.getSetup();
      if (!setup.readiness.planReady) return;
      await this.generateStrategy(true);
    } catch (error) {
      this.logger.warn(
        `Weekly Health strategy refresh skipped: ${this.errorMessage(error)}`,
      );
    }
  }

  private async buildPlanningContext() {
    const today = this.getIstDateKey();
    const from = this.addDays(today, -(CONTEXT_LOOKBACK_DAYS - 1));
    const [
      baseline,
      goals,
      photos,
      sourceReports,
      reports,
      recentHealth,
      recentDiet,
      recentMeditation,
      configuredSupplements,
      skincareProducts,
      haircareProducts,
      intimateCareProducts,
      ownerUpdates,
      executionEvidence,
      healthIntelligence,
      evidenceSettings,
      currentProducts,
      whatToBuyNext,
    ] = await Promise.all([
      this.baselineModel
        .findOne({ key: 'owner', isActive: true })
        .lean()
        .exec(),
      this.goalModel
        .find({ status: HealthGoalStatus.ACTIVE, isActive: true })
        .sort({ priority: -1 })
        .lean()
        .exec(),
      this.photoModel
        .find({ isActive: true })
        .select('-data')
        .sort({ takenAt: -1 })
        .limit(30)
        .lean()
        .exec(),
      this.sourceReportModel
        .find({ isActive: true })
        .select('-data')
        .sort({ reportDate: -1 })
        .limit(12)
        .lean()
        .exec(),
      this.reportsService.findAll(),
      this.healthService.findAll({
        startDate: from,
        endDate: today,
        page: 1,
        limit: 100,
      }),
      this.dietService.findAll(from, today),
      this.meditationService.findAll({
        startDate: from,
        endDate: today,
        page: 1,
        limit: 100,
      }),
      this.supplementsService.findAll(SupplementStatus.ACTIVE),
      this.skincareService.findProducts(SkincareProductStatus.ACTIVE),
      this.haircareService.findProducts(HaircareProductStatus.ACTIVE),
      this.intimateCareService.findProducts(IntimateCareProductStatus.ACTIVE),
      this.ownerUpdateModel
        .find({ isActive: true })
        .sort({ effectiveAt: -1, createdAt: -1 })
        .limit(40)
        .lean()
        .exec(),
      this.healthProgressService.getPlanningEvidence(14),
      this.healthIntelligenceService.getPlanningEvidence(30),
      this.evidenceSettingsModel
        .findOne({ key: 'owner', isActive: true })
        .lean()
        .exec(),
      this.productsService.findCurrentProducts(),
      this.productsService.getWhatToBuyNext(),
    ]);
    return {
      today,
      baseline,
      goals,
      governance: {
        sourcePriority: evidenceSettings?.sourcePriority ?? [
          ...DEFAULT_HEALTH_SOURCE_PRIORITY,
        ],
        autonomy: evidenceSettings?.autonomy ?? { ...DEFAULT_HEALTH_AUTONOMY },
      },
      recentPhotoAnalyses: photos.map((photo) => ({
        category: photo.category,
        angle: photo.angle,
        takenAt: photo.takenAt,
        analysis: photo.analysis,
      })),
      uploadedHealthReportEvidence: sourceReports.map((report) => ({
        label: report.label,
        reportDate: report.reportDate,
        originalName: report.originalName,
        analysis: report.analysis,
      })),
      latestHealthReports: reports.slice(0, 6),
      recentHealth,
      recentDiet,
      recentMeditation,
      configuredSupplements,
      skincareProducts,
      haircareProducts,
      intimateCareProducts,
      productInventory: currentProducts,
      productPurchaseSignals: whatToBuyNext,
      recentOwnerUpdates: ownerUpdates.map((item) => ({
        domain: item.domain,
        update: item.update,
        effectiveAt: item.effectiveAt,
      })),
      recentPlanExecution: executionEvidence.executions,
      recentProgressReviews: executionEvidence.reviews,
      healthIntelligence,
    };
  }

  private async generatePlanDayBatches(
    dateKeys: string[],
    contextJson: string,
    strategy: unknown,
    reason: string,
    referenceDays: unknown[] = [],
  ): Promise<Array<AiStructuredResponse<AiHealthPlan>>> {
    const batchSize = 2;
    const batches: string[][] = [];
    for (let index = 0; index < dateKeys.length; index += batchSize) {
      batches.push(dateKeys.slice(index, index + batchSize));
    }

    // Nutrition used to be generated in concurrent two-day batches. Each batch
    // therefore saw the same context but not the meals selected by the other
    // batches, which allowed the same "safe" meal template to repeat across
    // most of the seven-day window. Generate the small batches sequentially and
    // carry the already-used meal signatures forward.
    const generated: Array<AiStructuredResponse<AiHealthPlan>> = [];
    let nutritionDiversityContext =
      this.extractNutritionDiversityDays(referenceDays);

    for (const batch of batches) {
      const result = await this.generatePlanDays(
        batch,
        contextJson,
        strategy,
        reason,
        nutritionDiversityContext,
      );
      generated.push(result);
      nutritionDiversityContext = [
        ...nutritionDiversityContext,
        ...this.extractNutritionDiversityDays(result.data.days),
      ]
        .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
        .slice(-7);
    }

    return generated;
  }

  private sumAiUsage(usages: AiGenerationUsage[]): AiGenerationUsage {
    return usages.reduce<AiGenerationUsage>(
      (total, usage) => ({
        inputTokens: total.inputTokens + usage.inputTokens,
        outputTokens: total.outputTokens + usage.outputTokens,
        totalTokens: total.totalTokens + usage.totalTokens,
        cachedInputTokens: total.cachedInputTokens + usage.cachedInputTokens,
        reasoningTokens: total.reasoningTokens + usage.reasoningTokens,
      }),
      {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
      },
    );
  }

  private async generatePlanDays(
    dateKeys: string[],
    contextJson: string,
    strategy: unknown,
    reason: string,
    nutritionDiversityContext: NutritionDiversityDay[] = [],
  ): Promise<AiStructuredResponse<AiHealthPlan>> {
    const startedAt = Date.now();
    try {
      await this.aiUsage.assertBudget(HsakaaAiUsageFeature.HEALTH_PLANNER);
      let result =
        await this.aiService.generateStructuredResponse<AiHealthPlan>({
          name: 'hsakaa_health_rolling_plan_v26',
          schema: HEALTH_PLAN_SCHEMA,
          verbosity: 'medium',
          reasoningEffort: 'low',
          maxOutputTokens: 12000,
          instructions: this.planInstructions(),
          input: JSON.stringify({
            reason,
            dateKeys,
            strategy,
            contextJson,
            nutritionDiversityContext,
          }),
        });

      const specificityIssues = [
        ...this.findNutritionSpecificityIssues(result.data),
        ...this.findNutritionDiversityIssues(
          result.data,
          nutritionDiversityContext,
        ),
        ...this.findDailyRegimenCompletenessIssues(result.data),
      ];
      if (specificityIssues.length) {
        await this.aiUsage.record({
          feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
          status: HsakaaAiUsageStatus.FALLBACK,
          startedAt,
          model: result.model,
          responseId: result.responseId,
          usage: result.usage,
          metadata: {
            operation: 'rolling_health_plan_specificity_retry',
            reason,
            dayCount: dateKeys.length,
            issueCount: specificityIssues.length,
          },
        });
        result = await this.aiService.generateStructuredResponse<AiHealthPlan>({
          name: 'hsakaa_health_rolling_plan_v26_retry',
          schema: HEALTH_PLAN_SCHEMA,
          verbosity: 'medium',
          reasoningEffort: 'low',
          maxOutputTokens: 12000,
          instructions: [
            this.planInstructions(),
            'The previous plan failed Health-plan completeness validation. Correct every issue below. Keep exact food specificity, preserve calorie/macro intent, rotate meals against nutritionDiversityContext, include creatine/protein decisions, and return complete tagged skin/hair/body routines for every date.',
            ...specificityIssues.slice(0, 30).map((issue) => `- ${issue}`),
          ].join('\n'),
          input: JSON.stringify({
            reason,
            dateKeys,
            strategy,
            contextJson,
            nutritionDiversityContext,
          }),
        });
        const retryIssues = [
          ...this.findNutritionSpecificityIssues(result.data),
          ...this.findNutritionDiversityIssues(
            result.data,
            nutritionDiversityContext,
          ),
          ...this.findDailyRegimenCompletenessIssues(result.data),
        ];
        if (retryIssues.length) {
          throw new Error(
            `Health plan remained incomplete after retry: ${retryIssues
              .slice(0, 8)
              .join('; ')}`,
          );
        }
      }
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: HsakaaAiUsageStatus.SUCCESS,
        startedAt,
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
        metadata: {
          operation: 'rolling_health_plan',
          reason,
          dayCount: dateKeys.length,
        },
      });
      return result;
    } catch (error) {
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: this.aiUsage.isBudgetExceeded(error)
          ? HsakaaAiUsageStatus.BLOCKED
          : HsakaaAiUsageStatus.ERROR,
        startedAt,
        metadata: {
          operation: 'rolling_health_plan',
          reason,
          dayCount: dateKeys.length,
        },
        error,
      });
      throw error;
    }
  }

  private findRecommendationNamingIssues(strategy: AiHealthStrategy): string[] {
    const issues: string[] = [];

    for (const item of strategy.productRecommendations ?? []) {
      if (
        (item.action === 'add' || item.action === 'replace') &&
        !this.asText(item.suggestedProductName)
      ) {
        issues.push(
          `${item.domain} ${item.slot}: ADD/REPLACE must include a practical suggestedProductName even when Products OS has no matching item.`,
        );
      }
    }

    for (const item of strategy.supplementRecommendations ?? []) {
      if (
        (item.action === 'add' || item.action === 'replace') &&
        !this.asText(item.suggestedProductName)
      ) {
        issues.push(
          `${item.category}: ADD/REPLACE must include a practical supplement form/specification in suggestedProductName even when Products OS is empty.`,
        );
      }
    }

    return issues;
  }

  private findCareRecommendationCoverageIssues(
    strategy: AiHealthStrategy,
  ): string[] {
    const domains = new Set(
      (strategy.productRecommendations ?? []).map((item) => item.domain),
    );
    const issues: string[] = [];
    for (const domain of ['skincare', 'haircare', 'bodycare'] as const) {
      if (!domains.has(domain)) {
        issues.push(
          `Include at least one explicit ${domain} product/routine assessment row even when Products OS is empty.`,
        );
      }
    }
    return issues;
  }

  private findSupplementCoverageIssues(
    strategy: AiHealthStrategy,
    configuredSupplements: unknown,
  ): string[] {
    const recommendations = strategy.supplementRecommendations ?? [];
    const searchable = recommendations.map((item) =>
      [
        item.category,
        item.currentSupplement,
        item.suggestedProductName,
        item.suggestedBrand,
      ]
        .join(' ')
        .toLowerCase(),
    );
    const issues: string[] = [];

    for (const core of ['creatine', 'protein']) {
      if (!searchable.some((value) => value.includes(core))) {
        issues.push(
          `Include an explicit ${core === 'protein' ? 'protein powder' : 'creatine'} decision row (keep/add/replace/review/review_stop).`,
        );
      }
    }

    if (Array.isArray(configuredSupplements)) {
      for (const supplementValue of configuredSupplements) {
        const supplement = this.asRecord(supplementValue);
        const name = this.asText(supplement.name);
        if (!name) continue;
        const category = this.asText(supplement.category);
        const aliases = this.supplementIdentityAliases(
          [name, category].filter(Boolean).join(' '),
        );
        const covered = searchable.some((value) =>
          aliases.some((alias) => value.includes(alias)),
        );
        if (!covered) {
          issues.push(
            `Include a clear decision row for the currently configured supplement "${name}".`,
          );
        }
      }
    }

    return issues;
  }

  private supplementIdentityAliases(name: string): string[] {
    const normalized = name
      .toLowerCase()
      .replace(/omega\s*[- ]?3/g, 'omega3')
      .replace(/vitamin\s+d3/g, 'd3')
      .replace(/vitamin\s+b12/g, 'b12')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const aliases = new Set<string>();
    const add = (...values: string[]) =>
      values.filter(Boolean).forEach((value) => aliases.add(value));

    if (/\b(creatine|creatine monohydrate)\b/.test(normalized))
      add('creatine', 'creatine monohydrate');
    if (/\b(protein|whey|pea protein|plant protein)\b/.test(normalized))
      add('protein', 'protein powder', 'whey', 'plant protein', 'pea protein');
    if (/\b(d3|cholecalciferol|vitamin d)\b/.test(normalized))
      add('d3', 'vitamin d', 'cholecalciferol');
    if (/\b(b12|cobalamin|methylcobalamin|cyanocobalamin)\b/.test(normalized))
      add('b12', 'cobalamin', 'methylcobalamin', 'cyanocobalamin');
    if (/\b(omega3|fish oil|epa|dha)\b/.test(normalized))
      add('omega3', 'omega 3', 'fish oil', 'epa', 'dha');

    const ignored = new Set([
      'mg',
      'mcg',
      'ug',
      'g',
      'ml',
      'iu',
      'capsule',
      'capsules',
      'tablet',
      'tablets',
      'softgel',
      'softgels',
      'daily',
      'weekly',
      'once',
      'twice',
      'supplement',
    ]);
    const tokens = normalized
      .split(' ')
      .filter(
        (token) =>
          token.length >= 2 &&
          !/^\d+(?:\.\d+)?$/.test(token) &&
          !ignored.has(token),
      );
    if (tokens.length) {
      add(tokens.join(' '));
      tokens.slice(0, 3).forEach((token) => add(token));
    }

    return [...aliases];
  }

  private findDailyRegimenCompletenessIssues(plan: AiHealthPlan): string[] {
    const issues: string[] = [];
    const careTag = /^\[(OWNED|BUY|REVIEW)\]\s+/i;
    const textList = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.map((item) => this.asText(item)).filter(Boolean)
        : [];

    for (const [dayIndex, dayValue] of plan.days.entries()) {
      const day = this.asRecord(dayValue);
      const dateKey = this.asText(day.dateKey) || `day ${dayIndex + 1}`;
      const nutrition = this.asRecord(day.nutrition);
      const performance = Array.isArray(nutrition.performanceNutrition)
        ? nutrition.performanceNutrition.map((item) => this.asRecord(item))
        : [];
      const performanceCategories = new Set(
        performance.map((item) => this.asText(item.category)),
      );
      for (const category of ['creatine', 'protein_powder'] as const) {
        if (!performanceCategories.has(category)) {
          issues.push(
            `${dateKey}: nutrition.performanceNutrition must include ${category}.`,
          );
        }
      }
      for (const item of performance) {
        const action = this.asText(item.action);
        const status = this.asText(item.status);
        if (
          (action === 'add' || action === 'replace') &&
          status === 'pending_approval' &&
          !this.asText(item.item)
        ) {
          issues.push(
            `${dateKey}: pending ${action} performance-nutrition rows must name the exact form/specification to buy.`,
          );
        }
      }

      const skincare = this.asRecord(day.skincare);
      const skinMorning = textList(skincare.morning);
      const skinEvening = textList(skincare.evening);
      const morningText = skinMorning.join(' ').toLowerCase();
      const eveningText = skinEvening.join(' ').toLowerCase();
      if (!/(cleanser|cleanse|wash)/.test(morningText))
        issues.push(`${dateKey}: skincare AM must include cleansing.`);
      if (!/(moisturi[sz]|barrier|hydrating)/.test(morningText))
        issues.push(
          `${dateKey}: skincare AM must include a moisturiser/barrier decision.`,
        );
      if (!/(sunscreen|spf)/.test(morningText))
        issues.push(
          `${dateKey}: skincare AM must end with an explicit sunscreen/SPF step.`,
        );
      if (!/(cleanser|cleanse|wash)/.test(eveningText))
        issues.push(`${dateKey}: skincare PM must include cleansing.`);
      if (!/(moisturi[sz]|barrier|hydrating|recovery)/.test(eveningText))
        issues.push(
          `${dateKey}: skincare PM must include moisturising/barrier recovery.`,
        );

      const bodyCare = this.asRecord(day.bodyCare);
      const bodyMorning = textList(bodyCare.morning);
      const bodyEvening = textList(bodyCare.evening);
      const haircare = this.asRecord(day.haircare);
      const hairRoutine = textList(haircare.routine);
      for (const [label, steps] of [
        ['skincare AM', skinMorning],
        ['skincare PM', skinEvening],
        ['body care AM', bodyMorning],
        ['body care PM', bodyEvening],
        ['haircare', hairRoutine],
      ] as const) {
        if (!steps.length) issues.push(`${dateKey}: ${label} cannot be empty.`);
        const untagged = steps.find((step) => !careTag.test(step));
        if (untagged) {
          issues.push(
            `${dateKey}: ${label} steps must begin with [OWNED], [BUY], or [REVIEW].`,
          );
        }
      }
    }

    for (let index = 1; index < plan.days.length; index += 1) {
      const previous = this.asRecord(plan.days[index - 1]);
      const current = this.asRecord(plan.days[index]);
      const previousPm = textList(this.asRecord(previous.skincare).evening)
        .join(' ')
        .toLowerCase();
      const currentPm = textList(this.asRecord(current.skincare).evening)
        .join(' ')
        .toLowerCase();
      if (previousPm && currentPm && previousPm === currentPm) {
        issues.push(
          `${this.asText(current.dateKey) || `day ${index + 1}`}: skincare PM exactly repeats the previous generated night; use the planned treatment/recovery rotation unless repetition is explicitly required.`,
        );
      }
    }

    return issues;
  }

  private extractNutritionDiversityDays(
    values: unknown[],
  ): NutritionDiversityDay[] {
    return values
      .map((value) => {
        const day = this.asRecord(value);
        const dateKey = this.asText(day.dateKey);
        const nutrition = this.asRecord(day.nutrition);
        const meals = Array.isArray(nutrition.meals) ? nutrition.meals : [];
        return {
          dateKey,
          meals: meals
            .map((mealValue) => {
              const meal = this.asRecord(mealValue);
              return {
                label: this.normalizeMealLabel(this.asText(meal.label)),
                signature: this.mealSignature(meal),
              };
            })
            .filter((meal) => meal.signature),
        };
      })
      .filter((day) => day.dateKey && day.meals.length)
      .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  }

  private normalizeMealLabel(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private mealSignature(meal: Record<string, unknown>): string {
    const items = Array.isArray(meal.items) ? meal.items : [];
    return items
      .map((itemValue) => {
        const item = this.asRecord(itemValue);
        return this.normalizeFoodName(this.asText(item.name));
      })
      .filter(Boolean)
      .sort()
      .join('|');
  }

  private isPrimaryMealLabel(label: string): boolean {
    return /\b(breakfast|lunch|dinner|brunch|main meal|meal [123])\b/i.test(
      label,
    );
  }

  private findNutritionDiversityIssues(
    plan: AiHealthPlan,
    referenceDays: NutritionDiversityDay[] = [],
  ): string[] {
    const issues: string[] = [];
    const history = [...referenceDays].sort((left, right) =>
      left.dateKey.localeCompare(right.dateKey),
    );

    for (const current of this.extractNutritionDiversityDays(plan.days)) {
      const fullDaySignature = current.meals
        .map((meal) => `${meal.label}:${meal.signature}`)
        .join('||');

      const duplicateDay = history.find(
        (previous) =>
          previous.meals
            .map((meal) => `${meal.label}:${meal.signature}`)
            .join('||') === fullDaySignature,
      );
      if (duplicateDay) {
        issues.push(
          `${current.dateKey}: nutrition repeats the complete meal lineup from ${duplicateDay.dateKey}; rotate the actual foods/preparations while preserving nutrition targets.`,
        );
      }

      const previousDay = history[history.length - 1];
      if (previousDay) {
        const previousByLabel = new Map(
          previousDay.meals.map((meal) => [meal.label, meal.signature]),
        );
        const repeatedPrimaryMeals = current.meals.filter(
          (meal) =>
            this.isPrimaryMealLabel(meal.label) &&
            previousByLabel.get(meal.label) === meal.signature,
        );
        if (repeatedPrimaryMeals.length >= 2) {
          issues.push(
            `${current.dateKey}: ${repeatedPrimaryMeals.length} primary meals exactly repeat ${previousDay.dateKey}; change at least two main meal combinations unless a recorded constraint requires repetition.`,
          );
        }
      }

      for (const meal of current.meals) {
        if (!this.isPrimaryMealLabel(meal.label)) continue;
        const previousUses = history.filter((previous) =>
          previous.meals.some(
            (candidate) =>
              candidate.label === meal.label &&
              candidate.signature === meal.signature,
          ),
        );
        if (previousUses.length >= 2) {
          issues.push(
            `${current.dateKey}: ${meal.label || 'primary meal'} repeats the same exact food combination for a third time in the rolling window; rotate the meal while keeping targets practical.`,
          );
        }
      }

      history.push(current);
      history.sort((left, right) => left.dateKey.localeCompare(right.dateKey));
      if (history.length > 7) history.splice(0, history.length - 7);
    }

    return issues;
  }

  private findNutritionSpecificityIssues(plan: AiHealthPlan): string[] {
    const issues: string[] = [];
    const genericNames = new Set([
      'vegetable',
      'vegetables',
      'mixed vegetable',
      'mixed vegetables',
      'sabzi',
      'fruit',
      'fruits',
      'nuts',
      'nuts and seeds',
      'nuts/seeds',
      'flour',
      'atta',
      'grain',
      'grains',
      'rice',
      'protein',
      'protein source',
    ]);

    for (const [dayIndex, dayValue] of plan.days.entries()) {
      const day = this.asRecord(dayValue);
      const dateKey = this.asText(day.dateKey) || `day ${dayIndex + 1}`;
      const nutrition = this.asRecord(day.nutrition);
      const meals = Array.isArray(nutrition.meals) ? nutrition.meals : [];
      for (const [mealIndex, mealValue] of meals.entries()) {
        const meal = this.asRecord(mealValue);
        const mealLabel = this.asText(meal.label) || `meal ${mealIndex + 1}`;
        const items = Array.isArray(meal.items) ? meal.items : [];
        if (!items.length) {
          issues.push(`${dateKey} ${mealLabel}: no exact food items.`);
          continue;
        }
        for (const itemValue of items) {
          const item = this.asRecord(itemValue);
          const name = this.normalizeFoodName(this.asText(item.name));
          const category = this.asText(item.category);
          if (!name || genericNames.has(name)) {
            issues.push(
              `${dateKey} ${mealLabel}: ${category || 'food'} must name a specific item, not "${name || 'blank'}".`,
            );
            continue;
          }
          if (
            category === 'rice' &&
            !/\b(basmati|brown|red|white|black|parboiled|sona masoori|hand[- ]?pounded|matta|ponni|gobindobhog)\b/i.test(
              name,
            )
          ) {
            issues.push(
              `${dateKey} ${mealLabel}: rice item "${name}" must state the rice type/variety.`,
            );
          }
          if (
            category === 'grain_flour' &&
            /^(whole )?(grain|flour|atta)$/i.test(name)
          ) {
            issues.push(
              `${dateKey} ${mealLabel}: flour/grain item "${name}" must state the grain or flour type.`,
            );
          }
        }
      }
    }
    return issues;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalizeFoodName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private strategyInstructions(): string {
    return [
      'You are HSAKAA building the private single-owner Health strategy.',
      'Use only supplied baseline, active targets, tracked data, uploaded source-report evidence, generated Health Reports, photo analyses and configured routines.',
      'The baseline describes current state; goals describe desired state. Apply governance.sourcePriority strictly: professional instructions > explicit owner updates > connected objective data > structured health logs > task completion > AI inference.',
      'Respect governance.autonomy. Autonomous domains may be adjusted within recorded constraints; approval domains must be proposed but not silently changed; never/locked domains must never be changed by the AI.',
      'Explicit clinician, dietitian or trainer constraints override generic advice.',
      'If gym planningMode is hsakaa, design the programming direction yourself. If it is trainer_program, preserve the trainer program and only adapt recovery/cardio/accessory guidance around it.',
      'TRAINING STRUCTURE: preserve three distinct daily movement blocks: a morning walk/run/jog conditioning session, a separate evening resistance-training session, and a separate easy normal walk. Do not collapse them into one workout.',
      'Treat photo analyses as visual observations only, never diagnoses. Treat uploaded report analysis as extracted evidence only; do not create a new diagnosis from it.',
      'Do not start, stop or change medication/supplement doses automatically. Existing supplement schedules are authoritative. For non-prescription supplements, you may recommend keep/add/replace/review/review_stop, but every change requires owner approval; medically prescribed items and review_stop recommendations require professional review.',
      'PRODUCTS: use productInventory, configured skincare/haircare products, configuredSupplements and productPurchaseSignals when available, but Products OS is never a prerequisite for planning. HSAKAA must decide the clinically conservative OTC routine first, then mark what can use an owned product versus what should be shortlisted/bought/reviewed. Prefer keeping a suitable product the owner already has over adding another product.',
      'For skincare/haircare/bodycare, productRecommendations may name specific non-prescription/OTC candidate products and brands when useful. Always assess all three domains even when no products have been pre-entered. For skin, cover the practical core slots (cleanser, AM treatment decision, moisturizer, sunscreen, PM treatment/recovery). For hair, cover wash/cleanse and conditioning/scalp-care needs where relevant. For body care, cover cleansing, moisturising and exposed-skin sunscreen/treatment needs where relevant. KEEP/REVIEW may leave suggestedProductName empty when no new product is needed; ADD/REPLACE must provide a practical candidate product/form even when Products OS has no matching item yet. Never require the owner to pre-create a product before HSAKAA can recommend what to buy. For productRecommendations, set availabilityStatus=not_checked, availabilitySummary empty and availabilitySources empty; the system separately verifies public retail availability using only the saved location and product name.',
      'For supplements, explicitly assess protein powder and creatine plus every currently configured supplement, including vitamin D3, B12 and omega-3 when present. Each should receive a clear keep/add/replace/review/review_stop outcome rather than being silently omitted. If evidence is insufficient, use review rather than inventing a need. KEEP/REVIEW/REVIEW_STOP may leave suggestedProductName empty when the current supplement itself is the subject of the decision. ADD/REPLACE must provide a practical generic form/specification (and optionally a brand/product) even when Products OS has no matching item yet, so the owner can understand what to buy. Set availabilityStatus=not_checked and leave availabilitySummary/sources empty for later public market verification. Do not recommend hormones, steroids, prescription drugs or vague booster products.',
      'Use review_stop only to tell the owner that an existing supplement may warrant stopping/review based on explicit clinician instruction, documented report evidence, owner-reported side effects/interactions, or a clearly recorded reason. review_stop never executes a stop and requires owner approval; medically prescribed items require professional review.',
      'Location is planning context for food practicality and public retail verification only. Do not infer health facts from location.',
      'Do not silently change intimate-care product records. You may recommend review, routine consistency or professional evaluation.',
      'Use intimate-care baseline and configured products only for conservative routine planning. Never request, infer from, or analyze intimate-area photos.',
      'Be measurable: connect each priority to a target or tracked signal where possible.',
      'Safety escalations should state when owner/clinician review is appropriate without diagnosing.',
    ].join('\n');
  }

  private planInstructions(): string {
    return [
      'You are HSAKAA generating a precise rolling Health execution plan for the requested dates.',
      'Return exactly one day for every requested dateKey and no extra dates.',
      'Use the supplied strategy, baseline, active goals, tracked health/WHOOP, diet, meditation, photo analyses and current products.',
      'Apply governance.sourcePriority strictly whenever sources conflict: professional instructions > explicit owner updates > connected objective data > structured health logs > task completion > AI inference.',
      'Respect governance.autonomy. Do not silently change any domain marked approval, never or locked.',
      'MOVEMENT STRUCTURE: every day must contain morningConditioning, training and normalWalk as three distinct blocks. morningConditioning is a morning walk/run/jog session adapted to recovery and constraints. training is the separate evening resistance session; on non-lifting days use a recovery/rest session with empty exercises. normalWalk is a separate easy walk and must not be merged into the morning session.',
      'Use baseline gym timing preferences when available; otherwise morningConditioning around 07:00, evening weights around 19:00 and normalWalk around 20:30 are reasonable defaults.',
      'GYM: include exact exercises, sets, rep range, RIR, RPE, rest seconds, tempo, warm-up, cardio, cooldown, progression rule and deload note. Rest days should use an empty exercises array with sets/reps not invented.',
      'Respect injury/pain/clinician/trainer constraints. If recovery or pain signals are poor, reduce workload rather than forcing progression.',
      'If a trainer program is supplied, follow its split/exercises unless an explicit safety/recovery reason requires a conservative adaptation.',
      'NUTRITION: use numeric calorie/macros only when baseline/goal/tracked context supports them. Use 0 rather than inventing a target when evidence is insufficient. Respect diet restrictions and clinician/dietitian instructions.',
      'FOOD SPECIFICITY: every meal must contain exact food items and practical quantities. Never write only generic labels such as vegetables, mixed vegetables, sabzi, fruit, nuts, flour, atta, grains, protein or rice. Name the actual choice: e.g. spinach/bhindi/broccoli, whole-wheat atta/jowar flour, and brown/red/white basmati/hand-pounded/other explicit rice type. Include preparation, why it is there, and practical alternatives. Use the saved location to prefer foods that are realistically available locally. Include fruits and nuts/seeds only when they fit the plan rather than forcing them into every day.',
      'MEAL ROTATION: nutritionDiversityContext contains meals already selected elsewhere in the current rolling window. Do not repeat an entire day meal-for-meal. Keep calorie, macro and dietary constraints coherent while rotating practical food combinations, protein sources, grains, vegetables, fruit choices and preparation styles. The same exact primary-meal combination should appear no more than twice in a seven-day window and should not be repeated on consecutive days unless an explicit clinician/dietitian constraint requires it. Reusing useful staples is allowed; repeating the same full breakfast/lunch/dinner template is not.',
      'PERFORMANCE NUTRITION / SUPPLEMENTS: nutrition.performanceNutrition must contain explicit daily rows for creatine and protein powder, plus any other strategy recommendation that materially affects that day. Copy the strategy decision into action. If it is already configured/owner-approved, status=active and explain how it fits today without changing the saved dose/timing. If it is ADD/REPLACE and not configured, status=pending_approval, approvalRequired=true, state the exact form/specification to buy and how it would fit once approved, but do not invent or activate a dose. REVIEW/REVIEW_STOP uses status=review_required. If protein powder is unnecessary because exact meals already meet the protein target, use not_needed/not_needed_today and say so. Creatine and protein powder must never be silently omitted.',
      'CARE ROUTINES ARE THE DAILY SOURCE OF TRUTH: do not require a product to be pre-entered before writing the routine. Use configured/owned products where suitable; otherwise use the strategy recommendation. EVERY skincare, haircare and bodyCare step must begin with exactly one status tag: [OWNED] when an existing configured product can be used, [BUY] when an OTC product/form should be shortlisted before the step can be followed, or [REVIEW] when owner/professional confirmation is needed. Do not auto-purchase, auto-accept, or silently add prescription treatments.',
      'SKINCARE AM: return a complete ordered routine, not generic advice. Usually cover cleansing, an evidence-suitable treatment decision, moisturising when needed, and sunscreen as the final morning step. Vitamin C or caffeine/eye treatment may be selected when supported by the owner baseline/goals/tolerance; never force them just because they are examples.',
      'SKINCARE PM: return the full ordered routine for that specific date. Use a deliberate weekly rotation of treatment nights versus recovery/barrier nights according to baseline, tolerance, photos and existing products. Adjacent generated days should not have an identical PM routine unless the strategy explicitly requires the same recovery routine. Avoid stacking irritating actives. Every step must say what to use, order, and any relevant frequency/usage note.',
      'BODY CARE: populate bodyCare every day with practical AM/PM steps such as cleansing, moisturising, exposed-body sunscreen and targeted OTC care only when supported. This is separate from intimate care.',
      'HAIRCARE: give the exact routine for that date and explicitly state wash day/non-wash day. Include product type/step order and timing. Use configured treatments if present; do not invent prescription scalp/hair medicines.',
      'INTIMATE CARE: use only baseline notes and configured routine products. Keep guidance hygiene/routine-oriented, never request intimate photos, and escalate concerning symptoms to professional review rather than diagnosing.',
      'Use recent plan-execution comparisons, owner feedback, progress-review recommendations and healthIntelligence to adapt the next days. Repeated misses should make the plan more realistic rather than repeating the same failing structure.',
      'TRAINING PROGRESSION: use healthIntelligence.trainingProgression as evidence. Progress only when completion, exertion, recovery and pain signals support it; hold/reduce/review when the intelligence says so.',
      'PLATEAUS/CORRELATIONS: use them as planning evidence, not diagnosis or proof of causation. Do not overreact to low-confidence small samples.',
      'HEALTH MEMORY: respect successfulPatterns, failedPatterns and avoidOrReview so the plan does not repeatedly recommend routines that have already failed or caused issues.',
      'Every day should include useful check-ins so actual progress can be compared with the plan.',
      'Avoid repetitive filler across days; vary training stimulus/recovery focus according to the strategy while preserving a coherent weekly program.',
    ].join('\n');
  }

  private normalizeReportFollowUps(
    items: Array<{
      testName: string;
      timingText: string;
      explicitDate: string;
      intervalValue: number;
      intervalUnit: 'days' | 'weeks' | 'months' | 'unknown';
      reason: string;
    }>,
    reportDate: Date,
  ) {
    return items
      .filter((item) => item?.testName?.trim())
      .map((item) => {
        let dueAt: Date | null = null;
        if (item.explicitDate?.trim()) {
          const parsed = new Date(`${item.explicitDate.trim()}T09:00:00+05:30`);
          if (!Number.isNaN(parsed.getTime())) dueAt = parsed;
        } else if (
          Number.isFinite(item.intervalValue) &&
          item.intervalValue > 0 &&
          item.intervalUnit !== 'unknown'
        ) {
          dueAt = new Date(reportDate);
          if (item.intervalUnit === 'days') {
            dueAt.setDate(dueAt.getDate() + item.intervalValue);
          } else if (item.intervalUnit === 'weeks') {
            dueAt.setDate(dueAt.getDate() + item.intervalValue * 7);
          } else if (item.intervalUnit === 'months') {
            dueAt.setMonth(dueAt.getMonth() + item.intervalValue);
          }
          dueAt.setHours(9, 0, 0, 0);
        }
        return {
          testName: item.testName.trim(),
          timingText: item.timingText?.trim() ?? '',
          dueAt,
          reason: item.reason?.trim() ?? '',
          source: 'report_explicit' as const,
          status: dueAt
            ? HealthSourceReportFollowUpStatus.SCHEDULED
            : HealthSourceReportFollowUpStatus.NEEDS_CONFIRMATION,
          reminderEnabled: true,
        };
      });
  }

  private async refreshLabFollowUpsForPlannedWindow() {
    const today = this.getIstDateKey();
    const through = this.addDays(today, MAX_AHEAD_DAYS);
    const plans = await this.planModel
      .find({
        dateKey: { $gte: today, $lte: through },
        isActive: true,
      })
      .select({ dateKey: 1 })
      .lean()
      .exec();
    for (const plan of plans) {
      await this.planModel.updateOne(
        { dateKey: plan.dateKey, isActive: true },
        {
          $set: { labFollowUps: await this.labFollowUpsForDate(plan.dateKey) },
        },
      );
    }
    if (plans.length) {
      await this.healthProgressService.syncPlanTasksForDates(
        plans.map((plan) => plan.dateKey),
      );
    }
  }

  private async labFollowUpsForDate(dateKey: string) {
    const start = this.dateFromKey(dateKey);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const reports = await this.sourceReportModel
      .find({
        isActive: true,
        'analysis.followUpTests': {
          $elemMatch: {
            dueAt: { $gte: start, $lt: end },
            status: HealthSourceReportFollowUpStatus.SCHEDULED,
            reminderEnabled: true,
          },
        },
      })
      .select('-data')
      .lean()
      .exec();
    return reports.flatMap((report) =>
      (report.analysis?.followUpTests ?? [])
        .filter((item) => {
          if (
            !item.dueAt ||
            item.status !== HealthSourceReportFollowUpStatus.SCHEDULED ||
            item.reminderEnabled === false
          ) {
            return false;
          }
          const due = new Date(item.dueAt);
          return due >= start && due < end;
        })
        .map((item) => ({
          sourceReportId: String(report._id),
          testName: item.testName,
          dueAt: new Date(item.dueAt as Date),
          reason: item.reason || item.timingText || 'Scheduled lab follow-up.',
        })),
    );
  }

  private async enrichMarketAvailability(
    strategy: AiHealthStrategy,
    location?: Record<string, unknown>,
  ): Promise<AiHealthStrategy> {
    const candidates = [
      ...(strategy.productRecommendations ?? []).map((item, index) => ({
        key: `care:${index}`,
        domain: item.domain,
        productName: item.suggestedProductName,
        brand: item.suggestedBrand,
      })),
      ...(strategy.supplementRecommendations ?? []).map((item, index) => ({
        key: `supplement:${index}`,
        domain: 'supplement' as const,
        productName: item.suggestedProductName,
        brand: item.suggestedBrand,
      })),
    ].filter((item) => item.productName?.trim());

    const availability = await this.marketResearchService.verifyCandidates({
      location,
      candidates,
    });
    const byKey = new Map(availability.map((item) => [item.key, item]));

    return {
      ...strategy,
      productRecommendations: (strategy.productRecommendations ?? []).map(
        (item, index) => {
          const market = byKey.get(`care:${index}`);
          return {
            ...item,
            availabilityStatus: market?.status ?? 'not_checked',
            availabilitySummary: market?.summary ?? '',
            availabilitySources: market?.sources ?? [],
            requiresApproval: true,
          };
        },
      ),
      supplementRecommendations: (strategy.supplementRecommendations ?? []).map(
        (item, index) => {
          const market = byKey.get(`supplement:${index}`);
          return {
            ...item,
            availabilityStatus: market?.status ?? 'not_checked',
            availabilitySummary: market?.summary ?? '',
            availabilitySources: market?.sources ?? [],
            requiresApproval: true,
            requiresProfessionalReview:
              item.requiresProfessionalReview || item.action === 'review_stop',
          };
        },
      ),
    };
  }

  private async readPhotoBytes(photo: {
    storageKey?: string;
    data?: Buffer;
  }): Promise<Buffer> {
    if (photo.storageKey) {
      return this.objectStorage.getObject(photo.storageKey);
    }
    if (photo.data?.length) return Buffer.from(photo.data);
    throw new ServiceUnavailableException(
      'Progress photo content is unavailable. Run Health storage migration or restore the object.',
    );
  }

  private async readSourceReportBytes(report: {
    storageKey?: string;
    data?: Buffer;
  }): Promise<Buffer> {
    if (report.storageKey) {
      return this.objectStorage.getObject(report.storageKey);
    }
    if (report.data?.length) return Buffer.from(report.data);
    throw new ServiceUnavailableException(
      'Health report content is unavailable. Run Health storage migration or restore the object.',
    );
  }

  private configuredSupplementSummary(items: unknown[]): string[] {
    return items.slice(0, 30).map((item) => {
      if (!item || typeof item !== 'object')
        return 'Follow configured supplement schedule.';
      const record = item as Record<string, unknown>;
      const name =
        typeof record.name === 'string' ? record.name : 'Configured supplement';
      return `${name} — follow the existing Supplements schedule exactly; HSAKAA does not alter dose or timing.`;
    });
  }

  private setupPrompts(
    baseline: HealthBaseline | null,
    activeGoals: number,
    photoCounts: Record<string, number>,
    sourceReportCount: number,
  ): string[] {
    const prompts: string[] = [];
    if (!baseline)
      prompts.push(
        'Describe what you look/feel like now, your lifestyle, constraints, gym experience, diet, meditation, skin, hair and private intimate-care baseline.',
      );
    if (baseline && !baseline.onboardingCompleted)
      prompts.push(
        'Review the baseline and mark onboarding complete when it accurately represents your current state.',
      );
    if (!activeGoals)
      prompts.push(
        'Add at least one measurable target: exact date, relative horizon, or ongoing.',
      );
    if (!photoCounts.body)
      prompts.push(
        'Add private body baseline photos (front/side/back where comfortable) for progress comparison.',
      );
    if (!photoCounts.skin)
      prompts.push(
        'Add private skin photos (front/left/right or concern close-up) for routine progress tracking.',
      );
    if (!photoCounts.hair)
      prompts.push(
        'Add private hair photos (front/temples/top/crown) for progress tracking.',
      );
    if (!sourceReportCount) {
      prompts.push(
        'Upload relevant private health/lab reports when available so HSAKAA can use documented findings and clinician instructions as planning evidence.',
      );
    }
    return prompts;
  }

  private validateGoalHorizon(
    mode: HealthGoalHorizonMode,
    targetDate?: string,
    relativeMonths?: number | null,
  ) {
    if (mode === HealthGoalHorizonMode.EXACT_DATE && !targetDate)
      throw new BadRequestException('Exact-date goals require targetDate.');
    if (mode === HealthGoalHorizonMode.RELATIVE && !relativeMonths)
      throw new BadRequestException('Relative goals require relativeMonths.');
  }

  private assertGeneratedDates(
    days: Array<{ dateKey: string }>,
    expected: string[],
  ) {
    const actual = days.map((day) => day.dateKey).sort();
    const wanted = [...expected].sort();
    if (
      actual.length !== wanted.length ||
      actual.some((value, index) => value !== wanted[index])
    ) {
      throw new Error(
        `AI Health plan returned unexpected dates. expected=${wanted.join(',')} actual=${actual.join(',')}`,
      );
    }
  }

  private normalizeAheadDays(value = DEFAULT_AHEAD_DAYS) {
    if (!Number.isFinite(value)) return DEFAULT_AHEAD_DAYS;
    return Math.min(
      MAX_AHEAD_DAYS,
      Math.max(DEFAULT_AHEAD_DAYS, Math.round(value)),
    );
  }

  private buildDateKeys(start: string, aheadDays: number) {
    return Array.from({ length: aheadDays }, (_, index) =>
      this.addDays(start, index),
    );
  }

  private getIstDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private addDays(dateKey: string, days: number) {
    const date = new Date(`${dateKey}T12:00:00+05:30`);
    date.setUTCDate(date.getUTCDate() + days);
    return this.getIstDateKey(date);
  }

  private dateFromKey(dateKey: string) {
    return new Date(`${dateKey}T00:00:00+05:30`);
  }

  private assertDateKey(value: string) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(this.dateFromKey(value).getTime())
    )
      throw new BadRequestException('Invalid Health plan date.');
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private assertObjectId(value: string, label: string) {
    if (!Types.ObjectId.isValid(value))
      throw new BadRequestException(`Invalid ${label}.`);
  }

  private compactJson(value: unknown, maxChars: number) {
    const json = JSON.stringify(value);
    return json.length <= maxChars ? json : json.slice(0, maxChars);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
