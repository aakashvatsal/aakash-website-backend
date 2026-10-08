import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';
import { MediaPlanningExecution } from './schemas/media-planning-cycle.schema';
import {
  DEFAULT_CREATOR_SERIES,
  editorialTextKey,
  creatorConceptIsRepeated,
  selectCreatorSeries,
  CreatorSeries,
} from './media-creator-tags';

/**
 * Offline editorial safety net. This produces complete, platform-native WRITTEN
 * production packages. No personal incident, outcome, or trend is invented.
 * Approval, filming, design, and publication remain separate human/provider work.
 */
const IDEAS = [
  [
    'The second version is allowed to be smaller',
    'A smaller experiment teaches more than a perfect plan that stays in a notebook.',
    'The dramatic version of me wants a grand launch; the useful version wants one honest test.',
    'Choose one question and test it with the smallest real action.',
    'What could you test before dinner?',
  ],
  [
    'Being a beginner in public',
    'I would rather learn something badly in public than pretend to have mastered it in private.',
    'Looking competent feels safe. Asking a beginner question can actually move the work forward.',
    'Describe a skill you are learning without turning it into a success announcement.',
    'Which beginner question are you avoiding?',
  ],
  [
    'The meeting that could be a decision',
    'Discussion is only useful when it changes what somebody does next.',
    'A packed calendar can disguise an empty decision log.',
    'End the conversation with one owner, one next action and one review date.',
    'What decision is hiding behind your next meeting?',
  ],
  [
    'A life is not a dashboard',
    'A good week should include something that cannot be displayed as a growth chart.',
    'The productive part of my brain wants to track everything, including enjoyment.',
    'Keep one enjoyable activity free from scores, streaks and public proof.',
    'What would you do even if nobody saw it?',
  ],
  [
    'The honest version of discipline',
    'Discipline is not being intense every day; it is making the next step easy enough to repeat.',
    'Motivation usually makes better speeches than schedules.',
    'Pick a ten-minute habit and protect the boring repetition.',
    'What is the ten-minute version of your goal?',
  ],
  [
    'Learning to listen before fixing',
    'Sometimes the most useful response is a precise question, not a fast solution.',
    'The founder instinct is to solve a problem before the other person has finished describing it.',
    'Repeat what you heard, ask what is missing, then propose one experiment.',
    'When did a good question outperform advice?',
  ],
  [
    'Dogs have terrible LinkedIn strategies',
    'There is something refreshing about paying attention without trying to turn every moment into content.',
    'A dog would never ask whether a walk improved its personal brand.',
    'Go for a walk or spend time with an animal without measuring the return.',
    'What simple thing deserves your full attention today?',
  ],
  [
    'The awkward middle of learning',
    'Most skills feel less exciting after the first burst of enthusiasm and before visible progress.',
    'The highlight reel skips the bit where you repeat the same tiny move for weeks.',
    'Choose one uncomfortable fundamental and practise it without changing the goal.',
    'What is the boring middle of your current skill?',
  ],
  [
    'My brain wants seventeen tabs',
    'More information is not the same as a clearer decision.',
    'Every fresh tab promises certainty and usually delivers another open question.',
    'Write the decision first, then collect only the evidence that could change it.',
    'Which open tab can you close today?',
  ],
  [
    'Serious work needs an unserious hour',
    'A playful hour can be valuable without pretending it is a productivity technique.',
    'Not every hobby has to become a side hustle, a thread or a personal brand story.',
    'Protect one block for something you enjoy without a performance target.',
    'When did you last do something just because it was fun?',
  ],
  [
    'The false comfort of being busy',
    'Activity feels measurable; meaningful progress sometimes looks quiet.',
    'The easiest thing to report is the number of tasks completed, not the hard decision avoided.',
    'Write the one outcome that matters before opening your task list.',
    'What would make today useful even with fewer tasks?',
  ],
  [
    'One idea, three versions',
    'The first explanation of an idea is rarely the clearest explanation.',
    'A confident-sounding first draft can still leave the important question unanswered.',
    'Explain the same idea to a friend, a beginner and an expert; notice what changes.',
    'Who would understand your idea as it stands?',
  ],
  [
    'Not everything needs a life lesson',
    'Sometimes the best thing about a nice afternoon is simply that it was nice.',
    'My inner narrator tries to turn ordinary happiness into a five-point framework.',
    'Notice an enjoyable moment and let it stay ordinary.',
    'Can you enjoy a moment without explaining it?',
  ],
  [
    'The price of a vague maybe',
    'A clear no is often kinder than a vague promise nobody can plan around.',
    'Maybe feels diplomatic at the moment, then quietly steals everybody’s time.',
    'Replace one indefinite maybe with a decision or a specific date.',
    'Which maybe needs an honest answer?',
  ],
  [
    'Questions make better experiments',
    'The quality of a test depends on the question you ask before starting.',
    'An experiment without a question is just activity wearing a lab coat.',
    'Write a prediction, choose one measure, and decide what could change your mind.',
    'What would actually change your opinion?',
  ],
  [
    'A quiet kind of ambition',
    'Wanting a lot from life does not require treating every minute like an emergency.',
    'Ambition can be loud in goals and calm in the way you spend today.',
    'Choose the one thing worth doing well and leave space to be a person.',
    'What would calm ambition look like this week?',
  ],
  [
    'The courage to delete a feature',
    'Every extra feature creates another promise a product has to keep.',
    'Adding something often looks like progress, while removing it looks like admitting defeat.',
    'Name the job the user needs done and question anything that does not help.',
    'What would improve if you removed one thing?',
  ],
  [
    'A reading habit without book theatre',
    'A book is useful when an idea changes a question you ask, not when its cover appears online.',
    'Finishing pages can feel like achievement even when none of the ideas stay with you.',
    'Take one sentence, disagree with it, then test it in real life.',
    'Which idea from a book still bothers you?',
  ],
  [
    'An imperfect guitar note',
    'Practice is the place where sounding awkward is the point.',
    'The imaginary audience wants a concert before your fingers have learned the basics.',
    'Play one transition slowly until it feels less unfamiliar.',
    'What skill needs permission to sound bad first?',
  ],
  [
    'Chess and the move after the mistake',
    'The most interesting choice is often the one after you realise the previous move was weak.',
    'A mistake becomes expensive when pride makes you defend it.',
    'Pause, name the position you have now, and choose the next sensible move.',
    'What would you do next if you stopped defending the last move?',
  ],
  [
    'Speaking slower can say more',
    'Clarity usually improves when I stop trying to fit every thought into one breath.',
    'Fast words can create the impression of confidence while hiding a fuzzy argument.',
    'Record one sentence, remove half the qualifiers, and say it slowly.',
    'What sentence deserves a little more space?',
  ],
  [
    'A tiny Spanish conversation',
    'A useful language habit starts with the courage to sound slightly awkward.',
    'Memorising vocabulary feels tidy; speaking a real sentence feels risky.',
    'Say one short sentence aloud and let the mistake teach you something.',
    'What would you say in a language you are learning today?',
  ],
  [
    'Building a system for actual humans',
    'A clever system is not useful if real people cannot comfortably use it on a difficult Tuesday.',
    'The demo rewards the ideal path. Real life asks what happens when someone is tired or rushed.',
    'Test the smallest workflow with interruptions, mistakes and ordinary constraints.',
    'Which part of your system assumes everybody has a perfect day?',
  ],
  [
    'The two-minute reset',
    'Not every tired moment needs an inspiring speech; sometimes it needs a smaller next step.',
    'My brain likes to negotiate a complete life redesign when one task feels heavy.',
    'Stand up, get water, and decide the next visible action.',
    'What is one useful next step, not the whole solution?',
  ],
  [
    'Good stories need the inconvenient detail',
    'An interesting story includes the part that makes the narrator look less certain.',
    'The polished version jumps from problem to lesson and leaves out the doubt.',
    'Start with the decision, the tension and what remains unresolved.',
    'Which honest detail would make your story more believable?',
  ],
  [
    'Confidence without pretending',
    'It is possible to speak clearly while saying you are still figuring something out.',
    'Certainty gets attention, but curiosity keeps a conversation alive.',
    'State what you know, separate what you suspect, and invite a better question.',
    'What are you willing to be unsure about?',
  ],
  [
    'The small joy audit',
    'A satisfying week is made of ordinary moments as well as milestones.',
    'A calendar can look impressive and still forget what made the days enjoyable.',
    'Remember one moment that made you smile and make room for another.',
    'What was one quietly good part of your week?',
  ],
  [
    'A joke is allowed to stay a joke',
    'Humour can show personality without becoming a performance review or motivational quote.',
    'There is a strange pressure to attach a moral to every funny observation.',
    'Notice one harmless absurdity and enjoy it without explaining the lesson.',
    'What has made you laugh recently?',
  ],
  [
    'Stop making rest earn its place',
    'Rest does not have to justify itself by increasing tomorrow’s output.',
    'Even relaxing can start to feel like another appointment with a scorecard.',
    'Leave a little unscheduled space in the day.',
    'Where could you make space without a goal?',
  ],
  [
    'The difference between a goal and a promise',
    'Goals describe where we hope to go. Promises describe what another person can safely depend on.',
    'It is tempting to announce the exciting destination before the boring delivery is ready.',
    'Communicate the next verifiable step rather than an imagined victory.',
    'What can you promise with confidence right now?',
  ],
  [
    'When the exception becomes the product',
    'The unusual customer case reveals whether a workflow was designed for people or only a demo.',
    'Happy-path diagrams are tidy until a real person gets interrupted.',
    'Write down the first exception and decide how the product should recover.',
    'Which exception taught you the most?',
  ],
  [
    'A dashboard cannot answer why',
    'A metric is a useful alert, not an explanation of what people need.',
    'A green dashboard can coexist with a frustrated customer.',
    'Talk to the user behind one surprising number before deciding on a fix.',
    'What is your dashboard failing to tell you?',
  ],
  [
    'Who owns the next step?',
    'Clarity about the next owner matters more than another elaborate status meeting.',
    'A task with five observers and no owner may as well be invisible.',
    'Assign one decision owner and a specific follow-up trigger.',
    'What work is waiting for an owner?',
  ],
  [
    'The feature nobody requested',
    'Software can get more impressive while the original job gets harder.',
    'Every new tab in a product asks a user to make one more decision.',
    'Watch a complete real workflow before adding the next feature.',
    'What would you remove from your product?',
  ],
  [
    'A useful no to a customer',
    'A responsible no can protect a customer from a promise the team cannot keep.',
    'Saying yes instantly sometimes moves the hard decision to someone else.',
    'Explain the trade-off and offer the part you can reliably deliver.',
    'Where would a precise no build more trust?',
  ],
  [
    'Software meets a Monday morning',
    'The best test of an operations tool is how it behaves when the operator is distracted.',
    'Products are usually demonstrated in a world without interruptions.',
    'Observe a workflow with missing information and recovery steps.',
    'Which part of your product assumes perfect conditions?',
  ],
  [
    'Two people saw two different workflows',
    'When teams disagree about a process, the software may be hiding its states.',
    'A screen can be clear to the builder and confusing to the next person.',
    'Ask two different users to narrate their next action in the same workflow.',
    'Where do expectations diverge?',
  ],
  [
    'The launch checklist nobody sees',
    'Boring verification is part of the product experience even if it never appears in the announcement.',
    'A beautiful release note cannot replace a working first login.',
    'Walk through one real first-user path before celebrating the release.',
    'What invisible check matters most?',
  ],
  [
    'The cost of a silent status',
    'Customers should not have to guess whether somebody owns their request.',
    'The worst answer is often not a no; it is nothing.',
    'Provide the next meaningful update even when there is no resolution yet.',
    'When does silence become the product bug?',
  ],
  [
    'A powerful tool with one confusing button',
    'A good product is not measured by how much it can do but by what a user can reliably finish.',
    'An advanced feature is useless if the first action is hard to discover.',
    'Give a first-time user one clear task and observe without coaching.',
    'Where does your interface make people hesitate?',
  ],
  [
    'The handoff is the real workflow',
    'A process often breaks between teams rather than inside either team.',
    'Every team can complete its checklist while the customer remains stuck.',
    'Map a task from first request to final handoff with explicit ownership.',
    'Which handoff keeps slipping through?',
  ],
  [
    'The useful part of changing your mind',
    'A changed decision can mean new information was taken seriously, not that the original idea failed.',
    'Defending yesterday’s assumptions is expensive when today’s evidence differs.',
    'Name the new evidence and update one explicit decision.',
    'What new fact would change your plan?',
  ],
] as const;

const SCENES: Record<string, readonly [string, string, string]> = {
  'The second version is allowed to be smaller': [
    '“A complete redesign.” That is what ambitious me calls a one-button problem.',
    'Picture two versions of the same person planning a launch. One wants six screens and a dramatic countdown. The other opens the app, finds one broken handoff, and quietly fixes that.',
    'The smaller fix is not the less ambitious one. It is the first one somebody can actually test.',
  ],
  'Being a beginner in public': [
    'The most embarrassing part of learning is usually the first thirty seconds.',
    'Imagine sitting with a guitar while your fingers refuse to switch chords. The tutorial moves on; your left hand has apparently filed a complaint.',
    'The interesting part is the second attempt, not a fake highlight reel of instant progress.',
  ],
  'The meeting that could be a decision': [
    'Seven people left that meeting. The problem stayed.',
    'Imagine a project call ending with everybody saying “sounds good.” Nobody wrote down who owns the next handoff, so on Monday the same question arrives in a different chat.',
    'A meeting only becomes useful when somebody can name the next owner and action.',
  ],
  'A life is not a dashboard': [
    'Imagine adding a KPI to your weekend. Suddenly even your nap is underperforming.',
    'An ordinary afternoon becomes an invented dashboard: minutes walked, pages read, laughter achieved. The dashboard is beautifully formatted; the afternoon is gone.',
    'Sometimes the best measurement is noticing you enjoyed yourself.',
  ],
  'The honest version of discipline': [
    'My motivation loves a grand announcement. My calendar prefers ten minutes.',
    'Imagine two versions of you on a rainy evening. One buys a fresh notebook for a ninety-day transformation. The other picks up the guitar for ten minutes without announcing a single thing.',
    'The quieter version is easier to repeat tomorrow.',
  ],
  'Learning to listen before fixing': [
    'Someone says the app is confusing. Founder brain immediately opens a new feature ticket.',
    'Imagine a coach stuck on attendance. The developer explains three clever buttons. The coach interrupts: “I just need to know whether I marked everyone.” Now the real problem finally has a name.',
    'The better question sometimes removes three features from the discussion.',
  ],
  'Dogs have terrible LinkedIn strategies': [
    'Dogs have never optimized a walk for engagement. And somehow they still love it.',
    'Imagine a dog pulling toward the same tree for the fifth time. The human is wondering whether the route is productive. The dog is busy being delighted by the tree.',
    'No invented dog reaction is needed. Just notice how absurd human scorekeeping can get.',
  ],
  'The awkward middle of learning': [
    'Day one of guitar looks inspiring. Day twelve sounds like a door hinge.',
    'Imagine a learner switching between two chords. The fingers hesitate, the rhythm collapses, and the same four seconds need another try. That is the part nobody puts in a montage.',
    'The next attempt is the chapter worth documenting.',
  ],
  'My brain wants seventeen tabs': [
    'I opened another tab to decide which tab to close. Perfectly normal.',
    'Imagine a browser with seventeen comparison pages for one decision. Each page adds a new option until the original question is buried under bookmarks.',
    'The decision gets easier only after you write down what would actually change it.',
  ],
  'Serious work needs an unserious hour': [
    'Imagine scheduling an hour of fun and then asking for its ROI.',
    'A person finally sits down to play music just for pleasure. Ten minutes later a spreadsheet appears asking whether the experience improved their leadership abilities.',
    'Sometimes the funniest and healthiest answer is simply: that was fun.',
  ],
  'The false comfort of being busy': [
    'The task list is green. The customer is still waiting.',
    'Picture an operations team closing twenty tiny tasks while one shipment exception sits between two owners. Every dashboard looks active, but nobody knows the next meaningful update.',
    'The important number is sometimes the problem still unresolved.',
  ],
  'One idea, three versions': [
    'Explain your product to a friend. Now try explaining it to somebody who has never heard your jargon.',
    'Imagine saying “workflow orchestration” to one person and “you will know who handles the next step” to another. The first sounds impressive. The second lets somebody act.',
    'A good explanation changes with the listener, not just the slide deck.',
  ],
  'Not everything needs a life lesson': [
    'Somewhere a perfectly good afternoon is being turned into a leadership thread.',
    'Imagine somebody enjoying tea and a quiet window. Their inner content manager interrupts with: “Five things this cup taught me about resilience.” The tea has done nothing wrong.',
    'Maybe the afternoon can stay an afternoon.',
  ],
  'The price of a vague maybe': [
    '“Maybe next week” sounds polite until three people plan around it.',
    'Imagine a team waiting for a decision that never got a date. Nobody wants to be difficult, so the work quietly freezes behind a perfectly friendly message.',
    'A precise no or a real deadline is often kinder.',
  ],
  'Questions make better experiments': [
    'A test without a question is just activity wearing safety goggles.',
    'Picture a new feature going to trial. Everyone watches clicks rise, but nobody agreed whether the feature should reduce confusion or simply get noticed.',
    'Write the question before celebrating the chart.',
  ],
  'A quiet kind of ambition': [
    'An ambitious life should contain at least one hour you do not monetize.',
    'Imagine finishing a difficult workday and picking up a guitar. The mind offers a content plan, a habit tracker, and an imaginary sponsorship. You just wanted to play a song badly.',
    'Not every meaningful hour needs a commercial explanation.',
  ],
  'The courage to delete a feature': [
    'A feature can be beautiful, shipped, and still make the product harder to use.',
    'Imagine an academy manager trying to record attendance. The app offers analytics, integrations and a colorful dashboard before the one button they came for. The product has more features; their task has more friction.',
    'The brave move may be removing the clever distraction.',
  ],
  'A reading habit without book theatre': [
    'A bookshelf can look impressive while absolutely nothing changes.',
    'Imagine closing a book and opening your notes app. You copied twelve quotes but cannot name one idea you disagreed with. The next ten minutes of thinking are worth more than another photo of the cover.',
    'One uncomfortable question is a better souvenir than a perfect stack of books.',
  ],
  'An imperfect guitar note': [
    'The guitar does not care that you promised to be amazing by December.',
    'Picture a finger landing one fret too far. The note buzzes, you wince, then slowly move it back and play again. No triumphant montage, just a tiny audible difference.',
    'That second note is the entire story.',
  ],
  'Chess and the move after the mistake': [
    'The mistake is annoying. The next move is the interesting part.',
    'Imagine noticing the bishop you just left exposed. You cannot rewind the board. You can only decide whether to panic, defend the last move, or look at the position in front of you.',
    'The ability to respond is a different skill from avoiding every error.',
  ],
  'Speaking slower can say more': [
    'I can fit fifteen ideas into one breath. None of them survive.',
    'Imagine recording a thirty-second introduction and hearing yourself race through the important sentence. In the next take, you remove two qualifiers and pause once. Suddenly the sentence has room.',
    'A pause is not missing content; sometimes it is the point.',
  ],
  'A tiny Spanish conversation': [
    'A language app gives you a perfect score. A real sentence gives you stage fright.',
    'Imagine knowing the vocabulary for a café and still freezing when asked a simple follow-up. You try a short sentence, hesitate, and repeat it more clearly.',
    'The awkward attempt is where vocabulary becomes conversation.',
  ],
  'Building a system for actual humans': [
    'The demo never gets interrupted. Real life specializes in interruptions.',
    'Imagine a coach halfway through attendance when a parent calls. The screen refreshes, the unsaved marks vanish, and the app insists everything is fine.',
    'The product is not tested until the interruption is tested.',
  ],
  'The two-minute reset': [
    'My brain has proposed a complete life redesign because one email is difficult.',
    'Imagine a desk with one unfinished message. The brain asks for a new planner, a new routine and possibly a change of career. Meanwhile, the reply needs two honest sentences.',
    'The first useful action can be ridiculously smaller than the panic.',
  ],
  'Good stories need the inconvenient detail': [
    'The part that makes you look clever is rarely the part people remember.',
    'Imagine a polished founder story that jumps from idea to successful launch. The missing scene is a confused user who needed the button moved and the instructions rewritten.',
    'The uncomfortable middle is often the story.',
  ],
  'Confidence without pretending': [
    '“I am not sure yet” can be a much stronger sentence than a fake yes.',
    'Imagine being asked whether a release is ready. A confident announcement wins applause. A precise answer about the untested login path protects real users.',
    'Confidence is knowing what you can stand behind.',
  ],
  'The small joy audit': [
    'Imagine reviewing a week and remembering only your unfinished tasks.',
    'The calendar is full of meetings, workouts and checkmarks. The one moment that made you laugh with a friend has no category, so it almost disappears.',
    'Maybe that unmeasured moment deserves the headline.',
  ],
  'A joke is allowed to stay a joke': [
    'A spoon fell on the floor. My inner LinkedIn coach saw three leadership lessons.',
    'Imagine someone dropping a spoon and drafting a seven-slide carousel about resilience before picking it up. The spoon is still on the floor. The internet is already applauding.',
    'Sometimes the punchline is just the punchline.',
  ],
  'Stop making rest earn its place': [
    'Imagine taking a day off and asking whether it made you more productive.',
    'Somebody finally sits down with nothing scheduled. Ten minutes later they are calculating how much more efficient tomorrow might be. Even the sofa has become a performance tool.',
    'You are allowed to enjoy a pause without defending it.',
  ],
  'The difference between a goal and a promise': [
    'A goal can be ambitious. A promise has to survive contact with Tuesday.',
    'Imagine a software team excited about a new launch date. The customer does not care about the vision deck; they need to know what will actually work on the day.',
    'Make the next verifiable commitment clearer than the grand aspiration.',
  ],
  'Who owns the next step': [
    'A task with two owners sometimes has zero owners.',
    'Imagine a customer request passed between support and engineering. Both teams can prove they replied. Neither can name who will send the actual update.',
    'Ownership means the next action has one home.',
  ],
  'The feature nobody requested': [
    'The new feature got applause. The old problem got worse.',
    'Imagine a beautiful new analytics tab while the user is still struggling to complete their first form. One team celebrates the release. Another person just wants the original action to work.',
    'The loudest feature is not always the most useful.',
  ],
  'When the exception becomes the product': [
    'The happy path lasts twelve seconds. Real users bring the other twelve hours.',
    'Imagine a freight schedule changing after a status has already been sent. A dashboard can show an elegant green milestone while the operator needs a correction and a clear next owner.',
    'Exception handling is not the edge of the product; it is often the product.',
  ],
  'A dashboard cannot answer why': [
    'Five green metrics and one unhappy customer. Which one do you believe?',
    'Imagine a dashboard showing every job completed. One customer still cannot tell who will call them back. The cells are green because the measure never asked about the missing handoff.',
    'A dashboard can tell you where to look, not what the person experienced.',
  ],
  'A useful no to a customer': [
    'A quick yes feels helpful. Until the team has to explain why nothing works.',
    'Imagine a customer asking for a feature that would block the release of the one tool they actually need. Everyone wants to be helpful, but the next promise has a real cost.',
    'A clear no with a useful alternative can protect trust better than an impressive promise.',
  ],
  'Software meets a Monday morning': [
    'The demo ran perfectly. Monday morning has other plans.',
    'Imagine a rushed operator opening a tool with two missing fields, a late update and a colleague waiting for access. The clean demo never simulated any of those interruptions.',
    'A product that survives a messy Monday is worth more than a flawless demo.',
  ],
  'Two people saw two different workflows': [
    'Two people clicked the same button and expected completely different things.',
    'Imagine a support person who thinks “submitted” means finished, and an operator who thinks it means waiting for review. Both can read the same screen; neither shares the same state definition.',
    'Sometimes a product needs a clearer status, not another feature.',
  ],
  'The launch checklist nobody sees': [
    'Nobody applauds the login test that prevents a broken launch.',
    'Picture a launch page ready for screenshots while the first new user opens an invitation, lands on a blank screen, and has no idea what comes next. The least glamorous checklist suddenly matters most.',
    'A launch is the first real user journey, not just the announcement.',
  ],
  'The cost of a silent status': [
    'A silent status can cost more trust than a disappointing answer.',
    'Imagine a customer checking a shipment update that has not changed for two days. They are not necessarily demanding miracles. They want to know whether somebody owns the next answer.',
    'A plain truthful update can be better than a reassuring green badge.',
  ],
  'A powerful tool with one confusing button': [
    'One confusing button can make a powerful product feel broken.',
    'Imagine a first-time user needing a basic report. All the advanced charts load beautifully, but the button to export the result looks like an unrelated icon.',
    'The critical feature is not powerful until somebody can discover how to use it.',
  ],
  'The handoff is the real workflow': [
    'Two teams completed their tasks. The customer is still stuck.',
    'Imagine support marking a question resolved and engineering marking a change shipped. The answer never reaches the person waiting because nobody owns the final handoff.',
    'A workflow is only complete when the next person can actually move.',
  ],
  'The useful part of changing your mind': [
    'Changing your mind is easy in theory. It gets awkward after you already announced your plan.',
    'Imagine a founder announcing one product direction, then hearing from a user whose real workflow exposes a missing step. The difficult part is not understanding the feedback; it is admitting the plan needs revision.',
    'A decision improved by new evidence is stronger than one defended out of pride.',
  ],
  'Who owns the next step?': [
    'A task with two owners sometimes has zero owners.',
    'Imagine a customer request passed between support and engineering. Both teams can prove they replied. Neither can name who will send the actual update.',
    'Ownership means the next action has one home.',
  ],
};

type Source = { evidenceIds?: string[]; key?: string } | undefined;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function completeCreatorCopy(item: MediaPlanningExecution): boolean {
  if (
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

/** Compositional, zero-token creative bench when the fixed idea list is exhausted.
 * Never claims the hypothetical story happened. It is review-required content,
 * and historical titles are still checked before a subject is used. */
const EPISODE_SITUATIONS = [
  [
    'a first-time user opening a busy screen',
    'an important action hidden by a new feature',
    'remove the distraction and test the core task',
  ],
  [
    'a coach checking attendance before practice',
    'a parent interrupting before the save finishes',
    'make the interrupted task recoverable',
  ],
  [
    'a freight operator reading two conflicting milestones',
    'the most recent update being less trustworthy than an older one',
    'show evidence and a clear uncertainty label',
  ],
  [
    'a founder answering a product request',
    'a loud suggestion drowning out the underlying need',
    'observe the job before discussing features',
  ],
  [
    'an early guitar practice with an awkward chord change',
    'restarting the entire song after a single missed note',
    'isolate one difficult transition and practise just that',
  ],
  [
    'a beginner trying a Spanish sentence aloud',
    'knowing vocabulary but freezing in conversation',
    'try a short response without waiting to sound fluent',
  ],
  [
    'a chess player reviewing the move after a blunder',
    'spending energy defending the previous move',
    'name the position now and choose a better next response',
  ],
  [
    'a reader testing a surprising argument',
    'highlighting a page without changing a decision',
    'turn one disagreement into an observable question',
  ],
  [
    'a person trying to enjoy a dog walk',
    'a phone turning the whole outing into a content shoot',
    'put the phone away and observe the funny detail',
  ],
  [
    'two versions of a person planning a weekend',
    'one wanting a full optimisation spreadsheet',
    'let the real outing stay spontaneous',
  ],
  [
    'a voice-practice beginner recording an imperfect take',
    'deleting the attempt before listening back',
    'listen for one specific improvement',
  ],
  [
    'a team member handing over an unresolved task',
    'no one knowing who owns the next update',
    'name one owner and one visible handoff',
  ],
  [
    'a builder checking a green operational dashboard',
    'the real user still waiting for an answer',
    'trace the user journey alongside the metric',
  ],
  [
    'a founder deciding what to cut from a release',
    'a long feature list hiding the essential job',
    'rank the tasks by whether they unblock a user',
  ],
  [
    'a person with a free evening and an overflowing to-do list',
    'turning rest into another performance metric',
    'protect one block without a productivity target',
  ],
  [
    'a curious dog watching a human prepare for work',
    'the human making a simple decision unnecessarily dramatic',
    'let the small comic moment end without a life lesson',
  ],
] as const;
const EPISODE_LENSES = [
  ['the interruption test', 'What breaks when someone is interrupted?'],
  ['the first-minute test', 'What does the person need in the first minute?'],
  ['the wrong-assumption test', 'Which belief is quietly driving this choice?'],
  ['the handoff test', 'Who actually needs to act next?'],
  ['the beginner test', 'What is easy to miss when you are still learning?'],
  [
    'the quiet-payoff test',
    'What changes when you stop forcing a grand conclusion?',
  ],
  ['the counterexample test', 'What does the unusual case reveal?'],
  ['the honest-outcome test', 'What could you truthfully observe afterward?'],
] as const;
function seriesSituation(key: string, i: number) {
  const filters: Record<string, number[]> = {
    'founder-unfiltered': [0, 1, 2, 3, 11, 12, 13],
    'learning-at-30': [4, 5, 6, 7, 10],
    'me-vs-me': [9, 10, 14],
    'dogs-and-me': [8, 15],
    'life-without-work': [8, 9, 14, 15],
    'things-i-changed-my-mind-about': [0, 3, 6, 7, 12, 13],
  };
  const indices = filters[key] ?? [0, 3, 4, 7, 8, 9, 11, 14];
  return EPISODE_SITUATIONS[indices[i % indices.length]];
}
function newOfflineEpisode(
  platform: MediaPlatform,
  date: string,
  ordinal: number,
  usedHeadlines: Set<string>,
  activeSeries: readonly CreatorSeries[],
): { series: CreatorSeries; idea: string[]; story: [string, string, string] } {
  const available = activeSeries.filter((s) => s.channels.includes(platform));
  // A disabled portfolio should not crash saving: mark the temporary draft for
  // series review instead of falsely tagging an inactive series.
  let seriesList = available.length
    ? available
    : [
        {
          key: 'unassigned',
          name: 'Needs series review',
          channels: [platform],
        },
      ];
  if (platform === MediaPlatform.INSTAGRAM && seriesList.length > 1) {
    const counts = new Map<string, number>();
    for (const used of usedHeadlines) {
      for (const candidate of seriesList) {
        if (used.startsWith(editorialTextKey(`${candidate.name}:`)))
          counts.set(candidate.key, (counts.get(candidate.key) ?? 0) + 1);
      }
    }
    const underCap = seriesList.filter(
      (candidate) => (counts.get(candidate.key) ?? 0) < 2,
    );
    seriesList = (underCap.length ? underCap : seriesList)
      .slice()
      .sort((a, b) => (counts.get(a.key) ?? 0) - (counts.get(b.key) ?? 0));
  }
  const base = Math.abs(
    (Date.parse(`${date}T00:00:00Z`) || 0) / 86400000 + ordinal,
  );
  for (let attempt = 0; attempt < 6000; attempt++) {
    const serial = base + attempt;
    const series = seriesList[serial % seriesList.length];
    const situation = seriesSituation(
      series.key,
      Math.floor(serial / seriesList.length),
    );
    const lens =
      EPISODE_LENSES[Math.floor(serial / 17) % EPISODE_LENSES.length];
    const title = `${series.name}: ${situation[0]} — ${lens[0]}`;
    const normalized = editorialTextKey(title);
    // Editorial identity is the series + scenario + lens, not an episode number.
    // Changing just the date/number is not a sufficiently new story.
    if (
      [...usedHeadlines].some(
        (old) => old === normalized || old.startsWith(`${normalized} study `),
      )
    )
      continue;
    const thesis = `${lens[1]} That is the real question inside ${situation[0]}.`;
    const contrast = `${situation[1]} is where the story gets interesting.`;
    const action = situation[2];
    const question = lens[1];
    const hookStyles = [
      `${situation[1][0].toUpperCase()}${situation[1].slice(1)}. That is the part worth looking at.`,
      `The obvious version of this story is ${situation[0]}. The useful part starts when ${situation[1]}.`,
      `This looked simple until ${situation[1]}.`,
      `The interesting moment was not the plan. It was ${situation[1]}.`,
      `One small thing changed the whole situation: ${situation[1]}.`,
      `${situation[0][0].toUpperCase()}${situation[0].slice(1)} sounds straightforward. It wasn't.`,
    ];
    const hook = hookStyles[serial % hookStyles.length];
    const scene = `Stay with the concrete moment: ${situation[1]}. Show the hesitation, the trade-off and the attempt to ${action}, without pretending the outcome is already known.`;
    const payoff = `The useful next step is to ${action}, then let the real result decide what the story becomes.`;
    return {
      series,
      idea: [title, thesis, contrast, action, question],
      story: [hook, scene, payoff],
    };
  }
  // No invented evidence and no hard failure even after a very long history.
  // A date/ordinal-specific *unverified* concept is still safer than a silent
  // duplicate or losing the week's plan in the save transaction.
  const series = seriesList[0];
  const title = `${series.name}: evidence-needed field note ${date} / ${ordinal}`;
  return {
    series,
    idea: [
      title,
      'This episode needs an actual new observation.',
      'A real scene is not yet documented.',
      'Collect one safe-to-share observation and test the question.',
      'What did the real attempt reveal?',
    ],
    story: [
      'What really happened this time?',
      'Illustrative field note: the creator can document a real attempt but has not supplied evidence yet.',
      'The payoff is a verified observation, not an invented result.',
    ],
  };
}

export function authoredCreatorFallback(
  base: MediaPlanningExecution,
  date: string,
  ordinal: number,
  format: MediaPostType,
  platform: MediaPlatform,
  source?: Source,
  usedHeadlines = new Set<string>(),
  activeSeries: readonly CreatorSeries[] = DEFAULT_CREATOR_SERIES,
): MediaPlanningExecution {
  // Rotation is keyed to the actual date, so rolling an overlapping week does not
  // shuffle already saved assets. Avoid duplicate headlines in the same week.
  const dayNumber = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  const start =
    (((dayNumber * 7 + ordinal * 11 + platform.length * 13) % IDEAS.length) +
      IDEAS.length) %
    IDEAS.length;
  const candidates = IDEAS.map((idea, i) => ({
    idea,
    index: i,
    series: selectCreatorSeries(idea[0], platform, activeSeries),
  })).filter(
    (row) =>
      row.series && !creatorConceptIsRepeated(row.idea[0], usedHeadlines),
  );
  // An interesting weekly portfolio contains DIFFERENT recurring characters.
  // Keep founder ideas available to X, which has fewer compatible series.
  const frequency = new Map<string, number>();
  for (const used of usedHeadlines) {
    for (const series of activeSeries) {
      const prefix = editorialTextKey(`${series.name}:`);
      if (used.startsWith(prefix))
        frequency.set(series.key, (frequency.get(series.key) ?? 0) + 1);
    }
    for (const idea of IDEAS) {
      if (editorialTextKey(idea[0]) !== used) continue;
      const matched =
        selectCreatorSeries(idea[0], MediaPlatform.INSTAGRAM, activeSeries) ||
        selectCreatorSeries(idea[0], MediaPlatform.LINKEDIN, activeSeries) ||
        selectCreatorSeries(idea[0], MediaPlatform.X, activeSeries);
      if (matched)
        frequency.set(matched.key, (frequency.get(matched.key) ?? 0) + 1);
    }
  }
  const priority = (key: string) => {
    const used = frequency.get(key) ?? 0;
    if (platform === MediaPlatform.INSTAGRAM)
      return used >= 2 ? 1000 + used * 100 : used * 20;
    if (platform === MediaPlatform.LINKEDIN)
      return (key === 'learning-at-30' ? 0 : 8) + used * 4;
    return used * 3;
  };
  const longPreferred =
    format === MediaPostType.VIDEO &&
    candidates.some((x) => x.idea[0] === 'The courage to delete a feature');
  if (longPreferred)
    candidates.sort((a, b) =>
      a.idea[0] === 'The courage to delete a feature'
        ? -1
        : b.idea[0] === 'The courage to delete a feature'
          ? 1
          : 0,
    );
  candidates.sort(
    (a, b) =>
      (longPreferred
        ? a.idea[0] === 'The courage to delete a feature'
          ? -100
          : b.idea[0] === 'The courage to delete a feature'
            ? 100
            : 0
        : 0) ||
      priority(a.series!.key) - priority(b.series!.key) ||
      ((a.index - start + IDEAS.length) % IDEAS.length) -
        ((b.index - start + IDEAS.length) % IDEAS.length),
  );
  // The static library is finite. Archived history must never make an entire
  // paid seven-day plan unsaveable. Create a distinct, clearly hypothetical
  // SERIES episode, not a reworded copy of an exhausted catalogue title.
  const derived = candidates.length
    ? null
    : newOfflineEpisode(platform, date, ordinal, usedHeadlines, activeSeries);
  const index = candidates[0]?.index ?? -1;
  const series = candidates[0]?.series ?? derived!.series;
  const [title, thesis, contrast, action, question] = candidates.length
    ? IDEAS[index]
    : derived!.idea;
  usedHeadlines.add(editorialTextKey(title));
  const [hook, illustrativeScene, payoff] = derived?.story ??
    SCENES[title] ?? [
      contrast,
      `Consider an illustrative scenario: ${contrast} ${thesis}`,
      `That is why the practical move is simple: ${action}`,
    ];
  const isPlayful =
    series.key === 'life-without-work' ||
    series.key === 'dogs-and-me' ||
    series.key === 'me-vs-me';
  const isDialog = series.key === 'me-vs-me';
  const spokenOpening = isDialog
    ? `Ambitious me: “Let's turn this into a life-changing project.” Practical me: “Can we finish one tiny thing first?”`
    : hook;
  // Explicitly illustrative. These lines can be delivered verbatim without
  // inserting production instructions into the script or inventing achievements.
  const scene = illustrativeScene;
  const shortTransitions = [
    `Here's the problem: ${contrast}`,
    `Notice the turn: ${contrast}`,
    `But look what happens next: ${contrast}`,
    `And the awkward bit is this: ${contrast}`,
  ];
  const shortChoices = [
    `This is what I'd test next: ${action}`,
    `The next move is less glamorous: ${action}`,
    `The small but useful alternative is: ${action}`,
    `The experiment here is simple: ${action}`,
  ];
  const shortScript = [
    spokenOpening,
    scene,
    isDialog
      ? `Ambitious me wants a before-and-after documentary. Practical me wants evidence that the next step worked. The two versions disagree, and honestly, the boring one has a point.`
      : isPlayful
        ? `I love the drama of that contrast, mostly because it is so recognisably human. We make tiny moments absurdly complicated without anybody asking.`
        : shortTransitions[ordinal % shortTransitions.length],
    shortChoices[ordinal % shortChoices.length],
    payoff,
  ].join('\n\n');
  const founderChapters = [
    `A feature can be beautiful, finished, and still make a product harder to use. Imagine an academy manager opening an attendance app just before a training session. Thirty players are arriving, a parent wants an answer, and the coach has perhaps forty seconds to do one thing: mark who is present. Instead, a dashboard offers clever charts, settings, filters and a brand new insight panel. Nothing is technically broken. And yet the coach is stuck. That is the problem I want to examine: when does adding functionality reduce usefulness?`,
    `This is an illustrative design situation, not a claim that it happened at any particular academy. I like it because we can replay the scene from both sides. From the product team’s desk, an extra feature is progress. It is visible, easy to demonstrate, and usually comes with a satisfying release note. From the coach’s phone, the same feature may be another decision before the task they came to finish. Those two realities can exist inside the same product.`,
    `Now imagine an honest user test. Give a first-time coach the app and say nothing. Do not explain the navigation, point at the newest button or show them your favourite dashboard. Ask them to record today's attendance while the session is starting. Watch where their thumb stops. Does the app remember an interrupted session? Can they tell whether the attendance actually saved? If a parent calls halfway through, can they return without starting again? Those questions are much less glamorous than the launch slide.`,
    `Here is the first twist: the problem might not be the feature everybody is complaining about. Maybe the menu is fine. Maybe the unreadable state after saving is what makes people repeat the entire action. So if the team simply deletes a button because somebody said the interface feels busy, it can make things worse. The objective is not minimalism as a religion. It is removing friction from the job somebody came to do. First understand the job. Then simplify the path.`,
    `Let us apply the same thought to a completely different world: freight operations. A shipment's status may look excellent on a demo, right up until a vessel changes, an event arrives late, or two sources disagree about the same milestone. Imagine the operator opening a beautiful tracking screen while their customer is waiting for one precise answer: which arrival date can I act on? Yet the interface is busy showing a dozen decorative numbers. The valuable feature might be a very plain explanation of what changed, when, and which update is reliable.`,
    `If I were reviewing either product, I would write one sentence at the top of the page: the user came here to finish this task. Then I would trace each decision required between opening the product and completing the task. Highlight every step that exists only because the software is proud of its own complexity. That does not mean cutting every advanced option. It means giving the advanced option a place where it helps, instead of allowing it to interrupt the basic path.`,
    `There is also a cost on the other side. Deleting something can upset people who use it. A feature that looks irrelevant to most users may be essential to one specialist. That is why I would avoid pretending the answer is always “remove.” Sometimes the better answer is to move, rename, collapse or make a step optional. The evidence should decide. If a choice affects payments, privacy or operational safety, the test needs extra care. Simple should never mean reckless.`,
    `One practical exercise: take a task that seems obvious to your team. Ask one person who did not design the interface to attempt it. Record the exact point where they hesitate, without coaching. Write down what they expected to happen and what the screen actually did. Change just one thing. Run the same task again. You now have a stronger story than a feature announcement, because you can explain the problem, the choice, and what still needs checking.`,
    `I started with the coach trying to mark attendance. Remember the forty seconds before training? That is the payoff I care about. Not whether the product looked impressive in the meeting. Whether the coach could finish the real job without thinking about the software at all. The paradox is that great software often feels less dramatic than the team that built it would like. Sometimes the bravest decision is to leave a clever idea out of the user's way.`,
    `If you build products, here is the question I would take into the next design review: what is the one action your user must complete on a difficult day? Show me that path before you show me the new feature. I am not claiming one walkthrough settles the entire design. I am saying it reveals the next question worth testing. And I would rather have one clear answer from a real workflow than twenty gorgeous screenshots nobody can complete.`,
  ];
  const humorChapters = [
    `A spoon falls on the kitchen floor. The normal human response is to pick it up. My imaginary content-manager brain sees an inspirational LinkedIn carousel: “Three lessons a falling spoon taught me about leadership.” The spoon is still on the floor. We are already on slide five. That is the ridiculous scene behind this episode, and I think the spoon deserves an apology.`,
    `Imagine treating every nice thing as raw material for a personal brand. You go on a walk, and an invisible marketing manager asks about distribution strategy. You play one awkward guitar chord, and suddenly the room needs a dramatic before-and-after montage. You laugh at a harmless mistake and somebody wants a framework, a spreadsheet and an audience survey. It is exhausting just describing it.`,
    `There is a serious reason the joke works. Sharing an honest moment can make strangers feel like they know you. But the moment stops being honest when the moral arrives before the experience. Your audience does not need every laugh repackaged as resilience or every dog walk renamed the journey of a founder. Sometimes a walk is a walk, and the dog is simply much better at enjoying it than the human holding the phone.`,
    `Let's imagine the content manager returning for a second round. This person looks at a sunny afternoon and says, “Wonderful, but how do we quantify the emotional uplift?” Someone else starts a productivity tracker for relaxing. At that point the tracker needs to be politely escorted out of the room. We can be ambitious and still give ourselves permission to be unserious for an hour.`,
    `I like that kind of humor because the joke isn't about somebody else failing. It's about the ridiculous habits we all slip into when we care too much about doing everything correctly. Even the most thoughtful person can turn a two-minute decision into a ten-tab research project. Even a hard-working founder can forget that friendships, pets, hobbies, and afternoons are allowed to exist without generating a report.`,
    `Now there is a temptation to turn this observation into advice: “Try spending thirty minutes without metrics.” But notice what happened. We just turned the absence of measuring into another measurable challenge. That is the trick. We can turn anything, even resting, into a performance. If you're laughing, the joke has already done its work. We don't have to squeeze a productivity framework out of it afterward.`,
    `If I filmed the scene, I would use two characters: Serious Me with an imaginary boardroom presentation about the spoon, and Actual Me walking past, picking up the spoon, and leaving without a single quote for Instagram. That's the entire conflict. One character needs the world to mean something impressive. The other would like the kitchen floor to be safe.`,
    `The point is not to stop documenting a life. There are wonderful stories in unfinished guitar practice, a quiet room after a long workday, or a dog making a perfectly ordinary walk feel like an adventure. But those stories work best when they are captured before they are explained. Let something happen. Let it be slightly awkward. Let yourself laugh. Then decide whether it even belongs online.`,
    `So next time something harmless goes wrong, you don't need the instant lesson. The only question may be whether anybody needs help cleaning it up. And if a spoon falls near you, maybe rescue it before your imaginary personal-brand consultant starts designing slide six. That is a little joke I would happily leave exactly where it is.`,
    `We started with a spoon. We have traveled through a very unnecessary leadership framework. We are back in the kitchen, and the spoon has finally been picked up. No transformation metrics. No five-step method. And that, for once, is enough.`,
  ];
  const longBase =
    series.key === 'life-without-work' ||
    series.key === 'dogs-and-me' ||
    title === 'A joke is allowed to stay a joke'
      ? humorChapters
      : founderChapters;
  const longScript = derived
    ? [
        `This is a hypothetical story experiment, not a claim about a real customer or my own life. ${hook} ${illustrativeScene}`,
        `The specific problem I want to explore is: ${thesis} ${contrast}`,
        ...longBase.slice(1, 8),
        `In this particular imagined situation, the next meaningful choice would be: ${action}. We should test that against reality instead of claiming an outcome. ${payoff}`,
        `The question I would ask the audience is: ${question}`,
      ].join('\n\n')
    : longBase.join('\n\n');
  const script = format === MediaPostType.VIDEO ? longScript : shortScript;
  const isVideo = [
    MediaPostType.REEL,
    MediaPostType.SHORT,
    MediaPostType.VIDEO,
  ].includes(format);
  const carouselSlides =
    format === MediaPostType.CAROUSEL
      ? (series.key === 'dogs-and-me'
          ? [
              [
                title,
                'Their strategy: be excited to see someone. That seems to be enough.',
              ],
              [
                'Networking',
                'The dog version is simply saying hello. Often without an agenda.',
              ],
              [
                'Content calendar',
                'The same walk can still be the best part of the day.',
              ],
              [
                'Personal brand',
                'No positioning statement. Just being unmistakably themselves.',
              ],
              [
                'Performance review',
                'Nobody has asked for the quarterly treat-conversion report.',
              ],
              [
                'What humans could borrow',
                'Maybe it is okay to enjoy something without proving its usefulness.',
              ],
              [
                'No grand lesson',
                'Only use your own real dog footage. What small animal moment made you laugh?',
              ],
            ]
          : [
              [title, thesis],
              ['The moment it gets difficult', contrast],
              ['A scene you can picture', illustrativeScene],
              ['The surprising turn', payoff],
              ['Something you can actually do', action],
              [
                'The second version',
                `The first version wants applause. The second actually tries: ${action}`,
              ],
              ['The payoff', `The point is not to look flawless. ${payoff}`],
            ]
        ).map(([headline, bodyCopy], slideNumber) => ({
          slideNumber: slideNumber + 1,
          headline,
          bodyCopy,
          visualType: 'designed_graphic' as const,
          imagePrompt: '',
          visualDescription:
            'Editorial 4:5 typography on warm off-white with high-contrast black text, one concise statement per slide and restrained visual hierarchy.',
          overlayText: headline,
        }))
      : [];
  const linkedInPatterns = [
    [
      hook,
      illustrativeScene,
      `What I would do next: ${action}.`,
      payoff,
      question,
    ],
    [
      hook,
      `The awkward part is ${contrast.toLowerCase()}`,
      illustrativeScene,
      `So I would ${action}.`,
      question,
    ],
    [
      hook,
      illustrativeScene,
      `There is no clean lesson yet. The next useful move is to ${action}.`,
      payoff,
      question,
    ],
  ];
  const linkedIn =
    linkedInPatterns[ordinal % linkedInPatterns.length].join('\n\n');
  // X should read like a native observation, not a compressed LinkedIn template.
  const xPatterns = [
    `${hook} ${question}`,
    `${contrast} I would ${action}.`,
    `${payoff} ${question}`,
  ];
  const x = xPatterns[ordinal % xPatterns.length].slice(0, 280);
  const caption = isVideo
    ? `${hook}\n\n${payoff}\n\n${question}\n\n#LearningInPublic`
    : format === MediaPostType.CAROUSEL
      ? `${hook}\n\n${payoff}\n\n${question}\n\n#LifeInProgress`
      : platform === MediaPlatform.X
        ? x
        : linkedIn;
  const videoLength = Math.max(15, Math.round(words(script) / 2.25));
  const firstShot =
    series.key === 'learning-at-30'
      ? 'Start with the real learning activity if it is happening; otherwise use clean direct-to-camera.'
      : series.key === 'dogs-and-me'
        ? 'Only use authentic existing pet footage. Never stage dog reactions.'
        : series.key === 'founder-unfiltered'
          ? 'Open on a real safe-to-share workspace detail or a concise face-to-camera question.'
          : 'Begin with the contrasting thought straight to camera, no title preamble.';
  const videoPack = {
    ...base.videoPack,
    fullScript: isVideo ? script : '',
    targetDurationSeconds: isVideo ? videoLength : 0,
    deliveryInstructions:
      'Speak naturally, with thoughtful pauses; conversational rather than motivational. Deliver every line as written, checking any personal claims before recording.',
    shootStyle:
      format === MediaPostType.VIDEO
        ? 'Chaptered documentary/editorial: screen or action cold-open, face-to-camera explanation, demonstration, counterpoint, payoff'
        : 'Activity-first vertical mini-story: concrete cold-open, face-to-camera beat, real demonstration, reaction/payoff',
    location:
      series.key === 'founder-unfiltered'
        ? 'Real private-safe workspace plus one neutral face-to-camera position'
        : 'Real environment where the activity genuinely happens; avoid staged studio-looking setups',
    movement:
      format === MediaPostType.VIDEO
        ? 'Mix locked A-camera with over-shoulder/screen/action B-roll; change visual every 12-20 seconds'
        : 'Start with action, then 2-4 purposeful visual changes; no random cinematic filler',
    openingFrame: firstShot,
    cameraPosition:
      format === MediaPostType.VIDEO
        ? 'Primary camera horizontal 16:9 at eye level; secondary over-shoulder/detail angles for demonstrations'
        : 'Vertical 9:16; activity/detail shot first, then eye-level medium close-up',
    shotList:
      format === MediaPostType.VIDEO
        ? [
            `00:00-00:12 COLD OPEN — show the concrete problem before explaining it: ${contrast}`,
            `00:12-00:45 SETUP — Aakash on camera states the question and why it matters: ${question}`,
            `00:45-01:30 EXAMPLE — show a real approved or clearly-labelled synthetic demonstration: ${illustrativeScene}`,
            `01:30-02:30 BREAKDOWN — explain the trade-off with screen/action cutaways; no generic B-roll`,
            `02:30-03:30 COUNTERPOINT — show why the obvious answer may be incomplete`,
            `03:30-04:45 TEST — demonstrate the next action: ${action}`,
            `04:45-END PAYOFF — return to the opening scene, state what is known vs still unresolved, end with: ${question}`,
          ]
        : [
            `00:00-00:02 HOOK SHOT — show the actual object/action/problem before Aakash speaks`,
            `00:02-00:07 FIRST LINE — deliver the hook immediately: ${hook}`,
            `00:07-00:16 PROOF/SCENE — show the real approved moment or labelled demonstration: ${illustrativeScene}`,
            `00:16-00:27 TURN — cut back to Aakash or a second character/frame and reveal: ${contrast}`,
            `00:27-00:38 ACTION — visibly demonstrate or state the next move: ${action}`,
            `00:38-END PAYOFF — short reaction/return shot, then ${payoff}`,
          ],
    cameraInstructions:
      format === MediaPostType.VIDEO
        ? 'Shoot horizontal 16:9. Open with evidence/action, not a title card. Alternate A-camera with demonstration/screen/detail shots every 12-20 seconds. Keep all private data out of frame.'
        : 'Shoot vertical 9:16. Do not open with a seated talking head unless the hook itself is the visual. Use the actual activity/object first, then face-to-camera. Cut dead air and keep 3-6 intentional visual beats.',
    punchIns: [
      {
        at: '00:05',
        instruction:
          'Reveal the conflict; cut to a second framing, character or concrete detail',
      },
    ],
    broll: [
      {
        at: '00:12',
        instruction:
          'Real approved footage of the setting; if unavailable film a clearly illustrative demonstration, not an invented event',
      },
    ],
    onScreenText: [
      { at: '00:00', instruction: hook.slice(0, 58) },
      { at: '00:20', instruction: payoff.slice(0, 65) },
    ],
    audioDirection: 'Clean voice, low room noise, no dramatic sound effects',
    lightingDirection:
      'Soft front-facing daylight or diffused key, natural skin tone',
    editingRhythm:
      'Comfortable pacing; remove dead air without hyperactive cuts',
    captionDirection:
      'Readable sentence-case subtitles; highlight only the key question',
    musicDirection:
      'Optional subtle royalty-cleared instrumental at very low level, or silence',
    coverDirection: `High-contrast editorial title: ${title}, legible at phone size`,
    coverFrame:
      'Natural direct-to-camera expression against a simple background',
  };
  return {
    ...base,
    platform,
    format,
    action: 'post',
    seriesKey: series.key,
    seriesName: series.name,
    editorialFingerprint: editorialTextKey(`${title} ${thesis}`),
    trendStatus: 'not_verified',
    trendTitle: '',
    trendSource: '',
    trendUrl: '',
    trendPublishedAt: '',
    formatIntent: `Final written editorial ${format} pack`,
    reason:
      'Deterministic offline editorial completion: complete script/copy with no model retry.',
    whyThisFormat:
      'Native editorial format with a clear idea and an audience question.',
    whyThisTime: 'Distributed across the rolling seven-day publishing plan.',
    title,
    hook: (format === MediaPostType.VIDEO
      ? longScript.split(/[.!?]/)[0]
      : spokenOpening.split(/[.!?]/)[0]
    ).trim(),
    caption,
    script: isVideo ? script : '',
    description: caption,
    cta: question,
    hashtags:
      platform === MediaPlatform.X
        ? []
        : ['#LearningInPublic', '#EverydayExperiments'],
    slides: carouselSlides.map(
      (slide) => `${slide.headline}\n${slide.bodyCopy}`,
    ),
    coverText: title,
    thumbnailText: title,
    pinnedComment: question,
    storyFollowUp: `Follow up with the audience's answers to: ${question}`,
    editorialVersion: 'narrative-v1',
    storyBeats: [hook, illustrativeScene, contrast, action, payoff],
    storyPayoff: payoff,
    productionNotes: `Illustrative scene: ${illustrativeScene} This is a hypothetical demonstration, not an autobiographical claim. Real footage, approval and source checks are still required.`,
    publishCopy: caption,
    copyPasteText: caption,
    copyPasteCaption: caption,
    evidenceIds: source?.evidenceIds ?? [],
    opportunityKey: source?.key ?? '',
    imageBrief: {
      mode: format === MediaPostType.CAROUSEL ? 'designed_graphic' : 'none',
      aspectRatio: '4:5',
      overlayText: format === MediaPostType.CAROUSEL ? title : '',
      prompt: '',
      description:
        format === MediaPostType.CAROUSEL
          ? 'Seven distinct editorial slides, with concept-specific text and one main idea per card.'
          : '',
      sourceGuidance:
        'Use real capture or approved typography; never invent people or outcomes.',
    },
    carouselSlides,
    videoPack,
    xThread: [],
    whatsappSequence: [],
    executionReady: !!source?.evidenceIds?.length,
    readinessIssues: source?.evidenceIds?.length
      ? []
      : [
          'Written package complete; source evidence or first-person claim must be approved before publishing.',
        ],
    estimatedMinutes:
      format === MediaPostType.VIDEO
        ? 120
        : format === MediaPostType.CAROUSEL
          ? 55
          : isVideo
            ? 35
            : 15,
    requiresApproval: true,
  };
}
