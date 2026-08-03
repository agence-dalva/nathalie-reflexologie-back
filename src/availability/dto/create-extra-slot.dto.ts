import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsString, Matches } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateExtraSlotDto {
  @IsDateString()
  date: string;

  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime doit être au format HH:mm' })
  startTime: string;

  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime doit être au format HH:mm' })
  endTime: string;

  @Type(() => Number)
  @IsInt()
  serviceId: number;
}
