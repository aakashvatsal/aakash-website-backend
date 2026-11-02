import { reviewStudioPost } from './media-studio-editorial';
import { StudioPost } from './media-studio-policy';

const hook='The coach had thirty names open, but the attendance button froze.';
const grounded:StudioPost={
  id:'one',date:'2026-11-02',platform:'instagram',format:'reel',seriesKey:'founder',seriesName:'Founder, Unfiltered',
  title:'An attendance button that got in the way',hook,hookAlternatives:['Why did one button stop the whole session?'],
  script:`${hook} He had twenty children waiting for training while the screen showed a spinner. I opened the flow and watched where he clicked. The app assumed perfect Wi-Fi, but the field had almost none. So I changed the test: instead of another shiny feature, we tried a paper list next to the current screen. The difference was surprising. We learned the attendance process needed a reliable offline path. That test did not prove the final fix, but it showed exactly where to begin.`,
  copy:'',caption:'A simple workflow can hide the most important failure.',shotLocation:'Approved academy location',
  shotList:[{time:'00:00',shot:'Coach phone',direction:'Show approved sample'},{time:'00:08',shot:'Attendance screen',direction:'Show approved UI'},{time:'00:22',shot:'Test',direction:'Show comparison'}],
  slides:[],cover:'One button, twenty waiting',hashtags:[],pinnedComment:'What would you fix first?',
  evidenceId:'approved-academy-observation',status:'needs_review',reason:'',source:'ai',fingerprint:'',
};

describe('Media Studio independent editorial gate',()=>{
  it('passes a specific, evidence-backed, progressive, spoken script',()=>{
    const result=reviewStudioPost(grounded);
    expect(result.score).toBeGreaterThanOrEqual(8.5);
    expect(result.pass).toBe(true);
    expect(result.dimensions.story).toBeGreaterThanOrEqual(8);
  });
  it('rejects advice templates even with full script and populated metadata',()=>{
    const result=reviewStudioPost({...grounded,
      script:`${hook} Here is a better question. The first step can still be small. ${'A better question is always worth asking. '.repeat(28)}`});
    expect(result.pass).toBe(false);
    expect(result.issues.join(' ')).toMatch(/filler|template/i);
  });
  it('rejects a duplicate despite changing its title',()=>{
    const result=reviewStudioPost({...grounded,title:'Reconsidering the attendance workflow'},
      [{title:'Reconsidering the attendance workflow',hook,copy:grounded.script}]);
    expect(result.pass).toBe(false);
    expect(result.dimensions.originality).toBeLessThan(8);
  });
  it('refuses to verify a made-up first-person incident without evidence',()=>{
    const result=reviewStudioPost({...grounded,evidenceId:'',script:`${hook} I met a coach and I built the perfect product. ${grounded.script}`});
    expect(result.pass).toBe(false);
    expect(result.issues).toContain('Unverified first-person anecdote');
  });
  it('catches production instructions mixed into spoken dialogue',()=>{
    const result=reviewStudioPost({...grounded,script:`${hook} Cut to the app screen. ${grounded.script}`});
    expect(result.pass).toBe(false);
    expect(result.issues.join(' ')).toMatch(/Filming instructions/i);
  });
  it('checks that LinkedIn/X publish copy actually opens with its claimed hook',()=>{
    const result=reviewStudioPost({...grounded,format:'text',platform:'linkedin',
      copy:'A generic introduction that ignores the selected hook. '+grounded.script,script:''});
    expect(result.pass).toBe(false);
    expect(result.issues.join(' ')).toMatch(/Publishable text must begin/i);
  });
  it('does not label source-free commentary as a verified personal narrative',()=>{
    const result=reviewStudioPost({...grounded,evidenceId:'',script:grounded.script.replace('I opened the flow','Someone could open the flow')});
    expect(result.pass).toBe(false);
    expect(result.dimensions.authenticity).toBeLessThan(7.5);
  });
});
