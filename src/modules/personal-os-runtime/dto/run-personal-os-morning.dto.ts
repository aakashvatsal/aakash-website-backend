import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RunPersonalOsMorningDto {
  @IsOptional()
  @IsBoolean()
  syncWhoop?: boolean;

  @IsOptional()
  @IsBoolean()
  allowHealthAdaptation?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAi?: boolean;

  @IsOptional()
  @IsBoolean()
  forceBrief?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxEmbeddings?: number;
}
