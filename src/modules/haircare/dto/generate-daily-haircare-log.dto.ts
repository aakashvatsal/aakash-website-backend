import {
  IsDateString,
  IsString,
} from 'class-validator';

export class GenerateDailyHaircareLogDto {
  @IsString()
  userId: string;

  @IsDateString()
  date: string;
}