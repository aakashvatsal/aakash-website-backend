import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';

import { AiService } from '../modules/ai/ai.service';
import { ChatService } from '../modules/chat/chat.service';
import {
  BrainDump,
  BrainDumpDocument,
  BrainDumpSource,
} from '../modules/brain-dump/schemas/brain-dump.schema';
import {
  Conversation,
  ConversationChannel,
  ConversationDocument,
} from '../modules/chat/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
  MessageRole,
} from '../modules/chat/schemas/message.schema';
import {
  JournalEntry,
  JournalEntryDocument,
  JournalSource,
} from '../modules/journal/schemas/journal-entry.schema';
import { HsakaaMode } from './dto/ask-hsakaa.dto';
import { CreateHsakaaVoiceFeedbackDto } from './dto/hsakaa-voice.dto';
import {
  HsakaaVoiceFeedback,
  HsakaaVoiceFeedbackDocument,
} from './schemas/hsakaa-voice-feedback.schema';
import {
  HsakaaVoiceContext,
  HsakaaVoiceProfile,
  HsakaaVoiceProfileDocument,
} from './schemas/hsakaa-voice-profile.schema';
import {
  HsakaaPersonVoiceProfile,
  HsakaaPersonVoiceProfileDocument,
} from './schemas/hsakaa-person-voice-profile.schema';

interface VoiceCorpusSample {
  source:
    | 'private_chat'
    | 'manual_journal'
    | 'manual_brain_dump'
    | 'voice_brain_dump'
    | 'imported_chat'
    | 'correction';
  context: HsakaaVoiceContext;
  text: string;
  observedAt: Date;
  weight: number;
}

interface LearnedVoiceProfile {
  styleSummary: string;
  coreTraits: string[];
  sentencePatterns: string[];
  vocabularyMarkers: string[];
  humourPatterns: string[];
  punctuationPatterns: string[];
  emojiPatterns: string[];
  responseHabits: string[];
  avoidPatterns: string[];
  contextGuides: Array<{
    context: HsakaaVoiceContext;
    guidance: string;
  }>;
  syntheticExamples: Array<{
    context: HsakaaVoiceContext;
    text: string;
  }>;
  confidence: number;
}

export function sanitizeAakashRenderedText(text: string): string {
  return text
    .replace(/\s*(?:—|&mdash;|&#8212;|&#x2014;)\s*/gi, ' - ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

@Injectable()
export class HsakaaVoiceService {
  private readonly logger = new Logger(HsakaaVoiceService.name);

  private readonly fallbackVoice = {
    styleSummary:
      'Text like Aakash messages a person: direct, informal, compact and slightly imperfect in rhythm. Prefer a natural reply over a polished mini-essay. Do not sound like customer support, a consultant or ChatGPT.',
    coreTraits: [
      'direct and concise',
      'casual rather than corporate',
      'curious and practical',
      'comfortable with light self-mocking humour',
      'uses short reactions before the point when that feels natural',
    ],
    vocabularyMarkers: ['Okie', 'Hmmm', 'gimme', 'what’s your take'],
    responseHabits: [
      'default to one compact paragraph or a few short text-message lines',
      'answer the point first instead of restating the question',
      'use contractions and conversational fragments naturally',
      'use an emoji only when it actually adds tone, usually no more than one',
      'allow natural informality without manufacturing fake spelling mistakes',
    ],
    avoidPatterns: [
      'generic assistant openers such as “Absolutely”, “Certainly”, “Of course” or “Great question”',
      'the em dash punctuation mark; use commas, periods, colons, parentheses or a simple hyphen instead',
      'phrases such as “Based on the context provided”, “Here is a breakdown”, “In summary” or “As an AI”',
      'overly polished corporate or consultant phrasing',
      'unnecessary headings, numbered lists, bullet lists, summaries or repeated caveats in normal chat',
      'repeating the visitor’s question before answering it',
      'forcing a signature word, slang term, typo or emoji into every reply',
      'ending every answer with a generic offer such as “Let me know if you want more”',
    ],
  };

  constructor(
    @InjectModel(HsakaaVoiceProfile.name)
    private readonly profileModel: Model<HsakaaVoiceProfileDocument>,
    @InjectModel(HsakaaVoiceFeedback.name)
    private readonly feedbackModel: Model<HsakaaVoiceFeedbackDocument>,
    @InjectModel(HsakaaPersonVoiceProfile.name)
    private readonly personProfileModel: Model<HsakaaPersonVoiceProfileDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(JournalEntry.name)
    private readonly journalModel: Model<JournalEntryDocument>,
    @InjectModel(BrainDump.name)
    private readonly brainDumpModel: Model<BrainDumpDocument>,
    private readonly aiService: AiService,
    private readonly chatService: ChatService,
  ) {}

  sanitizeRenderedText(text: string): string {
    return sanitizeAakashRenderedText(text);
  }

  async getProfile() {
    const profile = await this.profileModel.findOne({ key: 'aakash' }).lean();

    return {
      profile,
      learningPolicy: {
        learnsFrom: [
          'owner messages typed in private HSAKAA',
          'manual journal entries',
          'manual/voice brain-dump entries',
          'explicit Aakash voice corrections',
          'Aakash-authored messages imported into My Chats',
        ],
        neverLearnsFrom: [
          'public or verified-person visitor messages',
          'assistant/HSAKAA outputs',
          'book text or highlights',
          'memory records',
          'Media drafts or analytics',
          'Health/WHOOP data',
        ],
        publicRendering:
          'Raw private writing is never injected into public/verified-person prompts. Only a fact-neutral distilled voice fingerprint is used.',
      },
    };
  }

  async addFeedback(dto: CreateHsakaaVoiceFeedbackDto) {
    const feedback = await this.feedbackModel.create({
      originalResponse: dto.originalResponse?.trim(),
      correctedText: dto.correctedText.trim(),
      instruction: dto.instruction?.trim(),
      context: dto.context ?? HsakaaVoiceContext.GENERAL,
      isActive: true,
    });

    return {
      id: feedback._id.toString(),
      needsRefresh: true,
    };
  }

  async refreshIfNeeded() {
    const corpus = await this.collectCorpus();
    const current = await this.profileModel.findOne({ key: 'aakash' }).lean();

    if (!corpus.samples.length) {
      return current;
    }

    const signature = this.buildCorpusSignature(corpus.samples);
    if (current?.corpusSignature === signature) {
      return current;
    }

    const previousSampleCount = current?.sampleCount ?? 0;
    const newSampleCount = Math.max(
      0,
      corpus.samples.length - previousSampleCount,
    );
    const profileAgeMs = current?.lastLearnedAt
      ? Date.now() - new Date(current.lastLearnedAt).getTime()
      : Number.POSITIVE_INFINITY;

    const isStale = profileAgeMs >= 7 * 24 * 60 * 60 * 1000;
    if (current && newSampleCount < 8 && !isStale) {
      return current;
    }

    return this.refreshProfileFromCorpus(
      corpus.samples,
      corpus.sourceCounts,
      signature,
    );
  }

  async refreshProfile() {
    const corpus = await this.collectCorpus();

    if (corpus.samples.length < 4) {
      return {
        refreshed: false,
        reason: 'not_enough_high_confidence_aakash_authored_samples',
        sampleCount: corpus.samples.length,
      };
    }

    const signature = this.buildCorpusSignature(corpus.samples);
    const profile = await this.refreshProfileFromCorpus(
      corpus.samples,
      corpus.sourceCounts,
      signature,
    );

    return { refreshed: true, profile };
  }

  async getRenderContext(mode: HsakaaMode, message: string, personId?: string) {
    const profile = await this.profileModel.findOne({ key: 'aakash' }).lean();
    const context = this.inferContext(mode, message);

    if (!profile) {
      return this.buildFallbackRenderContext(context);
    }

    const safe = this.buildPublicSafeProfile(profile);
    const matchingGuides = safe.contextGuides
      .filter(
        (guide) =>
          guide.context === context ||
          guide.context === HsakaaVoiceContext.GENERAL,
      )
      .slice(0, 3);
    const matchingExamples = safe.syntheticExamples
      .filter(
        (example) =>
          example.context === context ||
          example.context === HsakaaVoiceContext.GENERAL,
      )
      .slice(0, 3);

    const lines = [
      'AAKASH VOICE FINGERPRINT: STYLE ONLY, NEVER FACTUAL EVIDENCE',
      'This section controls tone and phrasing only. It must never introduce a fact, memory, relationship, opinion, event or claim that is not supported by the allowed factual context.',
      `Current conversational context: ${context}.`,
      `Style: ${safe.styleSummary || this.fallbackVoice.styleSummary}`,
    ];

    if (safe.coreTraits.length) {
      lines.push(`Core traits: ${safe.coreTraits.join('; ')}`);
    }
    if (safe.vocabularyMarkers.length) {
      lines.push(
        `Natural recurring markers (use only when they fit, never mechanically): ${safe.vocabularyMarkers.join('; ')}`,
      );
    }
    if (safe.responseHabits.length) {
      lines.push(`Response habits: ${safe.responseHabits.join('; ')}`);
    }
    if (safe.avoidPatterns.length) {
      lines.push(`Avoid: ${safe.avoidPatterns.join('; ')}`);
    }
    if (matchingGuides.length) {
      lines.push(
        `Context guidance: ${matchingGuides.map((guide) => guide.guidance).join(' | ')}`,
      );
    }
    if (matchingExamples.length) {
      lines.push(
        'Synthetic fact-neutral style examples (style only; do not copy mechanically):',
        ...matchingExamples.map((example) => `- ${example.text}`),
      );
    }

    if (personId) {
      const personContext = await this.getPersonRenderContext(personId);
      if (personContext) lines.push(personContext);
    }

    return lines.join('\n');
  }

  async refreshPersonProfile(personId: string) {
    if (!Types.ObjectId.isValid(personId)) {
      return { refreshed: false, reason: 'invalid_person_id' };
    }

    const samples =
      await this.chatService.getImportedOwnerStyleSamplesForPerson(
        personId,
        160,
      );
    const safeSamples = samples
      .map((item) => this.sanitizeAuthoredText(item.content))
      .filter((text) => this.isUsefulSample(text))
      .slice(0, 160);

    if (safeSamples.length < 4) {
      return {
        refreshed: false,
        reason: 'not_enough_person_specific_samples',
        sampleCount: safeSamples.length,
      };
    }

    const signature = this.buildTextSignature(safeSamples);
    const current = await this.personProfileModel
      .findOne({ personId: new Types.ObjectId(personId) })
      .lean();

    if (current?.corpusSignature === signature) {
      return { refreshed: false, reason: 'unchanged', profile: current };
    }

    const result = await this.aiService.generateStructuredResponse<{
      styleSummary: string;
      responseHabits: string[];
      vocabularyMarkers: string[];
      avoidPatterns: string[];
      syntheticExamples: string[];
      confidence: number;
    }>({
      name: 'aakash_person_interaction_style',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          styleSummary: { type: 'string' },
          responseHabits: { type: 'array', items: { type: 'string' } },
          vocabularyMarkers: { type: 'array', items: { type: 'string' } },
          avoidPatterns: { type: 'array', items: { type: 'string' } },
          syntheticExamples: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: [
          'styleSummary',
          'responseHabits',
          'vocabularyMarkers',
          'avoidPatterns',
          'syntheticExamples',
          'confidence',
        ],
      },
      instructions: `
Learn only how Aakash changes his communication style with one specific person.
Do not preserve or output facts from the conversation. Do not mention names, places, companies, events, dates, private topics or identifiable details.
Focus only on tone, warmth, directness, message length, question style, humour, punctuation, emoji habits and conversational pacing.
Synthetic examples must be generic and fact-neutral. Never quote the source messages verbatim.
This profile will modify style only, never factual content.
      `.trim(),
      input: safeSamples
        .map((text) => `[AAKASH] ${text.slice(0, 700)}`)
        .join('\n---\n'),
      verbosity: 'low',
      reasoningEffort: 'low',
      maxOutputTokens: 1800,
    });

    const safe = {
      styleSummary: this.sanitizeProfileField(result.data.styleSummary, 1200),
      responseHabits: this.sanitizeProfileList(result.data.responseHabits, 8),
      vocabularyMarkers: this.sanitizeProfileList(
        result.data.vocabularyMarkers,
        8,
      ),
      avoidPatterns: this.sanitizeProfileList(result.data.avoidPatterns, 8),
      syntheticExamples: this.sanitizeProfileList(
        result.data.syntheticExamples,
        5,
      ),
      confidence: Math.min(Math.max(Number(result.data.confidence) || 0, 0), 1),
    };

    const profile = await this.personProfileModel.findOneAndUpdate(
      { personId: new Types.ObjectId(personId) },
      {
        $set: {
          ...safe,
          sampleCount: safeSamples.length,
          corpusSignature: signature,
          lastLearnedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return { refreshed: true, profile };
  }

  private async getPersonRenderContext(personId: string) {
    if (!Types.ObjectId.isValid(personId)) return '';

    let profile = await this.personProfileModel
      .findOne({ personId: new Types.ObjectId(personId) })
      .lean();

    const samples =
      await this.chatService.getImportedOwnerStyleSamplesForPerson(
        personId,
        160,
      );
    const useful = samples
      .map((item) => this.sanitizeAuthoredText(item.content))
      .filter((text) => this.isUsefulSample(text));

    if (useful.length >= 4) {
      const signature = this.buildTextSignature(useful);
      if (!profile || profile.corpusSignature !== signature) {
        try {
          const refreshed = await this.refreshPersonProfile(personId);
          if ('profile' in refreshed && refreshed.profile) {
            profile = refreshed.profile;
          }
        } catch (error) {
          this.logger.warn(
            `Could not refresh person-specific communication style: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    if (!profile || profile.sampleCount < 4) return '';

    const lines = [
      'PERSON-SPECIFIC AAKASH COMMUNICATION FINGERPRINT: STYLE ONLY, NEVER FACTUAL EVIDENCE',
      profile.styleSummary ? `Style adjustment: ${profile.styleSummary}` : '',
      profile.responseHabits?.length
        ? `Interaction habits: ${profile.responseHabits.join('; ')}`
        : '',
      profile.vocabularyMarkers?.length
        ? `Natural markers for this relationship, only when they fit: ${profile.vocabularyMarkers.join('; ')}`
        : '',
      profile.avoidPatterns?.length
        ? `Avoid for this relationship: ${profile.avoidPatterns.join('; ')}`
        : '',
      profile.syntheticExamples?.length
        ? `Generic style examples: ${profile.syntheticExamples.join(' | ')}`
        : '',
      'Never infer a fact from this style fingerprint. Relationship facts must come from allowed Memory/People context only.',
    ].filter(Boolean);

    return lines.join('\n');
  }

  private buildTextSignature(values: string[]) {
    const hash = createHash('sha256');
    for (const value of values) hash.update(`${value}\n`);
    return hash.digest('hex');
  }

  private sanitizeProfileField(value: string, maxLength: number) {
    return this.sanitizeAuthoredText(String(value ?? '')).slice(0, maxLength);
  }

  private sanitizeProfileList(values: string[], maxItems: number) {
    return (Array.isArray(values) ? values : [])
      .map((value) => this.sanitizeProfileField(value, 500))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  private async collectCorpus() {
    const ownerConversations = await this.conversationModel
      .find({ channel: ConversationChannel.OWNER })
      .select({ _id: 1 })
      .lean();
    const ownerConversationIds = ownerConversations.map((item) => item._id);

    const [messages, journals, brainDumps, feedback, importedChats] =
      await Promise.all([
        ownerConversationIds.length
          ? this.messageModel
              .find({
                conversationId: { $in: ownerConversationIds },
                role: MessageRole.USER,
              })
              .sort({ createdAt: -1 })
              .limit(240)
              .lean()
          : Promise.resolve([]),
        this.journalModel
          .find({
            source: JournalSource.MANUAL,
            isActive: true,
            isArchived: false,
            content: { $type: 'string', $ne: '' },
          })
          .sort({ date: -1 })
          .limit(100)
          .select({ content: 1, date: 1 })
          .lean(),
        this.brainDumpModel
          .find({
            source: { $in: [BrainDumpSource.MANUAL, BrainDumpSource.VOICE] },
            isActive: true,
            isArchived: false,
          })
          .sort({ createdAt: -1 })
          .limit(100)
          .select({ content: 1, source: 1, createdAt: 1 })
          .lean(),
        this.feedbackModel
          .find({ isActive: true })
          .sort({ createdAt: -1 })
          .limit(60)
          .lean(),
        this.chatService.getImportedOwnerStyleSamples(240),
      ]);

    const samples: VoiceCorpusSample[] = [];

    for (const message of messages) {
      this.pushSample(samples, {
        source: 'private_chat',
        context: this.inferContext(
          this.normalizeMode(message.metadata?.mode),
          message.content,
        ),
        text: message.content,
        observedAt: this.asDate(
          (message as unknown as { createdAt?: Date }).createdAt,
        ),
        weight: 2,
      });
    }

    for (const journal of journals) {
      this.pushSample(samples, {
        source: 'manual_journal',
        context: HsakaaVoiceContext.REFLECTIVE,
        text: journal.content ?? '',
        observedAt: this.asDate(journal.date),
        weight: 2,
      });
    }

    for (const brainDump of brainDumps) {
      this.pushSample(samples, {
        source:
          brainDump.source === BrainDumpSource.VOICE
            ? 'voice_brain_dump'
            : 'manual_brain_dump',
        context:
          brainDump.source === BrainDumpSource.VOICE
            ? HsakaaVoiceContext.SPOKEN
            : HsakaaVoiceContext.CASUAL,
        text: brainDump.content,
        observedAt: this.asDate(brainDump.createdAt),
        weight: brainDump.source === BrainDumpSource.VOICE ? 2 : 1,
      });
    }

    for (const item of importedChats) {
      this.pushSample(samples, {
        source: 'imported_chat',
        context: HsakaaVoiceContext.CASUAL,
        text: item.content,
        observedAt: this.asDate(item.sentAt),
        weight: 4,
      });
    }

    for (const item of feedback) {
      this.pushSample(samples, {
        source: 'correction',
        context: item.context ?? HsakaaVoiceContext.GENERAL,
        text: [
          item.correctedText,
          item.instruction ? `STYLE NOTE: ${item.instruction}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        observedAt: this.asDate(
          (item as unknown as { createdAt?: Date }).createdAt,
        ),
        weight: 5,
      });
    }

    const deduped = this.dedupeSamples(samples)
      .sort(
        (first, second) =>
          second.observedAt.getTime() - first.observedAt.getTime(),
      )
      .slice(0, 360);

    const sourceCounts = deduped.reduce<Record<string, number>>(
      (counts, sample) => {
        counts[sample.source] = (counts[sample.source] ?? 0) + 1;
        return counts;
      },
      {},
    );

    return { samples: deduped, sourceCounts };
  }

  private async refreshProfileFromCorpus(
    samples: VoiceCorpusSample[],
    sourceCounts: Record<string, number>,
    signature: string,
  ) {
    const corpusText = this.buildCorpusText(samples);
    const learned =
      await this.aiService.generateStructuredResponse<LearnedVoiceProfile>({
        name: 'aakash_voice_profile',
        schema: this.voiceProfileJsonSchema(),
        instructions: `
You are learning Aakash's communication style, not his biography.

Analyze only stable stylistic patterns in the supplied Aakash-authored corpus: sentence rhythm, informality, recurring wording, humour, punctuation, emoji habits, how he disagrees, asks questions, explains work, reflects and chats casually.

Hard privacy and provenance rules:
- Do NOT output or preserve personal facts from the corpus.
- Do NOT mention names, companies, projects, books, places, dates, health facts, relationships, contact details or identifiable events.
- Do NOT quote private passages verbatim.
- Synthetic examples must be completely fact-neutral and generic. They may demonstrate rhythm/quirks but cannot contain a real person, company, project, book, place, date, metric or private event.
- Treat explicit CORRECTION samples as the strongest evidence.
- Repeated patterns matter more than one-off typos. Preserve stable quirks without exaggerating them.
- Do not make every example contain a catchphrase, emoji or deliberate grammar error.
- Identify generic AI habits that would sound unlike Aakash and place those in avoidPatterns.

The result will be used only as a style fingerprint. Facts are retrieved separately.
      `.trim(),
        input: corpusText,
        verbosity: 'medium',
        reasoningEffort: 'low',
        maxOutputTokens: 3200,
      });

    const learnedSafe = this.sanitizeLearnedProfile(learned.data, samples);
    const previous = await this.profileModel.findOne({ key: 'aakash' }).lean();
    const lastSampleAt = samples.reduce<Date | undefined>((latest, sample) => {
      if (!latest || sample.observedAt > latest) return sample.observedAt;
      return latest;
    }, undefined);

    return this.profileModel.findOneAndUpdate(
      { key: 'aakash' },
      {
        $set: {
          ...learnedSafe,
          sampleCount: samples.length,
          sourceCounts,
          corpusSignature: signature,
          lastSampleAt,
          lastLearnedAt: new Date(),
        },
        $setOnInsert: { key: 'aakash' },
        $inc: { version: previous ? 1 : 0 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  private voiceProfileJsonSchema(): Record<string, unknown> {
    const stringArray = { type: 'array', items: { type: 'string' } };
    const contextEnum = Object.values(HsakaaVoiceContext);

    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        styleSummary: { type: 'string' },
        coreTraits: stringArray,
        sentencePatterns: stringArray,
        vocabularyMarkers: stringArray,
        humourPatterns: stringArray,
        punctuationPatterns: stringArray,
        emojiPatterns: stringArray,
        responseHabits: stringArray,
        avoidPatterns: stringArray,
        contextGuides: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              context: { type: 'string', enum: contextEnum },
              guidance: { type: 'string' },
            },
            required: ['context', 'guidance'],
          },
        },
        syntheticExamples: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              context: { type: 'string', enum: contextEnum },
              text: { type: 'string' },
            },
            required: ['context', 'text'],
          },
        },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: [
        'styleSummary',
        'coreTraits',
        'sentencePatterns',
        'vocabularyMarkers',
        'humourPatterns',
        'punctuationPatterns',
        'emojiPatterns',
        'responseHabits',
        'avoidPatterns',
        'contextGuides',
        'syntheticExamples',
        'confidence',
      ],
    };
  }

  private buildCorpusText(samples: VoiceCorpusSample[]) {
    const maxCharacters = 52000;
    const chunks: string[] = [];
    let used = 0;

    for (const sample of samples) {
      const label = `[${sample.source} | ${sample.context} | weight=${sample.weight}]`;
      const text = sample.text.slice(0, 900);
      const chunk = `${label}\n${text}`;
      if (used + chunk.length > maxCharacters) break;
      chunks.push(chunk);
      used += chunk.length;
    }

    return chunks.join('\n\n---\n\n');
  }

  private buildCorpusSignature(samples: VoiceCorpusSample[]) {
    const hash = createHash('sha256');
    for (const sample of samples) {
      hash.update(sample.source);
      hash.update('|');
      hash.update(sample.context);
      hash.update('|');
      hash.update(sample.text);
      hash.update('\n');
    }
    return hash.digest('hex');
  }

  private pushSample(samples: VoiceCorpusSample[], sample: VoiceCorpusSample) {
    const text = this.sanitizeAuthoredText(sample.text);
    if (!this.isUsefulSample(text)) return;
    samples.push({ ...sample, text });
  }

  private sanitizeAuthoredText(value: string) {
    return value
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\bAuthorization:\s*Bearer\s+\S+/gi, '[redacted credential]')
      .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g, '[redacted credential]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
      .replace(/https?:\/\/\S+/gi, '[link]')
      .replace(/\beyJ[A-Za-z0-9._-]{30,}\b/g, '[redacted token]')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private isUsefulSample(text: string) {
    if (text.length < 12) return false;
    if (/^(?:curl|npm|pnpm|yarn|git|docker)\b/i.test(text)) return false;
    if (/^\s*(?:import|export|class|function|const|let|var)\b/m.test(text))
      return false;
    return true;
  }

  private dedupeSamples(samples: VoiceCorpusSample[]) {
    const seen = new Set<string>();
    return samples.filter((sample) => {
      const key = sample.text.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private sanitizeLearnedProfile(
    profile: LearnedVoiceProfile,
    samples: VoiceCorpusSample[],
  ): LearnedVoiceProfile {
    const corpusProperNouns = this.collectCorpusProperNouns(samples);
    const safeText = (value: string, maxLength = 1200) => {
      const clean = this.sanitizeAuthoredText(String(value ?? '')).slice(
        0,
        maxLength,
      );
      if (!clean) return '';
      if (/\d/.test(clean)) return '';
      const lower = clean.toLowerCase();
      if (
        [...corpusProperNouns].some(
          (token) => token.length >= 4 && lower.includes(token.toLowerCase()),
        )
      ) {
        return '';
      }
      return clean;
    };
    const safeList = (values: string[], limit: number) =>
      (values ?? [])
        .map((value) => safeText(value, 400))
        .filter(Boolean)
        .slice(0, limit);

    return {
      styleSummary:
        safeText(profile.styleSummary, 1800) || this.fallbackVoice.styleSummary,
      coreTraits: safeList(profile.coreTraits, 10),
      sentencePatterns: safeList(profile.sentencePatterns, 10),
      vocabularyMarkers: safeList(profile.vocabularyMarkers, 12),
      humourPatterns: safeList(profile.humourPatterns, 8),
      punctuationPatterns: safeList(profile.punctuationPatterns, 8),
      emojiPatterns: safeList(profile.emojiPatterns, 8),
      responseHabits: safeList(profile.responseHabits, 10),
      avoidPatterns: safeList(profile.avoidPatterns, 12),
      contextGuides: (profile.contextGuides ?? [])
        .map((guide) => ({
          context: guide.context,
          guidance: safeText(guide.guidance, 900),
        }))
        .filter((guide) => guide.guidance)
        .slice(0, 10),
      syntheticExamples: (profile.syntheticExamples ?? [])
        .map((example) => ({
          context: example.context,
          text: safeText(example.text, 600),
        }))
        .filter((example) => example.text)
        .slice(0, 12),
      confidence: Math.min(1, Math.max(0, Number(profile.confidence) || 0)),
    };
  }

  private collectCorpusProperNouns(samples: VoiceCorpusSample[]) {
    const ignored = new Set([
      'aakash',
      'hmmm',
      'okie',
      'i',
      'i’m',
      'i’ve',
      'i’ll',
      'the',
      'this',
      'that',
      'what',
      'when',
      'where',
      'why',
      'how',
      'and',
      'but',
    ]);
    const tokens = new Set<string>();

    for (const sample of samples) {
      for (const match of sample.text.matchAll(/\b[A-Z][A-Za-z]{2,}\b/g)) {
        const token = match[0].toLowerCase();
        if (!ignored.has(token)) tokens.add(token);
      }
    }

    return tokens;
  }

  private buildPublicSafeProfile(profile: Partial<HsakaaVoiceProfile>) {
    return {
      styleSummary: profile.styleSummary ?? '',
      coreTraits: (profile.coreTraits ?? []).slice(0, 8),
      vocabularyMarkers: (profile.vocabularyMarkers ?? []).slice(0, 8),
      responseHabits: (profile.responseHabits ?? []).slice(0, 8),
      avoidPatterns: [
        ...(profile.avoidPatterns ?? []).slice(0, 8),
        ...this.fallbackVoice.avoidPatterns,
      ].slice(0, 12),
      contextGuides: (profile.contextGuides ?? []).slice(0, 8),
      syntheticExamples: (profile.syntheticExamples ?? []).slice(0, 8),
    };
  }

  private buildFallbackRenderContext(context: HsakaaVoiceContext) {
    return [
      'AAKASH VOICE FINGERPRINT: STYLE ONLY, NEVER FACTUAL EVIDENCE',
      'This section controls tone only. It cannot supply facts.',
      `Current conversational context: ${context}.`,
      `Style: ${this.fallbackVoice.styleSummary}`,
      `Core traits: ${this.fallbackVoice.coreTraits.join('; ')}`,
      `Natural recurring markers (use only when they genuinely fit): ${this.fallbackVoice.vocabularyMarkers.join('; ')}`,
      `Response habits: ${this.fallbackVoice.responseHabits.join('; ')}`,
      `Avoid: ${this.fallbackVoice.avoidPatterns.join('; ')}`,
    ].join('\n');
  }

  private inferContext(mode: HsakaaMode, message: string): HsakaaVoiceContext {
    if (mode === HsakaaMode.COMPANIES) return HsakaaVoiceContext.WORK;
    if (mode === HsakaaMode.JOURNAL) return HsakaaVoiceContext.REFLECTIVE;
    if (mode === HsakaaMode.LIBRARY) return HsakaaVoiceContext.BOOKS;
    if (mode === HsakaaMode.MEMORY) return HsakaaVoiceContext.REFLECTIVE;

    const text = message.toLowerCase();
    if (/\b(book|read|reading|author|highlight)\b/.test(text)) {
      return HsakaaVoiceContext.BOOKS;
    }
    if (
      /\b(company|startup|founder|product|build|business|work|8lete|frayto)\b/.test(
        text,
      )
    ) {
      return HsakaaVoiceContext.WORK;
    }
    if (
      /\b(relationship|friend|dating|love|meet|between us|remember about me)\b/.test(
        text,
      )
    ) {
      return HsakaaVoiceContext.RELATIONSHIP;
    }
    if (
      /\b(think|believe|lesson|decision|changed|reflect|feel|why)\b/.test(text)
    ) {
      return HsakaaVoiceContext.REFLECTIVE;
    }
    return HsakaaVoiceContext.CASUAL;
  }

  private normalizeMode(value: unknown): HsakaaMode {
    return Object.values(HsakaaMode).includes(value as HsakaaMode)
      ? (value as HsakaaMode)
      : HsakaaMode.CHAT;
  }

  private asDate(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value !== 'string' && typeof value !== 'number')
      return new Date(0);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }
}
