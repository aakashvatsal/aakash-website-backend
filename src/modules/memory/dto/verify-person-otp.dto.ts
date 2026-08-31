import { IsMongoId, IsString, Length } from 'class-validator';

export class VerifyPersonOtpDto {
  @IsMongoId()
  verificationSessionId: string;

  @IsString()
  @Length(6, 6)
  otp: string;
}
