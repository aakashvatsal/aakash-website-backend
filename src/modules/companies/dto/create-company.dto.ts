import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
  IsDefined,
} from 'class-validator';

import {
  CompanyRole,
  CompanyStage,
  CompanyStatus,
} from '../schemas/company.schema';

class CompanyFounderDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

class CompanyLinkDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsUrl({
    require_protocol: true,
  })
  url: string;
}

class CompanyMetricDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsDefined()
  value: string | number | boolean;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsDateString()
  measuredAt?: string;
}

class CompanyGoalDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercentage?: number;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class CreateCompanyDto {
  // @IsMongoId()

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @IsEnum(CompanyStage)
  stage?: CompanyStage;

  @IsOptional()
  @IsArray()
  @IsEnum(CompanyRole, {
    each: true,
  })
  roles?: CompanyRole[];

  @IsOptional()
  @IsArray()
  @IsString({
    each: true,
  })
  industries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({
    each: true,
  })
  products?: string[];

  @IsOptional()
  @IsArray()
  @IsString({
    each: true,
  })
  markets?: string[];

  @IsOptional()
  @IsString()
  headquarters?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  website?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  logoUrl?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => CompanyFounderDto)
  founders?: CompanyFounderDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => CompanyLinkDto)
  links?: CompanyLinkDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => CompanyMetricDto)
  metrics?: CompanyMetricDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => CompanyGoalDto)
  goals?: CompanyGoalDto[];

  @IsOptional()
  @IsArray()
  @IsString({
    each: true,
  })
  principles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({
    each: true,
  })
  currentPriorities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({
    each: true,
  })
  challenges?: string[];

  @IsOptional()
  @IsString()
  currentFocus?: string;

  @IsOptional()
  @IsString()
  businessModel?: string;

  @IsOptional()
  @IsString()
  targetCustomer?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  foundedAt?: string;

  @IsOptional()
  @IsDateString()
  lastReviewedAt?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
