import { MemoryRecallIntent } from './dto/memory-recall-query.dto';
import { MemoryRecallService } from './memory-recall.service';
import { MemoryType, MemoryVerificationStatus } from './schemas/memory.schema';

describe('MemoryRecallService', () => {
  const service = new MemoryRecallService();

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-28T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('infers historical intent and semantic memory type deterministically', () => {
    const plan = service.buildPlan({
      query: 'What commitments did I previously make about UK expansion?',
    });

    expect(plan.intent).toBe(MemoryRecallIntent.HISTORICAL);
    expect(plan.includeHistorical).toBe(true);
    expect(plan.inferredType).toBe(MemoryType.COMMITMENT);
    expect(plan.tokens).toEqual(
      expect.arrayContaining(['commitments', 'expansion']),
    );
  });

  it('ranks direct content/entity matches above unrelated high-importance memories', () => {
    const plan = service.buildPlan({ query: 'UK academy pricing' });
    const results = service.rank(
      [
        {
          _id: 'unrelated',
          content: 'A very important personal operating principle.',
          type: MemoryType.LESSON,
          importance: 1,
          confidence: 1,
          verificationStatus: MemoryVerificationStatus.CONFIRMED,
          capturedAt: '2026-08-27T12:00:00.000Z',
        },
        {
          _id: 'matched',
          content: 'UK academy owners discussed pricing and admissions.',
          type: MemoryType.PROJECT_CONTEXT,
          entities: [{ type: 'company', name: '8lete UK' }],
          tags: ['academy', 'pricing'],
          importance: 0.6,
          confidence: 0.7,
          verificationStatus: MemoryVerificationStatus.CONFIRMED,
          capturedAt: '2026-08-10T12:00:00.000Z',
        },
      ],
      plan,
      2,
    );

    expect(results[0].memory._id).toBe('matched');
    expect(results[0].matchedFields).toEqual(
      expect.arrayContaining(['content', 'tags']),
    );
    expect(results[0].retrievalScore).toBeGreaterThan(
      results[1].retrievalScore,
    );
  });

  it('uses recency strongly for recent intent without making recency the only signal', () => {
    const plan = service.buildPlan({
      query: 'What happened recently with onboarding?',
      intent: MemoryRecallIntent.RECENT,
    });
    const results = service.rank(
      [
        {
          _id: 'old',
          content: 'Onboarding friction remains a project concern.',
          type: MemoryType.PROJECT_CONTEXT,
          importance: 0.9,
          confidence: 0.9,
          verificationStatus: MemoryVerificationStatus.CONFIRMED,
          happenedAt: '2025-08-28T12:00:00.000Z',
        },
        {
          _id: 'recent',
          content: 'Onboarding friction was reviewed this week.',
          type: MemoryType.EVENT,
          importance: 0.6,
          confidence: 0.8,
          verificationStatus: MemoryVerificationStatus.CONFIRMED,
          happenedAt: '2026-08-27T12:00:00.000Z',
        },
      ],
      plan,
      2,
    );

    expect(results[0].memory._id).toBe('recent');
    expect(results[0].scoreBreakdown.recency).toBeGreaterThan(
      results[1].scoreBreakdown.recency,
    );
  });

  it('boosts the inferred memory type but keeps the score auditable', () => {
    const plan = service.buildPlan({
      query: 'What goals do I have for content?',
    });
    const results = service.rank(
      [
        {
          _id: 'goal',
          content: 'Build a consistent content publishing system.',
          type: MemoryType.GOAL,
          importance: 0.7,
          confidence: 0.8,
          verificationStatus: MemoryVerificationStatus.CONFIRMED,
          capturedAt: '2026-08-20T12:00:00.000Z',
        },
        {
          _id: 'event',
          content: 'Discussed content publishing system.',
          type: MemoryType.EVENT,
          importance: 0.7,
          confidence: 0.8,
          verificationStatus: MemoryVerificationStatus.CONFIRMED,
          capturedAt: '2026-08-20T12:00:00.000Z',
        },
      ],
      plan,
      2,
    );

    expect(plan.inferredType).toBe(MemoryType.GOAL);
    expect(results[0].memory._id).toBe('goal');
    expect(results[0].scoreBreakdown.type).toBe(1);
    expect(results[1].scoreBreakdown.type).toBe(0);
  });

  it('uses happenedAt rather than update activity for temporal relevance', () => {
    const plan = service.buildPlan({ intent: MemoryRecallIntent.RECENT });
    const results = service.rank(
      [
        {
          _id: 'historically-old',
          content: 'Old event edited today.',
          type: MemoryType.EVENT,
          importance: 0.5,
          confidence: 0.5,
          verificationStatus: MemoryVerificationStatus.CONFIRMED,
          happenedAt: '2024-01-01T00:00:00.000Z',
          capturedAt: '2026-08-28T00:00:00.000Z',
        },
        {
          _id: 'actually-recent',
          content: 'Recent event.',
          type: MemoryType.EVENT,
          importance: 0.5,
          confidence: 0.5,
          verificationStatus: MemoryVerificationStatus.CONFIRMED,
          happenedAt: '2026-08-27T00:00:00.000Z',
          capturedAt: '2026-08-27T00:00:00.000Z',
        },
      ],
      plan,
      2,
    );

    expect(results[0].memory._id).toBe('actually-recent');
  });
});
