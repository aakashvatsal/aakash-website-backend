import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  HaircareProduct,
  HaircareProductSchema,
} from '../haircare/schemas/haircare-product.schema';
import {
  IntimateCareProduct,
  IntimateCareProductSchema,
} from '../intimate-care/schemas/intimate-care-product.schema';
import {
  SkincareProduct,
  SkincareProductSchema,
} from '../skincare/schemas/skincare-product.schema';
import {
  Supplement,
  SupplementSchema,
} from '../supplements/schemas/supplement.schema';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { RemindersController } from './reminders.controller';
import { RemindersScheduler } from './reminders.scheduler';
import { RemindersService } from './reminders.service';
import { Reminder, ReminderSchema } from './schemas/reminder.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Reminder.name,
        schema: ReminderSchema,
      },
      {
        name: Task.name,
        schema: TaskSchema,
      },
      {
        name: Supplement.name,
        schema: SupplementSchema,
      },
      {
        name: SkincareProduct.name,
        schema: SkincareProductSchema,
      },
      {
        name: HaircareProduct.name,
        schema: HaircareProductSchema,
      },
      {
        name: IntimateCareProduct.name,
        schema: IntimateCareProductSchema,
      },
    ]),
  ],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersScheduler],
  exports: [RemindersService],
})
export class RemindersModule {}
