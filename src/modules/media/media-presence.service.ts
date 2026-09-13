import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { MediaCoreService } from './media-core.service';
import { MediaGrowthService } from './media-growth.service';
import {
  MediaWorldContext,
  MediaWorldContextService,
} from './media-world-context.service';
import {
  MediaContentItem,
  MediaContentItemDocument,
} from './schemas/media-content-item.schema';
import {
  MediaPresenceStrategy,
  MediaPresenceStrategyDocument,
} from './schemas/media-presence-strategy.schema';
import {
  MediaVoiceProfile,
  MediaVoiceProfileDocument,
} from './schemas/media-voice-profile.schema';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';

const GROWTH_PLATFORMS = [
  MediaPlatform.LINKEDIN,
  MediaPlatform.INSTAGRAM,
  MediaPlatform.YOUTUBE,
  MediaPlatform.X,
  MediaPlatform.WHATSAPP,
] as const;

interface GeneratedPresenceStrategy {
  northStar: string;
  positioning: string;
  knownFor: string[];
  audiences: Array<{ name: string; need: string; desiredPerception: string }>;
  narratives: Array<{
    key: string;
    title: string;
    role: string;
    targetSharePercent: number;
    companyName: string;
    guardrails: string[];
  }>;
  platformRoles: Array<{
    platform: MediaPlatform;
    role: string;
    purpose: string;
    primaryFormats: MediaPostType[];
    minPostsPerWeek: number;
    preferredPostsPerWeek: number;
    maxPostsPerWeek: number;
    allowSkipDays: boolean;
  }>;
  companyBalance: Array<{
    companyName: string;
    narrativeRole: string;
    targetSharePercent: number;
    guardrails: string[];
  }>;
  thirtyDayObjectives: string[];
  ninetyDayObjectives: string[];
  reputationGoals: string[];
  neverBecome: string[];
  claimsRequiringReview: string[];
  privacyRules: string[];
}

interface GeneratedVoiceProfile {
  summary: string;
  principles: string[];
  sentenceRhythm: string;
  vocabulary: string;
  humour: string;
  profanity: string;
  technicalDepth: string;
  emotionalOpenness: string;
  storytelling: string;
  doMore: string[];
  doNot: string[];
  avoidPhrases: string[];
  authenticityChecks: string[];
  confidence: number;
}

@Injectable()
export class MediaPresenceService {
  constructor(
    @InjectModel(MediaPresenceStrategy.name)
    private readonly strategyModel: Model<MediaPresenceStrategyDocument>,
    @InjectModel(MediaVoiceProfile.name)
    private readonly voiceModel: Model<MediaVoiceProfileDocument>,
    @InjectModel(MediaContentItem.name)
    private readonly contentModel: Model<MediaContentItemDocument>,
    private readonly aiService: AiService,
    private readonly worldContextService: MediaWorldContextService,
    private readonly coreService: MediaCoreService,
    private readonly growthService: MediaGrowthService,
  ) {}

  async overview() {
    const [strategy, voice, context] = await Promise.all([
      this.getStrategy(),
      this.getVoiceProfile(),
      this.worldContextService.build(120),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      strategy,
      voice,
      context: this.contextOverview(context),
      policy: {
        wholeOsContextEnabled: true,
        privateOnlyDetailsSentToMediaGeneration: false,
        peopleAndMemoryExcludedFromMedia: true,
        allOtherPersonalOsSourcesPublicSafe: true,
        internalSafeCanShapeStrategy: false,
        needsReviewCannotBecomePublicFactWithoutApproval: false,
        publicSafeCanGroundContent: true,
        contentDirectorConsumesPresenceStrategy: true,
        contentDirectorConsumesVoiceProfile: true,
        autonomousPublishingEnabled: false,
      },
    };
  }

  getStrategy() {
    return this.strategyModel
      .findOne({ key: 'primary', isActive: true })
      .lean();
  }

  getVoiceProfile() {
    return this.voiceModel.findOne({ key: 'primary', isActive: true }).lean();
  }

  worldContext(days = 120) {
    return this.worldContextService.build(days);
  }

  async bootstrap(input: { force?: boolean; notes?: string } = {}) {
    const context = await this.worldContextService.build(120);
    const [strategy, voice] = await Promise.all([
      this.generateStrategy(input, context),
      this.generateVoiceProfile(input, context),
    ]);
    return { strategy, voice, context: this.contextOverview(context) };
  }

  async generateStrategy(
    input: { force?: boolean; notes?: string } = {},
    suppliedContext?: MediaWorldContext,
  ) {
    const context =
      suppliedContext ?? (await this.worldContextService.build(120));
    const existing = await this.strategyModel.findOne({
      key: 'primary',
      isActive: true,
    });
    if (
      !input.force &&
      !input.notes?.trim() &&
      existing?.sourceFingerprint === context.fingerprint
    ) {
      return existing;
    }

    const accounts = await this.coreService.listAccounts();
    const growthLearnings = await this.growthService.directorLearningContext(
      GROWTH_PLATFORMS as unknown as MediaPlatform[],
    );

    try {
      const response =
        await this.aiService.generateStructuredResponse<GeneratedPresenceStrategy>(
          {
            name: 'hsakaa_media_presence_strategy_v31',
            instructions: [
              'You are HSAKAA Presence Strategist for Aakash. Build a durable personal-brand strategy, not a one-week content list.',
              'The goal is to make the real Aakash more visible: builder/operator/technologist, his companies as evidence of what he builds, his learning and personality without turning him into a generic creator or motivational influencer.',
              'Starting from day one is fine. When media performance history is thin, explicitly favor exploration and learning instead of pretending to know what already wins.',
              'MEDIA PRIVACY POLICY: PEOPLE and MEMORY are excluded entirely. Every other supplied Personal OS source—including Companies, Health, Tasks, Journal, Library, Highlights, Decisions, Hobbies, Media and HSAKAA—is PUBLIC_SAFE for Media by owner policy.',
              'Use source-grounded company priorities/products/markets/status and health/routine metrics when supplied. Never invent metrics, customers, achievements, launches, funding, revenue, diagnoses, outcomes or facts that are absent from context.',
              'Do not infer or reconstruct PEOPLE/MEMORY details from other context.',
              'Configured company context is public-safe evidence, not merely internal strategy context.',
              'Design distinct jobs for LinkedIn, Instagram, YouTube, X and WhatsApp. Do not make them five copies of the same feed.',
              'Posting every day is not mandatory. Set realistic minimum/preferred/maximum weekly cadence and allow skip days when quality, novelty or workload does not justify posting.',
              'The platform format vocabulary must come only from the supplied enum values.',
              'Company content must support the umbrella Aakash narrative rather than turning the personal brand into repeated company advertising.',
              'Include explicit Never Become guardrails against fake-guru language, manufactured vulnerability, generic hustle/motivation, unsupported certainty and repetitive company promotion.',
              'This strategy may recommend review boundaries, but it does not approve, schedule or publish content.',
            ].join('\n'),
            input: JSON.stringify({
              owner: 'Aakash',
              notes: input.notes?.trim() || null,
              configuredAccounts: accounts.map((account) => ({
                platform: account.platform,
                displayName: account.displayName,
                strategy: account.strategy,
              })),
              companies: context.companies,
              publicSafeContext: context.publicSafe.slice(0, 80),
              internalSafeContext: context.internalSafe.slice(0, 80),
              needsReviewContext: context.needsReview.slice(0, 40),
              hsakaa: context.hsakaa,
              recentMedia: context.recentMedia,
              growthLearnings,
              privacyPolicy: context.policy,
            }),
            verbosity: 'medium',
            reasoningEffort: 'medium',
            maxOutputTokens: 9000,
            schema: this.strategyJsonSchema(),
          },
        );

      this.assertPlatformCoverage(response.data.platformRoles);
      const nextVersion = (existing?.version ?? 0) + 1;
      const baselineNeverBecome = [
        'Do not become a generic motivational or hustle-content account.',
        'Do not manufacture vulnerability, controversy, achievements or certainty for engagement.',
        'Do not let company promotion overwhelm Aakash as a person and builder.',
        'Do not mechanically repeat winning hooks, examples, structures or phrases.',
      ];
      const strategy = await this.strategyModel.findOneAndUpdate(
        { key: 'primary' },
        {
          $set: {
            ...response.data,
            neverBecome: this.unique([
              ...response.data.neverBecome,
              ...baselineNeverBecome,
            ]),
            key: 'primary',
            version: nextVersion,
            aiModel: response.model,
            aiResponseId: response.responseId,
            sourceFingerprint: context.fingerprint,
            generatedAt: new Date(),
            isActive: true,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      return strategy;
    } catch (error) {
      if (existing) throw error;
      throw new ServiceUnavailableException(
        `HSAKAA could not generate the Media Presence Strategy. ${this.errorMessage(error)}`,
      );
    }
  }

  async generateVoiceProfile(
    input: { force?: boolean; notes?: string } = {},
    suppliedContext?: MediaWorldContext,
  ) {
    const context =
      suppliedContext ?? (await this.worldContextService.build(120));
    const samples = await this.voiceSamples();
    const fingerprint = `${context.fingerprint}:${this.hashSamples(samples)}`;
    const existing = await this.voiceModel.findOne({
      key: 'primary',
      isActive: true,
    });
    if (
      !input.force &&
      !input.notes?.trim() &&
      existing?.sourceFingerprint === fingerprint
    ) {
      return existing;
    }

    try {
      const response =
        await this.aiService.generateStructuredResponse<GeneratedVoiceProfile>({
          name: 'hsakaa_media_voice_profile_v31',
          instructions: [
            "You are modeling Aakash's communication style for HSAKAA Media.",
            'Infer style, rhythm and communication preferences, not private facts. Never copy a private story or personal detail into the profile.',
            'Do not turn repeated phrases into a template. Learn mechanisms such as directness, reflection, specificity, humour and technical depth while explicitly protecting against phrase repetition.',
            'Do not create an influencer persona. The profile should help generated content sound like the same Aakash across platforms while remaining native to each platform.',
            'When sample evidence is thin, describe the profile as a working hypothesis and keep confidence conservative.',
            'Authenticity checks must reject fake-guru language, invented certainty, manufactured vulnerability, unsupported achievements, generic motivational filler and buzzword-heavy copy.',
          ].join('\n'),
          input: JSON.stringify({
            owner: 'Aakash',
            notes: input.notes?.trim() || null,
            sourceSamples: samples,
            publicSafeSignals: context.publicSafe.slice(0, 30).map((item) => ({
              source: item.source,
              title: item.title,
              summary: item.summary,
            })),
            recentMediaTitles: context.recentMedia.slice(0, 20),
            sampleCount: samples.length,
          }),
          verbosity: 'medium',
          reasoningEffort: 'medium',
          maxOutputTokens: 6000,
          schema: this.voiceJsonSchema(),
        });

      const nextVersion = (existing?.version ?? 0) + 1;
      const confidence =
        samples.length < 5
          ? Math.min(response.data.confidence, 45)
          : response.data.confidence;
      const baselineChecks = [
        'Would Aakash genuinely say this aloud or write it himself?',
        'Does every factual claim have evidence or an explicit review requirement?',
        'Is this specific enough to avoid generic creator or motivational language?',
        'Does it preserve the voice without reusing signature phrases mechanically?',
      ];
      return this.voiceModel.findOneAndUpdate(
        { key: 'primary' },
        {
          $set: {
            ...response.data,
            authenticityChecks: this.unique([
              ...response.data.authenticityChecks,
              ...baselineChecks,
            ]),
            confidence,
            sourceSampleCount: samples.length,
            key: 'primary',
            version: nextVersion,
            aiModel: response.model,
            aiResponseId: response.responseId,
            sourceFingerprint: fingerprint,
            generatedAt: new Date(),
            isActive: true,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      if (existing) throw error;
      throw new ServiceUnavailableException(
        `HSAKAA could not generate the Aakash Voice Profile. ${this.errorMessage(error)}`,
      );
    }
  }

  async directorContext() {
    const [strategy, voice, world] = await Promise.all([
      this.getStrategy(),
      this.getVoiceProfile(),
      this.worldContextService.build(120),
    ]);
    return {
      presenceStrategy: strategy,
      voiceProfile: voice,
      worldContext: {
        fingerprint: world.fingerprint,
        companies: world.companies,
        publicSafe: world.publicSafe.slice(0, 60),
        internalSafe: world.internalSafe.slice(0, 40),
        needsReview: world.needsReview.slice(0, 20),
        wholeLifeSignals: world.wholeLifeSignals.slice(0, 40),
        hobbies: world.hobbies,
        personalOsSections: world.personalOsSections,
        coverage: world.coverage,
        hsakaa: world.hsakaa,
        privacyPolicy: world.policy,
      },
    };
  }

  private contextOverview(context: MediaWorldContext) {
    return {
      generatedAt: context.generatedAt,
      windowDays: context.windowDays,
      fingerprint: context.fingerprint,
      coverage: context.coverage,
      companies: context.companies,
      hsakaa: context.hsakaa,
      publicSafePreview: context.publicSafe.slice(0, 8),
      internalSafePreview: context.internalSafe.slice(0, 8),
      needsReviewPreview: context.needsReview.slice(0, 8),
      wholeLifeSignalsPreview: context.wholeLifeSignals.slice(0, 8),
      hobbies: context.hobbies,
      personalOsSections: context.personalOsSections,
      policy: context.policy,
    };
  }

  private async voiceSamples() {
    const items = await this.contentModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('title thesis canonicalBody story origin')
      .lean();
    return items
      .map((item) => ({
        title: item.title,
        thesis: item.thesis ?? '',
        text: item.canonicalBody || item.story || '',
        origin: item.origin,
      }))
      .filter((item) => item.text.trim().length >= 40)
      .slice(0, 20);
  }

  private hashSamples(samples: unknown[]) {
    // Keep this dependency-free and deterministic; the world fingerprint already uses SHA-256.
    let hash = 2166136261;
    const input = JSON.stringify(samples);
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  private assertPlatformCoverage(roles: Array<{ platform: MediaPlatform }>) {
    const platforms = new Set(roles.map((role) => role.platform));
    const missing = GROWTH_PLATFORMS.filter(
      (platform) => !platforms.has(platform),
    );
    if (missing.length) {
      throw new Error(
        `Presence strategy omitted required platforms: ${missing.join(', ')}`,
      );
    }
  }

  private unique(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private errorMessage(error: unknown) {
    return error instanceof Error
      ? error.message
      : 'Unknown Media Presence error.';
  }

  private strategyJsonSchema(): Record<string, unknown> {
    const arrayOfStrings = { type: 'array', items: { type: 'string' } };
    return {
      type: 'object',
      properties: {
        northStar: { type: 'string' },
        positioning: { type: 'string' },
        knownFor: arrayOfStrings,
        audiences: {
          type: 'array',
          minItems: 2,
          maxItems: 8,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              need: { type: 'string' },
              desiredPerception: { type: 'string' },
            },
            required: ['name', 'need', 'desiredPerception'],
            additionalProperties: false,
          },
        },
        narratives: {
          type: 'array',
          minItems: 3,
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              title: { type: 'string' },
              role: { type: 'string' },
              targetSharePercent: { type: 'number', minimum: 0, maximum: 100 },
              companyName: { type: 'string' },
              guardrails: arrayOfStrings,
            },
            required: [
              'key',
              'title',
              'role',
              'targetSharePercent',
              'companyName',
              'guardrails',
            ],
            additionalProperties: false,
          },
        },
        platformRoles: {
          type: 'array',
          minItems: 5,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string', enum: GROWTH_PLATFORMS },
              role: { type: 'string' },
              purpose: { type: 'string' },
              primaryFormats: {
                type: 'array',
                items: { type: 'string', enum: Object.values(MediaPostType) },
              },
              minPostsPerWeek: { type: 'number', minimum: 0, maximum: 30 },
              preferredPostsPerWeek: {
                type: 'number',
                minimum: 0,
                maximum: 30,
              },
              maxPostsPerWeek: { type: 'number', minimum: 0, maximum: 50 },
              allowSkipDays: { type: 'boolean' },
            },
            required: [
              'platform',
              'role',
              'purpose',
              'primaryFormats',
              'minPostsPerWeek',
              'preferredPostsPerWeek',
              'maxPostsPerWeek',
              'allowSkipDays',
            ],
            additionalProperties: false,
          },
        },
        companyBalance: {
          type: 'array',
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              companyName: { type: 'string' },
              narrativeRole: { type: 'string' },
              targetSharePercent: { type: 'number', minimum: 0, maximum: 100 },
              guardrails: arrayOfStrings,
            },
            required: [
              'companyName',
              'narrativeRole',
              'targetSharePercent',
              'guardrails',
            ],
            additionalProperties: false,
          },
        },
        thirtyDayObjectives: arrayOfStrings,
        ninetyDayObjectives: arrayOfStrings,
        reputationGoals: arrayOfStrings,
        neverBecome: arrayOfStrings,
        claimsRequiringReview: arrayOfStrings,
        privacyRules: arrayOfStrings,
      },
      required: [
        'northStar',
        'positioning',
        'knownFor',
        'audiences',
        'narratives',
        'platformRoles',
        'companyBalance',
        'thirtyDayObjectives',
        'ninetyDayObjectives',
        'reputationGoals',
        'neverBecome',
        'claimsRequiringReview',
        'privacyRules',
      ],
      additionalProperties: false,
    };
  }

  private voiceJsonSchema(): Record<string, unknown> {
    const arrayOfStrings = { type: 'array', items: { type: 'string' } };
    return {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        principles: arrayOfStrings,
        sentenceRhythm: { type: 'string' },
        vocabulary: { type: 'string' },
        humour: { type: 'string' },
        profanity: { type: 'string' },
        technicalDepth: { type: 'string' },
        emotionalOpenness: { type: 'string' },
        storytelling: { type: 'string' },
        doMore: arrayOfStrings,
        doNot: arrayOfStrings,
        avoidPhrases: arrayOfStrings,
        authenticityChecks: arrayOfStrings,
        confidence: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: [
        'summary',
        'principles',
        'sentenceRhythm',
        'vocabulary',
        'humour',
        'profanity',
        'technicalDepth',
        'emotionalOpenness',
        'storytelling',
        'doMore',
        'doNot',
        'avoidPhrases',
        'authenticityChecks',
        'confidence',
      ],
      additionalProperties: false,
    };
  }
}
