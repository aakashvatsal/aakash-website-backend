import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

import {
  LibraryItemSource,
  LibraryItemStatus,
  LibraryItemType,
} from '../schemas/library-item.schema';

export class CreateLibraryItemDto {
  // @IsMongoId()
  // userId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsEnum(LibraryItemType)
  type?: LibraryItemType;

  @IsOptional()
  @IsEnum(LibraryItemStatus)
  status?: LibraryItemStatus;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authors?: string[];

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  coverImageUrl?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  sourceUrl?: string;

  @IsOptional()
  @IsEnum(LibraryItemSource)
  source?: LibraryItemSource;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  appleBooksId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentPage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPages?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keyTakeaways?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  quotes?: string[];

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsDateString()
  lastReadAt?: string;

  @IsOptional()
  @IsDateString()
  importedAt?: string;

  @IsOptional()
  @IsDateString()
  lastSyncedAt?: string;

  @IsOptional()
  @IsString()
  syncHash?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  isFavourite?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}