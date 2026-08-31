import { IsDateString } from 'class-validator';

export class GenerateDailySkincareLogDto {
  @IsDateString()
  date: string;
}
