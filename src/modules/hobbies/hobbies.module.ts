import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AiModule } from '../ai/ai.module';
import {
  LibraryItem,
  LibraryItemSchema,
} from '../library/schemas/library-item.schema';
import { NowModule } from '../now/now.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { HobbiesCoachingService } from './hobbies-coaching.service';
import { HobbiesController } from './hobbies.controller';
import { HobbiesScheduler } from './hobbies.scheduler';
import { HobbiesService } from './hobbies.service';
import { Hobby, HobbySchema } from './schemas/hobby.schema';
import {
  HobbyPracticeSession,
  HobbyPracticeSessionSchema,
} from './schemas/hobby-practice-session.schema';
import { HobbyReview, HobbyReviewSchema } from './schemas/hobby-review.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hobby.name, schema: HobbySchema },
      { name: HobbyPracticeSession.name, schema: HobbyPracticeSessionSchema },
      { name: HobbyReview.name, schema: HobbyReviewSchema },
      { name: Task.name, schema: TaskSchema },
      { name: LibraryItem.name, schema: LibraryItemSchema },
    ]),
    NowModule,
    AiModule,
  ],
  controllers: [HobbiesController],
  providers: [HobbiesService, HobbiesCoachingService, HobbiesScheduler],
  exports: [HobbiesService, HobbiesCoachingService, MongooseModule],
})
export class HobbiesModule {}
