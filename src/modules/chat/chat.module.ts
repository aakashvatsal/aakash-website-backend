import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Conversation,
  ConversationSchema,
} from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import {
  ImportedChatThread,
  ImportedChatThreadSchema,
} from './schemas/imported-chat-thread.schema';
import {
  ImportedChatMessage,
  ImportedChatMessageSchema,
} from './schemas/imported-chat-message.schema';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AiModule } from '../ai/ai.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Conversation.name,
        schema: ConversationSchema,
      },
      {
        name: Message.name,
        schema: MessageSchema,
      },
      {
        name: ImportedChatThread.name,
        schema: ImportedChatThreadSchema,
      },
      {
        name: ImportedChatMessage.name,
        schema: ImportedChatMessageSchema,
      },
    ]),
    AiModule,
    MemoryModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
