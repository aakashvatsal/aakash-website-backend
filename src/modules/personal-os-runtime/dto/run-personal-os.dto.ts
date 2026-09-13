import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RunPersonalOsDto {
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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxEmbeddings?: number;
}
