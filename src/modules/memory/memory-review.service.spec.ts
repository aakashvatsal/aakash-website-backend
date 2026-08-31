import { MemoryReviewService } from './memory-review.service';
import {
  MemoryLifecycleStatus,
  MemoryScope,
  MemoryType,
  MemoryVerificationStatus,
} from './schemas/memory.schema';

describe('MemoryReviewService', () => {
  const service = new MemoryReviewService({} as never, {} as never);
  const now = new Date('2026-08-28T12:00:00.000Z');

  const memory = (overrides: Record<string, unknown> = {}) => ({
    _id:
      typeof overrides._id === 'string'
        ? overrides._id
        : '68b000000000000000000001',
    content:
      'Aakash prefers detailed architecture explanations before implementation.',
    type: MemoryType.PREFERENCE,
    scope: MemoryScope.GENERAL,
    personLinks: [],
    lifecycleStatus: MemoryLifecycleStatus.ACTIVE,
    verificationStatus: MemoryVerificationStatus.CONFIRMED,
    confidence: 0.9,
    importance: 0.7,
    capturedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('surfaces old preferences without mutating memory truth', () => {
    const source = memory();
    const queue = service.buildQueue([source], now);
    expect(queue.sections.oldPreferences).toHaveLength(1);
    expect(queue.sections.oldPreferences[0].memory).toBe(source);
    expect(source.lifecycleStatus).toBe(MemoryLifecycleStatus.ACTIVE);
  });

  it('surfaces low-confidence or inferred memories', () => {
    const queue = service.buildQueue(
      [
        memory({
          _id: '68b000000000000000000002',
          type: MemoryType.FACT,
          confidence: 0.4,
          verificationStatus: MemoryVerificationStatus.INFERRED,
          capturedAt: '2026-08-20T00:00:00.000Z',
        }),
      ],
      now,
    );
    expect(queue.sections.uncertain).toHaveLength(1);
    expect(queue.rules.openAiCalls).toBe(0);
  });

  it('detects duplicates only inside the same type and attribution', () => {
    const queue = service.buildQueue(
      [
        memory({
          _id: '68b000000000000000000003',
          capturedAt: '2026-08-20T00:00:00.000Z',
          content:
            'Aakash prefers detailed architecture explanations before implementation decisions.',
        }),
        memory({
          _id: '68b000000000000000000004',
          capturedAt: '2026-08-21T00:00:00.000Z',
          content:
            'Aakash prefers detailed architecture explanations before implementation.',
        }),
        memory({
          _id: '68b000000000000000000005',
          type: MemoryType.GOAL,
          capturedAt: '2026-08-21T00:00:00.000Z',
          content:
            'Aakash prefers detailed architecture explanations before implementation.',
        }),
      ],
      now,
    );
    expect(queue.sections.duplicates).toHaveLength(1);
  });

  it('excludes snoozed items from the review queue', () => {
    const queue = service.buildQueue(
      [memory({ reviewSnoozedUntil: '2026-09-28T00:00:00.000Z' })],
      now,
    );
    expect(queue.total).toBe(0);
  });

  it('keeps disputed and contradicted memories in explicit review sections', () => {
    const queue = service.buildQueue(
      [
        memory({
          _id: '68b000000000000000000006',
          lifecycleStatus: MemoryLifecycleStatus.DISPUTED,
        }),
        memory({
          _id: '68b000000000000000000007',
          lifecycleStatus: MemoryLifecycleStatus.CONTRADICTED,
          contradictedByMemoryIds: ['68b000000000000000000008'],
        }),
      ],
      now,
    );
    expect(queue.sections.disputed).toHaveLength(1);
    expect(queue.sections.contradictions).toHaveLength(1);
  });
});
