import { MediaStudioService } from './media-studio.service';
import { StudioSlot } from './media-studio-policy';

describe('Media Studio format-specific AI normalization',()=>{
  const slot:StudioSlot={id:'2026-11-19:x:text:0',date:'2026-11-19',platform:'x',
    format:'text',seriesKey:'changed-my-mind',seriesName:'I Changed My Mind'};
  const hook='I opened my phone this morning and noticed the numbers.';
  const draft={slotId:slot.id,title:'Changed my mind about morning routines',hook,
    hookAlternatives:['My health check-in changed a small habit.'],
    copy:`${hook} I used to trust my mood, but the check-in changed how I decide what to do next.`,
    script:'Legacy AI-generated video script.',shotLocation:'Bedroom',
    shotList:[{time:'0:00',shot:'A close-up',direction:'Film the phone',spokenLine:'Start talking'}],
    slides:[{headline:'Video title',copy:'Caption',visual:'Thumbnail'}],
    cover:'A thumbnail',caption:'A video caption',hashtags:[],pinnedComment:'How do you decide?',
    evidenceId:'source-1',storyArc:'A real habit and a changed decision'};
  const service=Object.create(MediaStudioService.prototype) as MediaStudioService;

  it('discards all video and visual fields in an AI-generated X text post',()=>{
    const normalized=(service as any).normalize(slot,draft,new Set(['source-1']),[]);
    expect(normalized.copy).toBe(draft.copy);
    expect(normalized.script).toBe('');
    expect(normalized.shotLocation).toBe('');
    expect(normalized.shotList).toEqual([]);
    expect(normalized.slides).toEqual([]);
    expect(normalized.cover).toBe('');
    expect(normalized.caption).toBe('');
    expect(normalized.fingerprint).not.toContain('Legacy AI-generated');
  });
  it('does not strip the actual spoken script and filming directions from reels',()=>{
    const reel={...slot,platform:'instagram' as const,format:'reel' as const};
    const normalized=(service as any).normalize(reel,draft,new Set(['source-1']),[]);
    expect(normalized.script).toBe(draft.script);
    expect(normalized.shotLocation).toBe('Bedroom');
    expect(normalized.shotList).toHaveLength(1);
  });
});
