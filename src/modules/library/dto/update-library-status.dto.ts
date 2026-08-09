import {
  IsDateString,
  IsEnum,
  IsOptional,
} from 'class-validator';

import { LibraryItemStatus } from '../schemas/library-item.schema';

export class UpdateLibraryStatusDto {
  @IsEnum(LibraryItemStatus)
  status: LibraryItemStatus;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}