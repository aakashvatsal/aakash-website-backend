import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum MediaPreflightDecision {
  APPROVE = 'approve',
  CHANGES_REQUIRED = 'changes_required',
}

export class RunMediaPreflightDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class DecideMediaPreflightDto {
  @IsEnum(MediaPreflightDecision)
  decision: MediaPreflightDecision;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
