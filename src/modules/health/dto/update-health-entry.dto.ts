import { PartialType } from '@nestjs/mapped-types';

import { CreateHealthEntryDto } from './create-health-entry.dto';

export class UpdateHealthEntryDto extends PartialType(CreateHealthEntryDto) {}
