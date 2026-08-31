import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type PersonVerificationSessionDocument =
  HydratedDocument<PersonVerificationSession>;

export enum VerificationChannel {
  EMAIL = 'email',
  PHONE = 'phone',
}

export enum VerificationSessionStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  BLOCKED = 'blocked',
}

@Schema({
  timestamps: true,
  collection: 'person_verification_sessions',
})
export class PersonVerificationSession {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    required: true,
    index: true,
  })
  personId: Types.ObjectId;

  @Prop({
    type: String,
    enum: VerificationChannel,
    required: true,
  })
  channel: VerificationChannel;

  @Prop({
    required: true,
    trim: true,
  })
  destination: string;

  @Prop({
    required: true,
    select: false,
  })
  otpHash: string;

  @Prop({
    type: String,
    enum: VerificationSessionStatus,
    default: VerificationSessionStatus.PENDING,
    index: true,
  })
  status: VerificationSessionStatus;

  @Prop({
    min: 0,
    default: 0,
  })
  attempts: number;

  @Prop({
    min: 1,
    default: 5,
  })
  maximumAttempts: number;

  @Prop({
    required: true,
  })
  otpExpiresAt: Date;

  @Prop()
  verifiedAt?: Date;

  @Prop({
    select: false,
  })
  sessionTokenHash?: string;

  @Prop()
  sessionExpiresAt?: Date;

  @Prop({
    required: true,
    min: 1,
  })
  identityVersion: number;

  @Prop({
    trim: true,
  })
  ipAddress?: string;

  @Prop({
    trim: true,
  })
  userAgent?: string;

  @Prop()
  lastAccessedAt?: Date;

  @Prop({
    min: 0,
    default: 0,
  })
  accessCount: number;
}

export const PersonVerificationSessionSchema = SchemaFactory.createForClass(
  PersonVerificationSession,
);

PersonVerificationSessionSchema.index({
  personId: 1,
  status: 1,
});

PersonVerificationSessionSchema.index({
  destination: 1,
  status: 1,
  createdAt: -1,
});

PersonVerificationSessionSchema.index(
  {
    otpExpiresAt: 1,
  },
  {
    expireAfterSeconds: 86400,
  },
);

PersonVerificationSessionSchema.index(
  {
    sessionExpiresAt: 1,
  },
  {
    expireAfterSeconds: 86400,
    partialFilterExpression: {
      sessionExpiresAt: {
        $type: 'date',
      },
    },
  },
);
