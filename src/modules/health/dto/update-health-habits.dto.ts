import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';

import { HabitEntryDto } from './create-health-entry.dto';

export class UpdateHealthHabitsDto {
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => HabitEntryDto)
  habits: HabitEntryDto[];
}
