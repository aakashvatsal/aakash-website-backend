import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum MemoryDisputeResolution {
  RESTORE = 'restore',
  ARCHIVE = 'archive',
  FORGET = 'forget',
}

export class MemoryLifecycleReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class SupersedeMemoryDto extends MemoryLifecycleReasonDto {
  @IsMongoId()
  supersedingMemoryId: string;
}

export class ContradictMemoryDto extends MemoryLifecycleReasonDto {
  @IsMongoId()
  authoritativeMemoryId: string;
}

export class ResolveMemoryDisputeDto extends MemoryLifecycleReasonDto {
  @IsEnum(MemoryDisputeResolution)
  resolution: MemoryDisputeResolution;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
