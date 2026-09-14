import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { ImportedChatAuthor } from '../schemas/imported-chat-message.schema';
import { ImportedChatChannel } from '../schemas/imported-chat-thread.schema';

export class ImportMyChatMessageDto {
  @IsEnum(ImportedChatAuthor)
  author: ImportedChatAuthor;

  @IsString()
  @MaxLength(12000)
  content: string;

  @IsOptional()
  @IsDateString()
  sentAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ImportMyChatDto {
  @IsString()
  @MaxLength(240)
  title: string;

  @IsOptional()
  @IsMongoId()
  personId?: string;

  @IsEnum(ImportedChatChannel)
  channel: ImportedChatChannel;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceLabel?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ImportMyChatMessageDto)
  messages: ImportMyChatMessageDto[];
}
