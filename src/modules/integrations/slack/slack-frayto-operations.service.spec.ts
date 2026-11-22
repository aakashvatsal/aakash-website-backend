import { ConfigService } from '@nestjs/config';
import { SlackFraytoOperationsService } from './slack-frayto-operations.service';
import { SlackOperationStatus } from './slack.schemas';

const teamId = 'T01234567';
const userId = 'U01234567';
const companyId = '507f1f77bcf86cd799439011';
const ctx = {
  teamId,
  userId,
  channelId: 'C01234567',
  threadTs: '1700000000.0001',
  sourceEventId: 'Ev000001',
  message: 'Delete purchase invoice PI-40 for docket DK-40',
  history: [],
};
function setup(mapping = JSON.stringify({ [teamId]: companyId })) {
  const actions = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((x: Record<string, unknown>) =>
      Promise.resolve({
        ...x,
        _id: { toString: () => '507f1f77bcf86cd799439099' },
      }),
    ),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    findOneAndUpdate: jest.fn(),
  };
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          FRAYTO_SLACK_WORKSPACE_COMPANY_MAP: mapping,
          FRAYTO_BRIDGE_BASE_URL: 'https://development.traydo.com',
          FRAYTO_BRIDGE_API_KEY: 'a'.repeat(64),
        })[key],
    ),
  };
  const ai = {
    generateStructuredResponse: jest.fn().mockResolvedValue({
      data: {
        operation: 'delete_purchase_invoice',
        arguments: {
          docketNo: 'DK-40',
          invoiceNo: 'PI-40',
          stepNames: [],
          quotationNo: '',
          validUntil: '',
        },
        clarificationQuestion: '',
      },
    }),
  };
  const workspaces = { findOne: jest.fn() };
  return {
    service: new SlackFraytoOperationsService(
      actions as never,
      workspaces as never,
      config as unknown as ConfigService,
      ai as never,
    ),
    actions,
    ai,
    config,
  };
}

describe('Slack Frayto operation guardrails', () => {
  afterEach(() => jest.restoreAllMocks());

  it('never invokes AI or Frayto for unmapped Slack workspaces', async () => {
    const { service, ai } = setup('{}');
    expect(await service.prepare(ctx)).toBeNull();
    expect(ai.generateStructuredResponse).not.toHaveBeenCalled();
  });

  it('asks for missing invoice number without calling a mutation API', async () => {
    const { service, ai, actions } = setup();
    ai.generateStructuredResponse.mockResolvedValue({
      data: {
        operation: 'delete_purchase_invoice',
        arguments: {
          docketNo: 'DK-40',
          invoiceNo: '',
          stepNames: [],
          quotationNo: '',
          validUntil: '',
        },
        clarificationQuestion: '',
      },
    });
    const spy = jest.spyOn(global, 'fetch');
    const result = await service.prepare(ctx);
    expect(result?.needsClarification).toBe(true);
    expect(result?.answer).toContain('purchase invoice number');
    expect(actions.create).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('previews a verified Frayto invoice before requiring interactive confirmation', async () => {
    const { service, actions } = setup();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ready',
          resolutionId: '507f1f77bcf86cd799439022',
          summary: 'Docket DK-40, Invoice PI-40',
          expiresAt: new Date(Date.now() + 120000).toISOString(),
        }),
    } as Response);
    const result = await service.prepare(ctx);
    expect(result?.answer).toContain('No changes have been made');
    expect(result?.actionId).toBe('507f1f77bcf86cd799439099');
    expect(actions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SlackOperationStatus.AWAITING_CONFIRMATION,
        userId,
        teamId,
      }),
    );
    expect(service.confirmationBlocks(result!.actionId!)[0]).toEqual(
      expect.objectContaining({ type: 'actions' }),
    );
  });

  it('does not create an approval if Frayto denies the record or user', async () => {
    const { service, actions } = setup();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'forbidden',
          message: 'FMS permission denied.',
        }),
    } as Response);
    const result = await service.prepare(ctx);
    expect(result?.answer).toBe('FMS permission denied.');
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('binds the confirmation to the original Slack identity and pending action', async () => {
    const { service, actions } = setup();
    await service.acceptInteraction({
      type: 'block_actions',
      team: { id: teamId },
      channel: { id: ctx.channelId },
      user: { id: 'UOTHER12' },
      actions: [
        {
          action_id: 'hsakaa_frayto_confirm',
          value: '507f1f77bcf86cd799439099',
        },
      ],
    });
    expect(actions.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'UOTHER12',
        status: SlackOperationStatus.AWAITING_CONFIRMATION,
      }),
      expect.anything(),
    );
    // Only the original user can match the DB record; an unauthorized click matches nothing.
  });

  it('executes only through Frayto and requires completion evidence', async () => {
    const { service } = setup();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'completed',
          message: 'Invoice archived',
          auditId: 'AUD-42',
        }),
    } as Response);
    const result = await service.executeClaimed({
      expiresAt: new Date(Date.now() + 120000),
      resolutionId: '507f1f77bcf86cd799439011',
      companyId,
      teamId,
      userId,
      idempotencyKey: 'd3c9e2b3-8f1c-4012-a99b-04c7c79d52e0',
    } as never);
    expect(result.resolved).toBe(true);
    expect(result.answer).toContain('AUD-42');
  });
});
