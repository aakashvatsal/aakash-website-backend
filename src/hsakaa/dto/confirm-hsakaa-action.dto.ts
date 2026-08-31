import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConfirmHsakaaActionDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  confirmationToken: string;
}
