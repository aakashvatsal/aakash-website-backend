import {
  PartialType,
} from '@nestjs/mapped-types';

import {
  CreateNowStatusDto,
} from './create-now-status.dto';

export class UpdateNowStatusDto extends PartialType(
  CreateNowStatusDto,
) {}