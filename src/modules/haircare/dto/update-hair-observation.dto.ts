import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateHairObservationDto {
  @IsOptional()
  @IsObject()
  observation?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  wash?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  lifestyle?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  progressPhotoUrls?: string[];

  @IsOptional()
  @IsBoolean()
  dermatologistReviewRecommended?: boolean;

  @IsOptional()
  @IsString()
  dermatologistReviewReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
