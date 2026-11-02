export type StudioPlatform = 'instagram' | 'youtube' | 'linkedin' | 'x' | 'whatsapp';
export type StudioFormat = 'reel' | 'short' | 'long_video' | 'carousel' | 'image' | 'text' | 'story';
export type StudioSlot = {
  id: string; date: string; platform: StudioPlatform; format: StudioFormat;
  seriesKey: string; seriesName: string;
};
export type StudioPost = StudioSlot & {
  title: string; hook: string; hookAlternatives: string[];
  copy: string; script: string; shotLocation: string;
  shotList: Array<{time: string; shot: string; direction: string; spokenLine?: string}>;
  slides: Array<{headline: string; copy: string; visual: string}>;
  cover: string; caption: string; hashtags: string[];
  pinnedComment: string; evidenceId: string; storyArc?:string;
  status: 'ready' | 'needs_review' | 'needs_input' | 'writing_failed';
  reason: string; fingerprint: string; source: string;
  editorial?: {score:number;pass:boolean;dimensions:Record<string,number>;issues:string[];version:string};
  trend?: {status:'evergreen'|'verified_signal';title?:string;source?:string;url?:string;publishedAt?:string};
};
export const MEDIA_STUDIO_PLATFORMS: StudioPlatform[] = ['instagram','youtube','linkedin','x','whatsapp'];
export function studioLocalDate(now = new Date()): string {
  // ISO local date without accidentally using the server's UTC calendar.
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
export function studioAddDays(ymd: string, days: number): string {
  const epoch = Date.parse(`${ymd}T00:00:00.000Z`);
  if (!Number.isFinite(epoch)) throw new Error('Invalid local date');
  return new Date(epoch + days * 86_400_000).toISOString().slice(0,10);
}
export function studioFingerprint(text: string) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim().slice(0,350);
}
export function studioSimilar(a: string, b: string): number {
  const aa = new Set(studioFingerprint(a).split(' ').filter(x => x.length >= 3));
  const bb = new Set(studioFingerprint(b).split(' ').filter(x => x.length >= 3));
  if (!aa.size || !bb.size) return 0;
  const shared = [...aa].filter(word => bb.has(word)).length;
  return shared / Math.max(1, Math.min(aa.size, bb.size));
}
export function studioCadence(date: string): Array<{platform: StudioPlatform;format: StudioFormat}> {
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  const weekly: Record<number, Array<{platform:StudioPlatform;format:StudioFormat}>> = {
    0: [{platform:'linkedin',format:'text'},{platform:'x',format:'text'},{platform:'whatsapp',format:'story'}],
    1: [{platform:'instagram',format:'reel'},{platform:'youtube',format:'short'},{platform:'linkedin',format:'text'}],
    2: [{platform:'linkedin',format:'text'},{platform:'x',format:'text'},{platform:'whatsapp',format:'story'}],
    3: [{platform:'instagram',format:'reel'},{platform:'youtube',format:'short'},{platform:'linkedin',format:'text'}],
    4: [{platform:'instagram',format:'carousel'},{platform:'x',format:'text'}],
    5: [{platform:'instagram',format:'reel'},{platform:'youtube',format:'long_video'},{platform:'linkedin',format:'text'}],
    6: [{platform:'youtube',format:'short'},{platform:'x',format:'text'},{platform:'whatsapp',format:'story'}],
  };
  return [{platform:'instagram',format:'story'},...(weekly[weekday] || [])];
}
export function studioBuildSlots(date: string, active: Array<{key:string;name:string;channels:string[]}>): StudioSlot[] {
  const slots: StudioSlot[] = [];
  let index = new Date(`${date}T12:00:00Z`).getUTCDay() * 3;
  for (const item of studioCadence(date)) {
    const eligible = active.filter(x => x.channels.includes(item.platform));
    if (!eligible.length) continue; // Owner-selected platforms are authoritative.
    const selected = eligible[index % eligible.length]; index++;
    slots.push({id:`${date}:${item.platform}:${item.format}:${slots.length}`,date,platform:item.platform,format:item.format,seriesKey:selected.key,seriesName:selected.name});
  }
  return slots;
}
