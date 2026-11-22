import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../../ai/ai.module';
import { ChatModule } from '../../chat/chat.module';
import { SlackController } from './slack.controller';
import { SlackService } from './slack.service';
import { SlackIntentService } from './slack-intent.service';
import { SlackFraytoOperationsService } from './slack-frayto-operations.service';
import {
  SlackOperation,
  SlackOperationSchema,
  SlackKnowledge,
  SlackKnowledgeSchema,
  SlackOAuthState,
  SlackOAuthStateSchema,
  SlackQuery,
  SlackQuerySchema,
  SlackWorkspace,
  SlackWorkspaceSchema,
} from './slack.schemas';
import { HsakaaOwnerSessionGuard } from '../../../hsakaa/guards/hsakaa-owner-session.guard';

@Module({
  imports: [
    AiModule,
    ChatModule,
    MongooseModule.forFeature([
      { name: SlackWorkspace.name, schema: SlackWorkspaceSchema },
      { name: SlackOAuthState.name, schema: SlackOAuthStateSchema },
      { name: SlackQuery.name, schema: SlackQuerySchema },
      { name: SlackKnowledge.name, schema: SlackKnowledgeSchema },
      { name: SlackOperation.name, schema: SlackOperationSchema },
    ]),
  ],
  controllers: [SlackController],
  providers: [
    SlackService,
    SlackIntentService,
    SlackFraytoOperationsService,
    HsakaaOwnerSessionGuard,
  ],
  exports: [SlackService],
})
export class SlackModule {}
