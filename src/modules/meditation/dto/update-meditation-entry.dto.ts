import { PartialType } from '@nestjs/mapped-types';

import { CreateMeditationEntryDto } from './create-meditation-entry.dto';

export class UpdateMeditationEntryDto extends PartialType(
  CreateMeditationEntryDto,
) {}