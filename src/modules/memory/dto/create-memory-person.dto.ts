import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import {
  PersonIdentityStatus,
  PersonRelationshipType,
} from '../schemas/memory-person.schema';

export class PersonEmailIdentityDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class PersonPhoneIdentityDto {
  @IsString()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateMemoryPersonDto {
  /**
   * Optional for now because this application currently
   * operates for a single HSAKAA owner.
   */
  @IsOptional()
  @IsMongoId()
  ownerUserId?: string;

  @IsOptional()
  @IsMongoId()
  linkedUserId?: string | null;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  preferredName?: string;

  @IsOptional()
  @IsEnum(PersonRelationshipType)
  relationship?: PersonRelationshipType;

  @IsOptional()
  @IsString()
  relationshipLabel?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => PersonEmailIdentityDto)
  emails?: PersonEmailIdentityDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => PersonPhoneIdentityDto)
  phoneNumbers?: PersonPhoneIdentityDto[];

  @IsOptional()
  @IsEnum(PersonIdentityStatus)
  identityStatus?: PersonIdentityStatus;

  @IsOptional()
  @IsArray()
  @IsString({
    each: true,
  })
  aliases?: string[];

  @IsOptional()
  @IsArray()
  @IsString({
    each: true,
  })
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  memoryAccessConsentGranted?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @IsOptional()
  @IsString()
  blockedReason?: string;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}