import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { HsakaaMode } from './ask-hsakaa.dto';

export class AskVerifiedPersonHsakaaDto {
  @IsEnum(HsakaaMode)
  mode: HsakaaMode;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsMongoId()
  conversationId?: string;
}
