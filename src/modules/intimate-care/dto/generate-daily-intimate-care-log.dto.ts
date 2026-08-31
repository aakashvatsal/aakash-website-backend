import { IsDateString } from 'class-validator';

export class GenerateDailyIntimateCareLogDto {
  @IsDateString()
  date: string;
}
