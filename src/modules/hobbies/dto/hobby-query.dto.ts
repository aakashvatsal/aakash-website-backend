import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { HobbyStatus } from '../schemas/hobby.schema';

export class HobbyQueryDto {
  @IsOptional()
  @IsEnum(HobbyStatus)
  status?: HobbyStatus;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  archived?: boolean;
}

export class HobbySessionQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
