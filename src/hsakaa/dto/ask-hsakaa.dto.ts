import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum HsakaaMode {
  CHAT = 'Chat',
  COMPANIES = 'Companies',
  JOURNAL = 'Journal',
  LIBRARY = 'Library',
  HEALTH = 'Health',
  MEDIA = 'Media',
  MEMORY = 'Memory',
}

export class AskHsakaaDto {
  @IsEnum(HsakaaMode)
  mode: HsakaaMode;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsUUID('4')
  sessionId: string;

  @IsOptional()
  @IsMongoId()
  conversationId?: string;
}
