/** Independent, zero-token editorial preflight for Media Studio V7.
 * This evaluates delivered copy, not fields the writing model claims to have filled.
 * It is a conservative screening heuristic, NOT a promise of audience retention.
 */
import { StudioPost, studioFingerprint, studioSimilar } from './media-studio-policy';

export type StudioQualityDimension = 'hook'|'story'|'originality'|'authenticity'|'entertainment'|'platform';
export type StudioEditorialResult = {
  score:number;pass:boolean;dimensions:Record<StudioQualityDimension,number>;
  issues:string[];version:'studio-editorial-v2';
};
const round=(v:number)=>Math.round(Math.max(0,Math.min(10,v))*10)/10;
const words=(v:string)=>String(v||'').trim().split(/\s+/).filter(Boolean);
const normalize=(v:string)=>studioFingerprint(v);
const generic=/(?:here is (?:the|a) (?:lesson|thing|experiment)|the first step can still be small|that is not a victory speech|not a motivational speech|the problem isn't a lack of inspiration|try it once, notice what happens|i do not think the answer is|it is worth remembering|a better question|the practical difference is|i care more about the next real attempt|stay with the concrete moment|pick one real practice moment|your audience|say this on camera|use a stronger hook|write a script|film this shot)/i;
const productionSpeech=/(?:^|[.!?]\s+)(?:film|cut to|add b-roll|show the viewer|camera pans|insert footage|zoom in|capture a clip|on.screen text|punch.in|voiceover direction|say this line)\b/i;
const specificity=/\b(?:chess|guitar|spanish|book|chapter|dog|coach|academy|football|cricket|parent|player|invoice|shipping|freight|container|customer|meeting|bug|screen|payment|calendar|voice|piano|school|street|kitchen|desk|notebook|airport|train|phone|app|deadline|rehearsal|walk|practice|conversation|interview|feature|dashboard|test|refund|booking|reel|camera|mic|microphone|chord|pawn|move|code|deployment|release)\b/i;
const action=/\b(?:tried|tested|opened|closed|played|recorded|asked|answered|built|wrote|read|watched|looked|clicked|changed|noticed|stopped|failed|laughed|learned|showed|removed|kept|said|started|decided|measured|discovered|compared|practised|practiced)\b/i;
const contrast=/\b(?:but|until|instead|yet|however|actually|except|although|then|turned out|rather than|even though|versus|vs\.?|on the other hand)\b/i;
const firstSentence=(t:string)=>String(t||'').split(/(?<=[.!?])\s+|\n/).find(Boolean)?.trim()||'';
function related(a:string,b:string){
  const na=normalize(a),nb=normalize(b);
  if(!na||!nb)return false;
  if(na===nb || na.includes(nb) && nb.length>=35 || nb.includes(na) && na.length>=35)return true;
  return studioSimilar(na,nb)>=0.81;
}
export function reviewStudioPost(post:Pick<StudioPost,'title'|'hook'|'script'|'copy'|'format'|'platform'|'evidenceId'|'shotList'|'slides'|'caption'|'seriesKey'>,
  history:ReadonlyArray<{title?:string;hook?:string;copy?:string;fingerprint?:string;seriesKey?:string}>=[],
):StudioEditorialResult {
  const video=['reel','short','long_video'].includes(post.format);
  const body=String(video?post.script:post.format==='carousel'?post.slides.map(s=>`${s.headline}. ${s.copy}`).join(' '):post.copy||post.caption||'');
  const hook=String(post.hook||'').trim();
  const headline=`${post.title||''} ${hook}`;
  const text=words(body);
  const issues:string[]=[];
  const spokenOrText=video || post.format==='text';
  const hookIsFirst=!spokenOrText || normalize(firstSentence(body)).startsWith(normalize(hook).slice(0,28));
  let h=7.6;
  if(words(hook).length>=5 && words(hook).length<=21)h+=0.8;
  else {h-=2;issues.push('Hook is too short, too long, or generic');}
  if(specificity.test(hook)||/\d/.test(hook))h+=0.9;
  else {h-=1.3;issues.push('Opening needs a concrete subject or visible situation');}
  if(contrast.test(hook)||/[!?]/.test(hook))h+=0.5;
  if(!hookIsFirst){h-=3;issues.push(video?'Spoken script must begin with the selected hook':'Publishable text must begin with the selected hook');}
  if(generic.test(hook)){h-=3;issues.push('Opening uses a recycled motivational template');}

  let s=6.7;
  const sentences=body.split(/(?<=[.!?])\s+|\n+/).filter(x=>x.trim().length>10);
  if(sentences.length >= (video?5:post.format==='carousel'?5:2))s+=0.6;
  if(specificity.test(body))s+=0.9;else {s-=1.7;issues.push('Story lacks a concrete scene, object, or situation');}
  if(action.test(body))s+=0.8;else {s-=0.9;issues.push('Story needs a visible action or decision');}
  if(contrast.test(body))s+=0.8;else {s-=1;issues.push('No meaningful tension, contrast, or turn');}
  if(sentences.length>=4 && !related(sentences[0],sentences[sentences.length-1]))s+=0.5;
  if(generic.test(body)){s-=2.4;issues.push('Generic filler or an instruction appears in the final copy');}
  if(video && productionSpeech.test(body)){s-=3.5;issues.push('Filming instructions appear inside spoken dialogue');}
  if(video && post.format==='long_video' && text.length<650){s-=2.6;issues.push('Long-form script is too short to develop a complete story');}
  if(video && post.format!=='long_video' && (text.length<65||text.length>170)){s-=1.9;issues.push('Short-form script length needs editing for retention');}
  if(post.format==='carousel' && post.slides.length<6){s-=1.5;issues.push('Carousel needs a developed visual progression');}
  if(post.format==='carousel' && new Set(post.slides.map(x=>normalize(x.headline))).size<post.slides.length){s-=2;issues.push('Carousel repeats slide headlines');}

  const contentKey=`${headline} ${body.slice(0,300)}`;
  const duplicates=history.filter(h=>related(headline,`${h.title||''} ${h.hook||''}`) ||
    (String(h.copy||'').length>=50 && related(body.slice(0,450),String(h.copy).slice(0,450))));
  let o=duplicates.length?2.5:9.3;
  if(duplicates.length)issues.push('Near-duplicate of existing planned or published content');
  const phrases=body.toLowerCase().match(/\b(?:the first step|small experiment|real attempt|a better question|not a victory speech)\b/g)||[];
  if(phrases.length>1)o-=1.7;
  if(generic.test(body))o-=2.5;

  let a=post.evidenceId?9.1:6.5;
  if(!post.evidenceId)issues.push('No approved source evidence: personal-story claims require verification');
  // First-person past-tense anecdotes need an approved source, not an invented recollection.
  if(!post.evidenceId && /\b(?:i|we) (?:saw|built|met|spoke|tried|learned|realized|realised|failed|visited|received|was told)\b/i.test(body)){
    a=2;issues.push('Unverified first-person anecdote');
  }
  let e=6.9;
  if(specificity.test(body))e+=0.9;
  if(contrast.test(body))e+=0.7;
  if(/\b(?:funny|laughed|laugh|awkward|surprising|ridiculous|honestly|unexpected|mistake|oops|plot twist)\b/i.test(body))e+=0.6;
  if(generic.test(body))e-=2;
  let p=7.7;
  if(!post.seriesKey)p-=2;
  if(video && (!post.shotList || post.shotList.length<3))p-=2;
  if(post.format==='carousel' && post.slides.length<6)p-=1.3;
  if(video && post.platform==='youtube' && post.format==='long_video' && text.length<650)p-=2;
  if(!post.caption && post.platform!=='x' && post.platform!=='linkedin')p-=1;
  const dimensions={hook:round(h),story:round(s),originality:round(o),authenticity:round(a),entertainment:round(e),platform:round(p)};
  const score=round(h*.20+s*.25+o*.20+a*.15+e*.10+p*.10);
  const hardBlock=duplicates.length>0 || generic.test(body) || (spokenOrText && !hookIsFirst) ||
    (video && productionSpeech.test(body)) || (!post.evidenceId && a<4);
  const pass=!hardBlock && score>=8.5 && dimensions.hook>=8 && dimensions.story>=8 &&
    dimensions.originality>=8 && dimensions.authenticity>=7.5;
  if(score<8.5)issues.push(`Independent editorial preflight ${score}/10, target 8.5/10`);
  return {score,pass,dimensions,issues:[...new Set(issues)],version:'studio-editorial-v2'};
}
