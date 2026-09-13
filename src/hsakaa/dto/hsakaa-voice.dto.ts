import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { HsakaaVoiceContext } from '../schemas/hsakaa-voice-profile.schema';

export class CreateHsakaaVoiceFeedbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  originalResponse?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  correctedText: string;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  instruction?: string;

  @IsOptional()
  @IsEnum(HsakaaVoiceContext)
  context?: HsakaaVoiceContext;
}
