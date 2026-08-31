import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { HsakaaDailyContextPrivacy } from '../schemas/hsakaa-daily-context.schema';

export class HsakaaDailyContextQueryDto {
  @IsOptional()
  @IsString()
  dateKey?: string;
}

export class GenerateHsakaaDailyJournalDto {
  @IsOptional()
  @IsString()
  dateKey?: string;

  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

export class UpdateHsakaaDailyJournalDraftDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  highlight?: string;
}

export class UpdateHsakaaDailyPrivacyDto {
  @IsString()
  dateKey: string;

  @IsString()
  itemId: string;

  @IsEnum(HsakaaDailyContextPrivacy)
  privacy: HsakaaDailyContextPrivacy;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ClearHsakaaDailyPrivacyOverrideDto {
  @IsString()
  dateKey: string;

  @IsString()
  itemId: string;
}
