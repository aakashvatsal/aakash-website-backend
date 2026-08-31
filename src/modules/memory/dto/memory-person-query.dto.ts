import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import {
  PersonIdentityStatus,
  PersonRelationshipType,
} from '../schemas/memory-person.schema';

function transformOptionalBoolean({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
}

export class MemoryPersonQueryDto {
  // @IsOptional()
  // @IsMongoId()
  // ownerUserId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PersonRelationshipType)
  relationship?: PersonRelationshipType;

  @IsOptional()
  @IsEnum(PersonIdentityStatus)
  identityStatus?: PersonIdentityStatus;

  @IsOptional()
  @IsString()
  organizationName?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minImportance?: number;

  @IsOptional()
  @Transform(transformOptionalBoolean)
  @IsBoolean()
  isBlocked?: boolean;

  @IsOptional()
  @Transform(transformOptionalBoolean)
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @Transform(transformOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
