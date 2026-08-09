import { IsDateString, IsString } from 'class-validator';

export class GenerateDailySupplementLogDto {
  @IsString()
  userId: string;

  @IsDateString()
  date: string;
}