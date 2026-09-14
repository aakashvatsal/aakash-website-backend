import { Types } from 'mongoose';

import { HsakaaMode } from './dto/ask-hsakaa.dto';
import { HsakaaService } from './hsakaa.service';

describe('HsakaaService verified-person guard', () => {
  const conversationId = new Types.ObjectId();
  const personId = new Types.ObjectId();

  function createService() {
    const aiService = {
      generateResponse: jest.fn().mockResolvedValue('Verified personal answer'),
    };
    const chatService = {
      getOrCreateVerifiedPersonConversation: jest.fn().mockResolvedValue({
        _id: conversationId,
      }),
      getRecentVerifiedPersonMessages: jest.fn().mockResolvedValue([]),
      appendMessage: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    const contextService = {
      buildVerifiedPersonContext: jest.fn().mockResolvedValue({
        sections: ['VERIFIED CONTEXT'],
        memoryIds: [],
        retrievedMemoryCount: 0,
        personId,
        personName: 'Ria',
        memoryAccessConsentGranted: true,
      }),
    };
    const memoryVerificationService = {
      validateSession: jest.fn().mockResolvedValue({
        personId,
        personName: 'Ria',
        memoryAccessConsentGranted: true,
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
      memoryVerificationService as never,
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

    return {
      service,
      aiService,
      chatService,
      contextService,
      memoryVerificationService,
      voiceService,
    };
  }

  it('rejects unrelated questions before verified-person context or AI retrieval', async () => {
    const { service, aiService, contextService } = createService();

    const result = await service.askVerifiedPerson(
      {
        mode: HsakaaMode.CHAT,
        message: 'Explain quantum physics',
      },
      'verified-token',
    );

    expect(result.scope).toBe('verified_person');
    expect(contextService.buildVerifiedPersonContext).not.toHaveBeenCalled();
    expect(aiService.generateResponse).not.toHaveBeenCalled();
  });

  it('allows a relationship question and binds the conversation to the verified person', async () => {
    const { service, aiService, chatService, contextService } = createService();

    const result = await service.askVerifiedPerson(
      {
        mode: HsakaaMode.CHAT,
        message: 'What do you remember about me?',
      },
      'verified-token',
    );

    expect(result.answer).toBe('Verified personal answer');
    expect(
      chatService.getOrCreateVerifiedPersonConversation,
    ).toHaveBeenCalledWith(expect.objectContaining({ personId }));
    expect(contextService.buildVerifiedPersonContext).toHaveBeenCalledTimes(1);
    expect(aiService.generateResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'verified_person',
        contextSections: ['VERIFIED CONTEXT', 'AAKASH VOICE FINGERPRINT'],
      }),
    );
  });
});
