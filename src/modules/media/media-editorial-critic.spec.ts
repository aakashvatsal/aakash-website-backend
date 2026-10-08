import { MediaPlanningService } from './media-planning.service';
import { auditCreatorWeek, copySimilarity, reviewCreatorQuality } from './media-editorial-critic';
import { reviewCreatorEditorial } from './media-creator-editorial';
import { MediaPostType } from './schemas/media-post.schema';

describe('independent media quality assurance', () => {
  const service = Object.create(MediaPlanningService.prototype) as MediaPlanningService;
  const recover = (service as unknown as { recoverCreatorCalendar: (start: string, end: string, stage: string) => any }).recoverCreatorCalendar.bind(service);
  const posts = () => recover('2026-10-08', '2026-10-14', 'starting').days.flatMap((d: any) => d.executions).filter((item: any) => item.action === 'post');

  it('does not equate an existing 8/10 structural grade with independent 8/10 story quality', () => {
    const item = posts().find((p: any) => p.format === MediaPostType.REEL);
    expect(reviewCreatorEditorial(item).score).toBeGreaterThanOrEqual(8);
    const review = reviewCreatorQuality(item);
    expect(review.verdict).toBe('evidence_needed');
    expect(review.score).toBeLessThan(8);
    expect(review.issues.join(' ')).toMatch(/evidence/i);
  });

  it('rejects spoken scripts containing filming instructions and generic filler', () => {
    const original = posts().find((p: any) => p.format === MediaPostType.SHORT);
    const item = {...original, evidenceIds:['E001'], videoPack:{...original.videoPack, fullScript:'Today I want to talk about discipline. Pick one real practice moment and let the imperfect attempt speak. Follow for more.'}};
    const review = reviewCreatorQuality(item);
    expect(review.verdict).toBe('revise');
    expect(review.score).toBeLessThan(8);
    expect(review.issues.join(' ')).toMatch(/instructions|opening|story/i);
  });

  it('checks duplicate public copy across formats without trusting headline variation', () => {
    const [first, second] = posts().filter((p: any) => p.format === MediaPostType.REEL);
    const copied = {...second, evidenceIds:['E002'], videoPack:{...second.videoPack, fullScript:first.videoPack.fullScript}};
    const result = reviewCreatorQuality(copied, [first.videoPack.fullScript]);
    expect(result.score).toBeLessThan(8);
    expect(result.issues.join(' ')).toMatch(/similar/i);
    expect(copySimilarity(first.videoPack.fullScript, first.videoPack.fullScript)).toBe(1);
  });

  it('does not spend AI credits on unsupported fallback scenes', async () => {
    const plan = recover('2026-10-08', '2026-10-14', 'starting');
    const planner = Object.create(MediaPlanningService.prototype) as any;
    planner.generateTrackedStructuredResponse = jest.fn();
    const usage = { calls:0, totalTokens:0, budgetLimited:false };
    await planner.tagCreatorEditorial(plan, usage);
    expect(planner.generateTrackedStructuredResponse).not.toHaveBeenCalled();
    const reviewed = plan.days.flatMap((d: any) => d.executions).filter((p: any) => p.action === 'post');
    expect(reviewed).toHaveLength(17);
    expect(reviewed.every((p: any) => p.qualityVerdict && p.qualityScore < 8.5 && p.executionReady === false)).toBe(true);
  });

  it('rejects a low-quality AI rewrite without overwriting the paid original', async () => {
    const plan = recover('2026-10-08', '2026-10-14', 'starting');
    const item = plan.days.flatMap((d: any) => d.executions).find((p: any) => p.action === 'post' && p.format === MediaPostType.REEL);
    item.evidenceIds = ['E001'];
    plan.opportunities = [{ key:'o1', title:'A real practice', thesis:'Actual activity', sourceSummary:'Public-safe evidenced moment', evidenceIds:['E001'] } as any];
    const original = item.videoPack.fullScript;
    const planner = Object.create(MediaPlanningService.prototype) as any;
    planner.generateTrackedStructuredResponse = jest.fn().mockResolvedValue({data:{revisions:[{id:'0', hook:'Today I want to talk', body:'Today I want to talk about success.', payoff:'What do you think?', beats:[]}]}});
    await planner.reviseEditorialWeaknesses(plan, { calls:0, totalTokens:0, budgetLimited:false });
    expect(planner.generateTrackedStructuredResponse).toHaveBeenCalledTimes(1);
    expect(item.videoPack.fullScript).toBe(original);
    expect(item.qualityRevisionCount ?? 0).toBe(0);
  });

  it('maintains the 17 content packages even when quality approval remains blocked', () => {
    const assets = posts();
    const reviewed = auditCreatorWeek(assets);
    expect(reviewed).toHaveLength(17);
    expect(reviewed.every(x => x.result.score >= 0 && x.result.score <= 10)).toBe(true);
    expect(reviewed.some(x => x.result.verdict !== 'pass')).toBe(true);
  });
});
