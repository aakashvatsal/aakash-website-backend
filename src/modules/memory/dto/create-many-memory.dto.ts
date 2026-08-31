import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsMongoId,
  ValidateNested,
} from 'class-validator';

import { CreateMemoryItemDto } from './create-memory-item.dto';

export class CreateManyMemoryDto {
  // @IsMongoId()
  // ownerUserId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateMemoryItemDto)
  memory: CreateMemoryItemDto[];
}
