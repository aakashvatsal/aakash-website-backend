import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { HsakaaMode } from './ask-hsakaa.dto';

export class AskPrivateHsakaaDto {
  @IsEnum(HsakaaMode)
  mode: HsakaaMode;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message: string;

  @IsOptional()
  @IsMongoId()
  conversationId?: string;
}
