import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateExceptionDto {
  @IsDateString()
  date: string;

  @Type(() => Boolean)
  @IsBoolean()
  isClosed: boolean;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime doit être au format HH:mm' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime doit être au format HH:mm' })
  endTime?: string;
}
