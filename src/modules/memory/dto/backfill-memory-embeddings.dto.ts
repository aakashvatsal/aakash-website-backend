import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class BackfillMemoryEmbeddingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
