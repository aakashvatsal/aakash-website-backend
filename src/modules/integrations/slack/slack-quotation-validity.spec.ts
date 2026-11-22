import { ConfigService } from '@nestjs/config';
import { SlackFraytoOperationsService } from './slack-frayto-operations.service';
import { SlackOperationStatus } from './slack.schemas';

const teamId = 'TFRAYTO123';
const userId = 'UFRAYTO123';
const quoteId = 'TQMUM12300010';
const validity = '2026-12-15';
const ctx = {
  teamId,
  userId,
  channelId: 'COPERATIONS1',
  threadTs: '1700000000.00001',
  sourceEventId: 'EvQuote123',
  message: `Update quotation ${quoteId} validity to ${validity}`,
  history: [],
};

function setup(overrides: Record<string, string> = {}) {
  const actions = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
  };
  const config = { get: jest.fn((name: string) => overrides[name]) };
  const workspaces = {
    findOne: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        teamId, enabled: true, connected: true, approvalStatus: 'approved',
        allowDMs: true, allowedChannelIds: ['COPERATIONS1'],
        allowedUserIds: [userId],
      }),
    }),
  };
  const ai = {
    generateStructuredResponse: jest.fn().mockResolvedValue({
      data: {
        operation: 'extend_quotation_validity',
        arguments: {
          docketNo: '', invoiceNo: '', stepNames: [],
          quotationNo: quoteId, validUntil: validity,
        },
        clarificationQuestion: '',
      },
    }),
  };
  const service = new SlackFraytoOperationsService(
    actions as never,
    workspaces as never,
    config as unknown as ConfigService,
    ai as never,
  );
  return { service, actions, config, ai, workspaces };
}

describe('HSAKAA direct Frayto quotation validity updates', () => {
  afterEach(() => jest.restoreAllMocks());

  it('PATCHes the exact working endpoint and replies with the API-confirmed result', async () => {
    const { service, actions } = setup();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        statusCode: 200,
        message: 'Quotation validity updated successfully',
        data: { quotationId: quoteId, validity },
      })),
    } as Response);
    const result = await service.prepare(ctx);
    expect(result?.resolved).toBe(true);
    expect(result?.answer).toContain(quoteId);
    expect(result?.answer).toContain(validity);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://api2.traydo.com/quotation/update-quotation-validity');
    expect(options?.method).toBe('PATCH');
    expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(options?.body).toBe(JSON.stringify({ quotationId: quoteId, newValidity: validity }));
    expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({
      status: SlackOperationStatus.EXECUTING,
      operation: 'extend_quotation_validity',
    }));
    expect(actions.updateOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      $set: expect.objectContaining({ status: SlackOperationStatus.COMPLETED }),
    }));
  });

  it('does not call Frayto for a Slack user outside the mutation allowlist', async () => {
    const { service, actions, workspaces } = setup();
    workspaces.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const spy = jest.spyOn(global, 'fetch');
    const result = await service.prepare({ ...ctx, userId: 'UUNAUTHORIZED' });
    expect(result?.answer).toContain('not authorized');
    expect(spy).not.toHaveBeenCalled();
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('asks for a missing/invalid calendar date instead of calling Frayto', async () => {
    const { service, ai, actions } = setup();
    ai.generateStructuredResponse.mockResolvedValue({
      data: {
        operation: 'extend_quotation_validity',
        arguments: {
          docketNo: '', invoiceNo: '', stepNames: [],
          quotationNo: quoteId, validUntil: '2026-02-31',
        },
        clarificationQuestion: '',
      },
    });
    const spy = jest.spyOn(global, 'fetch');
    const result = await service.prepare(ctx);
    expect(result?.needsClarification).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('never claims success from an ambiguous 200 response', async () => {
    const { service } = setup();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
    } as Response);
    const result = await service.prepare(ctx);
    expect(result?.resolved).toBe(false);
    expect(result?.answer).toContain('did not confirm');
  });

  it('does not replay a previously attempted update', async () => {
    const { service, actions } = setup();
    actions.findOne.mockResolvedValue({
      status: SlackOperationStatus.EXECUTING,
      summary: 'Previous update unknown',
      operation: 'extend_quotation_validity',
      resolutionId: `quotation:${quoteId}`,
      _id: { toString: () => '507f1f77bcf86cd799439099' },
    });
    const spy = jest.spyOn(global, 'fetch');
    const result = await service.prepare(ctx);
    expect(result?.answer).toContain('not been verified');
    expect(spy).not.toHaveBeenCalled();
  });
});
