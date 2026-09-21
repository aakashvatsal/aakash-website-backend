export const MEDIA_STORYTELLING_VERSION = 'v4.3-actual-life-growth';

export const MEDIA_CURRENT_GROWTH_SEASON = {
  key: 'growth-season-2026-09-21',
  startsOn: '2026-09-21',
  reviewOn: '2027-03-21',
  durationMonths: 6,
  language: 'English',
  pursuits: [
    {
      key: 'reading',
      label: 'Reading',
      cadence: 'daily',
      role: 'anchor',
      tracking: [
        'book/title',
        'reading progress',
        'time/pages when available',
        'highlights or disagreements',
        'finished/paused/abandoned state',
        'ideas actually applied',
      ],
    },
    {
      key: 'spanish',
      label: 'Spanish',
      cadence: 'ongoing',
      role: 'skill',
      tracking: [
        'practice sessions',
        'vocabulary/listening/speaking checkpoints',
        'pronunciation attempts',
        'mistakes',
        'first real conversations',
      ],
    },
    {
      key: 'guitar',
      label: 'Guitar',
      cadence: 'ongoing',
      role: 'creative_skill',
      tracking: [
        'practice sessions',
        'chords/transitions',
        'songs',
        'failed attempts',
        'before/after recordings',
      ],
    },
    {
      key: 'voice',
      label: 'Voice improvement',
      cadence: 'ongoing',
      role: 'communication_skill',
      tracking: [
        'breath work',
        'lip trills',
        'projection/pitch/speech practice',
        'before/after recordings',
        'awkward/funny practice moments',
      ],
    },
    {
      key: 'chess',
      label: 'Chess',
      cadence: 'ongoing',
      role: 'thinking_skill',
      tracking: [
        'games/puzzles',
        'rating when available',
        'wins/losses/blunders',
        'recurring mistakes',
        'milestone games',
      ],
    },
  ],
  seasonReview: {
    actions: ['KEEP', 'GRADUATE', 'PAUSE', 'REPLACE'],
    rule: 'Reading stays the daily anchor unless Aakash explicitly changes it. Review the other pursuits at the six-month boundary and rotate only when the evidence, enjoyment, available time and diversity justify it.',
  },
  travel: {
    cadenceMonths: 6,
    goal: 'Plan one meaningful trip to a different destination every six months.',
    narrativeStages: [
      'why this destination',
      'research and budgeting',
      'planning and preparation',
      'anticipation',
      'journey',
      'surprises and people',
      'what contradicted expectations',
      'reflection and what came home with Aakash',
    ],
    constraints: [
      'Do not invent booked travel, dates, visas, tickets, meetings or outcomes.',
      'Treat planning itself as a legitimate story stage.',
      'Prefer destinations that are meaningfully different from the previous trip.',
    ],
  },
} as const;

export const MEDIA_HEALTH_CONTENT_POLICY = {
  purpose:
    'Use Health OS as a source of movement, routine, struggle, consistency, recovery and visible personal-growth stories when that materially improves reach, watch time, engagement or familiarity.',
  allowedByDefault: [
    'source-grounded gym/training sessions and exercise context',
    'source-grounded walks, runs and ordinary movement routines',
    'routine consistency, missed/returned sessions and honest attempts when explicitly supported',
    'fitness environments, preparation, post-session reactions and non-sensitive progress checkpoints',
    'conditional capture ideas for future planned gym/walk/run sessions without claiming completion',
  ],
  requiresExplicitApproval: [
    'weight, body-fat, measurements or physique numbers',
    'WHOOP/recovery/sleep/HRV/strain or other biometric scores',
    'pain, injury, diagnoses, symptoms or medical history',
    'medications, supplement doses, treatment plans or clinical instructions',
    'lab values, medical reports, intimate-care details or clinician communications',
    'before/after health claims or claims of medical/physical improvement',
  ],
  storytellingRules: [
    'Fitness content should primarily show Aakash living the process, not position him as a fitness coach.',
    'Prefer visible action: leaving for a walk, starting a set, recovering between sets, the end of a session, weather/context, or a genuine post-workout reaction.',
    'A gym or walk moment does not need a productivity/business lesson. The human moment can be the whole story.',
    'When Pixel, Cosmo or Happy naturally joins a walk or home routine, the dog may become a warm supporting character; never assume a dog was present.',
    'Do not publish generic workout tips, medical advice or prescriptive health guidance from Aakash unless the source explicitly supports that role.',
    'Do not expose exact routes, home-location clues or other unnecessarily precise location information.',
  ],
} as const;

export const MEDIA_RECURRING_CAST = {
  dogs: [
    { key: 'pixel', name: 'Pixel', breed: 'Beagle' },
    { key: 'cosmo', name: 'Cosmo', breed: 'Golden Retriever' },
    { key: 'happy', name: 'Happy', breed: 'Labrador' },
  ],
  rule: 'Pixel, Cosmo and Happy are real recurring parts of Aakash’s life. Use them only when they naturally improve a real scene, pattern interrupt, warmth, humour or continuity. Never invent an action/reaction, force a dog into an unrelated technical idea, or turn the account into a pet-content account.',
} as const;

export const MEDIA_WEEKLY_HUMANITY_CONTRACT = {
  purpose:
    'Ensure the seven-day plan contains enough lived Aakash, not only intelligent analysis of products and systems.',
  whenGroundedEvidenceExists: {
    minimumActualLifeFeedClusters: 2,
    minimumActualLifeInstagramFeedClusters: 1,
    minimumWholeLifeStoryDays: 3,
  },
  actualLifeCategories: ['routine', 'hobby', 'learning', 'human'],
  preferredActualLifeNarratives: [
    'learning_experiments',
    'building_aakash',
    'human_personality',
  ],
  rules: [
    'Actual-life means a real or conditionally captured activity, attempt, routine, hobby, reading/learning moment, walk, gym/training moment, travel preparation, home-life moment or genuine reaction.',
    'Professional work may still dominate LinkedIn, but if strong whole-life evidence exists it must not crowd human life out of Instagram for the entire week.',
    'Do not manufacture life events to satisfy the floor. If evidence is absent, keep the plan truthful and record the gap rather than inventing a scene.',
    'A dog cameo counts as warmth inside an existing real scene, not as a separate actual-life event unless a source-grounded dog moment exists.',
  ],
} as const;

export const MEDIA_STORY_SELECTION_DIMENSIONS = [
  'strangerCuriosity',
  'firstSecondsStrength',
  'narrativeTension',
  'humanityAndEmotion',
  'visualAction',
  'platformFit',
  'shareOrConversationPotential',
  'returnValue',
  'evidenceStrength',
] as const;

export const MEDIA_STORY_EVENT_TYPES = [
  'WIN',
  'FAILURE',
  'SETBACK',
  'ATTEMPT',
  'SURPRISE',
  'CHANGE_OF_MIND',
  'MISTAKE',
  'BREAKTHROUGH',
  'FIRST_TIME',
  'MILESTONE',
  'FUNNY_MOMENT',
  'UNCERTAINTY',
] as const;

export const MEDIA_PLATFORM_NATIVE_RULES = {
  instagram: {
    job: 'Make people feel they know Aakash, while still giving strong discovery hooks.',
    prefer: [
      'visual progress',
      'human situations',
      'behind-the-scenes reality',
      'hobbies and travel',
      'short story-led Reels with a visible event in the opening seconds',
      'selective concise carousels only when the idea is naturally visual',
      'warm recurring-life moments that encourage shares, replies or return viewing',
    ],
    avoid: [
      'LinkedIn essay pasted into a Reel',
      'generic motivational lessons',
      'every video being seated talking-head content',
      'dense system diagrams or product architecture when a human scene can carry the idea',
    ],
  },
  linkedin: {
    job: 'Build professional authority through lived builder/operator experience.',
    prefer: [
      'real decisions',
      'trade-offs',
      'mistakes',
      'changed assumptions',
      'company-building observations',
      'clear professional implications earned by the story',
      'context that makes the insight useful even to professionals outside Aakash’s immediate network',
    ],
    avoid: [
      'generic product-management education',
      'manufactured vulnerability',
      'copied Instagram captions',
    ],
  },
  youtube: {
    job: 'Maximise discovery, retention and long-term story investment.',
    prefer: [
      'strong first-seconds promise and a thumbnail/title premise understandable to a stranger',
      'tension, scene changes and progression',
      'documentary arcs',
      'before/after evidence',
      'six-month transformations',
      'Shorts that earn the next second and long-form that resolves deeper arcs',
    ],
    avoid: [
      'long setup before the premise',
      'outline-only scripts',
      'duplicating a Short as a Community post',
      'long-form videos whose only event is that an intended action has not happened yet',
    ],
  },
  x: {
    job: 'Be Aakash thinking in public in a concise, sharp and conversational way.',
    prefer: [
      'observations',
      'unfinished thoughts',
      'builder moments',
      'concise humour',
      'questions',
      'threads only when context genuinely needs multiple posts',
    ],
    avoid: [
      'LinkedIn copy pasted into X',
      'threading a thought that fits one post',
    ],
  },
  whatsapp: {
    job: 'Create intimacy with people who already know Aakash.',
    prefer: [
      'candid moments',
      'tiny updates',
      'reading or practice moments',
      'travel/airport moments',
      'occasional company milestones',
      'minimal explanation',
    ],
    avoid: ['broadcast-style essays', 'high-frequency promotional posting'],
  },
} as const;

export const MEDIA_SHOOTING_LIBRARY = [
  'walking_talk',
  'activity_first',
  'follow_me',
  'pov',
  'voiceover_documentary',
  'static_environmental',
  'moving_broll_narration',
  'off_camera_conversation',
  'before_after',
  'screen_plus_human',
] as const;

export function mediaStorytellingPromptPolicy() {
  return [
    `STORY ENGINE ${MEDIA_STORYTELLING_VERSION}: do not plan isolated posts. Treat Aakash's public presence as an ongoing story whose chapters are his real building, learning, attempts, failures, successes, uncertainty, travel and changing views.`,
    'NARRATIVE GOAL: make people root for Aakash, not admire a manufactured perfect version of him. The public character is a thoughtful builder who repeatedly becomes a beginner, documents the process and stays useful without turning every moment into a lesson.',
    'STORY FIRST: before selecting a format, identify the real event, current tension, what the audience already knows, what is new now, what remains unresolved and what the next believable chapter could be. A post should advance a story, begin a new grounded story, or deliberately provide lightweight human presence.',
    `REAL EVENT CLASSIFICATION: when supported by evidence, classify moments mentally using ${MEDIA_STORY_EVENT_TYPES.join(', ')}. Never fabricate any of them. Never invent conflict, customer events, financial loss, emotional events, relationship details, health outcomes, milestones, travel events or conversations.`,
    'NARRATIVE DEBT: it is healthy to leave a genuine question unresolved and return to it later. Do not force a complete moral or business lesson into every post. A small failure may simply end with trying again tomorrow.',
    'AUDIENCE MEMORY: do not repeatedly re-introduce facts the audience has already been told. Use historical fingerprints, currentRollingWindow and archived plan memory to infer what has already been established. Advance the chapter instead of saying “I recently started…” every week.',
    'STORY FRAMEWORK ROTATION: vary structures across open-loop, expectation→attempt→failure→reaction→next attempt, transformation, in-medias-res, contradiction, observation, tiny human moment and documentary progression. Do not default every asset to Hook→Problem→Lesson→CTA.',
    'ONE TRUTH, NATIVE TREATMENTS: derivatives may share one grounded event but each platform must have a distinct audience job, opening, pacing, depth and payoff. Never merely resize or lightly rewrite the same post across platforms.',
    'ENGLISH ONLY: all publishable scripts, spoken dialogue, captions, overlays, carousel copy, titles, descriptions, X posts, WhatsApp copy and calls-to-action must be English. A non-English word may appear only when the subject itself requires it, for example a Spanish-learning example. Do not generate Hindi or Hinglish unless the per-asset input explicitly overrides this rule.',
    'SHOOTING DIVERSITY: video must not default to Aakash seated at a desk. Rotate walking talk, activity-first, follow-me, POV, voice-over documentary, static environmental, moving B-roll narration, off-camera conversation, before/after and screen-plus-human. Across a rolling seven days, no more than two feed videos should use seated desk talking-head as the primary setup.',
    'ACTIVITY-FIRST OPENINGS: whenever the subject is guitar, voice, chess, reading, Spanish, fitness, travel or hands-on building, strongly prefer opening inside the activity before Aakash explains it. Show the evidence/problem/progress first when visually possible.',
    'VIDEO PRODUCTION: cameraInstructions and broll must tell Aakash exactly how to shoot: location/context, first frame, camera position or movement, key shots, whether audio is live or voice-over, and how to avoid a repetitive talking-head result. Use punchIns/onScreenText to protect pace, not to decorate every second.',
    'SHORT VIDEO RETENTION: earn the next second. Enter the scene quickly, establish tension/context fast, develop the event and deliver a payoff or honest unresolved ending. Do not waste the opening announcing the topic.',
    'LONG-FORM YOUTUBE: favour meaningful transformations, company-building stories, experiments and six-month arcs. Full scripts must contain scenes/progression rather than becoming a long lecture. Distinguish the duration of the real activity from the duration of the published video: a 30-minute practice session may become a 3-minute video. Never word a title as if the viewer will watch the full activity duration unless that is actually the published runtime.',
    'STORY SELECTION GATE: truth/evidence is mandatory but does not make a story interesting. Before choosing a major feed slot, rank grounded candidates mentally on stranger curiosity, first-seconds strength, narrative tension, humanity/emotion, visual action, platform fit, share/conversation potential and reason-to-return. Evidence strength is a gate and tie-breaker, not the public premise.',
    'STRANGER TEST: prefer stories whose premise makes sense before the viewer knows Aakash, 8lete, Frayto or HSAKAA. When a niche company event is strong, package the universal tension first and reveal the company as the real case study. Avoid titles/hooks that require internal product context to understand.',
    'ENTERTAINMENT + WARMTH: useful does not have to mean instructional. Preserve awkwardness, humour, contradiction, surprise, frustration, dogs interrupting a moment, visible attempts and small reactions when real. Do not make Aakash sound like a compliance reviewer of his own life.',
    'PROOF LANGUAGE STAYS INTERNAL: maintain factual discipline in reasoning, but do not repeatedly publish phrases such as “this is evidence, not progress”, “one data point does not establish improvement” or long disclaimers unless the distinction is genuinely central to the story. Translate safeguards into natural human English. One concise caveat is enough when needed.',
    'RECURRING DOG CAST: Aakash has Pixel (Beagle), Cosmo (Golden Retriever) and Happy (Labrador). Actively consider them when selecting or directing real home, walk, hobby and routine scenes because a genuine dog interruption, entrance, companionship beat or reaction can create warmth and a stronger opening. Never invent their behaviour or claim they were present. If suggesting a future capture, make it conditional on the dog naturally being there. Dogs should humanise Aakash, not become unrelated clickbait.',
    'HEALTH AS STORY MATERIAL: Health OS may contribute source-grounded gym, training, walk, run and ordinary movement context when it creates stronger visual action, humanity, tension, routine or continuity. When such evidence exists, rank at least one routine candidate against the week’s strongest professional ideas instead of relegating all fitness context to background. Fitness is part of Building Aakash, not a separate fitness-influencer identity.',
    'HEALTH PRIVACY GATE: routine fitness context may be used under storytellingPolicy.healthContentPolicy.allowedByDefault. Anything listed in requiresExplicitApproval must not be surfaced publicly merely because it exists in Health OS. Never infer a diagnosis, injury, treatment result, body change, biometric improvement or medical explanation.',
    'FITNESS STORYTELLING: favour lived scenes over advice: getting out the door, the first/last set, an interrupted walk, weather, a consistency gap, returning after a miss, a genuine post-session reaction, or visible progression when evidence supports it. Do not force every gym/walk moment into discipline, productivity or startup metaphors.',
    'LONG-FORM VIABILITY: a long YouTube video needs enough real scenes, progression, stakes/questions and payoff to sustain attention. A plan, absence of action or unresolved idea alone usually belongs in a Short/Story, not 5-10 minutes. Prefer actual attempt -> complication -> learning/change -> next question. Package specialist company material around a broader problem a stranger can understand.',
    'PACING: cut repeated caveats, definitions and throat-clearing. For short video, create a meaningful change, reveal, reaction, visual beat or question every few seconds. For long-form, use chapter-level progression and scene variation rather than an uninterrupted explanation.',
    'SUCCESS + FAILURE BALANCE: show both when evidence exists. Do not over-index on wins, and do not manufacture vulnerability. A failed attempt, changed mind or uncertainty can be more valuable than a polished lesson.',
    'WEEKLY ACTUAL-LIFE CHECK: when grounded routine/hobby/learning/human evidence exists, the final seven-day plan must contain enough actual life to feel inhabited. Aim for at least two distinct actual-life feed clusters, at least one on Instagram, and at least three Story days grounded in whole-life signals. Do not satisfy this with another HSAKAA/health-privacy analysis; the content must show Aakash actually doing, attempting, moving, reading, practising, walking, training, travelling/preparing, reacting or living.',
  ].join('\n');
}
