import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  IsInt,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  PersonContactReferenceSource,
  PersonRelationshipType,
} from '../schemas/memory-person.schema';

export class PersonEmailIdentityDto {
  @IsEmail()
  email: string;

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
  isPrimary?: boolean;
}

export class PersonContactReferenceDto {
  @IsEnum(PersonContactReferenceSource)
  source: PersonContactReferenceSource;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  url?: string;
}

export class CreateMemoryPersonDto {
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
  organizationName?: string;

  @IsOptional()
  @IsString()
  roleTitle?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  importance?: number;

  @IsOptional()
  @IsDateString()
  firstMetAt?: string;

  @IsOptional()
  @IsDateString()
  lastInteractionAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonContactReferenceDto)
  contactReferences?: PersonContactReferenceDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
