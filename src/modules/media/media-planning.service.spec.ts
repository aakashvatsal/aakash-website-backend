import { MediaPlanningService } from './media-planning.service';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';

const evidenceIds = Array.from(
  { length: 8 },
  (_, index) => `evidence_${index + 1}`,
);
const copySeeds = [
  'Monday is about reducing friction before adding intelligence to a workflow.',
  'Tuesday I am thinking about how good products disappear into the operator routine.',
  'Wednesday is a reminder that useful systems earn trust through boring reliability.',
  'Thursday I keep returning to the gap between a clever feature and an adopted habit.',
  'Friday I am looking at how a founder decides what not to build next.',
  'Saturday is for turning one strong idea into a clearer explanation instead of more ideas.',
  'Sunday I like reviewing which lessons actually changed a decision during the week.',
];

const platformAngles: Record<MediaPlatform, string> = {
  [MediaPlatform.LINKEDIN]:
    'For operators and builders, the practical consequence is',
  [MediaPlatform.INSTAGRAM]: 'The visual version of that thought is simple',
  [MediaPlatform.YOUTUBE]:
    'The deeper explanation starts with one operating question',
  [MediaPlatform.X]: 'The compressed version I would keep is',
  [MediaPlatform.WHATSAPP]:
    'For people who already know my work, the useful update is',
  [MediaPlatform.FACEBOOK]: 'The broader community angle is',
  [MediaPlatform.THREADS]: 'The conversational version is',
};

function videoPack(dayIndex: number) {
  return {
    fullScript: `${copySeeds[dayIndex]} ${platformAngles[MediaPlatform.YOUTUBE]} whether the system helps someone make a better decision with less effort. I have learned to distrust features that look impressive in a demo but create another operating step. The test I keep using is simple: can the person doing the work understand the next action faster, and can the system stay out of the way when judgement matters? That is the standard I want to keep applying as the products become more capable.`,
    targetDurationSeconds: 180,
    deliveryInstructions:
      'Calm, reflective and precise; speak directly to camera.',
    cameraInstructions:
      'Eye-level medium shot, clean background, subtle punch-ins.',
    punchIns: [
      { at: '00:25', instruction: 'Punch in on the operating-question line.' },
    ],
    broll: [
      {
        at: '00:55',
        instruction: 'Show a neutral workflow sketch or notebook page.',
      },
    ],
    onScreenText: [
      { at: '00:08', instruction: 'Overlay: useful > impressive' },
    ],
    musicDirection:
      'Very subtle instrumental under the voice; no dramatic build.',
    coverDirection: 'Close portrait with 3-5 word operator-focused title.',
  };
}

function carouselSlides(dayIndex: number) {
  return [
    {
      slideNumber: 1,
      headline: `A better operating question ${dayIndex + 1}`,
      bodyCopy:
        'Before adding another feature, ask what decision becomes easier for the person doing the work.',
      visualType: 'text_only' as const,
      imagePrompt: '',
      visualDescription:
        'Minimal text-first title slide with strong hierarchy and generous negative space.',
      overlayText: 'Make the decision easier',
    },
    {
      slideNumber: 2,
      headline: 'Useful systems reduce steps',
      bodyCopy:
        'The strongest workflow often removes one decision or one handoff instead of adding another dashboard.',
      visualType: 'designed_graphic' as const,
      imagePrompt: '',
      visualDescription:
        'Simple before-versus-after workflow diagram with fewer boxes on the right side.',
      overlayText: 'Fewer steps. Better judgement.',
    },
  ];
}

function execution(
  platform: MediaPlatform,
  dayIndex: number,
  action: 'post' | 'skip' = 'post',
  format: MediaPostType = MediaPostType.TEXT,
) {
  const copy = `${copySeeds[dayIndex]} ${platformAngles[platform]} ${dayIndex + 1}-${platform}.`;
  const opportunityKey = `opp_${((dayIndex + Object.values(MediaPlatform).indexOf(platform)) % 8) + 1}`;
  const isVideo = [
    MediaPostType.VIDEO,
    MediaPostType.REEL,
    MediaPostType.SHORT,
  ].includes(format);
  const isCarousel = format === MediaPostType.CAROUSEL;
  const isThread =
    platform === MediaPlatform.X && format === MediaPostType.THREAD;
  const isWhatsApp = platform === MediaPlatform.WHATSAPP;
  return {
    platform,
    action,
    time: action === 'post' ? '10:30' : '',
    format,
    formatIntent:
      action === 'post' ? `native ${platform} execution` : 'intentional skip',
    opportunityKey: action === 'post' ? opportunityKey : '',
    storyArcKey: '',
    reason:
      action === 'post'
        ? 'Worth saying from current evidence'
        : 'Protect quality',
    whyThisFormat: 'Native fit',
    whyThisTime: 'Starting hypothesis',
    title:
      action === 'post' ? `Specific ${platform} title ${dayIndex + 1}` : '',
    hook:
      action === 'post'
        ? `A specific observation ${dayIndex + 1} for ${platform}`
        : '',
    caption: action === 'post' ? copy : '',
    script: '',
    description: '',
    cta: action === 'post' ? 'What part of this shows up in your work?' : '',
    hashtags: [],
    slides: [],
    coverText: '',
    thumbnailText: '',
    pinnedComment: '',
    storyFollowUp: '',
    productionNotes: action === 'post' ? 'Publish as written.' : '',
    publishCopy:
      action === 'post'
        ? `${copy}\n\nWhat part of this shows up in your work?`
        : '',
    copyPasteText: action === 'post' ? copy : '',
    copyPasteCaption:
      action === 'post'
        ? `${copy}\n\nWhat part of this shows up in your work?`
        : '',
    evidenceIds:
      action === 'post'
        ? [
            evidenceIds[
              (dayIndex + Object.values(MediaPlatform).indexOf(platform)) % 8
            ],
          ]
        : [],
    imageBrief: {
      mode: 'none' as const,
      aspectRatio: '',
      overlayText: '',
      prompt: '',
      description: '',
      sourceGuidance: '',
    },
    carouselSlides:
      action === 'post' && isCarousel ? carouselSlides(dayIndex) : [],
    videoPack:
      action === 'post' && isVideo
        ? videoPack(dayIndex)
        : {
            fullScript: '',
            targetDurationSeconds: 0,
            deliveryInstructions: '',
            cameraInstructions: '',
            punchIns: [],
            broll: [],
            onScreenText: [],
            musicDirection: '',
            coverDirection: '',
          },
    xThread:
      action === 'post' && isThread
        ? [
            copy,
            `Second point ${dayIndex + 1}: simplify the operating decision before adding complexity.`,
          ]
        : [],
    whatsappSequence: action === 'post' && isWhatsApp ? [copy] : [],
    executionReady: action === 'post',
    readinessIssues: [],
    estimatedMinutes: action === 'post' ? 15 : 0,
    requiresApproval: true,
  };
}

function dailyStory(dayIndex: number) {
  return {
    action: 'post' as const,
    time: dayIndex % 2 ? '8:30 AM' : '08:30 IST',
    sourceType: (
      [
        'routine',
        'current_work',
        'learning',
        'personal_growth',
        'professional',
        'human_moment',
        'routine',
      ] as const
    )[dayIndex],
    sourceEvidenceIds: [evidenceIds[dayIndex % evidenceIds.length]],
    reason: `Daily familiarity from a real context signal ${dayIndex + 1}`,
    captureBrief: `If this routine/current moment happens on day ${dayIndex + 1}, capture a simple 5-10 second vertical clip; do not stage a false event.`,
    frames: [
      {
        order: 1,
        overlayText: `Tiny note ${dayIndex + 1}: ${['build', 'learn', 'move', 'review', 'record', 'read', 'reflect'][dayIndex]}.`,
        spokenText: '',
        visualDescription: `A natural vertical glimpse of the day ${dayIndex + 1} context with no sensitive screen content.`,
        captureInstruction:
          'Hold the phone steady for 5-8 seconds and keep identifiable/private details out of frame.',
        interactiveElement: '',
      },
    ],
    executionReady: true,
    readinessIssues: [],
  };
}

function youtubeCommunity(dayIndex: number) {
  const shouldPost = [1, 3, 5, 6].includes(dayIndex);
  return {
    action: shouldPost ? ('post' as const) : ('skip' as const),
    time: shouldPost ? '16:30' : '',
    format:
      dayIndex === 3
        ? ('poll' as const)
        : dayIndex === 5
          ? ('image' as const)
          : ('text' as const),
    sourceType: (
      [
        'routine',
        'current_work',
        'learning',
        'hobby',
        'personal_growth',
        'human_moment',
        'learning',
      ] as const
    )[dayIndex],
    sourceEvidenceIds: shouldPost
      ? [evidenceIds[dayIndex % evidenceIds.length]]
      : [],
    reason: shouldPost
      ? `Lightweight YouTube relationship moment ${dayIndex + 1}`
      : 'No Community post needed today.',
    publishCopy: shouldPost
      ? `Small note ${dayIndex + 1}: I am keeping this one conversational rather than turning it into another feed essay.`
      : '',
    imageBrief: {
      mode:
        dayIndex === 5 && shouldPost
          ? ('real_photo' as const)
          : ('none' as const),
      aspectRatio: dayIndex === 5 && shouldPost ? '1:1' : '',
      overlayText: '',
      prompt: '',
      description:
        dayIndex === 5 && shouldPost
          ? 'A private-safe current-life photo with no screens, company details or other people visible.'
          : '',
      sourceGuidance:
        dayIndex === 5 && shouldPost
          ? 'Use only a photo captured by Aakash that day; do not stage an event.'
          : '',
    },
    pollQuestion:
      dayIndex === 3 && shouldPost
        ? 'Which part of learning something new is hardest for you?'
        : '',
    pollOptions:
      dayIndex === 3 && shouldPost
        ? ['Starting', 'Staying consistent', 'Getting feedback']
        : [],
    executionReady: shouldPost,
    readinessIssues: [],
  };
}

function generatedPlan() {
  const schedule: Array<Partial<Record<MediaPlatform, MediaPostType>>> = [
    {
      linkedin: MediaPostType.TEXT,
      youtube: MediaPostType.VIDEO,
      whatsapp: MediaPostType.WHATSAPP_STATUS,
    },
    { instagram: MediaPostType.CAROUSEL, x: MediaPostType.TEXT },
    {
      linkedin: MediaPostType.CAROUSEL,
      whatsapp: MediaPostType.WHATSAPP_STATUS,
    },
    { instagram: MediaPostType.REEL, x: MediaPostType.THREAD },
    {
      linkedin: MediaPostType.TEXT,
      youtube: MediaPostType.VIDEO,
    },
    {
      instagram: MediaPostType.CAROUSEL,
      x: MediaPostType.TEXT,
    },
    {
      linkedin: MediaPostType.TEXT,
      instagram: MediaPostType.REEL,
      x: MediaPostType.TEXT,
      whatsapp: MediaPostType.WHATSAPP_STATUS,
    },
  ];
  const primaryPlatforms = [
    MediaPlatform.LINKEDIN,
    MediaPlatform.INSTAGRAM,
    MediaPlatform.YOUTUBE,
    MediaPlatform.X,
    MediaPlatform.WHATSAPP,
  ];
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date('2026-09-07T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      theme: `Day ${index + 1}`,
      workload: index === 2 ? 'light' : 'normal',
      executions: primaryPlatforms.map((platform) => {
        const format = schedule[index][platform];
        return execution(
          platform,
          index,
          format ? 'post' : 'skip',
          format ??
            (platform === MediaPlatform.WHATSAPP
              ? MediaPostType.WHATSAPP_STATUS
              : MediaPostType.TEXT),
        );
      }),
      instagramStory: dailyStory(index),
      youtubeCommunity: youtubeCommunity(index),
      engagement: [
        {
          platform: MediaPlatform.LINKEDIN,
          time: index % 2 ? '5:30 PM' : '17:30 IST',
          count: index === 2 ? 0 : 4,
          purpose: 'Participate meaningfully',
          guidance: 'Add one concrete thought; never generic praise.',
        },
      ],
    };
  });
  const opportunityAssignments: Array<Partial<Record<MediaPlatform, number>>> =
    [
      { linkedin: 1, youtube: 3, whatsapp: 5 },
      { instagram: 3, x: 2 },
      { linkedin: 1, whatsapp: 5 },
      { instagram: 6, x: 2 },
      { linkedin: 4, youtube: 7 },
      { instagram: 6, x: 8 },
      { linkedin: 4, instagram: 7, x: 2, whatsapp: 1 },
    ];
  for (const [dayIndex, day] of days.entries()) {
    for (const item of day.executions) {
      if (item.action !== 'post') continue;
      const opportunityNumber = opportunityAssignments[dayIndex][item.platform];
      if (!opportunityNumber) continue;
      item.opportunityKey = `opp_${opportunityNumber}`;
      item.evidenceIds = [evidenceIds[opportunityNumber - 1]];
    }
  }
  const narratives = [
    'professional_authority',
    'ideas_and_questions',
    'learning_from_zero',
    'grassroots_sports',
    'human_personality',
    'personal_ai',
    'builder_operator_journey',
    'freight_systems',
  ];
  const strategyNarratives = [
    'builder_operator',
    'ideas_thinking',
    'learning_experiments',
    'sports_workflows',
    'human_personality',
    'personal_intelligence',
    'building_aakash',
    'freight_workflows',
  ];
  const growthIntents = [
    'authority',
    'discovery',
    'conversion',
    'discovery',
    'affinity',
    'conversation',
    'conversion',
    'authority',
  ] as const;
  const identityPillars = [
    'builder_operator',
    'ideas_thinking',
    'learning_experiments',
    'builder_operator',
    'human_unfiltered',
    'ideas_thinking',
    'building_aakash',
    'builder_operator',
  ] as const;
  return {
    startDate: '2026-09-07',
    endDate: '2026-09-13',
    timezone: 'Asia/Kolkata',
    learningStage: 'days_1_30_exploration',
    summary:
      'Build authority and familiarity with a sustainable mixed-format rhythm.',
    opportunities: Array.from({ length: 8 }, (_, index) => ({
      key: `opp_${index + 1}`,
      title: `Opportunity ${index + 1}`,
      thesis: `Specific thesis ${index + 1}`,
      whyNow: 'Current work or routine makes it timely',
      sourceSummary: 'Public-safe HSAKAA evidence',
      evidenceIds: [evidenceIds[index]],
      companyName: index < 2 ? '8lete' : '',
      narrative: narratives[index],
      identityPillar: identityPillars[index],
      strategyNarrativeKey: strategyNarratives[index],
      topicClusterKey: `cluster_${index + 1}`,
      growthIntent: growthIntents[index],
      platforms: [
        MediaPlatform.LINKEDIN,
        MediaPlatform.INSTAGRAM,
        MediaPlatform.YOUTUBE,
        MediaPlatform.X,
        MediaPlatform.WHATSAPP,
      ],
      formats: [
        MediaPostType.TEXT,
        MediaPostType.CAROUSEL,
        MediaPostType.VIDEO,
        MediaPostType.REEL,
        MediaPostType.SHORT,
      ],
      strategicFit: 80,
      novelty: 85,
      evidenceStrength: 75,
      privacy: 'public_safe' as const,
      usable: true,
    })),
    storyArcs: [],
    days,
  };
}

function generatedBlueprint(plan = generatedPlan()) {
  return {
    startDate: plan.startDate,
    endDate: plan.endDate,
    timezone: plan.timezone,
    learningStage: plan.learningStage,
    summary: plan.summary,
    opportunities: plan.opportunities,
    storyArcs: plan.storyArcs,
    days: plan.days.map((day) => ({
      date: day.date,
      theme: day.theme,
      workload: day.workload,
      executions: day.executions.map((item) => ({
        platform: item.platform,
        action: item.action,
        time: item.time,
        format: item.format,
        opportunityKey: item.opportunityKey,
        storyArcKey: item.storyArcKey,
        reason: item.reason,
      })),
      instagramStory: {
        action: day.instagramStory.action,
        time: day.instagramStory.time,
        sourceType: day.instagramStory.sourceType,
        sourceEvidenceIds: day.instagramStory.sourceEvidenceIds,
        reason: day.instagramStory.reason,
        captureBrief: day.instagramStory.captureBrief,
      },
      youtubeCommunity: {
        action: day.youtubeCommunity.action,
        time: day.youtubeCommunity.time,
        format: day.youtubeCommunity.format,
        sourceType: day.youtubeCommunity.sourceType,
        sourceEvidenceIds: day.youtubeCommunity.sourceEvidenceIds,
        reason: day.youtubeCommunity.reason,
      },
      engagement: day.engagement,
    })),
  };
}

describe('MediaPlanningService V3.14 whole-OS growth planning', () => {
  function makeService(
    plan = generatedPlan(),
    options: {
      failFirstDayPackWithTokenLimit?: boolean;
      failFirstCalendarWithTokenLimit?: boolean;
      firstBlueprintAllSkip?: boolean;
      strategyCoreMissingEvidence?: boolean;
      strategyCoreUsesEvidenceAliases?: boolean;
      calendarUsesEvidenceAliases?: boolean;
      firstStrategyIdentityImbalanced?: boolean;
      overDistributeHobbySignal?: boolean;
      underProduceShortForm?: boolean;
      severelyUnderProduceShortForm?: boolean;
      skipInstagramStories?: boolean;
      emptyInstagramStoryEvidence?: boolean;
      invalidInstagramStoryEvidence?: boolean;
      invalidYoutubeCommunityEvidence?: boolean;
      underProduceLongForm?: boolean;
      underProduceX?: boolean;
      missingGrowthConversion?: boolean;
      missingGrowthPortfolio?: boolean;
      usedOnlyThreeGrowthClusters?: boolean;
    } = {},
  ) {
    const doc = { ...plan, key: 'x' };
    let lastPlanUpdate: { $set?: { days?: typeof plan.days } } | null = null;
    const planModel = {
      findOne: jest.fn(() => ({
        sort: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })),
      })),
      findOneAndUpdate: jest.fn(
        (_filter: unknown, update: { $set?: { days?: typeof plan.days } }) => {
          lastPlanUpdate = update;
          return Promise.resolve(doc);
        },
      ),
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
        })),
      })),
    };
    const dailyExecutionModel = {
      find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    const publicationModel = {
      find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
    };
    const aiRequests: Array<{
      input: string;
      name: string;
      maxOutputTokens: number;
    }> = [];
    let tokenFailureInjected = false;
    let calendarRequestCount = 0;
    let calendarTokenFailureInjected = false;
    const generateStructuredResponse = jest.fn(
      (request: { input: string; name: string; maxOutputTokens: number }) => {
        aiRequests.push(request);
        if (
          request.name.includes('hsakaa_media_presence_strategy_core') ||
          request.name.includes(
            'hsakaa_media_presence_strategy_evidence_repair',
          )
        ) {
          const blueprint = generatedBlueprint(plan);
          const opportunities = blueprint.opportunities.map(
            (opportunity, index) => ({
              ...opportunity,
              identityPillar:
                options.firstStrategyIdentityImbalanced &&
                request.name === 'hsakaa_media_presence_strategy_core_v3122'
                  ? ('builder_operator' as const)
                  : opportunity.identityPillar,
              strategyNarrativeKey:
                options.firstStrategyIdentityImbalanced &&
                request.name === 'hsakaa_media_presence_strategy_core_v3122'
                  ? 'builder_operator'
                  : opportunity.strategyNarrativeKey,
              growthIntent: options.missingGrowthPortfolio
                ? ('affinity' as const)
                : options.missingGrowthConversion &&
                    opportunity.growthIntent === 'conversion'
                  ? ('affinity' as const)
                  : opportunity.growthIntent,
              evidenceIds:
                options.overDistributeHobbySignal && index === 4
                  ? ['presence:hobby-1']
                  : options.strategyCoreUsesEvidenceAliases &&
                      !request.name.includes('strategy_evidence_repair')
                    ? opportunity.evidenceIds.map(
                        (_, evidenceIndex) =>
                          `E${String(((index + evidenceIndex) % evidenceIds.length) + 1).padStart(3, '0')}`,
                      )
                    : [...opportunity.evidenceIds],
              formats: options.severelyUnderProduceShortForm
                ? [MediaPostType.TEXT, MediaPostType.IMAGE, MediaPostType.VIDEO]
                : [...opportunity.formats],
            }),
          );
          if (
            options.strategyCoreMissingEvidence &&
            !request.name.includes('strategy_evidence_repair')
          ) {
            opportunities[0].evidenceIds = [];
            opportunities[0].title =
              'Reduce workflow friction before automation';
            opportunities[0].thesis =
              'The workflow should get simpler before automation is added.';
            opportunities[0].sourceSummary =
              'A workflow lesson grounded in current HSAKAA context.';
          }
          const strategyCore = {
            startDate: blueprint.startDate,
            endDate: blueprint.endDate,
            timezone: blueprint.timezone,
            learningStage: blueprint.learningStage,
            summary: blueprint.summary,
            opportunities,
            storyArcs: blueprint.storyArcs,
          };
          return Promise.resolve({
            data: strategyCore,
            model: 'test-model',
            responseId: `resp_${request.name}`,
          });
        }

        if (request.name.includes('hsakaa_media_presence_calendar')) {
          calendarRequestCount += 1;
          if (
            options.failFirstCalendarWithTokenLimit &&
            !calendarTokenFailureInjected
          ) {
            calendarTokenFailureInjected = true;
            return Promise.reject(
              new Error(
                'AI structured response did not complete: max_output_tokens. maxOutputTokens=7500 outputTokens=7500',
              ),
            );
          }
          const blueprint = generatedBlueprint(plan);
          let days = blueprint.days;
          if (options.calendarUsesEvidenceAliases) {
            days = days.map((day) => ({
              ...day,
              instagramStory: {
                ...day.instagramStory,
                sourceEvidenceIds: day.instagramStory.sourceEvidenceIds.map(
                  (id) => {
                    const index = evidenceIds.indexOf(id);
                    return index >= 0
                      ? `E${String(index + 1).padStart(3, '0')}`
                      : id;
                  },
                ),
              },
              youtubeCommunity: {
                ...day.youtubeCommunity,
                sourceEvidenceIds: day.youtubeCommunity.sourceEvidenceIds.map(
                  (id) => {
                    const index = evidenceIds.indexOf(id);
                    return index >= 0
                      ? `E${String(index + 1).padStart(3, '0')}`
                      : id;
                  },
                ),
              },
            }));
          }
          if (options.overDistributeHobbySignal) {
            days = days.map((day, index) => {
              if (index === 0) {
                return {
                  ...day,
                  instagramStory: {
                    ...day.instagramStory,
                    sourceEvidenceIds: ['presence:hobby-1'],
                  },
                };
              }
              if (index === 1) {
                return {
                  ...day,
                  youtubeCommunity: {
                    ...day.youtubeCommunity,
                    action: 'post' as const,
                    time: '16:30',
                    sourceEvidenceIds: ['presence:hobby-1'],
                  },
                };
              }
              return day;
            });
          }
          if (options.underProduceShortForm) {
            days = days.map((day, index) =>
              index === 6
                ? {
                    ...day,
                    executions: day.executions.map((item) =>
                      item.platform === MediaPlatform.INSTAGRAM &&
                      item.action === 'post'
                        ? { ...item, format: MediaPostType.IMAGE }
                        : item,
                    ),
                  }
                : day,
            );
          }
          if (options.severelyUnderProduceShortForm) {
            days = days.map((day, index) =>
              [5, 6].includes(index)
                ? {
                    ...day,
                    executions: day.executions.map((item) =>
                      item.platform === MediaPlatform.INSTAGRAM &&
                      item.action === 'post'
                        ? { ...item, format: MediaPostType.IMAGE }
                        : item,
                    ),
                  }
                : day,
            );
          }
          if (options.usedOnlyThreeGrowthClusters) {
            let assignment = 0;
            days = days.map((day) => ({
              ...day,
              executions: day.executions.map((item) => {
                if (item.action !== 'post') return item;
                const opportunityKey = ['opp_1', 'opp_2', 'opp_8'][
                  assignment % 3
                ];
                assignment += 1;
                return { ...item, opportunityKey };
              }),
            }));
          }
          if (options.skipInstagramStories) {
            for (const day of days) {
              const story = day.instagramStory as {
                action: 'post' | 'skip';
                time: string;
                sourceEvidenceIds: string[];
              };
              story.action = 'skip';
              story.time = '';
              story.sourceEvidenceIds = [];
            }
          }
          if (options.emptyInstagramStoryEvidence) {
            days = days.map((day, index) =>
              index === 0
                ? {
                    ...day,
                    instagramStory: {
                      ...day.instagramStory,
                      action: 'post' as const,
                      sourceEvidenceIds: [],
                    },
                  }
                : day,
            );
          }
          if (options.invalidInstagramStoryEvidence) {
            days = days.map((day, index) =>
              index === 0
                ? {
                    ...day,
                    instagramStory: {
                      ...day.instagramStory,
                      action: 'post' as const,
                      sourceEvidenceIds: ['fabricated:story-evidence'],
                    },
                  }
                : day,
            );
          }
          if (options.invalidYoutubeCommunityEvidence) {
            days = days.map((day, index) =>
              index === 0
                ? {
                    ...day,
                    youtubeCommunity: {
                      ...day.youtubeCommunity,
                      action: 'post' as const,
                      time: day.youtubeCommunity.time || '16:30',
                      sourceEvidenceIds: [],
                    },
                  }
                : day,
            );
          }
          if (options.underProduceLongForm) {
            let converted = false;
            days = days.map((day) => ({
              ...day,
              executions: day.executions.map((item) => {
                if (
                  !converted &&
                  item.platform === MediaPlatform.YOUTUBE &&
                  item.action === 'post' &&
                  item.format === MediaPostType.VIDEO
                ) {
                  converted = true;
                  return { ...item, format: MediaPostType.SHORT };
                }
                return item;
              }),
            }));
          }
          if (options.underProduceX) {
            let kept = 0;
            days = days.map((day) => ({
              ...day,
              executions: day.executions.map((item) => {
                if (
                  item.platform !== MediaPlatform.X ||
                  item.action !== 'post'
                ) {
                  return item;
                }
                kept += 1;
                return kept <= 1
                  ? item
                  : {
                      ...item,
                      action: 'skip' as const,
                      time: '',
                      opportunityKey: '',
                      reason: 'Injected cadence miss',
                    };
              }),
            }));
          }
          if (options.firstBlueprintAllSkip && calendarRequestCount === 1) {
            days = days.map((day) => ({
              ...day,
              executions: day.executions.map((item) => ({
                ...item,
                action: 'skip' as const,
                opportunityKey: '',
                reason: 'Evidence gate over-corrected',
              })),
            }));
          }
          return Promise.resolve({
            data: { days },
            model: 'test-model',
            responseId: `resp_${request.name}_${calendarRequestCount}`,
          });
        }

        if (request.name === 'hsakaa_media_presence_youtube_community_v3131') {
          const input = JSON.parse(request.input) as {
            communityPlans: Array<{ date: string }>;
          };
          return Promise.resolve({
            data: {
              posts: input.communityPlans.map((communityPlan) => {
                const day = plan.days.find(
                  (item) => item.date === communityPlan.date,
                )!;
                return {
                  date: communityPlan.date,
                  youtubeCommunity: day.youtubeCommunity,
                };
              }),
            },
            model: 'test-model',
            responseId: 'resp_youtube_community',
          });
        }

        if (
          request.name ===
          'hsakaa_media_presence_youtube_community_repair_v3131'
        ) {
          const input = JSON.parse(request.input) as { date: string };
          const day = plan.days.find((item) => item.date === input.date)!;
          return Promise.resolve({
            data: {
              date: input.date,
              youtubeCommunity: day.youtubeCommunity,
            },
            model: 'test-model',
            responseId: `resp_youtube_community_${input.date}`,
          });
        }

        if (request.name === 'hsakaa_media_presence_weekly_stories_v3125') {
          const input = JSON.parse(request.input) as {
            storyPlans: Array<{ date: string }>;
          };
          return Promise.resolve({
            data: {
              stories: input.storyPlans.map((storyPlan) => {
                const day = plan.days.find(
                  (item) => item.date === storyPlan.date,
                )!;
                return {
                  date: storyPlan.date,
                  instagramStory: day.instagramStory,
                };
              }),
            },
            model: 'test-model',
            responseId: 'resp_weekly_stories',
          });
        }

        if (request.name === 'hsakaa_media_presence_story_repair_v3125') {
          const input = JSON.parse(request.input) as { date: string };
          const day = plan.days.find((item) => item.date === input.date)!;
          return Promise.resolve({
            data: {
              date: input.date,
              instagramStory: day.instagramStory,
            },
            model: 'test-model',
            responseId: `resp_story_${input.date}`,
          });
        }

        const input = JSON.parse(request.input) as {
          date: string;
          expectedPosts: Array<{
            platform: MediaPlatform;
            opportunityKey?: string;
          }>;
          opportunities?: Array<{ key: string; evidenceIds: string[] }>;
        };
        if (
          request.name === 'hsakaa_media_presence_day_pack_v3125' &&
          options.failFirstDayPackWithTokenLimit &&
          !tokenFailureInjected
        ) {
          tokenFailureInjected = true;
          return Promise.reject(
            new Error(
              'AI structured response did not complete: max_output_tokens. maxOutputTokens=9000 outputTokens=9000',
            ),
          );
        }

        const day = plan.days.find((item) => item.date === input.date)!;
        const expectedPlatforms = new Set(
          input.expectedPosts.map((item) => item.platform),
        );
        const opportunityEvidence = new Map(
          (input.opportunities ?? []).map((opportunity) => [
            opportunity.key,
            opportunity.evidenceIds,
          ]),
        );
        return Promise.resolve({
          data: {
            date: input.date,
            posts: day.executions
              .filter(
                (item) =>
                  item.action === 'post' &&
                  expectedPlatforms.has(item.platform),
              )
              .map((item) => ({
                ...item,
                evidenceIds:
                  opportunityEvidence.get(item.opportunityKey) ??
                  item.evidenceIds,
              })),
          },
          model: 'test-model',
          responseId: `resp_${request.name}_${input.date}`,
        });
      },
    );
    const aiService = { generateStructuredResponse };
    const presenceService = {
      directorContext: jest.fn().mockResolvedValue({
        presenceStrategy: {
          version: 4,
          sourceFingerprint: 'strategy-fp',
          narratives: [
            {
              key: 'builder_operator',
              title: 'Building and operating difficult things',
              targetSharePercent: 20,
            },
            {
              key: 'ideas_thinking',
              title: 'Ideas, decisions and things Aakash is reconsidering',
              targetSharePercent: 15,
            },
            {
              key: 'sports_workflows',
              title: 'Grassroots sport, academies and better infrastructure',
              targetSharePercent: 10,
            },
            {
              key: 'freight_workflows',
              title:
                'Software and systems for operationally complex freight work',
              targetSharePercent: 10,
            },
            {
              key: 'personal_intelligence',
              title: 'Building HSAKAA and a personal intelligence system',
              targetSharePercent: 10,
            },
            {
              key: 'learning_experiments',
              title: 'Learning things from zero',
              targetSharePercent: 15,
            },
            {
              key: 'building_aakash',
              title: 'Building Aakash',
              targetSharePercent: 10,
            },
            {
              key: 'human_personality',
              title: 'Aakash outside the framework',
              targetSharePercent: 10,
            },
          ],
          platformRoles: [
            {
              platform: MediaPlatform.LINKEDIN,
              minPostsPerWeek: 2,
              preferredPostsPerWeek: 3,
              maxPostsPerWeek: 4,
            },
            {
              platform: MediaPlatform.INSTAGRAM,
              minPostsPerWeek: 2,
              preferredPostsPerWeek: 3,
              maxPostsPerWeek: 4,
            },
            {
              platform: MediaPlatform.YOUTUBE,
              minPostsPerWeek: 1,
              preferredPostsPerWeek: 2,
              maxPostsPerWeek: 2,
            },
            {
              platform: MediaPlatform.X,
              minPostsPerWeek: 2,
              preferredPostsPerWeek: 4,
              maxPostsPerWeek: 7,
            },
            {
              platform: MediaPlatform.WHATSAPP,
              minPostsPerWeek: 0,
              preferredPostsPerWeek: 1,
              maxPostsPerWeek: 3,
            },
          ],
        },
        voiceProfile: { version: 1 },
        worldContext: {
          fingerprint: 'world-fp',
          privacyPolicy: {},
          companies: [
            {
              id: 'company-8lete',
              name: '8lete',
              roles: ['Co-Founder & CEO'],
              industries: ['grassroots sports technology'],
              products: [],
              markets: ['India'],
              currentFocus: 'academy operating systems',
              currentPriorities: ['make academy operations easier'],
              principles: ['operator-first'],
            },
            {
              id: 'company-frayto',
              name: 'Frayto',
              roles: ['Co-Founder & CTO'],
              industries: ['freight technology'],
              products: [],
              markets: ['India'],
              currentFocus: 'operational freight workflows',
              currentPriorities: ['reduce workflow friction'],
              principles: ['operational clarity'],
            },
          ],
          publicSafe: evidenceIds.map((id, index) => ({
            id,
            title:
              index === 0
                ? 'Workflow friction before automation'
                : `Evidence ${index + 1}`,
            summary:
              index === 0
                ? 'A real public-safe workflow lesson about reducing friction before adding automation.'
                : 'Real public-safe evidence',
            kind: 'lesson',
            source: 'journal',
            significantChange: false,
          })),
          internalSafe: [],
          wholeLifeSignals: [
            {
              id: 'presence:routine-1',
              category: 'routine',
              kind: 'whole_life_signal',
              title: 'Gym / strength routine',
              summary:
                'A private-safe movement or training moment may be available for conditional capture.',
              occurredAt: '2026-09-03T03:00:00.000Z',
              source: 'health',
              privacy: 'internal_safe',
              significantChange: false,
            },
            {
              id: 'presence:hobby-1',
              category: 'hobby',
              kind: 'whole_life_signal',
              title: 'Guitar practice',
              summary:
                'A hobby practice signal may support a small learning-in-public moment without a business analogy.',
              occurredAt: '2026-09-03T12:00:00.000Z',
              source: 'task',
              privacy: 'internal_safe',
              significantChange: false,
            },
          ],
          hobbies: [
            {
              id: 'guitar-1',
              name: 'Guitar',
              status: 'active',
              intensity: 'primary',
              currentStageKey: 'foundations',
              currentStageTitle: 'Foundations',
              nextFocus: 'Clean chord transitions',
              weeklyTargetMinutes: 120,
              weeklyMinutes: 45,
              sessionsThisWeek: 2,
              pace: 'on_track',
              recommendedTodayMinutes: 20,
            },
          ],
          personalOsSections: [
            {
              source: 'task',
              totalItems: 3,
              publicSafe: 0,
              internalSafe: 3,
              needsReview: 0,
              privateOnly: 0,
              latestSafeItems: [],
            },
            {
              source: 'journal',
              totalItems: 2,
              publicSafe: 1,
              internalSafe: 0,
              needsReview: 1,
              privateOnly: 0,
              latestSafeItems: [],
            },
            {
              source: 'library',
              totalItems: 1,
              publicSafe: 0,
              internalSafe: 1,
              needsReview: 0,
              privateOnly: 0,
              latestSafeItems: [],
            },
            {
              source: 'hobby',
              totalItems: 2,
              publicSafe: 0,
              internalSafe: 2,
              needsReview: 0,
              privateOnly: 0,
              latestSafeItems: [],
            },
            {
              source: 'company',
              totalItems: 1,
              publicSafe: 1,
              internalSafe: 0,
              needsReview: 0,
              privateOnly: 0,
              latestSafeItems: [],
            },
          ],
          coverage: {
            capturedDays: 7,
            totalItems: 9,
            publicSafe: 2,
            internalSafe: 6,
            needsReview: 1,
            privateOnly: 0,
            sourceCounts: {
              task: 3,
              journal: 2,
              library: 1,
              hobby: 2,
              company: 1,
            },
            missingSources: [],
          },
        },
      }),
      overview: jest.fn().mockResolvedValue({ strategy: {}, voice: {} }),
    };
    const growthService = {
      directorLearningContext: jest.fn().mockResolvedValue([]),
    };
    const calendarService = {
      overview: jest.fn().mockResolvedValue({ coverage: [] }),
    };
    const learningService = {
      directorContext: jest
        .fn()
        .mockResolvedValue({ performance: [], audience: [] }),
    };
    const adaptationService = {
      planningContext: jest.fn().mockResolvedValue({
        key: '2026-08-31',
        focusThisWeek: ['specific builder evidence'],
        avoidThisWeek: ['generic advice'],
        cadenceAdjustments: [],
        narrativeAdjustments: [],
        strategyChangeCandidates: [],
      }),
    };
    const launchService = {
      planningContext: jest.fn().mockResolvedValue({
        phase: 'days_1_30_exploration',
        dayNumber: 1,
        launchStarted: true,
        experimentPolicy: {
          experimentSharePercent: 35,
          minimumSamplesBeforeConclusion: 5,
          minimumDistinctFormatsPerWeek: 3,
          minimumDistinctNarrativesPerWeek: 3,
          preserveVoiceOverOptimization: true,
          avoidEarlyWinnerLockIn: true,
        },
        guidance: 'Explore deliberately.',
      }),
    };
    const contentIntelligenceService = {
      planningFingerprintContext: jest.fn().mockResolvedValue([
        {
          _id: 'memory_1',
          lexicalSignature: ['different', 'historic', 'subject'],
          normalizedText: 'a completely unrelated historical media item',
        },
      ]),
    };
    const socialPresenceService = {
      overview: jest.fn().mockResolvedValue({
        accounts: [
          {
            account: { platform: MediaPlatform.INSTAGRAM },
            profile: { followerCount: 12 },
          },
          {
            account: { platform: MediaPlatform.YOUTUBE },
            profile: { followerCount: 4 },
          },
          {
            account: { platform: MediaPlatform.X },
            profile: { followerCount: 20 },
          },
          {
            account: { platform: MediaPlatform.LINKEDIN },
            profile: { followerCount: null },
          },
        ],
      }),
    };
    const service = new MediaPlanningService(
      planModel as never,
      dailyExecutionModel as never,
      publicationModel as never,
      aiService as never,
      presenceService as never,
      growthService as never,
      calendarService as never,
      learningService as never,
      adaptationService as never,
      launchService as never,
      contentIntelligenceService as never,
      socialPresenceService as never,
    );
    return {
      service,
      aiService,
      planModel,
      presenceService,
      launchService,
      contentIntelligenceService,
      aiRequests,
      getLastPlanUpdate: () => lastPlanUpdate,
      getStrategyCoreRequest: () =>
        aiRequests.find(
          (request) =>
            request.name === 'hsakaa_media_presence_strategy_core_v3122',
        ),
    };
  }

  it('generates exactly seven days with publish-ready copy and intentional skips', async () => {
    const { service, aiService } = makeService();
    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });
    expect(result.days).toHaveLength(7);
    expect(
      result.days[0].executions.filter((item) => item.action === 'post'),
    ).toHaveLength(3);
    expect(aiService.generateStructuredResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'hsakaa_media_presence_strategy_core_v3122',
        maxOutputTokens: 5200,
      }),
    );
    expect(aiService.generateStructuredResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'hsakaa_media_presence_calendar_v3122',
        maxOutputTokens: 5600,
      }),
    );
    expect(aiService.generateStructuredResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'hsakaa_media_presence_day_pack_v3125',
        maxOutputTokens: 9000,
      }),
    );
    expect(aiService.generateStructuredResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'hsakaa_media_presence_weekly_stories_v3125',
        maxOutputTokens: 5600,
      }),
    );
    expect(aiService.generateStructuredResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'hsakaa_media_presence_youtube_community_v3131',
        maxOutputTokens: 3200,
      }),
    );
    expect(
      result.days.filter((day) => day.instagramStory.action === 'post'),
    ).toHaveLength(7);
    expect(
      result.days.filter((day) => day.youtubeCommunity.action === 'post'),
    ).toHaveLength(4);
  });

  it('repairs an over-distributed hobby signal instead of failing the seven-day plan', async () => {
    const { service } = makeService(generatedPlan(), {
      overDistributeHobbySignal: true,
    });

    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    const hobbyEvidenceId = 'presence:hobby-1';
    const opportunities = new Map(
      result.opportunities.map((item) => [item.key, item]),
    );
    const surfaces = new Set<string>();
    for (const day of result.days) {
      for (const execution of day.executions) {
        if (execution.action !== 'post') continue;
        if (!execution.opportunityKey) continue;
        const opportunity = opportunities.get(execution.opportunityKey);
        if (opportunity?.evidenceIds.includes(hobbyEvidenceId)) {
          surfaces.add(`${day.date}:${execution.platform}:feed`);
        }
      }
      if (
        day.instagramStory.action === 'post' &&
        day.instagramStory.sourceEvidenceIds.includes(hobbyEvidenceId)
      ) {
        surfaces.add(`${day.date}:instagram:story`);
      }
      if (
        day.youtubeCommunity.action === 'post' &&
        day.youtubeCommunity.sourceEvidenceIds.includes(hobbyEvidenceId)
      ) {
        surfaces.add(`${day.date}:youtube:community`);
      }
    }

    expect(surfaces.size).toBeLessThanOrEqual(2);
  });

  it('repairs an under-produced short-form cadence instead of failing the seven-day plan', async () => {
    const { service } = makeService(generatedPlan(), {
      underProduceShortForm: true,
    });

    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    const shortFormats = new Set([
      MediaPostType.REEL,
      MediaPostType.SHORT,
      MediaPostType.CAROUSEL,
    ]);
    const shortFormCount = result.days.reduce(
      (total, day) =>
        total +
        day.executions.filter(
          (item) => item.action === 'post' && shortFormats.has(item.format),
        ).length,
      0,
    );

    expect(shortFormCount).toBeGreaterThanOrEqual(5);
    expect(shortFormCount).toBeLessThanOrEqual(6);
  });

  it('repairs a severe 3-of-5 short-form miss even when opportunities did not advertise short formats', async () => {
    const { service } = makeService(generatedPlan(), {
      severelyUnderProduceShortForm: true,
    });

    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    const shortFormats = new Set([
      MediaPostType.REEL,
      MediaPostType.SHORT,
      MediaPostType.CAROUSEL,
    ]);
    const shortFormCount = result.days.reduce(
      (total, day) =>
        total +
        day.executions.filter(
          (item) => item.action === 'post' && shortFormats.has(item.format),
        ).length,
      0,
    );

    expect(shortFormCount).toBeGreaterThanOrEqual(5);
    expect(shortFormCount).toBeLessThanOrEqual(6);
  });

  it('restores daily Instagram Story cadence from grounded context instead of rejecting the week', async () => {
    const { service } = makeService(generatedPlan(), {
      skipInstagramStories: true,
    });

    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    expect(
      result.days.filter((day) => day.instagramStory.action === 'post'),
    ).toHaveLength(7);
    expect(
      result.days.every(
        (day) => day.instagramStory.sourceEvidenceIds.length > 0,
      ),
    ).toBe(true);
  });

  it('repairs an Instagram Story POST with empty evidence instead of rejecting the week', async () => {
    const { service } = makeService(generatedPlan(), {
      emptyInstagramStoryEvidence: true,
    });

    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    expect(result.days[0].instagramStory.action).toBe('post');
    expect(
      result.days[0].instagramStory.sourceEvidenceIds.length,
    ).toBeGreaterThan(0);
    expect(result.days[0].instagramStory.sourceEvidenceIds).not.toContain(
      'fabricated:story-evidence',
    );
  });

  it('replaces unavailable Instagram Story evidence with grounded HSAKAA context', async () => {
    const { service } = makeService(generatedPlan(), {
      invalidInstagramStoryEvidence: true,
    });

    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    expect(result.days[0].instagramStory.action).toBe('post');
    expect(
      result.days[0].instagramStory.sourceEvidenceIds.length,
    ).toBeGreaterThan(0);
    expect(result.days[0].instagramStory.sourceEvidenceIds).not.toContain(
      'fabricated:story-evidence',
    );
  });

  it('repairs an ungrounded YouTube Community POST before blueprint validation', async () => {
    const { service } = makeService(generatedPlan(), {
      invalidYoutubeCommunityEvidence: true,
    });

    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    const communityPosts = result.days.filter(
      (day) => day.youtubeCommunity.action === 'post',
    );
    expect(communityPosts.length).toBeGreaterThanOrEqual(3);
    expect(
      communityPosts.every(
        (day) => day.youtubeCommunity.sourceEvidenceIds.length > 0,
      ),
    ).toBe(true);
  });

  it('restores the long-form YouTube cadence when the model returns only one long video', async () => {
    const { service } = makeService(generatedPlan(), {
      underProduceLongForm: true,
    });

    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    const longFormCount = result.days.reduce(
      (total, day) =>
        total +
        day.executions.filter(
          (item) =>
            item.action === 'post' &&
            item.platform === MediaPlatform.YOUTUBE &&
            item.format === MediaPostType.VIDEO,
        ).length,
      0,
    );
    expect(longFormCount).toBe(2);
  });

  it('restores a platform minimum from an existing SKIP instead of rejecting the whole week', async () => {
    const { service } = makeService(generatedPlan(), {
      underProduceX: true,
    });

    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    const xPosts = result.days.reduce(
      (total, day) =>
        total +
        day.executions.filter(
          (item) => item.platform === MediaPlatform.X && item.action === 'post',
        ).length,
      0,
    );
    expect(xPosts).toBeGreaterThanOrEqual(2);
    expect(xPosts).toBeLessThanOrEqual(7);
  });

  it('repairs a missing follower-conversion cluster instead of failing the 100K growth portfolio', async () => {
    const { service, getLastPlanUpdate } = makeService(generatedPlan(), {
      missingGrowthConversion: true,
    });

    await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    const persisted = getLastPlanUpdate()?.$set as unknown as {
      opportunities: ReturnType<typeof generatedPlan>['opportunities'];
      days: ReturnType<typeof generatedPlan>['days'];
    };
    const usedOpportunityKeys = new Set(
      persisted.days.flatMap((day) =>
        day.executions
          .filter((item) => item.action === 'post')
          .map((item) => item.opportunityKey),
      ),
    );
    const conversionClusters = persisted.opportunities.filter(
      (item) =>
        usedOpportunityKeys.has(item.key) && item.growthIntent === 'conversion',
    );

    expect(conversionClusters.length).toBeGreaterThanOrEqual(1);
    expect(
      conversionClusters.some((item) =>
        [
          'building_aakash',
          'learning_experiments',
          'human_personality',
          'personal_intelligence',
        ].includes(item.strategyNarrativeKey),
      ),
    ).toBe(true);
    expect(
      conversionClusters.some((item) =>
        item.whyNow.includes('ongoing journey'),
      ),
    ).toBe(true);
  });

  it('repairs missing discovery, conversion and authority jobs without adding another post', async () => {
    const baseline = generatedPlan();
    const baselinePostCount = baseline.days.reduce(
      (total, day) =>
        total + day.executions.filter((item) => item.action === 'post').length,
      0,
    );
    const { service, getLastPlanUpdate } = makeService(baseline, {
      missingGrowthPortfolio: true,
    });

    await service.generate({
      startDate: '2026-09-03',
      force: true,
    });
    const persisted = getLastPlanUpdate()?.$set as unknown as {
      opportunities: ReturnType<typeof generatedPlan>['opportunities'];
      days: ReturnType<typeof generatedPlan>['days'];
    };
    const opportunities = new Map(
      persisted.opportunities.map((item) => [item.key, item]),
    );
    const clusterIntents = new Map<string, string>();
    let postCount = 0;
    for (const day of persisted.days) {
      for (const execution of day.executions) {
        if (execution.action !== 'post') continue;
        postCount += 1;
        const opportunity = opportunities.get(execution.opportunityKey);
        if (!opportunity) continue;
        clusterIntents.set(
          opportunity.topicClusterKey,
          opportunity.growthIntent,
        );
      }
    }
    const intents = [...clusterIntents.values()];

    expect(
      intents.filter((intent) => intent === 'discovery').length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      intents.filter((intent) => intent === 'conversion').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      intents.filter((intent) => intent === 'authority').length,
    ).toBeGreaterThanOrEqual(1);
    expect(postCount).toBe(baselinePostCount);
  });

  it('materializes a fourth grounded cluster when the calendar uses only three growth clusters', async () => {
    const { service, getLastPlanUpdate } = makeService(generatedPlan(), {
      usedOnlyThreeGrowthClusters: true,
    });

    await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    const persisted = getLastPlanUpdate()?.$set as unknown as {
      opportunities: ReturnType<typeof generatedPlan>['opportunities'];
      days: ReturnType<typeof generatedPlan>['days'];
    };
    const opportunities = new Map(
      persisted.opportunities.map((item) => [item.key, item]),
    );
    const clusterIntents = new Map<string, string>();
    for (const day of persisted.days) {
      for (const execution of day.executions) {
        if (execution.action !== 'post') continue;
        const opportunity = opportunities.get(execution.opportunityKey);
        if (!opportunity) continue;
        clusterIntents.set(
          opportunity.topicClusterKey,
          opportunity.growthIntent,
        );
      }
    }
    const intents = [...clusterIntents.values()];

    expect(clusterIntents.size).toBeGreaterThanOrEqual(4);
    expect(
      intents.filter((intent) => intent === 'discovery').length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      intents.filter((intent) => intent === 'conversion').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      intents.filter((intent) => intent === 'authority').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('passes sanitized whole-life routine and hobby signals into strategy evidence without exposing private health metrics', async () => {
    const { service, getStrategyCoreRequest } = makeService();
    await service.generate({ startDate: '2026-09-03', force: true });
    const request = getStrategyCoreRequest();
    const input = JSON.parse(request!.input) as {
      worldContext: {
        wholeLifeSignals: Array<{
          id: string;
          category: string;
          title: string;
          summary: string;
        }>;
      };
      hobbies: Array<{
        name: string;
        nextFocus?: string;
        weeklyMinutes: number;
      }>;
      personalOsSections: Array<{ source: string; totalItems: number }>;
      growthObjective: { targetFollowers: number; mode: string };
      planningCadence: { platforms: Record<string, { max: number }> };
    };
    expect(input.worldContext.wholeLifeSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'routine',
          title: 'Gym / strength routine',
        }),
        expect.objectContaining({
          category: 'hobby',
          title: 'Guitar practice',
        }),
      ]),
    );
    expect(input.worldContext.wholeLifeSignals[0].id).toMatch(/^E\d{3}$/);
    expect(JSON.stringify(input.worldContext.wholeLifeSignals)).not.toContain(
      'recoveryScore',
    );
    expect(JSON.stringify(input.worldContext.wholeLifeSignals)).not.toContain(
      'sleep',
    );
    expect(input.hobbies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Guitar',
          nextFocus: 'Clean chord transitions',
          weeklyMinutes: 45,
        }),
      ]),
    );
    expect(input.personalOsSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'task', totalItems: 3 }),
        expect.objectContaining({ source: 'journal', totalItems: 2 }),
        expect.objectContaining({ source: 'hobby', totalItems: 2 }),
      ]),
    );
    expect(input.growthObjective).toMatchObject({
      targetFollowers: 100000,
      mode: 'fastest_sustainable',
    });
    expect(input.planningCadence.platforms.whatsapp.max).toBe(3);
  });

  it('resolves short evidence aliases back to canonical HSAKAA evidence IDs', async () => {
    const { service, aiRequests } = makeService(generatedPlan(), {
      strategyCoreUsesEvidenceAliases: true,
    });
    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();
    const calendarRequest = aiRequests.find(
      (request) => request.name === 'hsakaa_media_presence_calendar_v3122',
    );
    const calendarInput = JSON.parse(calendarRequest!.input) as {
      strategyCore: { opportunities: Array<{ evidenceIds: string[] }> };
    };
    expect(calendarInput.strategyCore.opportunities[0].evidenceIds[0]).toBe(
      evidenceIds[0],
    );
    expect(
      calendarInput.strategyCore.opportunities[0].evidenceIds[0],
    ).not.toMatch(/^E\d{3}$/);
  });

  it('resolves calendar Story and Community evidence aliases before validation', async () => {
    const { service } = makeService(generatedPlan(), {
      calendarUsesEvidenceAliases: true,
    });
    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();
  });

  it('repairs an opportunity with missing evidence internally instead of failing the whole week', async () => {
    const { service, aiRequests } = makeService(generatedPlan(), {
      strategyCoreMissingEvidence: true,
    });
    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();
    const calendarRequest = aiRequests.find(
      (request) => request.name === 'hsakaa_media_presence_calendar_v3122',
    );
    const calendarInput = JSON.parse(calendarRequest!.input) as {
      strategyCore: {
        opportunities: Array<{ key: string; evidenceIds: string[] }>;
      };
    };
    const repaired = calendarInput.strategyCore.opportunities.find(
      (item) => item.key === 'opp_1',
    );
    expect(repaired?.evidenceIds).toContain(evidenceIds[0]);
  });

  it('passes launch calibration and historical anti-repetition memory to HSAKAA', async () => {
    const {
      service,
      launchService,
      contentIntelligenceService,
      getStrategyCoreRequest,
    } = makeService();
    await service.generate({ startDate: '2026-09-03', force: true });
    expect(launchService.planningContext).toHaveBeenCalled();
    expect(
      contentIntelligenceService.planningFingerprintContext,
    ).toHaveBeenCalledWith(160);
    const request = getStrategyCoreRequest();
    const input = JSON.parse(request!.input) as {
      learningStage: string;
      historicalMediaFingerprints: unknown[];
      launchCalibration: {
        experimentPolicy: { experimentSharePercent: number };
      };
    };
    expect(input.learningStage).toBe('days_1_30_exploration');
    expect(input.historicalMediaFingerprints).toHaveLength(1);
    expect(
      input.launchCalibration.experimentPolicy.experimentSharePercent,
    ).toBe(35);
  });

  it('self-heals fabricated evidence references instead of surfacing them to the plan', async () => {
    const plan = generatedPlan();
    plan.opportunities[0].evidenceIds = ['made_up_evidence'];
    const { service, aiRequests } = makeService(plan);
    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();
    const calendarRequest = aiRequests.find(
      (request) => request.name === 'hsakaa_media_presence_calendar_v3122',
    );
    const calendarInput = JSON.parse(calendarRequest!.input) as {
      strategyCore: {
        opportunities: Array<{ key: string; evidenceIds: string[] }>;
      };
    };
    const repaired = calendarInput.strategyCore.opportunities.find(
      (item) => item.key === 'opp_1',
    );
    expect(repaired?.evidenceIds).not.toContain('made_up_evidence');
    expect(repaired?.evidenceIds.length).toBeGreaterThan(0);
  });

  it('uses internal-safe evidence as reflection material without turning it into a company claim', async () => {
    const plan = generatedPlan();
    const reflectionId = 'internal_reflection_1';
    const firstPost = plan.days[1].executions.find(
      (item) => item.action === 'post',
    )!;
    const reflectedOpportunity = plan.opportunities.find(
      (item) => item.key === firstPost.opportunityKey,
    )!;
    reflectedOpportunity.evidenceIds = [
      ...reflectedOpportunity.evidenceIds,
      reflectionId,
    ];
    reflectedOpportunity.companyName = '';
    firstPost.evidenceIds = [reflectionId];
    firstPost.copyPasteText =
      'I keep noticing that the best workflow is usually the one that removes a decision instead of adding another screen.';
    firstPost.copyPasteCaption =
      'I keep noticing that the best workflow is usually the one that removes a decision instead of adding another screen.\n\nThat is a lesson I am carrying into my work this week.';

    const { service, presenceService, aiRequests } = makeService(plan);
    presenceService.directorContext.mockResolvedValue({
      presenceStrategy: { version: 1, sourceFingerprint: 'strategy-fp' },
      voiceProfile: { version: 1 },
      worldContext: {
        fingerprint: 'world-fp',
        privacyPolicy: {},
        publicSafe: evidenceIds.map((id, index) => ({
          id,
          title: `Evidence ${index + 1}`,
          summary: 'Real public-safe evidence',
        })),
        internalSafe: [
          {
            id: reflectionId,
            title: 'Internal builder note',
            summary: 'A private operating lesson that must be abstracted',
          },
        ],
      },
    });

    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();
    const dayPack = aiRequests.find((request) => {
      if (request.name !== 'hsakaa_media_presence_day_pack_v3125') return false;
      const input = JSON.parse(request.input) as { date: string };
      return input.date === plan.days[1].date;
    });
    const input = JSON.parse(dayPack!.input) as {
      reflectionEvidence: Array<{ id: string }>;
    };
    expect(input.reflectionEvidence.map((item) => item.id)).toContain(
      reflectionId,
    );
  });

  it('keeps a named company builder opportunity when only identity-safe plus internal reflection evidence exists', async () => {
    const plan = generatedPlan();
    const reflectionId = 'internal_8lete_builder_context';
    const targetDay = plan.days[1];
    const targetPost = targetDay.executions.find(
      (item) => item.action === 'post',
    )!;
    const targetOpportunity = plan.opportunities.find(
      (item) => item.key === targetPost.opportunityKey,
    )!;
    targetOpportunity.companyName = '8lete';
    targetOpportunity.evidenceIds = [reflectionId];
    targetOpportunity.thesis =
      'A first-person builder question from operating 8lete without publishing private company claims.';
    targetPost.evidenceIds = [reflectionId];

    const { service, presenceService, aiRequests } = makeService(plan);
    presenceService.directorContext.mockResolvedValue({
      presenceStrategy: { version: 1, sourceFingerprint: 'strategy-fp' },
      voiceProfile: { version: 1 },
      worldContext: {
        fingerprint: 'world-fp',
        privacyPolicy: {},
        companies: [
          {
            id: 'company-8lete',
            name: '8lete',
            roles: ['Co-Founder & CEO'],
            industries: ['grassroots sports technology'],
            products: [],
            markets: ['India'],
            currentFocus: 'academy operating systems',
            currentPriorities: ['make academy operations easier'],
            principles: ['operator-first'],
          },
        ],
        publicSafe: evidenceIds.map((id, index) => ({
          id,
          title: `Evidence ${index + 1}`,
          summary: 'Real public-safe evidence',
          kind: 'lesson',
          source: 'journal',
          significantChange: false,
        })),
        internalSafe: [
          {
            id: reflectionId,
            title: '8lete builder reflection',
            summary:
              'A private-safe operating question that may shape first-person content but must not be published as a factual company claim.',
            kind: 'builder_reflection',
            source: 'company',
            significantChange: false,
          },
        ],
        wholeLifeSignals: [],
        hobbies: [],
        personalOsSections: [],
        coverage: {
          capturedDays: 1,
          totalItems: 1,
          publicSafe: evidenceIds.length,
          internalSafe: 1,
          needsReview: 0,
          privateOnly: 0,
          sourceCounts: { company: 1 },
          missingSources: [],
        },
        hsakaa: {},
      },
    });

    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();

    const dayPack = aiRequests.find((request) => {
      if (request.name !== 'hsakaa_media_presence_day_pack_v3125') return false;
      const input = JSON.parse(request.input) as { date: string };
      return input.date === targetDay.date;
    });
    const input = JSON.parse(dayPack!.input) as {
      opportunities: Array<{ companyName?: string; evidenceIds: string[] }>;
      reflectionEvidence: Array<{ id: string }>;
      identityEvidence: Array<{ id: string; companyName?: string }>;
      companyStrategicContext: Array<{ name: string }>;
    };
    const companyOpportunity = input.opportunities.find(
      (item) =>
        item.companyName === '8lete' && item.evidenceIds.includes(reflectionId),
    );

    expect(companyOpportunity).toBeDefined();
    expect(companyOpportunity?.evidenceIds).toContain(reflectionId);
    expect(
      companyOpportunity?.evidenceIds.some((id) =>
        id.startsWith('identity:company:'),
      ),
    ).toBe(true);
    expect(input.reflectionEvidence.map((item) => item.id)).toContain(
      reflectionId,
    );
    expect(
      input.identityEvidence.some((item) => item.companyName === '8lete'),
    ).toBe(true);
    expect(input.companyStrategicContext.map((item) => item.name)).toContain(
      '8lete',
    );
  });

  it('auto-frames reflection-only X copy in first person instead of failing the week', async () => {
    const plan = generatedPlan();
    const reflectionId = 'internal_reflection_x_unframed';
    const day = plan.days[1];
    const xPost = day.executions.find(
      (item) => item.action === 'post' && item.platform === MediaPlatform.X,
    )!;
    const opportunity = plan.opportunities.find(
      (item) => item.key === xPost.opportunityKey,
    )!;
    opportunity.evidenceIds = [reflectionId];
    opportunity.companyName = '';
    xPost.evidenceIds = [reflectionId];
    xPost.publishCopy =
      'The best workflow removes a decision before it adds another layer of automation.';
    xPost.copyPasteText = xPost.publishCopy;
    xPost.copyPasteCaption =
      'The best workflow removes a decision before it adds another layer of automation.';
    xPost.caption = xPost.copyPasteCaption;
    xPost.hook = 'The best workflow removes a decision first';

    const { service, presenceService, getLastPlanUpdate } = makeService(plan);
    presenceService.directorContext.mockResolvedValue({
      presenceStrategy: { version: 1, sourceFingerprint: 'strategy-fp' },
      voiceProfile: { version: 1 },
      worldContext: {
        fingerprint: 'world-fp',
        privacyPolicy: {},
        publicSafe: evidenceIds.map((id, index) => ({
          id,
          title: `Evidence ${index + 1}`,
          summary: 'Real public-safe evidence',
        })),
        internalSafe: [
          {
            id: reflectionId,
            title: 'Internal workflow reflection',
            summary:
              'A private operating reflection that may only support first-person framing.',
          },
        ],
      },
    });

    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();

    const update = getLastPlanUpdate();
    expect(update?.$set?.days).toBeDefined();
    const repairedX = update!.$set!.days![1].executions.find(
      (item) => item.action === 'post' && item.platform === MediaPlatform.X,
    )!;
    expect(repairedX.copyPasteText).toMatch(
      /I've been thinking about this from my own experience/i,
    );
    expect(repairedX.copyPasteCaption).toMatch(
      /I've been thinking about this from my own experience/i,
    );
    expect(repairedX.hook).toMatch(/I've been thinking/i);
  });

  it('repairs an all-skip week locally without paying for another calendar generation', async () => {
    const { service, aiRequests, getLastPlanUpdate } = makeService(
      generatedPlan(),
      {
        firstBlueprintAllSkip: true,
      },
    );
    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });
    expect(result.days).toHaveLength(7);
    expect(
      aiRequests.some(
        (request) =>
          request.name === 'hsakaa_media_presence_calendar_repair_v3122',
      ),
    ).toBe(false);
    const savedDays = getLastPlanUpdate()?.$set?.days ?? [];
    expect(
      savedDays
        .flatMap((day) => day.executions)
        .some((item) => item.action === 'post'),
    ).toBe(true);
  });

  it('isolates placeholder copy instead of failing the paid weekly run', async () => {
    const plan = generatedPlan();
    const post = plan.days[0].executions.find(
      (item) => item.action === 'post',
    )!;
    const platform = post.platform;
    post.publishCopy = 'Write a post about building software for coaches';
    post.copyPasteText = post.publishCopy;
    post.copyPasteCaption = 'Caption idea for the same topic';
    const { service, getLastPlanUpdate } = makeService(plan);
    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();
    const saved = getLastPlanUpdate()!.$set!.days![0].executions.find(
      (item) => item.platform === platform,
    )!;
    expect(saved.action).toBe('skip');
  });

  it('isolates an incomplete AI image pack instead of failing the week', async () => {
    const plan = generatedPlan();
    const post = plan.days[0].executions.find(
      (item) => item.action === 'post',
    )!;
    const platform = post.platform;
    post.format = MediaPostType.IMAGE;
    post.imageBrief = {
      mode: 'ai_generation' as 'none',
      aspectRatio: '4:5',
      overlayText: 'Build for Monday morning',
      prompt: 'A coach with a phone',
      description: '',
      sourceGuidance: 'Generate from scratch',
    };
    const { service, getLastPlanUpdate } = makeService(plan);
    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();
    const saved = getLastPlanUpdate()!.$set!.days![0].executions.find(
      (item) => item.platform === platform,
    )!;
    expect(saved.action).toBe('skip');
  });

  it('isolates an incomplete carousel instead of failing the week', async () => {
    const plan = generatedPlan();
    const post = plan.days[1].executions.find(
      (item) => item.action === 'post',
    )!;
    const platform = post.platform;
    post.format = MediaPostType.CAROUSEL;
    post.carouselSlides = [
      {
        slideNumber: 1,
        headline: 'One slide is not a carousel',
        bodyCopy: 'It still needs a complete sequence.',
        visualType: 'text_only',
        imagePrompt: '',
        visualDescription:
          'Minimal text card with strong hierarchy and generous spacing.',
        overlayText: 'One slide',
      },
    ];
    const { service, getLastPlanUpdate } = makeService(plan);
    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();
    const saved = getLastPlanUpdate()!.$set!.days![1].executions.find(
      (item) => item.platform === platform,
    )!;
    expect(saved.action).toBe('skip');
  });

  it('isolates a video outline that cannot be repaired into a full script', async () => {
    const plan = generatedPlan();
    const post = plan.days[3].executions.find(
      (item) => item.action === 'post' && item.format === MediaPostType.REEL,
    )!;
    const platform = post.platform;
    post.videoPack = {
      fullScript: 'Hook, then explain the lesson, then CTA.',
      targetDurationSeconds: 45,
      deliveryInstructions: 'Calm and conversational.',
      cameraInstructions: 'Vertical medium shot at eye level.',
      punchIns: [],
      broll: [],
      onScreenText: [],
      musicDirection: 'Subtle instrumental under voice.',
      coverDirection: 'Close portrait with short title.',
    };
    const { service, getLastPlanUpdate } = makeService(plan);
    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();
    const saved = getLastPlanUpdate()!.$set!.days![2].executions.find(
      (item) => item.platform === platform,
    )!;
    expect(saved.action).toBe('skip');
  });

  it('isolates internal Media strategy leakage instead of failing the week', async () => {
    const plan = generatedPlan();
    const post = plan.days[3].executions.find(
      (item) => item.action === 'post',
    )!;
    const platform = post.platform;
    post.publishCopy =
      'Early signals are samples, so my first few posts are really an algorithm strategy experiment.';
    post.copyPasteText = post.publishCopy;
    post.copyPasteCaption = post.publishCopy;
    const { service, getLastPlanUpdate } = makeService(plan);
    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();
    const saved = getLastPlanUpdate()!.$set!.days![3].executions.find(
      (item) => item.platform === platform,
    )!;
    expect(saved.action).toBe('skip');
  });

  it('splits the weekly blueprint and retries a bounded stage when it hits max_output_tokens', async () => {
    const { service, aiRequests } = makeService(generatedPlan(), {
      failFirstCalendarWithTokenLimit: true,
    });
    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });
    expect(result.days).toHaveLength(7);
    expect(
      aiRequests.some(
        (request) =>
          request.name ===
          'hsakaa_media_presence_calendar_v3122_token_fallback',
      ),
    ).toBe(true);
    expect(
      Math.max(...aiRequests.map((request) => request.maxOutputTokens)),
    ).toBeLessThanOrEqual(12000);
  });

  it('falls back to one-post structured calls when a daily pack hits max_output_tokens', async () => {
    const { service, aiRequests } = makeService(generatedPlan(), {
      failFirstDayPackWithTokenLimit: true,
    });
    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });
    expect(result.days).toHaveLength(7);
    expect(
      aiRequests.some(
        (request) => request.name === 'hsakaa_media_presence_single_post_v3125',
      ),
    ).toBe(true);
    expect(
      Math.max(...aiRequests.map((request) => request.maxOutputTokens)),
    ).toBeLessThanOrEqual(12000);
  });

  it('derives a missing WhatsApp copyPasteCaption from the final WhatsApp sequence without failing', async () => {
    const plan = generatedPlan();
    const whatsapp = plan.days[0].executions.find(
      (item) =>
        item.action === 'post' && item.platform === MediaPlatform.WHATSAPP,
    )!;
    const expected = whatsapp.whatsappSequence[0];
    whatsapp.copyPasteCaption = '';
    whatsapp.caption = '';
    const { service, getLastPlanUpdate } = makeService(plan);

    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();

    const saved = getLastPlanUpdate()!.$set!.days![0].executions.find(
      (item) => item.platform === MediaPlatform.WHATSAPP,
    )!;
    expect(saved.action).toBe('post');
    expect(saved.copyPasteCaption).toContain(expected);
  });

  it('repairs a one-narrative strategy locally without paying for another strategy generation', async () => {
    const { service, aiRequests } = makeService(generatedPlan(), {
      firstStrategyIdentityImbalanced: true,
    });

    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    expect(result.days).toHaveLength(7);
    expect(
      aiRequests.some(
        (request) =>
          request.name === 'hsakaa_media_presence_strategy_core_repair_v3122',
      ),
    ).toBe(false);
  });

  it('repairs combined cadence, growth, story and narrative drift in one paid run', async () => {
    const { service, aiRequests } = makeService(generatedPlan(), {
      firstStrategyIdentityImbalanced: true,
      missingGrowthPortfolio: true,
      severelyUnderProduceShortForm: true,
      skipInstagramStories: true,
      underProduceLongForm: true,
      underProduceX: true,
    });

    const result = await service.generate({
      startDate: '2026-09-03',
      force: true,
    });

    expect(result.days).toHaveLength(7);
    expect(
      aiRequests.some((request) =>
        [
          'hsakaa_media_presence_strategy_core_repair_v3122',
          'hsakaa_media_presence_calendar_repair_v3122',
        ].includes(request.name),
      ),
    ).toBe(false);
  });

  it('uses one canonical publishCopy and derives legacy text/caption fields without asking AI for duplicates', async () => {
    const plan = generatedPlan();
    const post = plan.days[0].executions.find(
      (item) => item.action === 'post',
    )!;
    const platform = post.platform;
    post.publishCopy =
      'This is the one final platform-native copy HSAKAA should generate and publish.';
    (post as unknown as Record<string, unknown>).copyPasteText = undefined;
    (post as unknown as Record<string, unknown>).copyPasteCaption = undefined;
    (post as unknown as Record<string, unknown>).caption = undefined;

    const { service, getLastPlanUpdate, aiRequests } = makeService(plan);
    await expect(
      service.generate({ startDate: '2026-09-03', force: true }),
    ).resolves.toBeDefined();

    const saved = getLastPlanUpdate()!.$set!.days![0].executions.find(
      (item) => item.platform === platform,
    )!;
    expect(saved.publishCopy).toBe(post.publishCopy);
    expect(saved.copyPasteText).toBe(post.publishCopy);
    expect(saved.copyPasteCaption).toBe(post.publishCopy);
    const dayPackRequest = aiRequests.find((request) =>
      request.name.startsWith('hsakaa_media_presence_day_pack'),
    );
    expect(dayPackRequest).toBeDefined();
  });

  it('keeps the 7-Day Plan on today plus the next six days while Today uses the same plan day', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-07T06:00:00.000Z'));
    try {
      const { service } = makeService();
      const overview = await service.overview();

      expect(overview.rolling.startDate).toBe('2026-09-07');
      expect(overview.rolling.endDate).toBe('2026-09-13');
      expect(overview.rolling.expectedDates).toEqual([
        '2026-09-07',
        '2026-09-08',
        '2026-09-09',
        '2026-09-10',
        '2026-09-11',
        '2026-09-12',
        '2026-09-13',
      ]);
      expect(overview.policy.rollingWindow.todayPlusFutureDays).toBe(7);
    } finally {
      jest.useRealTimers();
    }
  });

  it('preserves every existing Media day when filling only missing rolling-window dates', () => {
    const { service } = makeService();
    const base = generatedPlan();
    const missingDate = '2026-09-13';
    const originalExistingDays = base.days
      .slice(0, 6)
      .map((day) => ({ ...day }));
    base.days = base.days.slice(0, 6);

    const candidate = generatedPlan();
    candidate.days = candidate.days
      .filter((day) => day.date === missingDate)
      .map((day) => ({ ...day, theme: 'Only the missing day was generated' }));

    const merged = (
      service as unknown as {
        mergeMissingGeneratedDays: (
          basePlan: ReturnType<typeof generatedPlan>,
          candidatePlan: ReturnType<typeof generatedPlan>,
          startDate: string,
          endDate: string,
          generatedDateSet: Set<string>,
        ) => ReturnType<typeof generatedPlan>;
      }
    ).mergeMissingGeneratedDays(
      base,
      candidate,
      '2026-09-07',
      '2026-09-13',
      new Set([missingDate]),
    );

    expect(merged.days.slice(0, 6)).toEqual(originalExistingDays);
    expect(merged.days[6].date).toBe(missingDate);
    expect(merged.days[6].theme).toBe('Only the missing day was generated');
  });

  it('allows the daily roll to maintain the future horizon when a new weekly outing context is still unknown', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-14T06:00:00.000Z'));
    try {
      const { service, planModel, presenceService } = makeService();
      const base = generatedPlan();
      base.startDate = '2026-09-13';
      base.endDate = '2026-09-19';
      base.days = base.days.map((day, index) => ({
        ...day,
        date: `2026-09-${String(13 + index).padStart(2, '0')}`,
      }));
      const stored = {
        ...base,
        key: '2026-09-13:4:1:weekly:phase:v3.16.4',
        weekContext: {
          outingStatus: 'yes' as const,
          outingDetails: '',
          weekKey: '2026-09-07',
          capturedAt: new Date('2026-09-07T00:00:00.000Z'),
        },
      };
      planModel.findOne.mockImplementation(() => ({
        sort: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(stored) })),
      }));
      presenceService.overview.mockResolvedValue({
        strategy: { version: 4 },
        voice: {},
      });

      const overview = await service.overview();
      expect(overview.rolling.needsWeeklyContext).toBe(true);
      expect(overview.rolling.canAutoRoll).toBe(true);
      expect(overview.rolling.missingDates).toEqual(['2026-09-20']);

      const singleDay = jest
        .spyOn(service as never, 'generateSingleDayIntoRollingPlan' as never)
        .mockResolvedValue(stored as never);
      await service.rollForward({ mode: 'roll' });
      expect(singleDay).toHaveBeenCalledWith(
        stored,
        '2026-09-20',
        expect.objectContaining({
          mode: 'roll',
          targetDate: '2026-09-20',
          outingStatus: 'unknown',
        }),
        undefined,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not re-check preserved rolling days against their own historical fingerprints', () => {
    const { service } = makeService();
    const plan = generatedPlan();
    for (const day of plan.days) {
      if (day.instagramStory.action === 'post')
        day.instagramStory.time = '08:30';
      day.youtubeCommunity.action = 'skip';
      day.youtubeCommunity.time = '';
      day.youtubeCommunity.publishCopy = '';
      day.youtubeCommunity.executionReady = false;
    }
    const preservedDay = plan.days[0];
    const preservedPost = preservedDay.executions.find(
      (item) => item.action === 'post',
    )!;
    const preservedText = preservedPost.publishCopy;
    const lexicalSignature = [
      ...new Set(
        preservedText
          .toLowerCase()
          .match(/[a-z0-9]+/g)
          ?.filter((token) => token.length > 2) ?? [],
      ),
    ];
    const historical = [
      {
        _id: `planned:test:${preservedDay.date}:${preservedPost.platform}`,
        lexicalSignature,
        normalizedText: preservedText,
      },
    ];
    const internal = service as unknown as {
      assertPlan: (
        candidate: typeof plan,
        startDate: string,
        endDate: string,
        publicEvidenceIds: string[],
        reflectionEvidenceIds: string[],
        identityEvidenceIds: string[],
        historicalFingerprints: typeof historical,
        options?: { historicalNoveltyDates?: Set<string> },
      ) => void;
    };

    expect(() =>
      internal.assertPlan(
        plan,
        plan.startDate,
        plan.endDate,
        evidenceIds,
        [],
        [],
        historical,
      ),
    ).toThrow(/too close to historical Media memory/);

    expect(() =>
      internal.assertPlan(
        plan,
        plan.startDate,
        plan.endDate,
        evidenceIds,
        [],
        [],
        historical,
        { historicalNoveltyDates: new Set([plan.days[6].date]) },
      ),
    ).not.toThrow();
  });

  it('does not resurrect stale evidence from preserved days after rolling repair', () => {
    const { service } = makeService();
    const base = generatedPlan();
    const staleEvidenceId = 'task:6a9c8fbb8a30bcc2e5f40d10:task_activity';
    const staleOpportunity = base.opportunities.find(
      (item) => item.key === 'opp_1',
    )!;
    staleOpportunity.evidenceIds = [staleEvidenceId];
    for (const day of base.days) {
      for (const item of day.executions) {
        if (item.opportunityKey === 'opp_1') {
          item.evidenceIds = [staleEvidenceId];
        }
      }
    }

    const repairedSkeleton = generatedBlueprint(base);
    const repairedOpportunity = repairedSkeleton.opportunities.find(
      (item) => item.key === 'opp_1',
    )!;
    repairedOpportunity.evidenceIds = [];
    repairedOpportunity.privacy = 'needs_review';
    repairedOpportunity.usable = false;
    for (const day of repairedSkeleton.days) {
      for (const item of day.executions) {
        if (item.opportunityKey !== 'opp_1') continue;
        item.action = 'skip';
        item.time = '';
        item.opportunityKey = '';
        item.storyArcKey = '';
        item.reason = 'Stale evidence isolated by rolling repair.';
      }
    }

    const targetDate = '2026-09-12';
    const generatedDay = base.days.find((day) => day.date === targetDate)!;
    const internal = service as unknown as {
      mergeRollingGeneratedPlan: (
        basePlan: typeof base,
        skeleton: typeof repairedSkeleton,
        day: typeof generatedDay,
        startDate: string,
        endDate: string,
        targetDate: string,
      ) => typeof base;
    };
    const merged = internal.mergeRollingGeneratedPlan(
      base,
      repairedSkeleton,
      generatedDay,
      '2026-09-07',
      '2026-09-13',
      targetDate,
    );

    expect(
      merged.opportunities.find((item) => item.key === 'opp_1'),
    ).toMatchObject({
      evidenceIds: [],
      privacy: 'needs_review',
      usable: false,
    });
    expect(
      merged.days
        .filter((day) => day.date !== targetDate)
        .flatMap((day) => day.executions)
        .some(
          (item) => item.action === 'post' && item.opportunityKey === 'opp_1',
        ),
    ).toBe(false);
  });

  it('requires strategy and voice before planning', async () => {
    const { service, presenceService } = makeService();
    presenceService.directorContext = jest.fn().mockResolvedValue({
      presenceStrategy: null,
      voiceProfile: null,
      worldContext: {},
    });
    await expect(service.generate({ force: true })).rejects.toThrow(
      'Build the Media Presence Strategy',
    );
  });
});
