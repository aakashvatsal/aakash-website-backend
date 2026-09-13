import { HsakaaDailyContextService } from './hsakaa-daily-context.service';
import { HobbyPracticeStatus } from '../modules/hobbies/schemas/hobby-practice-session.schema';
import {
  HsakaaDailyContextItem,
  HsakaaDailyContextPrivacy,
  HsakaaDailyContextSource,
} from './schemas/hsakaa-daily-context.schema';

type ItemBuilder = {
  publicationItem(record: Record<string, unknown>): HsakaaDailyContextItem;
  personInteractionItem(
    record: Record<string, unknown>,
  ): HsakaaDailyContextItem;
  hobbyPracticeItem(record: Record<string, unknown>): HsakaaDailyContextItem;
};

function service() {
  return new HsakaaDailyContextService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  ) as unknown as ItemBuilder;
}

describe('Phase 7 daily context privacy defaults', () => {
  it('treats published canonical Media publications as public-safe', () => {
    const item = service().publicationItem({
      _id: 'publication-1',
      contentItemId: 'content-1',
      platform: 'instagram',
      format: 'reel',
      title: 'Public build update',
      status: 'published',
      publishedAt: new Date('2026-08-30T12:00:00.000Z'),
      createdAt: new Date('2026-08-30T10:00:00.000Z'),
    });

    expect(item.source).toBe(HsakaaDailyContextSource.MEDIA);
    expect(item.kind).toBe('media_published');
    expect(item.privacy).toBe(HsakaaDailyContextPrivacy.PUBLIC_SAFE);
    expect(item.defaultPrivacy).toBe(HsakaaDailyContextPrivacy.PUBLIC_SAFE);
  });

  it('keeps unpublished canonical Media activity internal', () => {
    const item = service().publicationItem({
      _id: 'publication-2',
      contentItemId: 'content-2',
      platform: 'linkedin',
      format: 'text',
      title: 'Draft founder note',
      status: 'draft',
      createdAt: new Date('2026-08-30T10:00:00.000Z'),
    });

    expect(item.kind).toBe('media_core_activity');
    expect(item.privacy).toBe(HsakaaDailyContextPrivacy.INTERNAL_SAFE);
  });

  it('keeps People interactions private-only by default', () => {
    const item = service().personInteractionItem({
      _id: 'interaction-1',
      type: 'conversation',
      summary: 'Discussed a personal follow-up.',
      occurredAt: new Date('2026-08-30T13:00:00.000Z'),
      primaryPersonId: 'person-1',
      participantIds: ['person-1'],
      channel: 'whatsapp',
      direction: 'outbound',
    });

    expect(item.source).toBe(HsakaaDailyContextSource.PEOPLE);
    expect(item.privacy).toBe(HsakaaDailyContextPrivacy.PRIVATE_ONLY);
    expect(item.defaultPrivacy).toBe(HsakaaDailyContextPrivacy.PRIVATE_ONLY);
  });

  it('publishes completed hobby practice into HSAKAA as internal-safe evidence without treating unfinished practice as a significant completion', () => {
    const completed = service().hobbyPracticeItem({
      _id: 'session-1',
      hobbyId: 'hobby-1',
      status: HobbyPracticeStatus.COMPLETED,
      durationMinutes: 30,
      focus: 'Chord transitions',
      startedAt: new Date('2026-09-04T12:00:00.000Z'),
    });
    const inProgress = service().hobbyPracticeItem({
      _id: 'session-2',
      hobbyId: 'hobby-1',
      status: HobbyPracticeStatus.IN_PROGRESS,
      durationMinutes: 0,
      focus: 'Chord transitions',
      startedAt: new Date('2026-09-04T13:00:00.000Z'),
    });

    expect(completed.source).toBe(HsakaaDailyContextSource.HOBBY);
    expect(completed.kind).toBe('hobby_practice_completed');
    expect(completed.privacy).toBe(HsakaaDailyContextPrivacy.INTERNAL_SAFE);
    expect(completed.significantChange).toBe(true);
    expect(completed.summary).toContain('30 min');

    expect(inProgress.kind).toBe('hobby_practice');
    expect(inProgress.privacy).toBe(HsakaaDailyContextPrivacy.INTERNAL_SAFE);
    expect(inProgress.significantChange).toBe(false);
  });
});
