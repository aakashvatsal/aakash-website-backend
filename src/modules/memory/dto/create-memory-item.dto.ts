// import { OmitType } from '@nestjs/mapped-types';

// import { CreateMemoryDto } from './create-memory.dto';

// export class CreateMemoryItemDto extends OmitType(
//   CreateMemoryDto,
//   ['ownerUserId'] as const,
// ) {}

import { CreateMemoryDto } from './create-memory.dto';

export class CreateMemoryItemDto extends CreateMemoryDto {}
