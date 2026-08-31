import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export enum ProactiveSignalCategory {
  FORGOTTEN_COMMITMENT = 'forgotten_commitment',
  QUIET_RELATIONSHIP = 'quiet_relationship',
  UNRESOLVED_DECISION = 'unresolved_decision',
  REPEATEDLY_DEFERRED_TASK = 'repeatedly_deferred_task',
  HEALTH_TREND = 'health_trend',
  READING_RESURFACE = 'reading_resurface',
  COMPANY_RISK = 'company_risk',
  COMPANY_OPPORTUNITY = 'company_opportunity',
  JOURNAL_PATTERN = 'journal_pattern',
  MEDIA_ATTENTION = 'media_attention',
  GENERAL_ATTENTION = 'general_attention',
}

export enum ProactiveSignalSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ProactiveSignalStatus {
  OPEN = 'open',
  ACKNOWLEDGED = 'acknowledged',
  SNOOZED = 'snoozed',
  DISMISSED = 'dismissed',
  RESOLVED = 'resolved',
}

export enum ProactiveActionDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
}

export enum ProactiveReviewPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export class ProactiveScanDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  lookbackDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(60)
  maxEvidence?: number;
}

export class ProactiveSignalQueryDto {
  @IsOptional()
  @IsEnum(ProactiveSignalStatus)
  status?: ProactiveSignalStatus;

  @IsOptional()
  @IsEnum(ProactiveSignalCategory)
  category?: ProactiveSignalCategory;

  @IsOptional()
  @IsEnum(ProactiveSignalSeverity)
  severity?: ProactiveSignalSeverity;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class UpdateProactiveSignalStatusDto {
  @IsEnum(ProactiveSignalStatus)
  status: ProactiveSignalStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  snoozeDays?: number;
}

export class DecideProactiveActionDto {
  @IsEnum(ProactiveActionDecision)
  decision: ProactiveActionDecision;
}

export class GenerateProactiveReviewDto {
  @IsEnum(ProactiveReviewPeriod)
  period: ProactiveReviewPeriod;

  @IsOptional()
  @IsDateString()
  referenceDate?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ProactiveReviewQueryDto {
  @IsOptional()
  @IsEnum(ProactiveReviewPeriod)
  period?: ProactiveReviewPeriod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
