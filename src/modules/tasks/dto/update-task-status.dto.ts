import { IsEnum } from 'class-validator';

import { TaskStatus } from '../schemas/task.schema';

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status: TaskStatus;
}
