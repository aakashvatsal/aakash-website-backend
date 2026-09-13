import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MediaPlatform } from '../schemas/media-post.schema';

export class BootstrapMediaLaunchDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateMediaLaunchProfileDto {
  @IsEnum(MediaPlatform)
  platform: MediaPlatform;

  @IsBoolean()
  applied: boolean;
}
