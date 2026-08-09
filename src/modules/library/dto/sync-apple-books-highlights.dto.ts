import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SyncAppleBookHighlightDto {
  @IsString()
  externalId: string;

  @IsString()
  assetId: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsNumber()
  physicalLocation?: number;

  @IsOptional()
  @IsNumber()
  locationRangeStart?: number;

  @IsOptional()
  @IsNumber()
  locationRangeEnd?: number;

  @IsOptional()
  @IsNumber()
  style?: number;

  @IsOptional()
  @IsBoolean()
  isUnderline?: boolean;

  @IsOptional()
  @IsDateString()
  highlightedAt?: string;

  @IsOptional()
  @IsDateString()
  sourceModifiedAt?: string;

  @IsOptional()
  @IsString()
  syncHash?: string;
}

export class SyncAppleBooksHighlightsDto {
  @IsString()
  deviceId: string;

  @IsString()
  deviceName: string;

  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(
    () =>
      SyncAppleBookHighlightDto,
  )
  highlights:
    SyncAppleBookHighlightDto[];

  @IsOptional()
  @IsDateString()
  syncedAt?: string;
}