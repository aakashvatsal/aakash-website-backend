import { MediaPlanningExecution } from './schemas/media-planning-cycle.schema';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';
import { reviewCreatorQuality, auditCreatorWeek } from './media-editorial-critic';
import { MEDIA_STORYCRAFT_CONTRACT, mediaStorytellingPromptPolicy } from './media-storytelling-policy';

function fixture(overrides: Partial<MediaPlanningExecution> = {}): MediaPlanningExecution {
  const hook = 'I lost the chess game on move eight.';
  const body = [
    `${hook} I had opened my laptop to review the board when I noticed my bishop was trapped.`,
    'I wanted to attack anyway, but the position on the screen showed the opponent had already covered that square. I spent the next minute trying to rescue the piece.',
    'Then I replayed the actual move. The pawn had moved only once, and I had missed its diagonal. I closed the game and reset the board to the same position.',
    'Now my next practice session starts with that position, not an inspirational quote about losing. The mistake I need to fix is visible on the board.'
  ].join('\n\n');
  return {
    action: 'post', platform: MediaPlatform.INSTAGRAM, format: MediaPostType.REEL,
    title: 'The bishop I missed', seriesKey: 'learning-at-30', seriesName: 'Learning at 30',
    hook, hookAlternatives: [
      'Can you spot my mistake before the bishop disappears?',
      'One chess position exposed the move I keep overlooking.',
    ],
    editorialVersion: 'storycraft-v5',
    openingVisual: 'Overhead close-up of the real chessboard before the losing move',
    storyTension: 'I attacked while my bishop was exposed',
    storyTurn: 'I replayed the move and found the pawn diagonal',
    viewerPayoff: 'The viewer sees exactly which diagonal trapped the bishop',
    storyBeats: ['Game', 'Attack', 'Trap', 'Replay', 'What changes next'],
    storyPayoff: 'The mistake I need to fix is visible on the board.',
    evidenceIds: ['E007'],
    videoPack: {
      fullScript: body, openingFrame:'Overhead chessboard', shotList:['Board','Hands','Replay'],
      onScreenText:[{at:'0',instruction:'I missed this'},{at:'6',instruction:'The diagonal'}],
    } as MediaPlanningExecution['videoPack'],
    publishCopy: body,
    ...overrides,
  } as MediaPlanningExecution;
}

describe('v5 Hook Studio and storycraft quality gate', () => {
  it('has several different storytelling shapes, not one forced script template', () => {
    expect(MEDIA_STORYCRAFT_CONTRACT.storyShapes.length).toBeGreaterThanOrEqual(5);
    expect(mediaStorytellingPromptPolicy()).toContain('HOOK LAB');
  });
  it('passes a finished, grounded story with a credible real hook and progression', () => {
    const review = reviewCreatorQuality(fixture());
    expect(review.verdict).toBe('pass');
    expect(review.score).toBeGreaterThanOrEqual(8.5);
  });
  it('rejects clickbait even with a long, apparently detailed story', () => {
    const item = fixture({hook:'You will not believe this secret formula'});
    const result = reviewCreatorQuality(item);
    expect(result.verdict).toBe('revise');
    expect(result.dimensions.hook).toBeLessThan(8);
  });
  it('rejects a video when the selected hook is not its actual opening line', () => {
    const item = fixture({hook:'My customer said the strangest thing yesterday'});
    const result = reviewCreatorQuality(item);
    expect(result.verdict).toBe('revise');
    expect(result.issues.join(' ')).toMatch(/not spoken verbatim/);
  });
  it('rejects missing visual, missing real narrative stakes or repeated alternate hooks', () => {
    const item = fixture({openingVisual:'', storyTurn:'', hookAlternatives:['One weird chess story','One weird chess story']});
    const result = reviewCreatorQuality(item);
    expect(result.verdict).toBe('revise');
    expect(result.issues.join(' ')).toMatch(/Hook Studio/);
    expect(result.issues.join(' ')).toMatch(/tension/);
  });
  it('continues to score final audience copy and detects duplicate weeks', () => {
    const item = fixture();
    const result = auditCreatorWeek([item, fixture({title:'Duplicate story'})]);
    expect(result).toHaveLength(2);
    expect(result[0].result.verdict).toBe('revise');
    expect(result[0].result.issues.join(' ')).toMatch(/Similar finished copy/);
  });
});
