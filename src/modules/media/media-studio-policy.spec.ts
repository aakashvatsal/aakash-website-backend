import {studioAddDays,studioBuildSlots,studioCadence,studioFingerprint,studioLocalDate,studioSimilar} from './media-studio-policy';
import {normalizePitch} from './media-series-design';

describe('Media Studio V7 invariants',()=>{
  const active=[
    {key:'learn',name:'Learning',channels:['instagram','youtube','whatsapp']},
    {key:'founder',name:'Founder',channels:['linkedin','x']},
    {key:'world',name:'World A-Z',channels:['youtube','instagram']},
    {key:'books',name:'Reading',channels:['linkedin','instagram']},
    {key:'life',name:'Life',channels:['whatsapp','instagram']},
  ];
  it('keeps an eight-date today + seven future range',()=>{
    expect(studioAddDays('2026-11-02',7)).toBe('2026-11-09');
    expect(studioLocalDate(new Date('2026-11-02T21:00:00Z'))).toBe('2026-11-03');
  });
  it('keeps selected platforms authoritative on each date',()=>{
    for(let i=0;i<7;i++){
      const slots=studioBuildSlots(studioAddDays('2026-11-02',i),active);
      expect(slots.length).toBeGreaterThan(0);
      for(const slot of slots)expect(active.find(s=>s.key===slot.seriesKey)?.channels).toContain(slot.platform);
    }
  });
  it('cannot generate WhatsApp stories from a series not opted into WhatsApp',()=>{
    const slots=studioBuildSlots('2026-11-02',active.filter(s=>s.key!=='life'&&s.key!=='learn'));
    expect(slots.some(s=>s.platform==='whatsapp')).toBe(false);
  });
  it('allows WhatsApp Status as a series-selected platform',()=>{
    expect(normalizePitch({name:'World A to Z',angle:'A weekly country exploration with careful cultural storytelling.',
      channels:['instagram','whatsapp']}).channels).toEqual(['instagram','whatsapp']);
  });

  it('keeps all 17 mandatory posts in any seven consecutive calendar days',()=>{
    const activeAll=active.map(s=>({...s,channels:['instagram','youtube','linkedin','x','whatsapp']}));
    for(let offset=0;offset<7;offset++) {
      const formats=Array.from({length:7},(_,i)=>studioBuildSlots(studioAddDays('2026-11-02',offset+i),activeAll));
      const slots=formats.flat();
      const count=(platform:string,format:string)=>slots.filter(s=>s.platform===platform&&s.format===format).length;
      expect(count('instagram','reel')).toBe(3);
      expect(count('instagram','carousel')).toBe(1);
      expect(count('youtube','long_video')).toBe(1);
      expect(count('youtube','short')).toBe(3);
      expect(count('linkedin','text')).toBe(5);
      expect(count('x','text')).toBe(4);
    }
  });
  it('flags closely repeated hooks while ignoring unrelated topics',()=>{
    expect(studioSimilar('the one chess mistake I keep making','the one chess mistake I keep making again')).toBeGreaterThan(.75);
    expect(studioSimilar('guitar practice and a missed chord','customer onboarding in freight software')).toBeLessThan(.4);
  });
});
