import {
  IsEmail,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  profileImageUrl?: string;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}