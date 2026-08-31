import { IsString, MinLength } from 'class-validator';

export class RequestPersonOtpDto {
  @IsString()
  @MinLength(3)
  identifier: string;
}
