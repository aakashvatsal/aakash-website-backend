import { Controller, Get, Param, Query } from '@nestjs/common';

import { ConversationQueryDto } from './dto/conversation-query.dto';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('insights')
  getInsights() {
    return this.chatService.getInsights();
  }

  @Get('conversations')
  getConversations(
    @Query()
    query: ConversationQueryDto,
  ) {
    return this.chatService.getConversations(query);
  }

  @Get('conversations/:conversationId')
  getConversation(
    @Param('conversationId')
    conversationId: string,
  ) {
    return this.chatService.getConversation(conversationId);
  }
}
