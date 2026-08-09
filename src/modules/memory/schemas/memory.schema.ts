import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

export type MemoryDocument = HydratedDocument<Memory>;

export enum MemoryType {
  FACT = 'fact',
  PREFERENCE = 'preference',
  DECISION = 'decision',
  ROUTINE = 'routine',
  GOAL = 'goal',
  EXPERIENCE = 'experience',
  RELATIONSHIP = 'relationship',
  PROJECT = 'project',
}

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

export const MemorySourceReferenceSchema =
  SchemaFactory.createForClass(MemorySourceReference);

@Schema({
  timestamps: true,
  collection: 'memory',
})
export class Memory {
  // @Prop({
  //   type: SchemaTypes.ObjectId,
  //   ref: 'User',
  //   required: true,
  //   index: true,
  // })
  // ownerUserId: Types.ObjectId;

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

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const MemorySchema =
  SchemaFactory.createForClass(Memory);

MemorySchema.pre(
  'validate',
  async function () {
    const personSpecificLevels = [
      MemoryAccessLevel.PERSON_PRIVATE,
      MemoryAccessLevel.OWNER_AND_PERSON,
    ];

    if (
      personSpecificLevels.includes(
        this.accessLevel,
      ) &&
      !this.personId
    ) {
      throw new Error(
        `personId is required when accessLevel is "${this.accessLevel}".`,
      );
    }
  },
);

MemorySchema.index({
  ownerUserId: 1,
  personId: 1,
  type: 1,
  isActive: 1,
});

MemorySchema.index({
  ownerUserId: 1,
  personId: 1,
  accessLevel: 1,
  isActive: 1,
});

MemorySchema.index({
  ownerUserId: 1,
  personId: 1,
  tags: 1,
});

MemorySchema.index({
  ownerUserId: 1,
  accessLevel: 1,
  importance: -1,
  confidence: -1,
});

MemorySchema.index(
  {
    ownerUserId: 1,
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
    ownerUserId: 1,
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

MemorySchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: {
      expiresAt: {
        $type: 'date',
      },
    },
  },
);