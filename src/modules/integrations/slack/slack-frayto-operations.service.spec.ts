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
  const workspaces = {
    findOne: jest
      .fn()
      .mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue({ allowedChannelIds: [ctx.channelId] }),
      }),
  };
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
    workspaces,
  };
}

describe('Slack Frayto operation guardrails', () => {
  afterEach(() => jest.restoreAllMocks());

  it('supports direct deletion without a bridge mapping', async () => {
    const { service } = setup('{}');
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);
    expect((await service.prepare(ctx))?.resolved).toBe(true);
    expect(String(spy.mock.calls[0][0])).toBe(
      'https://api2.traydo.com/dockets/delete-purchase-invoice?docketId=DK-40&number=PI-40',
    );
    expect(spy.mock.calls[0][1]?.method).toBe('DELETE');
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

  it.each([
    'How to delete invoice PI-40 for docket DK-40?',
    'Do not delete invoice PI-40 for docket DK-40',
    'Show invoice PI-40 for docket DK-40',
    'Delete sales invoice PI-40 for docket DK-40',
  ])('blocks non-deletion intent: %s', async (message) => {
    const { service, actions } = setup();
    const spy = jest.spyOn(global, 'fetch');
    expect(await service.prepare({ ...ctx, message })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('blocks invented IDs', async () => {
    const { service } = setup();
    const spy = jest.spyOn(global, 'fetch');
    expect(
      (
        await service.prepare({
          ...ctx,
          message: 'Delete invoice PI-41 for docket DK-40',
        })
      )?.needsClarification,
    ).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('blocks unauthorized users', async () => {
    const { service, workspaces } = setup();
    workspaces.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    const spy = jest.spyOn(global, 'fetch');
    expect((await service.prepare(ctx))?.answer).toContain('not authorized');
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not claim success for an ambiguous HTTP 200', async () => {
    const { service } = setup();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{}',
      } as Response);
    expect((await service.prepare(ctx))?.resolved).toBe(false);
  });

  it('does not replay attempted deletion', async () => {
    const { service, actions } = setup();
    actions.findOne.mockResolvedValue({
      operation: 'delete_purchase_invoice',
      resolutionId: 'purchase-invoice:DK-40:PI-40',
      status: SlackOperationStatus.EXECUTING,
    });
    const spy = jest.spyOn(global, 'fetch');
    expect((await service.prepare(ctx))?.resolved).toBe(false);
    expect(spy).not.toHaveBeenCalled();
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
