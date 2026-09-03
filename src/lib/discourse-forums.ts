/** Public forums verified for the official anonymous Discourse JSON API. */
export const discourseForums = [
  { host:'community.home-assistant.io', name:'Home Assistant' },
  { host:'forums.docker.com', name:'Docker Community' },
  { host:'meta.discourse.org', name:'Discourse Meta' },
] as const;

export function parseDiscourseUrl(input: string) {
  try {
    const url=new URL(input);
    const forum=discourseForums.find(item=>item.host===url.hostname.toLowerCase());
    if(!forum || url.protocol!=='https:' || url.port || url.username || url.password || url.search) return null;
    const match=url.pathname.match(/^\/t\/(?:[a-zA-Z0-9_-]*[a-zA-Z_-][a-zA-Z0-9_-]*\/)?([1-9]\d{0,11})(?:\/[1-9]\d{0,11})?\/?$/u);
    if(!match)return null;
    return {...forum,id:match[1],canonicalUrl:`https://${forum.host}/t/${match[1]}`,reference:`${forum.host}|${match[1]}`};
  } catch { return null; }
}
