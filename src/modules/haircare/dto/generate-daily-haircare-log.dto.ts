import { IsDateString } from 'class-validator';

export class GenerateDailyHaircareLogDto {
  @IsDateString()
  date: string;
}
