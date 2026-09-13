import { HsakaaMode } from './dto/ask-hsakaa.dto';

export type PublicHsakaaScope =
  'personal' | 'health' | 'media' | 'out_of_scope';

export interface PublicHsakaaScopeDecision {
  scope: PublicHsakaaScope;
  allowed: boolean;
  answer?: string;
}

const HEALTH_PATTERN =
  /\b(health|whoop|workout|gym|exercise|sleep|recovery|strain|hrv|heart rate|resting heart|weight|weigh|weighs|height|tall|body fat|diet|nutrition|calorie|protein|supplement|creatine|vitamin|medical|medicine|doctor|injury|knee|skin|skincare|hair|haircare|beard|vo2|max|steps)\b/i;
const MEDIA_PATTERN =
  /\b(media|social media|instagram|youtube|linkedin|twitter|x account|followers?|reels?|shorts?|posts?|caption|hashtag|content strategy|content calendar|engagement|reach|impressions|analytics|thumbnail)\b/i;

// Named entities that are inherently about Aakash and are safe to use as a
// public-personal anchor. Health and media still win above this check.
const AAKASH_ENTITY_PATTERN =
  /\b(aakash(?:\s+vatsal)?|vatsal|hsakaa|8lete|frayto|traydo|cosmo)\b/i;

// Public HSAKAA can answer questions phrased directly at Aakash/the twin when
// they ask about his own state, history, preferences or views. It must not
// treat a generic request containing "you" ("can you explain...") as personal.
const DIRECT_PERSONAL_PATTERN =
  /\b(?:what|which|where|when|why|how|who)\s+(?:do|did|does|are|were|have|has|would|will)\s+you\b|\b(?:what|which)\s+(?:is|are|was|were)\s+your\b|\b(?:your)\s+(?:work|career|company|companies|startup|startups|childhood|school|college|education|family|relationship|relationships|belief|beliefs|opinion|opinions|decision|decisions|goal|goals|preference|preferences|hobby|hobbies|reading|journal|memory|memories|routine|routines|principle|principles|interest|interests|learning|language|languages|dog|books?)\b/i;
const WH_SECOND_PERSON_PATTERN =
  /^(?:what|which|where|when|why|how|who)\b.*\b(?:you|your|yours)\b/i;
const GENERAL_TASK_PATTERN =
  /\b(explain|write|create|generate|solve|calculate|translate|summarize|recommend|plan|find|search|look up|teach)\b/i;

const THIRD_PERSONAL_PATTERN = /\b(?:he|him|his)\b/i;

const PERSONAL_TOPIC_PATTERN =
  /\b(founder|company|companies|startup|startups|career|childhood|school|college|education|family|relationship|relationships|dating|single|married|friend|friends|belief|beliefs|opinion|opinions|thinking|decision|decisions|lesson|lessons|goal|goals|preference|preferences|likes|dislikes|hobby|hobbies|reading|journal|memory|memories|routine|routines|principle|principles|interest|interests|learning|language|languages|guitar|singing|japanese|spanish|urdu|dog|mumbai|kandivali|books?)\b/i;

// Only unmistakable conversational continuations are inherited. A short
// unrelated question must never become personal just because a prior message
// was about Aakash.
const FOLLOW_UP_PATTERN =
  /^(?:why|why is that|how so|tell me more|what else|and then|then what|what happened next|really|go on|continue)[?.!]*$/i;
const PRONOUN_FOLLOW_UP_PATTERN =
  /^(?:(?:does|did|is|was|has|had|can|could|would|will)\s+he\b|(?:what|why|how|when|where|which)\s+(?:did|does|is|was|has|had|can|could|would|will)\s+he\b)/i;

const MODE_QUERY_PATTERNS: Partial<Record<HsakaaMode, RegExp>> = {
  [HsakaaMode.COMPANIES]:
    /\b(company|companies|startup|startups|8lete|frayto|traydo|founder|building|business)\b/i,
  [HsakaaMode.JOURNAL]:
    /\b(journal|entry|entries|wrote|writing|reflection|reflections|thought|thoughts)\b/i,
  [HsakaaMode.LIBRARY]:
    /\b(library|book|books|reading|read|highlight|highlights|author|authors)\b/i,
  [HsakaaMode.MEMORY]:
    /\b(memory|memories|remember|remembered|recall|fact|facts|preference|preferences|goal|goals|lesson|lessons)\b/i,
};

function isPersonalModeQuery(mode: HsakaaMode, text: string) {
  return MODE_QUERY_PATTERNS[mode]?.test(text) ?? false;
}

export function evaluatePublicHsakaaScope(
  mode: HsakaaMode,
  message: string,
  hasPriorConversation = false,
): PublicHsakaaScopeDecision {
  const text = message.trim();

  if (mode === HsakaaMode.HEALTH || HEALTH_PATTERN.test(text)) {
    return {
      scope: 'health',
      allowed: false,
      answer:
        'I keep that part private. You can ask me about my work, books, memories, decisions or how I think though.',
    };
  }

  if (mode === HsakaaMode.MEDIA || MEDIA_PATTERN.test(text)) {
    return {
      scope: 'media',
      allowed: false,
      answer:
        'I keep that side private too. Ask me about my work, companies, books, memories or how I think instead.',
    };
  }

  const hasAakashEntity = AAKASH_ENTITY_PATTERN.test(text);
  const isDirectPersonalQuestion = DIRECT_PERSONAL_PATTERN.test(text);
  const hasThirdPersonReference = THIRD_PERSONAL_PATTERN.test(text);
  const hasPersonalTopic = PERSONAL_TOPIC_PATTERN.test(text);
  const isWhSecondPersonQuestion = WH_SECOND_PERSON_PATTERN.test(text);
  const looksLikeGeneralTask = GENERAL_TASK_PATTERN.test(text);
  const isModeSpecificPersonalQuery = isPersonalModeQuery(mode, text);

  const isFollowUp =
    hasPriorConversation &&
    (FOLLOW_UP_PATTERN.test(text) || PRONOUN_FOLLOW_UP_PATTERN.test(text));

  // A named Aakash/entity reference is personal unless it is blocked above.
  // This covers natural questions such as "What is 8lete?" and
  // "What does Aakash think about X?" without turning "you" into a wildcard.
  if (hasAakashEntity) {
    return { scope: 'personal', allowed: true };
  }

  if (isDirectPersonalQuestion) {
    return { scope: 'personal', allowed: true };
  }

  if (isWhSecondPersonQuestion && hasPersonalTopic && !looksLikeGeneralTask) {
    return { scope: 'personal', allowed: true };
  }

  if (hasPriorConversation && hasThirdPersonReference && hasPersonalTopic) {
    return { scope: 'personal', allowed: true };
  }

  if (isModeSpecificPersonalQuery) {
    return { scope: 'personal', allowed: true };
  }

  if (isFollowUp) {
    return { scope: 'personal', allowed: true };
  }

  return {
    scope: 'out_of_scope',
    allowed: false,
    answer:
      'Hmmm, that’s not really what I’m here for 😅 Ask me something about me: my work, books, memories, decisions or how I think.',
  };
}

const VERIFIED_PERSON_RELATIONSHIP_PATTERN =
  /\b(?:what\s+(?:do|did|can)\s+you\s+(?:remember|know)\s+about\s+me|do\s+you\s+remember\s+me|what\s+have\s+we\s+(?:discussed|talked\s+about|done)|our\s+(?:relationship|history|memories|conversations?)|between\s+us|how\s+did\s+we\s+meet|when\s+did\s+we\s+meet|you\s+know\s+me)\b/i;

export function evaluateVerifiedPersonHsakaaScope(
  mode: HsakaaMode,
  message: string,
  hasPriorConversation = false,
): PublicHsakaaScopeDecision {
  const publicDecision = evaluatePublicHsakaaScope(
    mode,
    message,
    hasPriorConversation,
  );

  if (
    publicDecision.allowed ||
    publicDecision.scope === 'health' ||
    publicDecision.scope === 'media'
  ) {
    return publicDecision;
  }

  if (VERIFIED_PERSON_RELATIONSHIP_PATTERN.test(message.trim())) {
    return { scope: 'personal', allowed: true };
  }

  return publicDecision;
}
