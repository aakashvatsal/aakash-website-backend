import { PartialType } from '@nestjs/mapped-types';

import { CreateHaircareProductDto } from './create-haircare-product.dto';

export class UpdateHaircareProductDto extends PartialType(
  CreateHaircareProductDto,
) {}
