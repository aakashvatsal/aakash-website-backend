import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class UpdateMemoryTagsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  tags: string[];
}
