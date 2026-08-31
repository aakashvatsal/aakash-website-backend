import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type MemoryDocument = HydratedDocument<Memory>;

export enum MemoryType {
  FACT = 'fact',
  PREFERENCE = 'preference',
  GOAL = 'goal',
  COMMITMENT = 'commitment',
  BELIEF = 'belief',
  LESSON = 'lesson',
  EVENT = 'event',
  RELATIONSHIP = 'relationship',
  ROUTINE = 'routine',
  PROJECT_CONTEXT = 'project_context',
  OPINION = 'opinion',
  UNRESOLVED_QUESTION = 'unresolved_question',

  /**
   * Legacy values kept readable for historical records.
   * New captures should use the canonical types above.
   */
  DECISION = 'decision',
  EXPERIENCE = 'experience',
  PROJECT = 'project',
}

export const MEMORY_CANONICAL_TYPES: MemoryType[] = [
  MemoryType.FACT,
  MemoryType.PREFERENCE,
  MemoryType.GOAL,
  MemoryType.COMMITMENT,
  MemoryType.BELIEF,
  MemoryType.LESSON,
  MemoryType.EVENT,
  MemoryType.RELATIONSHIP,
  MemoryType.ROUTINE,
  MemoryType.PROJECT_CONTEXT,
  MemoryType.OPINION,
  MemoryType.UNRESOLVED_QUESTION,
];

export const MEMORY_LEGACY_TYPES: MemoryType[] = [
  MemoryType.DECISION,
  MemoryType.EXPERIENCE,
  MemoryType.PROJECT,
];

export const MEMORY_TYPE_SEMANTICS: Partial<Record<MemoryType, string>> = {
  [MemoryType.FACT]:
    'A recorded proposition or state that should be treated as factual only to the extent supported by its source and verification status.',
  [MemoryType.PREFERENCE]:
    'A stable like, dislike, choice tendency or preferred way of doing something.',
  [MemoryType.GOAL]:
    'A desired future state or outcome the subject wants to achieve.',
  [MemoryType.COMMITMENT]:
    'A promise, obligation or explicit intention to take or avoid an action.',
  [MemoryType.BELIEF]:
    'A working model or proposition the subject currently considers true and that may change with evidence.',
  [MemoryType.LESSON]:
    'A reusable takeaway derived from experience, reflection or observed outcomes.',
  [MemoryType.EVENT]:
    'Something that happened at a particular time or during a bounded period.',
  [MemoryType.RELATIONSHIP]:
    'Stable context about how people or entities are connected or how that relationship functions.',
  [MemoryType.ROUTINE]:
    'A repeated behavior, cadence, habit or recurring operating pattern.',
  [MemoryType.PROJECT_CONTEXT]:
    'Durable context, constraints, conventions or current state for a project or workstream.',
  [MemoryType.OPINION]:
    'An evaluative judgment or viewpoint that should not be presented as objective fact.',
  [MemoryType.UNRESOLVED_QUESTION]:
    'An open uncertainty, unanswered question or issue that still needs resolution.',
};

export enum MemorySource {
  CHAT = 'chat',
  JOURNAL = 'journal',
  MANUAL = 'manual',
  EMAIL = 'email',
  CALENDAR = 'calendar',
  HEALTH = 'health',
  COMPANY = 'company',
  LIBRARY = 'library',
  MEDIA = 'media',
  BRAIN_DUMP = 'brain_dump',
}

export enum MemoryAccessLevel {
  OWNER_ONLY = 'owner_only',
  PERSON_PRIVATE = 'person_private',
  OWNER_AND_PERSON = 'owner_and_person',
  PUBLIC = 'public',
}

export enum MemorySensitivity {
  NORMAL = 'normal',
  PERSONAL = 'personal',
  SENSITIVE = 'sensitive',
  HIGHLY_SENSITIVE = 'highly_sensitive',
}

export enum MemoryVerificationStatus {
  UNVERIFIED = 'unverified',
  INFERRED = 'inferred',
  CONFIRMED = 'confirmed',
  DISPUTED = 'disputed',
}

export enum MemoryDurability {
  TEMPORARY = 'temporary',
  DURABLE = 'durable',
}

export enum MemoryCaptureOrigin {
  MANUAL = 'manual',
  HSAKAA = 'hsakaa',
  SYSTEM = 'system',
}

export enum MemoryLifecycleStatus {
  ACTIVE = 'active',
  SUPERSEDED = 'superseded',
  CONTRADICTED = 'contradicted',
  EXPIRED = 'expired',
  ARCHIVED = 'archived',
  DISPUTED = 'disputed',
  FORGOTTEN = 'forgotten',
}

@Schema({ _id: false })
export class MemoryLifecycleEvent {
  @Prop({
    type: String,
    enum: MemoryLifecycleStatus,
    required: true,
  })
  fromStatus: MemoryLifecycleStatus;

  @Prop({
    type: String,
    enum: MemoryLifecycleStatus,
    required: true,
  })
  toStatus: MemoryLifecycleStatus;

  @Prop({ trim: true, required: true })
  reason: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Memory' })
  relatedMemoryId?: Types.ObjectId;

  @Prop({ default: Date.now })
  changedAt: Date;
}

export const MemoryLifecycleEventSchema =
  SchemaFactory.createForClass(MemoryLifecycleEvent);

export enum MemoryScope {
  GENERAL = 'general',
  INDIVIDUAL = 'individual',
  GROUP = 'group',
}

export enum MemoryPersonRelation {
  PRIMARY_SUBJECT = 'primary_subject',
  PARTICIPANT = 'participant',
  MENTIONED = 'mentioned',
  SOURCE = 'source',
  RELATED = 'related',
}

@Schema({ _id: false })
export class MemoryPersonLink {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    required: true,
  })
  personId: Types.ObjectId;

  @Prop({
    type: String,
    enum: MemoryPersonRelation,
    required: true,
  })
  relation: MemoryPersonRelation;

  @Prop({ trim: true })
  displayNameSnapshot?: string;
}

export const MemoryPersonLinkSchema =
  SchemaFactory.createForClass(MemoryPersonLink);

export enum MemoryEntityType {
  PERSON = 'person',
  COMPANY = 'company',
  PROJECT = 'project',
  DECISION = 'decision',
  TASK = 'task',
  BOOK = 'book',
  MEDIA = 'media',
  HEALTH = 'health',
  OTHER = 'other',
}

@Schema({ _id: false })
export class MemoryEntityReference {
  @Prop({
    type: String,
    enum: MemoryEntityType,
    required: true,
  })
  type: MemoryEntityType;

  @Prop({
    trim: true,
    required: true,
  })
  name: string;

  @Prop({
    type: SchemaTypes.ObjectId,
  })
  entityId?: Types.ObjectId;

  @Prop({
    trim: true,
  })
  externalId?: string;
}

export const MemoryEntityReferenceSchema = SchemaFactory.createForClass(
  MemoryEntityReference,
);

@Schema({ _id: false })
export class MemorySourceReference {
  @Prop({
    type: SchemaTypes.ObjectId,
  })
  entityId?: Types.ObjectId;

  @Prop({
    trim: true,
  })
  entityType?: string;

  @Prop({
    trim: true,
  })
  externalId?: string;

  @Prop({
    trim: true,
  })
  sourceUrl?: string;

  @Prop()
  sourceCreatedAt?: Date;
}

export const MemorySourceReferenceSchema = SchemaFactory.createForClass(
  MemorySourceReference,
);

@Schema({
  timestamps: true,
  collection: 'memory',
})
export class Memory {
  /**
   * Optional because public and owner-only memory may not
   * belong to a specific external person.
   */
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    default: null,
    index: true,
  })
  personId?: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: MemoryScope,
    default: MemoryScope.GENERAL,
    index: true,
  })
  scope: MemoryScope;

  @Prop({
    type: [MemoryPersonLinkSchema],
    default: [],
  })
  personLinks: MemoryPersonLink[];

  @Prop({
    required: true,
    trim: true,
  })
  content: string;

  @Prop({
    required: true,
    trim: true,
    select: false,
  })
  contentHash: string;

  @Prop({
    type: String,
    enum: MemoryType,
    default: MemoryType.FACT,
    index: true,
  })
  type: MemoryType;

  @Prop({
    type: String,
    enum: MemorySource,
    default: MemorySource.CHAT,
    index: true,
  })
  source: MemorySource;

  @Prop({
    type: MemorySourceReferenceSchema,
    default: undefined,
  })
  sourceReference?: MemorySourceReference;

  @Prop({
    type: [String],
    default: [],
  })
  tags: string[];

  @Prop({
    type: [String],
    default: [],
    index: true,
  })
  categories: string[];

  @Prop({
    type: [MemoryEntityReferenceSchema],
    default: [],
  })
  entities: MemoryEntityReference[];

  @Prop({
    min: 0,
    max: 1,
    default: 0.5,
  })
  importance: number;

  @Prop({
    min: 0,
    max: 1,
    default: 0.5,
  })
  confidence: number;

  @Prop({
    type: String,
    enum: MemoryVerificationStatus,
    default: MemoryVerificationStatus.UNVERIFIED,
    index: true,
  })
  verificationStatus: MemoryVerificationStatus;

  @Prop({
    type: String,
    enum: MemoryAccessLevel,
    default: MemoryAccessLevel.OWNER_ONLY,
    index: true,
  })
  accessLevel: MemoryAccessLevel;

  @Prop({
    type: String,
    enum: MemorySensitivity,
    default: MemorySensitivity.PERSONAL,
    index: true,
  })
  sensitivity: MemorySensitivity;

  @Prop({
    type: String,
    enum: MemoryDurability,
    default: MemoryDurability.DURABLE,
    index: true,
  })
  durability: MemoryDurability;

  @Prop({
    type: String,
    enum: MemoryCaptureOrigin,
    default: MemoryCaptureOrigin.MANUAL,
    index: true,
  })
  captureOrigin: MemoryCaptureOrigin;

  @Prop({
    default: Date.now,
    index: true,
  })
  capturedAt: Date;

  @Prop({
    index: true,
  })
  happenedAt?: Date;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryInboxItem',
    index: true,
  })
  inboxItemId?: Types.ObjectId;

  @Prop({
    type: [Number],
    default: undefined,
    select: false,
  })
  embedding?: number[];

  @Prop({
    trim: true,
    select: false,
  })
  embeddingModel?: string;

  @Prop({
    default: false,
  })
  embeddingGenerated: boolean;

  @Prop()
  embeddingGeneratedAt?: Date;

  @Prop({
    type: String,
    enum: MemoryLifecycleStatus,
    default: MemoryLifecycleStatus.ACTIVE,
    index: true,
  })
  lifecycleStatus: MemoryLifecycleStatus;

  @Prop({
    type: [MemoryLifecycleEventSchema],
    default: [],
  })
  lifecycleHistory: MemoryLifecycleEvent[];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Memory', index: true })
  supersedesMemoryId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Memory', index: true })
  supersededByMemoryId?: Types.ObjectId;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Memory', default: [] })
  contradictsMemoryIds: Types.ObjectId[];

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Memory', default: [] })
  contradictedByMemoryIds: Types.ObjectId[];

  @Prop({
    default: false,
  })
  isDisputed: boolean;

  @Prop({
    trim: true,
  })
  disputeReason?: string;

  @Prop()
  disputedAt?: Date;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
  })
  disputedByPersonId?: Types.ObjectId;

  @Prop()
  expiresAt?: Date;

  @Prop()
  lastAccessedAt?: Date;

  @Prop({
    min: 0,
    default: 0,
  })
  accessCount: number;

  @Prop()
  lastReviewedAt?: Date;

  @Prop({ min: 0, default: 0 })
  reviewCount: number;

  @Prop()
  reviewSnoozedUntil?: Date;

  @Prop({ trim: true, maxlength: 1000 })
  lastReviewNote?: string;

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const MemorySchema = SchemaFactory.createForClass(Memory);

MemorySchema.pre('validate', function () {
  if (
    this.personId &&
    (!this.personLinks || this.personLinks.length === 0) &&
    this.scope === MemoryScope.GENERAL
  ) {
    this.scope = MemoryScope.INDIVIDUAL;
    this.personLinks = [
      {
        personId: this.personId,
        relation: MemoryPersonRelation.PRIMARY_SUBJECT,
      },
    ];
  }

  const personSpecificLevels = [
    MemoryAccessLevel.PERSON_PRIVATE,
    MemoryAccessLevel.OWNER_AND_PERSON,
  ];

  if (personSpecificLevels.includes(this.accessLevel) && !this.personId) {
    throw new Error(
      `personId is required when accessLevel is "${this.accessLevel}".`,
    );
  }

  const links = this.personLinks ?? [];
  const subjectLinks = links.filter((link) =>
    [
      MemoryPersonRelation.PRIMARY_SUBJECT,
      MemoryPersonRelation.PARTICIPANT,
    ].includes(link.relation),
  );

  if (this.scope === MemoryScope.GENERAL) {
    if (this.personId) {
      throw new Error('General memories cannot have personId.');
    }

    if (subjectLinks.length) {
      throw new Error(
        'General memories cannot have primary-subject or participant links.',
      );
    }
  }

  if (this.scope === MemoryScope.INDIVIDUAL) {
    const primaryLinks = links.filter(
      (link) => link.relation === MemoryPersonRelation.PRIMARY_SUBJECT,
    );

    if (!this.personId || primaryLinks.length !== 1) {
      throw new Error(
        'Individual memories require exactly one primary subject and personId.',
      );
    }

    if (!primaryLinks[0].personId.equals(this.personId)) {
      throw new Error(
        'Individual memory personId must match the primary-subject link.',
      );
    }
  }

  if (this.scope === MemoryScope.GROUP) {
    if (this.personId) {
      throw new Error('Group memories cannot use personId as a single owner.');
    }

    if (subjectLinks.length < 2) {
      throw new Error(
        'Group memories require at least two subject or participant people.',
      );
    }
  }
});

MemorySchema.index({
  personId: 1,
  type: 1,
  isActive: 1,
});

MemorySchema.index({
  'personLinks.personId': 1,
  'personLinks.relation': 1,
  scope: 1,
  isActive: 1,
});

MemorySchema.index({
  scope: 1,
  importance: -1,
  confidence: -1,
});

MemorySchema.index({
  durability: 1,
  capturedAt: -1,
  isActive: 1,
});

MemorySchema.index({
  'entities.type': 1,
  'entities.entityId': 1,
});

MemorySchema.index({
  personId: 1,
  accessLevel: 1,
  isActive: 1,
});

MemorySchema.index({
  personId: 1,
  tags: 1,
});

MemorySchema.index({
  accessLevel: 1,
  importance: -1,
  confidence: -1,
});

MemorySchema.index(
  {
    personId: 1,
    contentHash: 1,
    type: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
      personId: {
        $type: 'objectId',
      },
    },
  },
);

MemorySchema.index(
  {
    contentHash: 1,
    type: 1,
    accessLevel: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
      personId: null,
    },
  },
);

MemorySchema.index({
  content: 'text',
  tags: 'text',
});

MemorySchema.index({
  embeddingGenerated: 1,
  embeddingModel: 1,
  accessLevel: 1,
  isActive: 1,
  isArchived: 1,
});

MemorySchema.index({
  lifecycleStatus: 1,
  expiresAt: 1,
  updatedAt: -1,
});
