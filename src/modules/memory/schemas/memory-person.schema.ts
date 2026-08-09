import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

export type MemoryPersonDocument =
  HydratedDocument<MemoryPerson>;

export enum PersonIdentityStatus {
  UNVERIFIED = 'unverified',
  PARTIALLY_VERIFIED = 'partially_verified',
  VERIFIED = 'verified',
  BLOCKED = 'blocked',
}

export enum PersonRelationshipType {
  SELF = 'self',
  FAMILY = 'family',
  FRIEND = 'friend',
  COLLEAGUE = 'colleague',
  EMPLOYEE = 'employee',
  CLIENT = 'client',
  INVESTOR = 'investor',
  ADVISOR = 'advisor',
  ACQUAINTANCE = 'acquaintance',
  OTHER = 'other',
}

@Schema({ _id: false })
export class PersonEmailIdentity {
  @Prop({
    required: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  lastOtpSentAt?: Date;

  @Prop()
  lastVerifiedAt?: Date;

  @Prop({ default: false })
  isPrimary: boolean;
}

export const PersonEmailIdentitySchema =
  SchemaFactory.createForClass(PersonEmailIdentity);

@Schema({ _id: false })
export class PersonPhoneIdentity {
  @Prop({
    required: true,
    trim: true,
  })
  phoneNumber: string;

  @Prop({
    trim: true,
  })
  countryCode?: string;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  lastOtpSentAt?: Date;

  @Prop()
  lastVerifiedAt?: Date;

  @Prop({ default: false })
  isPrimary: boolean;
}

export const PersonPhoneIdentitySchema =
  SchemaFactory.createForClass(PersonPhoneIdentity);

@Schema({
  timestamps: true,
  collection: 'memory_people',
})
export class MemoryPerson {
  /**
   * Registered owner of the HSAKAA instance.
   */
  // @Prop({
  //   type: SchemaTypes.ObjectId,
  //   ref: 'User',
  //   required: true,
  //   index: true,
  // })
  // ownerUserId: Types.ObjectId;

  /**
   * Optional platform account if this person registers later.
   */
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  })
  linkedUserId?: Types.ObjectId | null;

  @Prop({
    required: true,
    trim: true,
  })
  name: string;

  @Prop({
    trim: true,
  })
  preferredName?: string;

  @Prop({
    type: String,
    enum: PersonRelationshipType,
    default: PersonRelationshipType.OTHER,
    index: true,
  })
  relationship: PersonRelationshipType;

  @Prop({
    trim: true,
  })
  relationshipLabel?: string;

  @Prop({
    type: [PersonEmailIdentitySchema],
    default: [],
  })
  emails: PersonEmailIdentity[];

  @Prop({
    type: [PersonPhoneIdentitySchema],
    default: [],
  })
  phoneNumbers: PersonPhoneIdentity[];

  @Prop({
    type: String,
    enum: PersonIdentityStatus,
    default: PersonIdentityStatus.UNVERIFIED,
    index: true,
  })
  identityStatus: PersonIdentityStatus;

  /**
   * Increment this whenever email, phone, or access identity changes.
   * Existing verification sessions become invalid.
   */
  @Prop({
    min: 1,
    default: 1,
  })
  identityVersion: number;

  @Prop()
  firstVerifiedAt?: Date;

  @Prop()
  lastVerifiedAt?: Date;

  @Prop()
  lastAccessedAt?: Date;

  @Prop({
    type: [String],
    default: [],
  })
  aliases: string[];

  @Prop({
    type: [String],
    default: [],
  })
  tags: string[];

  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    default: false,
  })
  memoryAccessConsentGranted: boolean;

  @Prop()
  memoryAccessConsentGrantedAt?: Date;

  @Prop()
  memoryAccessConsentRevokedAt?: Date;

  @Prop({
    default: false,
  })
  deletionRequested: boolean;

  @Prop()
  deletionRequestedAt?: Date;

  @Prop({
    type: SchemaTypes.Mixed,
    default: {},
  })
  metadata: Record<string, unknown>;

  @Prop({
    default: false,
    index: true,
  })
  isBlocked: boolean;

  @Prop({
    trim: true,
  })
  blockedReason?: string;

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const MemoryPersonSchema =
  SchemaFactory.createForClass(MemoryPerson);

MemoryPersonSchema.index({
  ownerUserId: 1,
  identityStatus: 1,
  isActive: 1,
});

MemoryPersonSchema.index({
  ownerUserId: 1,
  linkedUserId: 1,
});

MemoryPersonSchema.index({
  ownerUserId: 1,
  relationship: 1,
  isActive: 1,
});

MemoryPersonSchema.index({
  ownerUserId: 1,
  'emails.email': 1,
});

MemoryPersonSchema.index({
  ownerUserId: 1,
  'phoneNumbers.phoneNumber': 1,
});

MemoryPersonSchema.index({
  name: 'text',
  preferredName: 'text',
  aliases: 'text',
  tags: 'text',
});