import { IsDateString, IsString } from 'class-validator';

export class GenerateDailyIntimateCareLogDto {
  @IsString()
  userId: string;

  @IsDateString()
  date: string;
}