import { IsDateString, IsString } from 'class-validator';

export class GenerateDailySkincareLogDto {
  @IsString()
  userId: string;

  @IsDateString()
  date: string;
}