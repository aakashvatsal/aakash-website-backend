import {
  IsMongoId,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class FundChatDto {
  @IsUUID('4')
  sessionId: string;

  @IsOptional()
  @IsMongoId()
  caseId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;
}

export class FundPublicCaseQueryDto {
  @IsUUID('4')
  sessionId: string;
}
