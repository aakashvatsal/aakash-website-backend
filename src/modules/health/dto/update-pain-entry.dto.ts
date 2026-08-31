import { PartialType } from '@nestjs/mapped-types';

import { AddPainEntryDto } from './add-pain-entry.dto';

export class UpdatePainEntryDto extends PartialType(AddPainEntryDto) {}
