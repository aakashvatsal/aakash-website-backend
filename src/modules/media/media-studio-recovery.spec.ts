import { MediaStudioService } from './media-studio.service';
import { studioBuildSlots } from './media-studio-policy';

describe('Media Studio V7.2 per-asset recovery',()=>{
  const date='2026-11-04';
  const active=Array.from({length:5},(_,i)=>({
    key:`series_${i}`,name:`Series ${i}`,channels:['instagram','youtube','linkedin','x','whatsapp'],
    angle:'Real stories from actual personal practice',
  }));
  let stored:Record<string,any>;
  let ai:jest.Mock;
  let service:MediaStudioService;
  beforeEach(()=>{
    stored={};
    const days:any={
      findOne:jest.fn(({date:key})=>({lean:async()=>stored[key]??null})),
      updateOne:jest.fn(async({date:key},{ $set,$setOnInsert}:any)=>{
        stored[key]={...(stored[key]??{}),...($setOnInsert??{}),...($set),date:key};
      }),
    };
    ai=jest.fn();
    service=new MediaStudioService(days,{} as any,{} as any,{} as any,{} as any,
      {generateStructuredResponse:ai} as any,{activePortfolio:async()=>active} as any,{} as any);
    jest.spyOn(service as any,'context').mockResolvedValue({evidence:[],hobbies:[],companies:[],voice:'voice'});
    jest.spyOn(service as any,'recentCopy').mockResolvedValue([]);
    jest.spyOn(service as any,'ensureDate').mockImplementation(()=>{});
  });
  function draftFor(slotId:string){
    const hook='Today I saw the same honest mistake in a real test';
    return {slotId,title:'A real choice in practice',hook,hookAlternatives:['There was one surprising choice'],
      copy:'The visible moment matters more than any generic advice. An actual attempt gave a specific result. We can ask what to improve next.',
      script:hook+' '+Array.from({length:65},(_,i)=>`the ${i} practice detail`).join(' '),
      shotLocation:'Real workspace or approved illustrative desk setup',
      shotList:[0,1,2].map(i=>({time:`00:0${i}`,shot:'Concrete filming frame',direction:'Show a concrete example',spokenLine:'First real line'})),
      slides:[],cover:'A surprising mistake',caption:'The actual difference is visible.',hashtags:[],
      pinnedComment:'What changed?',evidenceId:'',storyArc:'The decision and its consequence'};
  }
  it('checkpoints completed scripts and isolates truncated responses without fake Needs Input',async()=>{
    const slots=studioBuildSlots(date,active);
    expect(slots.length).toBeGreaterThanOrEqual(2);
    ai.mockImplementation(async({input}:any)=>{
      const requested=JSON.parse(input).slot.id;
      if(requested===slots[1].id)throw new Error('AI structured response did not complete: max_output_tokens');
      return {data:{posts:[draftFor(requested)]},usage:{inputTokens:25,outputTokens:120,totalTokens:145,reasoningTokens:5}};
    });
    const output=await service.generateDate(date);
    expect(output.status).toBe('needs_attention');
    expect(stored[date].posts[0].title).toBe('A real choice in practice');
    expect(stored[date].posts[1].status).toBe('writing_failed');
    expect(stored[date].posts[1].reason).not.toContain('personal information required');
    expect(stored[date].generationUsage.calls).toBeGreaterThanOrEqual(slots.length);
    expect(stored[date].posts.every((p:any)=>p.status!=='needs_input')).toBe(true);
    const oldCalls=ai.mock.calls.length;
    ai.mockImplementation(async({input}:any)=>({data:{posts:[draftFor(JSON.parse(input).slot.id)]},usage:{inputTokens:1,outputTokens:100,reasoningTokens:0}}));
    await service.generateDate(date);
    expect(ai.mock.calls.length-oldCalls).toBe(1);
    expect(stored[date].posts[0].script).toContain('practice detail');
    expect(stored[date].posts[1].title).toBe('A real choice in practice');
  });
  it('never calls the AI when completed writing only needs editorial fact review',async()=>{
    ai.mockImplementation(async({input}:any)=>({data:{posts:[draftFor(JSON.parse(input).slot.id)]},
      usage:{inputTokens:1,outputTokens:100,reasoningTokens:0}}));
    await service.generateDate(date);
    const calls=ai.mock.calls.length;
    await service.generateDate(date);
    expect(ai.mock.calls.length).toBe(calls);
  });
});

describe('Media Studio generation budget',()=>{
  it('retains completed assets and records a recoverable failure when budget runs out',async()=>{
    const original=process.env.HSAKAA_MEDIA_STUDIO_MAX_CALLS_PER_DAY;
    process.env.HSAKAA_MEDIA_STUDIO_MAX_CALLS_PER_DAY='1';
    try {
      const date='2026-11-02';
      const active=Array.from({length:5},(_,i)=>({key:`k_${i}`,name:`Test ${i}`,
        channels:['instagram','youtube','linkedin','x','whatsapp']}));
      const stored:Record<string,any>={};
      const days:any={findOne:()=>({lean:async()=>stored[date]??null}),
        updateOne:async(_:any,{ $set }:any)=>{stored[date]={...(stored[date]??{}),...$set};}};
      const ai=jest.fn(async({input}:any)=>{
        const slot=JSON.parse(input).slot;
        const hook='One specific incident made the choice surprisingly difficult';
        return {data:{posts:[{slotId:slot.id,title:'A particular difficulty',hook,hookAlternatives:['The specific alternative'],
          copy:'The example shows a visible tradeoff with specific consequences and a meaningful conclusion. This makes it worthwhile to discuss.',
          script:`${hook} ${'The decision had a consequence. '.repeat(80)}`,
          shotLocation:'Desk',shotList:[1,2,3].map(i=>({time:String(i),shot:'Real shot',direction:'Film',spokenLine:'Dialogue'})),
          slides:[],cover:'One real example',caption:'The stakes were real',hashtags:[],
          pinnedComment:'Tell us what changed',evidenceId:'',storyArc:'Real tradeoffs'}]},
          usage:{inputTokens:200,outputTokens:600,reasoningTokens:20}};
      });
      const service=new MediaStudioService(days,{} as any,{} as any,{} as any,{} as any,
        {generateStructuredResponse:ai} as any,{activePortfolio:async()=>active} as any,{} as any);
      jest.spyOn(service as any,'context').mockResolvedValue({evidence:[],companies:[],hobbies:[],voice:''});
      jest.spyOn(service as any,'recentCopy').mockResolvedValue([]);
      jest.spyOn(service as any,'ensureDate').mockImplementation(()=>{});
      await service.generateDate(date);
      expect(ai).toHaveBeenCalledTimes(1);
      expect(stored[date].posts[0].script).toContain('The decision had a consequence');
      expect(stored[date].posts.slice(1).every((p:any)=>p.status==='writing_failed')).toBe(true);
      expect(stored[date].generationUsage.calls).toBe(1);
    } finally {
      if(original===undefined)delete process.env.HSAKAA_MEDIA_STUDIO_MAX_CALLS_PER_DAY;
      else process.env.HSAKAA_MEDIA_STUDIO_MAX_CALLS_PER_DAY=original;
    }
  });
});
