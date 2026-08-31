import { PartialType } from '@nestjs/mapped-types';

import { AddWorkoutDto } from './add-workout.dto';

export class UpdateWorkoutDto extends PartialType(AddWorkoutDto) {}
