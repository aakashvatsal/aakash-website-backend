import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv } from 'node:crypto';
import { SlackService, SLACK_ACCESS_DENIED_MESSAGE } from './slack.service';
import { SlackWorkspaceApproval } from './slack.schemas';

const allowedTeam = 'T01234567';
const allowedUser = 'U01234567';
const allowedChannel = 'C01234567';
const signingKey = 'a'.repeat(64);

function encryptedToken(value: string) {
  const iv = Buffer.alloc(12, 1);
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(signingKey, 'hex'),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function setup(
  status: SlackWorkspaceApproval = SlackWorkspaceApproval.APPROVED,
) {
  const workspace = {
    teamId: allowedTeam,
    teamName: 'Testing Workspace',
    botUserId: 'U99999999',
    encryptedBotToken: encryptedToken('xoxb-test-token'),
    approvalStatus: status,
    connected: true,
    enabled: true,
    restrictChannelUsers: false,
    allowedChannelIds: [allowedChannel],
    allowedUserIds: [allowedUser],
    allowDMs: true,
  };
  const workspaces = {
    findOne: jest.fn().mockImplementation(() => ({
      lean: jest.fn().mockResolvedValue(workspace),
      select: jest.fn().mockResolvedValue(workspace),
    })),
    findOneAndUpdate: jest.fn().mockResolvedValue(workspace),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    find: jest.fn().mockReturnValue({
      select: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([workspace]) }),
    }),
  };
  const oauthStates = {
    create: jest.fn().mockResolvedValue({}),
    findOneAndUpdate: jest.fn().mockResolvedValue({ isOwner: false }),
  };
  const queries = {
    countDocuments: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({}),
    findOneAndUpdate: jest.fn().mockResolvedValue(null),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const knowledge = {
    find: jest.fn().mockReturnValue({
      sort: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    }),
    create: jest.fn().mockResolvedValue({}),
  };
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          SLACK_CLIENT_ID: '123.456',
          SLACK_CLIENT_SECRET: 'secret',
          SLACK_SIGNING_SECRET: 'signing-secret',
          SLACK_REDIRECT_URI:
            'https://api.aakashvatsal.com/api/v1/integrations/slack/callback',
          SLACK_TOKEN_ENCRYPTION_KEY: signingKey,
          FRONTEND_URL: 'https://aakashvatsal.com',
        })[key],
    ),
  };
  const ai = { generateResponse: jest.fn() };
  const chat = { getOrCreateSlackConversation: jest.fn() };
  const service = new SlackService(
    workspaces as never,
    oauthStates as never,
    queries as never,
    knowledge as never,
    config as unknown as ConfigService,
    ai as never,
    {} as never,
    chat as never,
  );
  return {
    service,
    workspace,
    workspaces,
    oauthStates,
    queries,
    knowledge,
    config,
    ai,
    chat,
  };
}

function mention(overrides: Record<string, unknown> = {}) {
  return {
    type: 'event_callback',
    team_id: allowedTeam,
    event_id: 'EvABC',
    event: {
      type: 'app_mention',
      channel: allowedChannel,
      user: allowedUser,
      text: '<@U99999999> Please fix my incident',
      ts: '1700000000.000001',
      ...overrides,
    },
  };
}

describe('Slack multi-workspace distribution and access control', () => {
  afterEach(() => jest.restoreAllMocks());

  it('provides a public install link and keeps public OAuth state distinct from owner installs', async () => {
    const { service, oauthStates } = setup();
    expect(service.getPublicInstallUrl()).toBe(
      'https://api.aakashvatsal.com/api/v1/integrations/slack/install',
    );
    const { authorizationUrl } = await service.getAuthorizationUrl(false);
    expect(authorizationUrl).toContain('slack.com/oauth/v2/authorize');
    expect(oauthStates.create).toHaveBeenCalledWith(
      expect.objectContaining({ isOwner: false }),
    );
    await service.getAuthorizationUrl(true);
    expect(oauthStates.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOwner: true }),
    );
    expect(service.getFrontendReturnUrl(false)).toBe(
      'https://aakashvatsal.com/slack/installed?slack=pending',
    );
  });

  it('accepts independently installed workspaces without activating either or exposing the token', async () => {
    const { service, workspaces, oauthStates } = setup(
      SlackWorkspaceApproval.PENDING,
    );
    const calls: Array<Record<string, unknown>> = [];
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      const teamId = calls.length ? 'T88888888' : allowedTeam;
      calls.push({ teamId });
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            team: { id: teamId, name: teamId },
            access_token: `xoxb-token-${teamId}`,
            bot_user_id: 'U99999999',
            scope: 'chat:write',
          }),
      } as Response);
    });
    expect((await service.handleCallback('code1', 'state1')).teamId).toBe(
      allowedTeam,
    );
    expect((await service.handleCallback('code2', 'state2')).teamId).toBe(
      'T88888888',
    );
    expect(oauthStates.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(workspaces.findOneAndUpdate).toHaveBeenCalledTimes(2);
    const oauthUpdates = workspaces.findOneAndUpdate.mock
      .calls as unknown as Array<
      [
        unknown,
        {
          $set: { enabled: boolean; encryptedBotToken: string };
          $setOnInsert: { approvalStatus: string };
        },
      ]
    >;
    for (const [, update] of oauthUpdates) {
      expect(update.$set.enabled).toBe(false);
      expect(update.$setOnInsert.approvalStatus).toBe('pending');
      expect(update.$set.encryptedBotToken).not.toContain('xoxb-');
    }
  });

  it('denies pending workspaces, redacts the question, and does not pass it to AI', async () => {
    const { service, queries } = setup(SlackWorkspaceApproval.PENDING);
    await service.acceptEvent(mention());
    expect(queries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accessDenied: true,
        query: '[Access denied: message not retained]',
      }),
    );
    expect(JSON.stringify(queries.create.mock.calls)).not.toContain(
      'Please fix my incident',
    );
  });

  it('denies foreign Slack Connect users even when a channel is approved', async () => {
    const { service, queries } = setup();
    await service.acceptEvent(mention({ user_team: 'TFOREIGN1' }));
    expect(queries.create).toHaveBeenCalledWith(
      expect.objectContaining({ accessDenied: true }),
    );
  });

  it('can restrict mentions to individually approved members', async () => {
    const { service, workspace, queries } = setup();
    workspace.restrictChannelUsers = true;
    await service.acceptEvent(mention({ user: 'U55555555' }));
    expect(queries.create).toHaveBeenCalledWith(
      expect.objectContaining({ accessDenied: true }),
    );
  });

  it('forbids enabling an unapproved installation, and revocation disables AI', async () => {
    const { service, workspaces } = setup(SlackWorkspaceApproval.PENDING);
    workspaces.findOne.mockResolvedValueOnce({
      teamId: allowedTeam,
      connected: true,
      approvalStatus: 'pending',
      enabled: false,
      allowDMs: true,
      allowedChannelIds: [allowedChannel],
      allowedUserIds: [allowedUser],
    });
    await expect(
      service.updateWorkspace(allowedTeam, { enabled: true }),
    ).rejects.toThrow(BadRequestException);
    workspaces.findOne.mockResolvedValueOnce({
      teamId: allowedTeam,
      connected: true,
      approvalStatus: 'approved',
      enabled: true,
      allowDMs: true,
      allowedChannelIds: [allowedChannel],
      allowedUserIds: [allowedUser],
    });
    await service.updateWorkspace(allowedTeam, {
      approvalStatus: SlackWorkspaceApproval.REJECTED,
    });
    const updateCalls = workspaces.updateOne.mock.calls as unknown as Array<
      [unknown, { $set: { approvalStatus: string; enabled: boolean } }]
    >;
    const lastUpdate = updateCalls.at(-1);
    expect(lastUpdate?.[0]).toEqual({ teamId: allowedTeam });
    expect(lastUpdate?.[1].$set.approvalStatus).toBe('rejected');
    expect(lastUpdate?.[1].$set.enabled).toBe(false);
  });

  it('sends the exact denial message using the installing workspace token without calling AI', async () => {
    const { service, workspace, queries, ai, chat } = setup(
      SlackWorkspaceApproval.PENDING,
    );
    const job = {
      _id: 'job1',
      teamId: workspace.teamId,
      eventId: 'EvDENIED',
      channelId: allowedChannel,
      userId: allowedUser,
      threadTs: '1700000000.000001',
      eventTs: '1700000000.000001',
      threadKey: '1700000000.000001',
      isDM: false,
      accessDenied: true,
      attempts: 1,
    };
    queries.findOneAndUpdate.mockResolvedValueOnce(job);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, ts: '1700000001.000001' }),
    } as Response);
    await service.consumeQueue();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = fetchSpy.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe('string');
    expect(body).toContain(SLACK_ACCESS_DENIED_MESSAGE);
    expect(JSON.stringify(queries.updateOne.mock.calls)).toContain(
      'access_denied',
    );
    expect(JSON.stringify(queries.updateOne.mock.calls)).toContain(
      SLACK_ACCESS_DENIED_MESSAGE,
    );
    expect(ai.generateResponse).not.toHaveBeenCalled();
    expect(chat.getOrCreateSlackConversation).not.toHaveBeenCalled();
  });

  it('never mixes workspace-specific knowledge while an owner reviews its entries', async () => {
    const { service, workspaces, knowledge } = setup();
    const docQuery = {
      sort: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    };
    knowledge.find.mockReturnValue(docQuery);
    await service.getKnowledge(allowedTeam);
    expect(workspaces.findOne).toHaveBeenCalledWith({
      teamId: allowedTeam,
      connected: true,
    });
    expect(knowledge.find).toHaveBeenCalledWith({ teamId: allowedTeam });
    await service.addKnowledge(
      allowedTeam,
      'Public guide',
      'Workspace-specific content',
    );
    expect(knowledge.create).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: allowedTeam }),
    );
  });
});

describe('allowlisted channel monitoring (optional)', () => {
  it('ignores ordinary channel posts unless explicit channel monitoring is enabled', async () => {
    const { service, queries } = setup();
    await service.acceptEvent({
      type: 'event_callback',
      team_id: allowedTeam,
      event_id: 'EvChannel1',
      event: {
        type: 'message',
        channel_type: 'channel',
        channel: allowedChannel,
        user: allowedUser,
        ts: '1700000000.300001',
        text: 'Please reopen the pending operations step',
      },
    });
    expect(queries.create).not.toHaveBeenCalled();
  });

  it('accepts monitored messages in an approved channel with history scope', async () => {
    const { service, workspace, queries } = setup();
    Object.assign(workspace, {
      monitorChannels: true,
      scopes: ['channels:history'],
    });
    await service.acceptEvent({
      type: 'event_callback',
      team_id: allowedTeam,
      event_id: 'EvChannel2',
      event: {
        type: 'message',
        channel_type: 'channel',
        channel: allowedChannel,
        user: allowedUser,
        ts: '1700000000.300002',
        text: 'Please reopen step Cargo Received in docket DK-25',
      },
    });
    expect(queries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accessDenied: false,
        query: 'Please reopen step Cargo Received in docket DK-25',
      }),
    );
  });
});
