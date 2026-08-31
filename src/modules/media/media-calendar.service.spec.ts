import { BadRequestException } from '@nestjs/common';
import { Model, Types } from 'mongoose';

import { MediaBufferService } from './media-buffer.service';
import { MediaCalendarService } from './media-calendar.service';
import { MediaCoreService } from './media-core.service';
import { MediaPublishingService } from './media-publishing.service';
import { MediaAccountDocument } from './schemas/media-account.schema';
import { MediaCalendarSlotDocument } from './schemas/media-calendar-slot.schema';
import {
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
} from './schemas/media-post.schema';
import {
  MediaDeliveryStatus,
  MediaProductionStatus,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

function saveDocument<T extends object>(document: T) {
  return jest.fn().mockImplementation(() => Promise.resolve(document));
}

describe('MediaCalendarService', () => {
  function createService(options?: {
    publication?: MediaPublicationDocument;
    account?: MediaAccountDocument;
  }) {
    const account = options?.account;
    const publication = options?.publication;
    const accountModel = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(account ?? null),
    } as unknown as Model<MediaAccountDocument>;
    const publicationModel = {
      findOne: jest.fn().mockResolvedValue(publication ?? null),
    } as unknown as Model<MediaPublicationDocument>;
    const slotModel = {
      exists: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    } as unknown as Model<MediaCalendarSlotDocument>;
    const updateAccountMock = jest.fn();
    const coreService = {
      updateAccount: updateAccountMock,
    } as unknown as MediaCoreService;
    const publishingService = {
      publish: jest.fn(),
      shouldUseBuffer: jest.fn().mockReturnValue(false),
    } as unknown as MediaPublishingService;
    const bufferService = {
      isConfigured: jest.fn().mockReturnValue(false),
      schedule: jest.fn(),
      getPost: jest.fn(),
    } as unknown as MediaBufferService;

    return {
      service: new MediaCalendarService(
        accountModel,
        publicationModel,
        slotModel,
        coreService,
        publishingService,
        bufferService,
      ),
      coreService,
      updateAccountMock,
      publishingService,
    };
  }

  function publication(overrides?: Partial<MediaPublicationDocument>) {
    const document = {
      _id: new Types.ObjectId(),
      contentItemId: new Types.ObjectId(),
      accountId: new Types.ObjectId(),
      platform: MediaPlatform.LINKEDIN,
      format: MediaPostType.TEXT,
      status: MediaPostStatus.READY,
      productionStatus: MediaProductionStatus.READY,
      deliveryStatus: MediaDeliveryStatus.NOT_SCHEDULED,
      autoPublish: false,
      publishAttempts: 0,
      metadata: {},
      save: jest.fn(),
      ...overrides,
    } as unknown as MediaPublicationDocument;
    document.save = saveDocument(document);
    return document;
  }

  function account(overrides?: Partial<MediaAccountDocument>) {
    return {
      _id: new Types.ObjectId(),
      platform: MediaPlatform.LINKEDIN,
      displayName: 'LinkedIn',
      isActive: true,
      isPrimary: true,
      capabilities: {
        canPublish: true,
        canSchedule: true,
        canReadAnalytics: true,
        canReadEngagement: true,
        canUploadAssets: true,
        requiresManualPublish: false,
      },
      strategy: {
        goals: [],
        contentPillars: [],
        audiences: [],
        planningHorizonDays: 7,
        desiredPublicationsPerWeek: 0,
        timezone: 'Asia/Kolkata',
        preferredDaysOfWeek: [],
        preferredPublishTimes: ['09:00'],
      },
      metadata: {},
      save: jest.fn(),
      ...overrides,
    } as unknown as MediaAccountDocument;
  }

  it('never allows account planning horizon below seven days', async () => {
    const configuredAccount = account();
    const { service, updateAccountMock } = createService();
    updateAccountMock.mockResolvedValue(configuredAccount);

    await service.updateAccount(configuredAccount._id.toString(), {
      strategy: { planningHorizonDays: 2 },
    });

    expect(updateAccountMock).toHaveBeenCalledWith(
      configuredAccount._id.toString(),
      { strategy: { planningHorizonDays: 7 } },
    );
  });

  it('blocks final scheduling until Production Studio says the publication is ready', async () => {
    const item = publication({
      productionStatus: MediaProductionStatus.ASSETS_PENDING,
    });
    const { service } = createService({ publication: item });

    await expect(
      service.schedulePublication(item._id.toString(), {
        scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow auto-publish when the configured account cannot publish', async () => {
    const configuredAccount = account({
      capabilities: {
        canPublish: false,
        canSchedule: true,
        canReadAnalytics: true,
        canReadEngagement: false,
        canUploadAssets: false,
        requiresManualPublish: true,
      },
    });
    const item = publication({ accountId: configuredAccount._id });
    const { service } = createService({
      publication: item,
      account: configuredAccount,
    });

    await expect(
      service.schedulePublication(item._id.toString(), {
        scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        autoPublish: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records explicit approval when a production-ready publication is scheduled', async () => {
    const configuredAccount = account();
    const item = publication({ accountId: configuredAccount._id });
    const { service } = createService({
      publication: item,
      account: configuredAccount,
    });
    const future = new Date(Date.now() + 2 * 60 * 60_000).toISOString();

    await service.schedulePublication(item._id.toString(), {
      scheduledAt: future,
      autoPublish: true,
    });

    expect(item.status).toBe(MediaPostStatus.SCHEDULED);
    expect(item.deliveryStatus).toBe(MediaDeliveryStatus.SCHEDULED);
    expect(item.autoPublish).toBe(true);
    expect(item.scheduleApprovedAt).toBeInstanceOf(Date);
    expect((item as unknown as { save: jest.Mock }).save).toHaveBeenCalled();
  });

  it('keeps WhatsApp Status out of automatic publishing', async () => {
    const configuredAccount = account({
      platform: MediaPlatform.WHATSAPP,
      capabilities: {
        canPublish: true,
        canSchedule: true,
        canReadAnalytics: false,
        canReadEngagement: true,
        canUploadAssets: true,
        requiresManualPublish: false,
      },
    });
    const item = publication({
      accountId: configuredAccount._id,
      platform: MediaPlatform.WHATSAPP,
      format: MediaPostType.WHATSAPP_STATUS,
    });
    const { service } = createService({
      publication: item,
      account: configuredAccount,
    });

    await expect(
      service.schedulePublication(item._id.toString(), {
        scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        autoPublish: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
