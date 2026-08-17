import { IsDateString } from 'class-validator';

export class DeleteExtraSlotsDto {
  @IsDateString()
  date: string;
}
