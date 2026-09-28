import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export enum PublicMemoryImportSource {
  IDENTITY = 'identity',
  COMPANIES = 'companies',
  HOBBIES = 'hobbies',
  LIBRARY = 'library',
  PUBLIC_JOURNAL = 'public_journal',
}

export class GeneratePublicMemoryCandidatesDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(PublicMemoryImportSource, { each: true })
  sources?: PublicMemoryImportSource[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxCandidates?: number;
}
