import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateBookingDto {
  @Type(() => Number)
  @IsInt()
  serviceId: number;

  @IsDateString()
  startsAt: string;

  @IsString()
  @MinLength(1)
  customerFirstname: string;

  @IsString()
  @MinLength(1)
  customerLastname: string;

  @IsEmail()
  customerEmail: string;

  @IsOptional()
  @IsPhoneNumber('FR')
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  beneficiaryFirstname?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  beneficiaryLastname?: string;

  @IsOptional()
  @IsPhoneNumber('FR')
  beneficiaryPhone?: string;

  // Le motif du rendez-vous est demandé aussi bien en ligne qu'au back-office :
  // c'est ce qu'elle lit en premier en préparant sa séance.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1, { message: 'Le motif est requis' })
  notes: string;
}
