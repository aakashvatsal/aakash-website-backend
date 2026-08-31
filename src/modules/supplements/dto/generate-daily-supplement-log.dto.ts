import { IsDateString } from 'class-validator';

export class GenerateDailySupplementLogDto {
  @IsDateString()
  date: string;
}
