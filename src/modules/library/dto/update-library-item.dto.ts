import { PartialType } from '@nestjs/mapped-types';

import { CreateLibraryItemDto } from './create-library-item.dto';

export class UpdateLibraryItemDto extends PartialType(CreateLibraryItemDto) {}
