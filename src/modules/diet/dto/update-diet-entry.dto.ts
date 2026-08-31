import { PartialType } from '@nestjs/mapped-types';
import { CreateDietEntryDto } from './create-diet-entry.dto';

export class UpdateDietEntryDto extends PartialType(CreateDietEntryDto) {}
