import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export enum HsakaaDecisionHorizon {
  TODAY = 'today',
  WEEKS = 'weeks',
  MONTHS = 'months',
  YEARS = 'years',
}

export class HsakaaDecisionOptionDto {
  @IsString()
  @MaxLength(120)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(700)
  description?: string;
}

export class AnalyzeHsakaaDecisionDto {
  @IsString()
  @MaxLength(700)
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => HsakaaDecisionOptionDto)
  options: HsakaaDecisionOptionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  context?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(360, { each: true })
  constraints?: string[];

  @IsOptional()
  @IsEnum(HsakaaDecisionHorizon)
  horizon?: HsakaaDecisionHorizon;
}
