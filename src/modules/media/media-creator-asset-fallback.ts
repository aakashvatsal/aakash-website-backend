import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';
import { MediaPlanningExecution } from './schemas/media-planning-cycle.schema';
import { DEFAULT_CREATOR_SERIES, editorialTextKey, CreatorSeries } from './media-creator-tags';

/**
 * Offline means no commissioned author has written a real story.
 * Preserve a transparent slot for the creator rather than manufacturing
 * fictitious dialogue, "43s scripts" and faux 10/10 production packs.
 */
export function completeCreatorCopy(item: MediaPlanningExecution): boolean {
  if (
    item.editorialVersion === 'offline-research-v2' ||
    /Deterministic offline editorial completion|Offline research only/i.test(item.reason || '') ||
    item.action !== 'post' ||
    !item.publishCopy?.trim() ||
    !item.hook?.trim() ||
    !item.title?.trim() ||
    !item.cta?.trim() ||
    !item.productionNotes?.trim() ||
    /\b(?:tbd|placeholder|write a post about|insert your|caption idea)\b/i.test(
      item.publishCopy,
    )
  )
    return false;
  if (item.format === MediaPostType.THREAD)
    return (
      item.xThread?.length >= 2 && item.xThread.every((part) => !!part?.trim())
    );
  if (item.format === MediaPostType.IMAGE)
    return (
      item.imageBrief?.mode !== 'none' &&
      !!item.imageBrief?.description?.trim() &&
      words(item.publishCopy) >= 30
    );
  if (item.format === MediaPostType.CAROUSEL)
    return (
      item.carouselSlides?.length >= 6 &&
      item.carouselSlides.every(
        (slide) =>
          slide.headline?.trim() &&
          slide.bodyCopy?.trim() &&
          slide.visualDescription?.trim(),
      )
    );
  if (
    [MediaPostType.REEL, MediaPostType.SHORT, MediaPostType.VIDEO].includes(
      item.format,
    )
  ) {
    const length = words(item.videoPack?.fullScript ?? '');
    return (
      length >= (item.format === MediaPostType.VIDEO ? 550 : 65) &&
      !!item.videoPack?.cameraInstructions?.trim() &&
      !!item.videoPack?.musicDirection?.trim() &&
      !!item.videoPack?.coverDirection?.trim() &&
      item.videoPack?.targetDurationSeconds > 0
    );
  }
  return item.platform === MediaPlatform.X
    ? item.publishCopy.length <= 280
    : words(item.publishCopy) >= 65;
}


const words = (value: string) => value.split(/\s+/).filter(Boolean).length;
type Source = { evidenceIds?: string[]; key?: string } | undefined;

function researchPrompt(series: CreatorSeries, topic: string): string {
  const topics = series.sourceTopics ?? [];
  if (topics.includes('books') || /read|book|mind/i.test(series.key)) {
    return `Find the actual book title and passage, what you believed beforehand, the exact argument you disagreed with, and an observed decision or concrete counterexample. Topic: ${topic}. Do not invent a quote or pretend you changed your mind.`;
  }
  if (topics.includes('hobbies') || /guitar|chess|spanish|learning/i.test(series.key)) {
    return `Capture one real attempt or mistake in ${topic}, an authentic reaction and what happened next. Include actual footage or a specific practice log. No invented breakthrough, dialogue or before/after result.`;
  }
  if (topics.includes('companies') || topics.includes('projects') || /founder|work|business/i.test(series.key)) {
    return `Choose one approved real decision or customer problem relating to ${topic}. Identify the concrete constraint, two options, what was chosen, and an observable consequence. Remove customer/private details.`;
  }
  return `Collect one verified, public-safe incident, observation or research source about ${topic}. Identify a concrete scene, stakes, an unexpected shift and an earned ending; no generic advice or imaginary first-person events.`;
}

export function authoredCreatorFallback(
  base: MediaPlanningExecution,
  date: string,
  ordinal: number,
  format: MediaPostType,
  platform: MediaPlatform,
  _source?: Source,
  usedHeadlines = new Set<string>(),
  activeSeries: readonly CreatorSeries[] = DEFAULT_CREATOR_SERIES,
): MediaPlanningExecution {
  const matching = activeSeries.filter(series => series.channels.includes(platform));
  const selected = matching.length
    ? matching[Math.abs(ordinal) % matching.length]
    : { key: 'unassigned', name: 'Needs series review', channels: [platform] };
  const topicOptions = (selected.topicKeywords ?? []).filter(Boolean);
  const topic = topicOptions.length
    ? topicOptions[Math.abs(ordinal) % topicOptions.length]
    : (selected.angle || selected.name).slice(0, 90);
  const baseTitle = `${selected.name}: story research — ${topic.slice(0, 65)}`;
  let title = `${baseTitle} (${date})`;
  let uniqueness = 2;
  while (usedHeadlines.has(editorialTextKey(title))) {
    title = `${baseTitle} (${date} · ${uniqueness++})`;
  }
  usedHeadlines.add(editorialTextKey(title));
  const captureBrief = researchPrompt(selected as CreatorSeries, topic);
  return {
    ...base,
    platform,
    format,
    action: 'post',
    time: base.time,
    title,
    seriesKey: selected.key,
    seriesName: selected.name,
    editorialVersion: 'offline-research-v2',
    formatIntent: 'UNWRITTEN STORY SLOT — source research required',
    reason: 'Offline research only: AI writing unavailable or source evidence insufficient. This is NOT a completed production pack.',
    whyThisFormat: 'A possible slot reserved for this active series. Not a finished creative decision.',
    whyThisTime: 'Reserved schedule slot; do not publish until properly authored and approved.',
    hook: '',
    hookAlternatives: [],
    openingVisual: '',
    storyTension: '',
    storyTurn: '',
    viewerPayoff: '',
    storyBeats: [],
    storyPayoff: '',
    caption: '',
    script: '',
    publishCopy: '',
    copyPasteText: '',
    copyPasteCaption: '',
    description: '',
    cta: '',
    hashtags: [],
    slides: [],
    coverText: '',
    thumbnailText: '',
    pinnedComment: '',
    storyFollowUp: '',
    editorialFingerprint: editorialTextKey(title),
    evidenceIds: [], // Never cite an unrelated opportunity as evidence for a hypothetical scene.
    opportunityKey: '',
    trendStatus: 'not_verified',
    trendTitle: '',
    trendSource: '',
    trendUrl: '',
    trendPublishedAt: '',
    productionNotes: captureBrief,
    imageBrief: { ...base.imageBrief, mode: 'none', overlayText: '', prompt: '', description: '' },
    carouselSlides: [],
    videoPack: {
      ...base.videoPack,
      fullScript: '',
      targetDurationSeconds: 0,
      shotList: [],
      punchIns: [],
      broll: [],
      onScreenText: [],
      cameraInstructions: '',
      coverDirection: '',
      musicDirection: '',
    },
    xThread: [],
    whatsappSequence: [],
    qualityScore: 0,
    qualityVerdict: 'evidence_needed',
    editorialScore: 0,
    editorialIssues: ['No actual story, hook or script exists. Gather evidence and write with AI before reviewing.'],
    qualityIssues: ['Not authored. Gather public-safe story evidence, then generate and review a real creative pack.'],
    qualityRevisionCount: 0,
    estimatedMinutes: 0,
    executionReady: false,
    readinessIssues: ['Unwritten idea, not a finished script. Add a real scene/source and regenerate with AI; owner review still required.'],
    requiresApproval: true,
  };
}
