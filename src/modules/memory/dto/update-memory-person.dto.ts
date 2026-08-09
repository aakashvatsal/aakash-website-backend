import { PartialType } from '@nestjs/mapped-types';

import { CreateMemoryPersonDto } from './create-memory-person.dto';

export class UpdateMemoryPersonDto extends PartialType(
  CreateMemoryPersonDto,
) {}