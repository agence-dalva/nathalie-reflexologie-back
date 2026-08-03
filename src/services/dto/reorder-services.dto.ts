import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsArray } from 'class-validator';

export class ReorderServicesDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}
