import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { JournalEntryType } from '../../journal/schemas/journal-entry.schema';
import {
  MemoryAccessLevel,
  MemorySensitivity,
  MemoryType,
} from '../../memory/schemas/memory.schema';
import { TaskPriority } from '../../tasks/schemas/task.schema';
import { BrainDumpTarget } from '../schemas/brain-dump.schema';

export class ProcessBrainDumpDto {
  @IsEnum(BrainDumpTarget)
  target: BrainDumpTarget;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsEnum(JournalEntryType)
  journalType?: JournalEntryType;

  @IsOptional()
  @IsEnum(MemoryType)
  memoryType?: MemoryType;

  @IsOptional()
  @IsEnum(MemoryAccessLevel)
  memoryAccessLevel?: MemoryAccessLevel;

  @IsOptional()
  @IsEnum(MemorySensitivity)
  memorySensitivity?: MemorySensitivity;
}
