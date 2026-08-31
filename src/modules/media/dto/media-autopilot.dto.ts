import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import {
  MediaAutopilotRecommendationStatus,
  MediaAutopilotRunType,
} from '../schemas/media-autopilot.schema';

export class UpdateMediaAutopilotSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() dailyEnabled?: boolean;
  @IsOptional() @IsBoolean() weeklyEnabled?: boolean;
  @IsOptional() @IsBoolean() autoDraftCalendarGaps?: boolean;
  @IsOptional() @IsInt() @Min(7) @Max(30) planningHorizonDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) maxDailyDraftRuns?: number;
  @IsOptional() @IsInt() @Min(2) @Max(8) candidateCount?: number;
}

export class RunMediaAutopilotDto {
  @IsOptional() @IsEnum(MediaAutopilotRunType) type?: MediaAutopilotRunType;
  @IsOptional() @IsBoolean() generateDrafts?: boolean;
}

export class UpdateMediaAutopilotRecommendationDto {
  @IsEnum(MediaAutopilotRecommendationStatus)
  status: MediaAutopilotRecommendationStatus;
}
