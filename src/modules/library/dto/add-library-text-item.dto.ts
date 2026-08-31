import { IsString, MinLength } from 'class-validator';

export class AddLibraryTextItemDto {
  @IsString()
  @MinLength(1)
  value: string;
}
