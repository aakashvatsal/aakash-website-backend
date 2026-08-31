import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { ConversationQueryDto } from './dto/conversation-query.dto';
import {
  Conversation,
  ConversationChannel,
  ConversationDocument,
} from './schemas/conversation.schema';
import {
  Message,
  MessageDocument,
  MessageRole,
} from './schemas/message.schema';

interface PublicConversationParams {
  conversationId?: string;
  sessionId: string;
  mode: string;
  firstMessage: string;
}

interface OwnerConversationParams {
  conversationId?: string;
  mode: string;
  firstMessage: string;
}

interface AppendMessageParams {
  conversationId: Types.ObjectId;
  role: MessageRole;
  content: string;
  memoryIds?: Types.ObjectId[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,

    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

  async getOrCreatePublicConversation(params: PublicConversationParams) {
    if (params.conversationId) {
      if (!Types.ObjectId.isValid(params.conversationId)) {
        throw new BadRequestException('Invalid conversation ID.');
      }

      const existing = await this.conversationModel.findOne({
        _id: new Types.ObjectId(params.conversationId),
        sessionId: params.sessionId,
        channel: ConversationChannel.PUBLIC,
        isActive: true,
      });

      if (existing) {
        existing.mode = params.mode;
        await existing.save();
        return existing;
      }
    }

    return this.conversationModel.create({
      sessionId: params.sessionId,
      channel: ConversationChannel.PUBLIC,
      mode: params.mode,
      title: this.createConversationTitle(params.firstMessage),
      isActive: true,
      lastMessageAt: new Date(),
      messageCount: 0,
    });
  }

  async getOrCreateOwnerConversation(params: OwnerConversationParams) {
    if (params.conversationId) {
      if (!Types.ObjectId.isValid(params.conversationId)) {
        throw new BadRequestException('Invalid conversation ID.');
      }

      const existing = await this.conversationModel.findOne({
        _id: new Types.ObjectId(params.conversationId),
        channel: ConversationChannel.OWNER,
        isActive: true,
      });

      if (existing) {
        existing.mode = params.mode;
        await existing.save();
        return existing;
      }
    }

    return this.conversationModel.create({
      channel: ConversationChannel.OWNER,
      mode: params.mode,
      title: this.createConversationTitle(params.firstMessage),
      isActive: true,
      lastMessageAt: new Date(),
      messageCount: 0,
    });
  }

  async getRecentOwnerMessages(conversationId: Types.ObjectId, limit = 16) {
    const conversationExists = await this.conversationModel.exists({
      _id: conversationId,
      channel: ConversationChannel.OWNER,
      isActive: true,
    });

    if (!conversationExists) {
      return [];
    }

    const safeLimit = Math.min(Math.max(limit, 1), 30);
    const messages = await this.messageModel
      .find({
        conversationId,
        role: { $in: [MessageRole.USER, MessageRole.ASSISTANT] },
      })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();

    return messages.reverse().map((message) => ({
      role:
        message.role === MessageRole.USER
          ? ('user' as const)
          : ('assistant' as const),
      content: message.content,
    }));
  }

  async getOwnerConversations(query: ConversationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: {
      channel: ConversationChannel;
      mode?: string;
      title?: { $regex: string; $options: string };
    } = { channel: ConversationChannel.OWNER };

    if (query.mode?.trim()) {
      filter.mode = query.mode.trim();
    }

    if (query.search?.trim()) {
      filter.title = {
        $regex: this.escapeRegex(query.search.trim()),
        $options: 'i',
      };
    }

    const [data, total] = await Promise.all([
      this.conversationModel
        .find(filter)
        .sort({ lastMessageAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.conversationModel.countDocuments(filter),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async getOwnerConversation(conversationId: string) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Invalid conversation ID.');
    }

    const objectId = new Types.ObjectId(conversationId);
    const conversation = await this.conversationModel
      .findOne({
        _id: objectId,
        channel: ConversationChannel.OWNER,
      })
      .lean();

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    const messages = await this.messageModel
      .find({
        conversationId: objectId,
        role: { $in: [MessageRole.USER, MessageRole.ASSISTANT] },
      })
      .sort({ createdAt: 1 })
      .populate({
        path: 'memoryIds',
        select:
          'content type source tags accessLevel sensitivity importance confidence verificationStatus isDisputed createdAt updatedAt',
      })
      .lean();

    return { conversation, messages };
  }

  async getRecentMessages(
    conversationId: Types.ObjectId,
    sessionId: string,
    limit = 12,
  ) {
    const conversationExists = await this.conversationModel.exists({
      _id: conversationId,
      sessionId,
      channel: ConversationChannel.PUBLIC,
      isActive: true,
    });

    if (!conversationExists) {
      return [];
    }

    const safeLimit = Math.min(Math.max(limit, 1), 20);

    const messages = await this.messageModel
      .find({
        conversationId,
        role: {
          $in: [MessageRole.USER, MessageRole.ASSISTANT],
        },
      })
      .sort({
        createdAt: -1,
      })
      .limit(safeLimit)
      .lean();

    return messages.reverse().map((message) => ({
      role:
        message.role === MessageRole.USER
          ? ('user' as const)
          : ('assistant' as const),
      content: message.content,
    }));
  }

  async appendMessage(params: AppendMessageParams) {
    const message = await this.messageModel.create({
      conversationId: params.conversationId,
      role: params.role,
      content: params.content.trim(),
      memoryIds: params.memoryIds ?? [],
      metadata: params.metadata ?? {},
    });

    await this.conversationModel.updateOne(
      {
        _id: params.conversationId,
      },
      {
        $set: {
          lastMessageAt: new Date(),
        },
        $inc: {
          messageCount: 1,
        },
      },
    );

    return message;
  }

  async getInsights() {
    const now = Date.now();
    const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const publicConversationFilter = {
      channel: ConversationChannel.PUBLIC,
    };

    const [
      totalConversations,
      conversationsLast24Hours,
      conversationsLast7Days,
      totalMessages,
      userMessages,
      assistantMessages,
      groundedAssistantMessages,
    ] = await Promise.all([
      this.conversationModel.countDocuments(publicConversationFilter),
      this.conversationModel.countDocuments({
        ...publicConversationFilter,
        lastMessageAt: {
          $gte: last24Hours,
        },
      }),
      this.conversationModel.countDocuments({
        ...publicConversationFilter,
        lastMessageAt: {
          $gte: last7Days,
        },
      }),
      this.messageModel.countDocuments({
        role: {
          $in: [MessageRole.USER, MessageRole.ASSISTANT],
        },
      }),
      this.messageModel.countDocuments({
        role: MessageRole.USER,
      }),
      this.messageModel.countDocuments({
        role: MessageRole.ASSISTANT,
      }),
      this.messageModel.countDocuments({
        role: MessageRole.ASSISTANT,
        'memoryIds.0': {
          $exists: true,
        },
      }),
    ]);

    return {
      totalConversations,
      conversationsLast24Hours,
      conversationsLast7Days,
      totalMessages,
      userMessages,
      assistantMessages,
      groundedAssistantMessages,
      groundingRate:
        assistantMessages > 0
          ? Math.round((groundedAssistantMessages / assistantMessages) * 1000) /
            10
          : 0,
      averageMessagesPerConversation:
        totalConversations > 0
          ? Math.round((totalMessages / totalConversations) * 10) / 10
          : 0,
    };
  }

  async getConversations(query: ConversationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: {
      channel: ConversationChannel;
      mode?: string;
      title?: {
        $regex: string;
        $options: string;
      };
    } = {
      channel: ConversationChannel.PUBLIC,
    };

    if (query.mode?.trim()) {
      filter.mode = query.mode.trim();
    }

    if (query.search?.trim()) {
      filter.title = {
        $regex: this.escapeRegex(query.search.trim()),
        $options: 'i',
      };
    }

    const [data, total] = await Promise.all([
      this.conversationModel
        .find(filter)
        .select('-sessionId')
        .sort({
          lastMessageAt: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.conversationModel.countDocuments(filter),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async getConversation(conversationId: string) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Invalid conversation ID.');
    }

    const objectId = new Types.ObjectId(conversationId);

    const conversation = await this.conversationModel
      .findOne({
        _id: objectId,
        channel: ConversationChannel.PUBLIC,
      })
      .select('-sessionId')
      .lean();

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    const messages = await this.messageModel
      .find({
        conversationId: objectId,
        role: {
          $in: [MessageRole.USER, MessageRole.ASSISTANT],
        },
      })

      .sort({
        createdAt: 1,
      })
      .populate({
        path: 'memoryIds',
        select:
          'content type source tags accessLevel sensitivity importance confidence verificationStatus isDisputed createdAt updatedAt',
      })
      .lean();

    return {
      conversation,
      messages,
    };
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private createConversationTitle(message: string) {
    const clean = message.trim().replace(/\s+/g, ' ');

    if (clean.length <= 80) {
      return clean || 'New conversation';
    }

    return `${clean.slice(0, 77)}...`;
  }
}
