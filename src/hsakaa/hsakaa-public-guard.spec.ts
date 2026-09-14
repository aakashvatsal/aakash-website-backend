import { Types } from 'mongoose';

import { MessageRole } from '../modules/chat/schemas/message.schema';
import { HsakaaMode } from './dto/ask-hsakaa.dto';
import { HsakaaService } from './hsakaa.service';

describe('HsakaaService public scope guard', () => {
  const conversationId = new Types.ObjectId();

  function createService(
    previousMessages: Array<{ role: MessageRole; content: string }> = [],
  ) {
    const aiService = {
      generateResponse: jest.fn().mockResolvedValue('Personal answer'),
    };
    const chatService = {
      getOrCreatePublicConversation: jest.fn().mockResolvedValue({
        _id: conversationId,
      }),
      getRecentMessages: jest.fn().mockResolvedValue(previousMessages),
      appendMessage: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    const contextService = {
      buildPublicContext: jest.fn().mockResolvedValue({
        sections: ['PUBLIC CONTEXT'],
        memoryIds: [],
        retrievedMemoryCount: 0,
      }),
    };
    const voiceService = {
      getRenderContext: jest.fn().mockResolvedValue('AAKASH VOICE FINGERPRINT'),
      sanitizeRenderedText: jest.fn((text: string) =>
        text.replace(/—/g, ' - '),
      ),
    };

    const service = new HsakaaService(
      aiService as never,
      chatService as never,
      contextService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      voiceService as never,
      {} as never,
    );

    return { service, aiService, chatService, contextService, voiceService };
  }

  it.each([
    ['Explain quantum physics', HsakaaMode.CHAT],
    ["How is Aakash's WHOOP recovery?", HsakaaMode.CHAT],
    ["How is Aakash's Instagram performing?", HsakaaMode.CHAT],
  ])(
    'rejects %s before context retrieval or AI generation',
    async (message, mode) => {
      const { service, aiService, contextService } = createService();

      const result = await service.ask({
        mode,
        message,
        sessionId: 'c52d92f2-bf2e-4e13-9023-238267d6ad2c',
      });

      expect(result.answer).toBeTruthy();
      expect(contextService.buildPublicContext).not.toHaveBeenCalled();
      expect(aiService.generateResponse).not.toHaveBeenCalled();
    },
  );

  it('still retrieves public context and calls AI for an Aakash question', async () => {
    const { service, aiService, contextService } = createService();

    const result = await service.ask({
      mode: HsakaaMode.CHAT,
      message: 'What is Aakash building with 8lete?',
      sessionId: 'c52d92f2-bf2e-4e13-9023-238267d6ad2c',
    });

    expect(result.answer).toBe('Personal answer');
    expect(contextService.buildPublicContext).toHaveBeenCalledTimes(1);
    expect(aiService.generateResponse).toHaveBeenCalledTimes(1);
    expect(aiService.generateResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        contextSections: ['PUBLIC CONTEXT', 'AAKASH VOICE FINGERPRINT'],
      }),
    );
  });

  it('does not let a short unrelated question bypass the guard after a personal turn', async () => {
    const { service, aiService, contextService } = createService([
      { role: MessageRole.USER, content: 'Tell me about Aakash.' },
      { role: MessageRole.ASSISTANT, content: 'A public answer about Aakash.' },
    ]);

    await service.ask({
      mode: HsakaaMode.CHAT,
      message: 'Write me a poem',
      sessionId: 'c52d92f2-bf2e-4e13-9023-238267d6ad2c',
    });

    expect(contextService.buildPublicContext).not.toHaveBeenCalled();
    expect(aiService.generateResponse).not.toHaveBeenCalled();
  });
});
