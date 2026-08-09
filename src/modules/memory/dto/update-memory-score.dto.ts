import {
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdateMemoryScoreDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  importance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}