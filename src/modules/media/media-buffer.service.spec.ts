import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';

import { MediaBufferService } from './media-buffer.service';
import { MediaAssetStorageService } from './media-asset-storage.service';
import {
  MediaAccountConnectionStatus,
  MediaDeliveryProvider,
} from './schemas/media-account.schema';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';
import { MediaPostStatus } from './schemas/media-post.schema';

function createService(options?: {
  apiKey?: string;
  assets?: Array<Record<string, unknown>>;
}) {
  const config = {
    get: jest.fn((key: string) =>
      key === 'BUFFER_API_KEY' ? options?.apiKey : undefined,
    ),
  } as unknown as ConfigService;
  const accountModel = {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
  };
  const assetModel = {
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(options?.assets ?? []),
      }),
    }),
  };
  const assetStorage = {
    resolveAssetUrl: jest.fn(
      (asset: { url?: string; storageKey?: string }) =>
        asset.url ??
        (asset.storageKey
          ? `https://signed.example/${asset.storageKey}`
          : undefined),
    ),
  } as unknown as MediaAssetStorageService;
  return new MediaBufferService(
    config,
    accountModel as never,
    assetModel as never,
    assetStorage,
  );
}

const account = {
  _id: new Types.ObjectId(),
  platform: MediaPlatform.X,
  connectionStatus: MediaAccountConnectionStatus.CONNECTED,
  deliveryProvider: MediaDeliveryProvider.BUFFER,
  buffer: {
    organizationId: 'org-1',
    channelId: 'channel-1',
    service: 'twitter',
    isDisconnected: false,
    isLocked: false,
    isQueuePaused: false,
  },
} as never;

describe('MediaBufferService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports Buffer as optional when the API key is not configured', async () => {
    const service = createService();
    const result = await service.status();
    expect(result.configured).toBe(false);
    expect(result.reachable).toBe(false);
    expect(result.requiredEnvironmentVariable).toBe('BUFFER_API_KEY');
  });

  it('does not hand off to a paused Buffer queue', () => {
    const service = createService({ apiKey: 'buffer-test-key' });
    const publication = {
      platform: MediaPlatform.X,
      format: MediaPostType.TEXT,
    } as never;
    const paused = {
      ...(account as object),
      buffer: {
        ...(account as { buffer: object }).buffer,
        isQueuePaused: true,
      },
    } as never;
    expect(service.canHandle(publication, paused)).toBe(false);
  });

  it('uses the first X thread item as both root text and thread item 1', async () => {
    const service = createService({ apiKey: 'buffer-test-key' });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            createPost: {
              __typename: 'PostActionSuccess',
              post: { id: 'post-1', status: 'sending' },
            },
          },
        }),
    } as Response);

    await service.publishNow(
      {
        _id: new Types.ObjectId(),
        platform: MediaPlatform.X,
        format: MediaPostType.THREAD,
        status: MediaPostStatus.READY,
        caption: 'A different summary',
        slides: ['Root thread post', 'Second post'],
        metadata: {},
      } as never,
      account,
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    if (typeof init.body !== 'string') {
      throw new Error('Expected Buffer GraphQL request body to be a string.');
    }
    const body = JSON.parse(init.body) as {
      variables: {
        input: {
          text: string;
          metadata: { twitter: { thread: Array<{ text: string }> } };
        };
      };
    };
    expect(body.variables.input.text).toBe('Root thread post');
    expect(body.variables.input.metadata.twitter.thread[0]?.text).toBe(
      'Root thread post',
    );
  });

  it('blocks asset-required posts before Buffer when no ready public asset exists', async () => {
    const service = createService({ apiKey: 'buffer-test-key' });
    await expect(
      service.publishNow(
        {
          _id: new Types.ObjectId(),
          platform: MediaPlatform.X,
          format: MediaPostType.IMAGE,
          status: MediaPostStatus.READY,
          caption: 'Image post',
          metadata: {},
        } as never,
        account,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
