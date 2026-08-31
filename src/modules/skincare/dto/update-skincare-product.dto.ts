import { PartialType } from '@nestjs/mapped-types';

import { CreateSkincareProductDto } from './create-skincare-product.dto';

export class UpdateSkincareProductDto extends PartialType(
  CreateSkincareProductDto,
) {}
