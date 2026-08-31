import { IsMongoId, IsString, MinLength } from 'class-validator';

export class RequestPersonOtpDto {
  // @IsMongoId()
  // ownerUserId: string;

  @IsString()
  @MinLength(3)
  identifier: string;
}
