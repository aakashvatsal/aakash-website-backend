import { PartialType } from '@nestjs/mapped-types';

import { AddCompanyGoalDto } from './add-company-goal.dto';

export class UpdateCompanyGoalDto extends PartialType(
  AddCompanyGoalDto,
) {}