import { MediaStudioService } from './media-studio.service';
import { StudioPost } from './media-studio-policy';

const date='2026-11-02';
const hook='The coach had thirty names open, but the attendance button froze.';
const script=`${hook} There were twenty children waiting, and the first lesson was right on the phone screen. I opened the flow and watched where someone clicked. The app assumed perfect Wi-Fi, but the field barely had a signal. We made a different test instead of adding another shiny feature. We compared the actual step with a paper attendance sheet. The result was surprising: the bottleneck was not the number of buttons. The problem was that the flow never recovered from bad connectivity. That told us where to start, without pretending the product was already fixed.`;
const original:StudioPost={
  id:`${date}:instagram:reel:1`,date,platform:'instagram',format:'reel',seriesKey:'founder',seriesName:'Founder, Unfiltered',
  title:'A coach cannot wait for perfect wifi',hook:'Here is one thing about building a product',hookAlternatives:['A common founder lesson'],
  copy:'',script:'Here is one thing about building a product. '+ 'The first step can still be small. '.repeat(65),
  shotLocation:'Real academy',shotList:[{time:'00:00',shot:'Phone',direction:'Show the phone'},{time:'00:10',shot:'Coach',direction:'Film the desk'},{time:'00:20',shot:'Attempt',direction:'Film the test'}],
  slides:[],cover:'One app',caption:'It takes a lot of work.',hashtags:[],pinnedComment:'What is your idea?',
  evidenceId:'approved1',source:'ai',status:'needs_review',reason:'Needs better story',fingerprint:'old-fingerprint',
};
const draft=(slotId:string)=>({slotId,title:'Why a coach could not mark attendance',hook,
  hookAlternatives:['Twenty children were waiting while an app was loading'],copy:'',script,
  shotLocation:'Approved academy workspace',shotList:[1,2,3].map(i=>({time:`00:${i*10}`,shot:'Show original user flow',direction:'Use approved demo visuals',spokenLine:'Spoken dialogue follows full script'})),
  slides:[],cover:'The button froze',caption:'The real test was a coach using it at training.',hashtags:[],pinnedComment:'What would you test?',
  evidenceId:'approved1',storyArc:'A real attempt, user friction and a revised test'});

describe('Media Studio single-asset editorial improvement',()=>{
  function setup(answer:unknown){
    const record:any={date,posts:[{...original}],markModified:jest.fn(),save:jest.fn().mockResolvedValue(true)};
    const days:any={findOne:jest.fn(()=>({lean:async()=>record,...record})),};
    // The final write fetch must be the document with an editable post collection.
    days.findOne=jest.fn().mockImplementationOnce(()=>({lean:async()=>record})).mockImplementation(()=>record);
    const ai=jest.fn().mockResolvedValue({data:answer,usage:{inputTokens:100,outputTokens:500,reasoningTokens:5}});
    const service=new MediaStudioService(days,{} as any,{} as any,{} as any,{} as any,
      {generateStructuredResponse:ai} as any,
      {activePortfolio:async()=>[{key:'founder',channels:['instagram']}]} as any,{} as any);
    jest.spyOn(service as any,'context').mockResolvedValue({evidence:[{id:'approved1',title:'Observed attendance'}],hobbies:[],companies:[],voice:''});
    jest.spyOn(service as any,'recentCopy').mockResolvedValue([]);
    jest.spyOn(service as any,'ensureDate').mockImplementation(()=>{});
    return {record,ai,service};
  }
  it('saves an improvement without overwriting unrelated posts',async()=>{
    const {record,service}=setup({posts:[draft(original.id)]});
    const result=await service.improvePost(date,original.id);
    expect(result.improved).toBe(true);
    expect(record.posts[0].script).toContain('perfect Wi-Fi');
    expect(record.save).toHaveBeenCalledTimes(1);
    expect(record.posts[0].editorial).toBeDefined();
  });
  it('preserves the original if model did not finish the requested post',async()=>{
    const {record,service}=setup({posts:[]});
    const result=await service.improvePost(date,original.id);
    expect(result.improved).toBe(false);
    expect(record.posts[0].fingerprint).toBe('old-fingerprint');
    expect(record.save).not.toHaveBeenCalled();
  });
  it('skips the model entirely when the original already passed',async()=>{
    const {record,ai,service}=setup({posts:[]});
    record.posts[0]={...original,...draft(original.id),status:'ready'};
    await service.improvePost(date,original.id);
    expect(ai).not.toHaveBeenCalled();
  });
});
