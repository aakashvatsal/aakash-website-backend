import { PartialType } from '@nestjs/mapped-types';
import { CreateIntimateCareProductDto } from './create-intimate-care-product.dto';

export class UpdateIntimateCareProductDto extends PartialType(
  CreateIntimateCareProductDto,
) {}
