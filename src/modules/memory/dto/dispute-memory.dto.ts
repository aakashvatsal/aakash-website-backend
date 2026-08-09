import {
  IsString,
  MinLength,
} from 'class-validator';

export class DisputeMemoryDto {
  @IsString()
  @MinLength(3)
  reason: string;
}