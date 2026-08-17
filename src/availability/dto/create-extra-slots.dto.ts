import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { CreateExtraSlotDto } from './create-extra-slot.dto';

export class CreateExtraSlotsDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Aucun créneau à enregistrer' })
  @ValidateNested({ each: true })
  @Type(() => CreateExtraSlotDto)
  slots: CreateExtraSlotDto[];
}
