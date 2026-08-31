import {
  IsDateString,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ConfirmMemoryReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class SnoozeMemoryReviewDto {
  @IsDateString()
  until: string;
}

export class CreateMemoryMergeDraftDto {
  @IsMongoId()
  otherMemoryId: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  content?: string;
}
