import { MediaPlanningService } from './media-planning.service';
import { evaluateMediaCreatorQuota } from './media-creator-quota';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';

describe('HSAKAA low-cost seven-day quota recovery', () => {
  const service = Object.create(MediaPlanningService.prototype) as any;
  const localDate = '2026-10-08';
  const buildPlan = () => service.recoverCreatorCalendar(localDate, '2026-10-14', 'active');

  it('reserves all 17 required format slots without an AI call', () => {
    service.aiService = { generateStructuredResponse: jest.fn() };
    const plan = buildPlan();
    const all = plan.days.flatMap((day: any) => day.executions);
    const quota = evaluateMediaCreatorQuota(all);
    expect(plan.days).toHaveLength(7);
    expect(all.filter((item: any) => item.action === 'post')).toHaveLength(17);
    expect(quota.complete).toBe(true);
    expect(quota.totals).toMatchObject({
      instagramReels: 3, instagramCarousels: 1, youtubeLong: 1,
      youtubeShorts: 3, linkedin: 5, x: 4,
    });
    expect(service.aiService.generateStructuredResponse).not.toHaveBeenCalled();
    expect(all.filter((item: any) => item.action === 'post').every((item: any) =>
      item.executionReady === false && item.requiresApproval && item.readinessIssues.length)).toBe(true);
    expect(plan.days.every((day: any) => new Set(day.executions.map((item: any) => item.platform)).size === 5)).toBe(true);
  });

  it('does not turn review-required drafts into publish-ready assets on repeated runs', () => {
    const once = buildPlan();
    const twice = service.reconcileCreatorPlan(once);
    expect(twice.days.flatMap((day: any) => day.executions)).toEqual(once.days.flatMap((day: any) => day.executions));
    const ready = service.creatorQuotaReadiness(twice.days);
    expect(ready.planned.complete).toBe(true);
    expect(ready.ready.complete).toBe(false);
    expect(ready.draftsRequiringReview).toBe(17);
  });

  it('preserves a genuinely ready post instead of replacing it', () => {
    const original = buildPlan();
    const existing = original.days[0].executions.find((p: any) =>
      p.platform === MediaPlatform.INSTAGRAM && p.action === 'post');
    existing.executionReady = true;
    existing.readinessIssues = [];
    existing.publishCopy = 'A previously approved post.';
    const recovered = service.reconcileCreatorPlan(original);
    const same = recovered.days[0].executions.find((p: any) =>
      p.platform === MediaPlatform.INSTAGRAM && p.action === 'post');
    expect(same).toEqual(existing);
    expect(same.format).toBe(MediaPostType.REEL);
  });

  it('stops before billing an extra AI call once the configured call budget is exhausted', async () => {
    service.aiService = { generateStructuredResponse: jest.fn() };
    const usage = service.emptyPlanningUsage();
    usage.calls = 11;
    await expect(service.generateTrackedStructuredResponse({
      name: 'unit-budget-check', instructions: 'generate', input: '{}', schema: {},
    }, usage)).rejects.toThrow('AI budget reached');
    expect(usage.budgetLimited).toBe(true);
    expect(service.aiService.generateStructuredResponse).not.toHaveBeenCalled();
  });

  it('conservatively reserves token and cost spend when an API response fails', async () => {
    service.aiService = {
      generateStructuredResponse: jest.fn().mockRejectedValue(new Error(
        'AI structured response did not complete: max_output_tokens. outputTokens=3000 reasoningTokens=1200',
      )),
    };
    const usage = service.emptyPlanningUsage();
    await expect(service.generateTrackedStructuredResponse({
      name: 'incomplete-week', instructions: 'Generate posts', input: '{}', schema: {},
      maxOutputTokens: 4500,
    }, usage)).rejects.toThrow('did not complete');
    expect(usage.calls).toBe(1);
    expect(usage.failedCalls).toBe(1);
    expect(usage.estimatedCostUsd).toBeGreaterThan(0);
    expect(usage.totalTokens).toBeGreaterThanOrEqual(4500);
  });

  it('keeps compacted prompts valid JSON and source-date anchored', () => {
    const input = JSON.stringify({ startDate: localDate,
      historicalMediaFingerprints: Array.from({length: 140},(_,index)=>({title:`Prior story ${index}`,content:'x'.repeat(2000)})),
      publicEvidence: [{id: 'E001',title: 'Safe signal',summary: 'safe'}],
    });
    const compact = JSON.parse(service.compactMediaRequestInput(input, 28000));
    expect(compact.startDate).toBe(localDate);
    expect(JSON.stringify(compact).length).toBeLessThanOrEqual(28000);
  });
});
