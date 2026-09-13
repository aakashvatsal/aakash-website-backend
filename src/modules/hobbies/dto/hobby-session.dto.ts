import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  HobbyEvidenceType,
  HobbyPracticeSource,
} from '../schemas/hobby-practice-session.schema';

export class HobbyEvidenceDto {
  @IsEnum(HobbyEvidenceType)
  type: HobbyEvidenceType;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class StartHobbySessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  focus?: string;

  @IsOptional()
  @IsEnum(HobbyPracticeSource)
  source?: HobbyPracticeSource;

  @IsOptional()
  @IsMongoId()
  taskId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class FinishHobbySessionDto {
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reflection?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  enjoyment?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HobbyEvidenceDto)
  evidence?: HobbyEvidenceDto[];
}

export class LogHobbySessionDto {
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  focus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reflection?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  enjoyment?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HobbyEvidenceDto)
  evidence?: HobbyEvidenceDto[];

  @IsOptional()
  @IsEnum(HobbyPracticeSource)
  source?: HobbyPracticeSource;

  @IsOptional()
  @IsMongoId()
  taskId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
