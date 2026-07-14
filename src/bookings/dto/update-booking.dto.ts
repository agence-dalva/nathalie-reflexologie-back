import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional } from 'class-validator';

export class UpdateBookingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceId?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;
}
