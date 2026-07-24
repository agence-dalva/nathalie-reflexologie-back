import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ImportFrenchHolidaysDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year: number;
}
