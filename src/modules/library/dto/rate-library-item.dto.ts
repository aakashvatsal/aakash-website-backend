import {
  IsNumber,
  Max,
  Min,
} from 'class-validator';

export class RateLibraryItemDto {
  @IsNumber()
  @Min(0)
  @Max(5)
  rating: number;
}