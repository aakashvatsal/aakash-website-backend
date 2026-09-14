import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AiModule } from '../modules/ai/ai.module';
import { ChatModule } from '../modules/chat/chat.module';
import { CompaniesModule } from '../modules/companies/companies.module';
import { HealthModule } from '../modules/health/health.module';
import { HobbiesModule } from '../modules/hobbies/hobbies.module';
import { JournalModule } from '../modules/journal/journal.module';
import { LibraryModule } from '../modules/library/library.module';
import { MediaModule } from '../modules/media/media.module';
import { MemoryModule } from '../modules/memory/memory.module';
import { NowModule } from '../modules/now/now.module';
import { TasksModule } from '../modules/tasks/tasks.module';
import { MeditationModule } from '../modules/meditation/meditation.module';
import { RemindersModule } from '../modules/reminders/reminders.module';
import { BrainDumpModule } from '../modules/brain-dump/brain-dump.module';

import { Task, TaskSchema } from '../modules/tasks/schemas/task.schema';
import {
  BrainDump,
  BrainDumpSchema,
} from '../modules/brain-dump/schemas/brain-dump.schema';
import {
  JournalEntry,
  JournalEntrySchema,
} from '../modules/journal/schemas/journal-entry.schema';
import {
  LibraryItem,
  LibraryItemSchema,
} from '../modules/library/schemas/library-item.schema';
import {
  LibraryHighlight,
  LibraryHighlightSchema,
} from '../modules/library/schemas/library-highlight.schema';
import {
  HealthEntry,
  HealthEntrySchema,
} from '../modules/health/schemas/health-entry.schema';
import { Hobby, HobbySchema } from '../modules/hobbies/schemas/hobby.schema';
import {
  HobbyPracticeSession,
  HobbyPracticeSessionSchema,
} from '../modules/hobbies/schemas/hobby-practice-session.schema';
import {
  MediaPost,
  MediaPostSchema,
} from '../modules/media/schemas/media-post.schema';
import {
  MediaPublication,
  MediaPublicationSchema,
} from '../modules/media/schemas/media-publication.schema';
import {
  Company,
  CompanySchema,
} from '../modules/companies/schemas/company.schema';
import { Memory, MemorySchema } from '../modules/memory/schemas/memory.schema';
import {
  PersonInteraction,
  PersonInteractionSchema,
} from '../modules/memory/schemas/person-interaction.schema';
import {
  Conversation,
  ConversationSchema,
} from '../modules/chat/schemas/conversation.schema';
import { Message, MessageSchema } from '../modules/chat/schemas/message.schema';
import { HsakaaActionService } from './hsakaa-action.service';
import { HsakaaBriefScheduler } from './hsakaa-brief.scheduler';
import { HsakaaBriefService } from './hsakaa-brief.service';
import { HsakaaPatternService } from './hsakaa-pattern.service';
import { HsakaaWeeklyReviewService } from './hsakaa-weekly-review.service';
import { HsakaaDecisionService } from './hsakaa-decision.service';
import { HsakaaDecisionExperimentService } from './hsakaa-decision-experiment.service';
import { HsakaaDecisionAnalyticsService } from './hsakaa-decision-analytics.service';
import { HsakaaDailyContextService } from './hsakaa-daily-context.service';
import { HsakaaDailyJournalService } from './hsakaa-daily-journal.service';
import { HsakaaDailyJournalScheduler } from './hsakaa-daily-journal.scheduler';
import { HsakaaAgentContextService } from './hsakaa-agent-context.service';
import { HsakaaController } from './hsakaa.controller';
import { HsakaaOwnerSessionGuard } from './guards/hsakaa-owner-session.guard';
import { HsakaaContextService } from './hsakaa-context.service';
import { HsakaaService } from './hsakaa.service';
import { HsakaaToolsService } from './hsakaa-tools.service';
import {
  HsakaaAction,
  HsakaaActionSchema,
} from './schemas/hsakaa-action.schema';
import { HsakaaBrief, HsakaaBriefSchema } from './schemas/hsakaa-brief.schema';
import {
  HsakaaPatternReport,
  HsakaaPatternReportSchema,
} from './schemas/hsakaa-pattern.schema';
import {
  HsakaaWeeklyReview,
  HsakaaWeeklyReviewSchema,
} from './schemas/hsakaa-weekly-review.schema';
import {
  HsakaaDecisionCase,
  HsakaaDecisionCaseSchema,
} from './schemas/hsakaa-decision-case.schema';
import {
  HsakaaDailyContext,
  HsakaaDailyContextSchema,
} from './schemas/hsakaa-daily-context.schema';
import {
  HsakaaVoiceProfile,
  HsakaaVoiceProfileSchema,
} from './schemas/hsakaa-voice-profile.schema';
import {
  HsakaaVoiceFeedback,
  HsakaaVoiceFeedbackSchema,
} from './schemas/hsakaa-voice-feedback.schema';
import { HsakaaVoiceService } from './hsakaa-voice.service';
import {
  HsakaaPersonVoiceProfile,
  HsakaaPersonVoiceProfileSchema,
} from './schemas/hsakaa-person-voice-profile.schema';
import { HsakaaVoiceScheduler } from './hsakaa-voice.scheduler';
import { HsakaaSpeechService } from './hsakaa-speech.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HsakaaAction.name, schema: HsakaaActionSchema },
      { name: HsakaaBrief.name, schema: HsakaaBriefSchema },
      { name: HsakaaPatternReport.name, schema: HsakaaPatternReportSchema },
      { name: HsakaaWeeklyReview.name, schema: HsakaaWeeklyReviewSchema },
      { name: HsakaaDecisionCase.name, schema: HsakaaDecisionCaseSchema },
      { name: HsakaaDailyContext.name, schema: HsakaaDailyContextSchema },
      { name: HsakaaVoiceProfile.name, schema: HsakaaVoiceProfileSchema },
      { name: HsakaaVoiceFeedback.name, schema: HsakaaVoiceFeedbackSchema },
      {
        name: HsakaaPersonVoiceProfile.name,
        schema: HsakaaPersonVoiceProfileSchema,
      },
      { name: Task.name, schema: TaskSchema },
      { name: BrainDump.name, schema: BrainDumpSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
      { name: LibraryItem.name, schema: LibraryItemSchema },
      { name: LibraryHighlight.name, schema: LibraryHighlightSchema },
      { name: HealthEntry.name, schema: HealthEntrySchema },
      { name: Hobby.name, schema: HobbySchema },
      { name: HobbyPracticeSession.name, schema: HobbyPracticeSessionSchema },
      { name: MediaPost.name, schema: MediaPostSchema },
      { name: MediaPublication.name, schema: MediaPublicationSchema },
      { name: PersonInteraction.name, schema: PersonInteractionSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Memory.name, schema: MemorySchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    AiModule,
    ChatModule,
    MemoryModule,
    NowModule,
    CompaniesModule,
    JournalModule,
    LibraryModule,
    HealthModule,
    HobbiesModule,
    MediaModule,
    TasksModule,
    RemindersModule,
    MeditationModule,
    BrainDumpModule,
  ],
  controllers: [HsakaaController],
  providers: [
    HsakaaService,
    HsakaaContextService,
    HsakaaAgentContextService,
    HsakaaToolsService,
    HsakaaActionService,
    HsakaaBriefService,
    HsakaaPatternService,
    HsakaaWeeklyReviewService,
    HsakaaDecisionService,
    HsakaaDecisionExperimentService,
    HsakaaDecisionAnalyticsService,
    HsakaaDailyContextService,
    HsakaaDailyJournalService,
    HsakaaDailyJournalScheduler,
    HsakaaVoiceService,
    HsakaaVoiceScheduler,
    HsakaaSpeechService,
    HsakaaBriefScheduler,
    HsakaaOwnerSessionGuard,
  ],
  exports: [HsakaaBriefService],
})
export class HsakaaModule {}
