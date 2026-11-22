import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { SlackService } from './slack.service';

function createService(overrides: Record<string, unknown> = {}) {
  const workspace = {
    teamId: 'T01234567',
    connected: true,
    approvalStatus: 'approved',
    enabled: true,
    restrictChannelUsers: false,
    botUserId: 'U99999999',
    allowedChannelIds: ['C01234567'],
    allowDMs: true,
    allowedUserIds: ['U01234567'],
  };
  const queries = {
    countDocuments: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({}),
  };
  const workspaces = {
    findOne: jest
      .fn()
      .mockReturnValue({ lean: jest.fn().mockResolvedValue(workspace) }),
  };
  const config = {
    get: jest.fn(
      (key: string) => ({ SLACK_SIGNING_SECRET: 'test-signing-secret' })[key],
    ),
  };
  const service = new SlackService(
    workspaces as never,
    {} as never,
    queries as never,
    {} as never,
    config as unknown as ConfigService,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, queries, workspace, workspaces, config, ...overrides };
}

describe('SlackService security and ingestion', () => {
  it('accepts a valid Slack HMAC over the exact raw bytes', () => {
    const { service } = createService();
    const body = Buffer.from('{"type":"url_verification","challenge":"abc"}');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac('sha256', 'test-signing-secret')
      .update(`v0:${timestamp}:${body.toString('utf8')}`)
      .digest('hex')}`;
    expect(() =>
      service.verifySignature(body, timestamp, signature),
    ).not.toThrow();
    expect(() =>
      service.verifySignature(Buffer.from('modified'), timestamp, signature),
    ).toThrow(UnauthorizedException);
  });

  it('rejects stale requests, missing secrets, and malformed signatures', () => {
    const { service } = createService();
    expect(() =>
      service.verifySignature(
        Buffer.from('{}'),
        String(Math.floor(Date.now() / 1000) - 600),
        `v0=${'a'.repeat(64)}`,
      ),
    ).toThrow(UnauthorizedException);
    expect(() =>
      service.verifySignature(Buffer.from('{}'), '1', `v0=${'a'.repeat(64)}`),
    ).toThrow(UnauthorizedException);
    expect(() =>
      service.verifySignature(
        Buffer.from('{}'),
        String(Math.floor(Date.now() / 1000)),
        'bad',
      ),
    ).toThrow(UnauthorizedException);
  });

  it('queues a redacted denial for channels not on the explicit allowlist', async () => {
    const { service, queries } = createService();
    await service.acceptEvent({
      type: 'event_callback',
      team_id: 'T01234567',
      event_id: 'Ev1',
      event: {
        type: 'app_mention',
        channel: 'C99999999',
        user: 'U01234567',
        text: '<@U99999999> hello',
        ts: '1111.0001',
      },
    });
    expect(queries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accessDenied: true,
        query: '[Access denied: message not retained]',
      }),
    );
  });

  it('queues permitted mentions without retaining the bot mention', async () => {
    const { service, queries } = createService();
    await service.acceptEvent({
      type: 'event_callback',
      team_id: 'T01234567',
      event_id: 'Ev2',
      event: {
        type: 'app_mention',
        channel: 'C01234567',
        user: 'U01234567',
        text: '<@U99999999> Help with API auth',
        ts: '1111.0001',
      },
    });
    expect(queries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Help with API auth',
        accessDenied: false,
        status: 'received',
      }),
    );
  });

  it('denies DMs from users who were not explicitly allowed', async () => {
    const { service, queries } = createService();
    await service.acceptEvent({
      type: 'event_callback',
      team_id: 'T01234567',
      event_id: 'Ev3',
      event: {
        type: 'message',
        channel_type: 'im',
        channel: 'D01234567',
        user: 'U11111111',
        text: 'hello',
        ts: '1111.0001',
      },
    });
    expect(queries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accessDenied: true,
        query: '[Access denied: message not retained]',
      }),
    );
  });

  it('ignores bot-authored messages to prevent reply loops', async () => {
    const { service, queries } = createService();
    await service.acceptEvent({
      type: 'event_callback',
      team_id: 'T01234567',
      event_id: 'Ev4',
      event: {
        type: 'message',
        channel_type: 'im',
        channel: 'D01234567',
        user: 'U99999999',
        text: 'hello',
        ts: '1111.0001',
      },
    });
    expect(queries.create).not.toHaveBeenCalled();
  });

  it('acknowledges repeated Slack delivery idempotently', async () => {
    const { service, queries } = createService();
    queries.create.mockRejectedValueOnce({ code: 11000 });
    await expect(
      service.acceptEvent({
        type: 'event_callback',
        team_id: 'T01234567',
        event_id: 'Ev5',
        event: {
          type: 'app_mention',
          channel: 'C01234567',
          user: 'U01234567',
          text: 'hello',
          ts: '1111.0001',
        },
      }),
    ).resolves.toEqual({ ok: true });
  });
});
