import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
  collection: 'users',
})
export class User {
  @Prop({
    required: true,
    trim: true,
  })
  name: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({
    required: true,
    select: false,
  })
  password: string;

  @Prop({
    trim: true,
  })
  profileImageUrl?: string;

  @Prop({
    trim: true,
  })
  phoneNumber?: string;

  @Prop({
    default: true,
    index: true,
  })
  isActive: boolean;

  @Prop({
    default: false,
  })
  isEmailVerified: boolean;

  @Prop()
  emailVerifiedAt?: Date;

  @Prop({
    default: 'Asia/Kolkata',
  })
  timezone: string;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  passwordChangedAt?: Date;

  @Prop({
    default: false,
  })
  isArchived: boolean;
}

export const UserSchema =
  SchemaFactory.createForClass(User);

UserSchema.index({
  email: 1,
  isActive: 1,
});