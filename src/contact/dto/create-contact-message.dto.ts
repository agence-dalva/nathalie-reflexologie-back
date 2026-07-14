import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateContactMessageDto {
  @IsString()
  @MinLength(1)
  firstname: string;

  @IsString()
  @MinLength(1)
  lastname: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsPhoneNumber('FR')
  phone?: string;

  @IsString()
  @MinLength(1)
  message: string;
}
