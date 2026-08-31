import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type MemoryPersonDocument = HydratedDocument<MemoryPerson>;

export enum PersonIdentityStatus {
  UNVERIFIED = 'unverified',
  PARTIALLY_VERIFIED = 'partially_verified',
  VERIFIED = 'verified',
  BLOCKED = 'blocked',
}

export enum PersonContactReferenceSource {
  MANUAL = 'manual',
  GOOGLE_CONTACTS = 'google_contacts',
  GMAIL = 'gmail',
  CALENDAR = 'calendar',
  WHATSAPP = 'whatsapp',
  LINKEDIN = 'linkedin',
  SLACK = 'slack',
  OTHER = 'other',
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

@Schema({ _id: false })
export class PersonContactReference {
  @Prop({
    type: String,
    enum: PersonContactReferenceSource,
    default: PersonContactReferenceSource.MANUAL,
  })
  source: PersonContactReferenceSource;

  @Prop({ trim: true })
  externalId?: string;

  @Prop({ trim: true })
  label?: string;

  @Prop({ trim: true })
  url?: string;
}

export const PersonContactReferenceSchema = SchemaFactory.createForClass(
  PersonContactReference,
);

@Schema({
  timestamps: true,
  collection: 'memory_people',
})
export class MemoryPerson {
  /**
   * Optional platform account if this person registers later.
   */
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    default: null,
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

  @Prop({ trim: true, index: true })
  organizationName?: string;

  @Prop({ trim: true })
  roleTitle?: string;

  @Prop({ trim: true })
  department?: string;

  @Prop({ trim: true })
  location?: string;

  @Prop({ min: 1, max: 5, default: 3, index: true })
  importance: number;

  @Prop()
  firstMetAt?: Date;

  @Prop({ index: true })
  lastInteractionAt?: Date;

  @Prop({
    type: [PersonContactReferenceSchema],
    default: [],
  })
  contactReferences: PersonContactReference[];

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

export const MemoryPersonSchema = SchemaFactory.createForClass(MemoryPerson);

MemoryPersonSchema.index({
  identityStatus: 1,
  isActive: 1,
});

MemoryPersonSchema.index(
  {
    linkedUserId: 1,
  },
  {
    name: 'memory_people_linked_user_active_unique',
    unique: true,
    partialFilterExpression: {
      linkedUserId: { $type: 'objectId' },
      isActive: true,
    },
  },
);

MemoryPersonSchema.index({
  relationship: 1,
  isActive: 1,
});

MemoryPersonSchema.index({
  'emails.email': 1,
});

MemoryPersonSchema.index({
  'phoneNumbers.phoneNumber': 1,
});

MemoryPersonSchema.index({
  name: 'text',
  preferredName: 'text',
  aliases: 'text',
  tags: 'text',
  organizationName: 'text',
  roleTitle: 'text',
  department: 'text',
  location: 'text',
});
MemoryPersonSchema.index({
  importance: -1,
  lastInteractionAt: -1,
  name: 1,
});
