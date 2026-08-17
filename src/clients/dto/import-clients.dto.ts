import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ImportClientDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstname: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastname: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  /** Nombre de séances déjà effectuées dans l'ancien outil. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  importedBookingsCount?: number;

  /** Date de la dernière séance dans l'ancien outil. */
  @IsOptional()
  @IsDateString()
  importedLastBookingAt?: string;
}

export class ImportClientsDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Aucun client à importer' })
  @ArrayMaxSize(5000, { message: 'Import limité à 5000 clients à la fois' })
  @ValidateNested({ each: true })
  @Type(() => ImportClientDto)
  clients: ImportClientDto[];
}
