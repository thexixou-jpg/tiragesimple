import { createParticipants } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

interface PtAccount { url?: string; name?: string; displayName?: string; host?: string }
interface PtVideo { uuid?: string; name?: string; url?: string; publishedAt?: string; thumbnailPath?: string; account?: PtAccount; commentsPolicy?: { id?: number } }
interface PtComment { id?: number; text?: string; createdAt?: string; inReplyToCommentId?: number | null; isDeleted?: boolean; heldForReview?: boolean; totalReplies?: number; account?: PtAccount }
interface PtPage { total?: number; totalNotDeletedComments?: number; data?: PtComment[] }
interface PtNode { comment?: PtComment; children?: PtNode[] }
interface PtThread { comment?: PtComment; children?: PtNode[] }
export interface PeerTubeReference { host: string; videoId: string; canonicalUrl: string }
const pageSize=100;

function allowedHosts(env: Env): string[] { return (env.PEERTUBE_ALLOWED_HOSTS || '').split(',').map(v=>v.trim().toLowerCase()).filter(v=>/^[a-z0-9.-]+$/u.test(v)); }
export function parsePeerTubeUrl(input: string, hosts: string[]): PeerTubeReference | null {
  try {
    const url=new URL(input); const host=url.hostname.toLowerCase();
    if(url.protocol!=='https:' || !hosts.includes(host) || url.port || url.username || url.password || url.search || url.hash) return null;
    const match=url.pathname.match(/^\/(?:videos\/watch|w)\/([A-Za-z0-9_-]{8,64})\/?$/u);
    if(!match) return null;
    return {host,videoId:match[1],canonicalUrl:`https://${host}${url.pathname.endsWith('/')?url.pathname.slice(0,-1):url.pathname}`};
  } catch { return null; }
}
function assertEnabled(env: Env){if(env.PEERTUBE_ENABLED!=='true'||!env.PEERTUBE_ALLOWED_HOSTS)throw new Error('Le connecteur PeerTube est temporairement désactivé.');}
async function ptJson<T>(host:string,path:string,env:Env):Promise<T>{
  assertEnabled(env); if(!allowedHosts(env).includes(host))throw new Error('Cette instance PeerTube n’est pas encore prise en charge.');
  let response:Response; try{response=await fetch(`https://${host}/api/v1${path}`,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{accept:'application/json','user-agent':'TirageSimple/1.0 (+https://tiragesimple.fr)'}});}catch{throw new ProviderRequestError('L’instance PeerTube ne répond pas. Une nouvelle tentative sera effectuée.',true);}
  if(!response.ok){if(response.status===429||response.status>=500)throw new ProviderRequestError('L’instance PeerTube limite les requêtes ou est temporairement indisponible.',true);throw new ProviderRequestError(`Vidéo PeerTube publique indisponible (${response.status}).`,false);}
  const text=await response.text();if(text.length>4_000_000)throw new Error('La réponse PeerTube dépasse la limite de sécurité de l’outil.');try{return JSON.parse(text) as T;}catch{throw new Error('Réponse PeerTube invalide : import interrompu.');}
}
function stableAccount(a?:PtAccount):{id:string;username?:string;displayName?:string}|null{try{if(!a?.url)return null;const u=new URL(a.url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||a.url.length>500)return null;return{id:u.href.replace(/\/$/u,''),username:a.host?`${a.name}@${a.host}`.toLowerCase():a.name?.toLowerCase(),displayName:a.displayName||a.name};}catch{return null;}}
function key(host:string,uuid:string){return `${host}|${uuid}`;}
function splitKey(value:string){const m=value.match(/^([a-z0-9.-]+)\|([0-9a-f-]{36})$/u);if(!m)throw new Error('Référence PeerTube invalide.');return{host:m[1],uuid:m[2]};}
function normalize(c:PtComment,isReply:boolean):SocialComment[]{const a=stableAccount(c.account);if(!Number.isSafeInteger(c.id)||c.isDeleted||c.heldForReview||!a||typeof c.text!=='string')return[];return[{providerCommentId:String(c.id),providerUserId:a.id,username:a.username,displayName:a.displayName,text:c.text.replace(/<[^>]*>/gu,' '),isReply,createdAt:c.createdAt}];}
function flatten(nodes:PtNode[]):SocialComment[]{return nodes.flatMap(n=>[...normalize(n.comment||{},true),...flatten(Array.isArray(n.children)?n.children:[])]);}

export async function getPeerTubePublication(input:string,env:Env):Promise<SocialPublication>{
  const ref=parsePeerTubeUrl(input,allowedHosts(env));if(!ref)throw new Error('Utilisez le lien complet d’une vidéo provenant d’une instance PeerTube prise en charge.');
  const v=await ptJson<PtVideo>(ref.host,`/videos/${encodeURIComponent(ref.videoId)}`,env);if(!v.uuid||!/^[0-9a-f-]{36}$/u.test(v.uuid)||!v.name||v.commentsPolicy?.id===2)throw new Error('Vidéo PeerTube publique introuvable ou commentaires désactivés.');
  const returned=v.url?parsePeerTubeUrl(v.url,allowedHosts(env)):null;if(!returned||returned.host!==ref.host||returned.videoId!==v.uuid)throw new Error('Utilisez l’URL canonique de la vidéo sur une instance prise en charge.');
  const author=stableAccount(v.account);const thumb=v.thumbnailPath?.startsWith('/')?`https://${ref.host}${v.thumbnailPath}`:undefined;
  return{provider:'peertube',providerPublicationId:key(ref.host,v.uuid),canonicalUrl:returned.canonicalUrl,authorProviderId:author?.id,authorName:author?.displayName,title:v.name.slice(0,1000),thumbnailUrl:thumb,publishedAt:v.publishedAt};
}
export async function getPeerTubeCommentPage(publicationId:string,pageToken:string|undefined,includeReplies:boolean,env:Env){
  const ref=splitKey(publicationId);const start=pageToken?Number.parseInt(pageToken,10):0;if(!Number.isSafeInteger(start)||start<0||start>120000)throw new Error('Pagination PeerTube invalide.');
  const p=await ptJson<PtPage>(ref.host,`/videos/${ref.uuid}/comment-threads?count=${pageSize}&start=${start}&sort=-createdAt`,env);if(!Array.isArray(p.data)||p.data.length>pageSize||!Number.isSafeInteger(p.total))throw new Error('Pagination PeerTube incohérente.');
  return{comments:p.data.flatMap(c=>normalize(c,false)),totalResults:p.data.length,nextPageToken:start+p.data.length<p.total!&&p.data.length?String(start+p.data.length):undefined,replyParentIds:includeReplies?p.data.filter(c=>(c.totalReplies||0)>0&&Number.isSafeInteger(c.id)).map(c=>String(c.id)):[]};
}
export async function getPeerTubeReplyPage(publicationId:string,threadId:string,env:Env){
  const ref=splitKey(publicationId);if(!/^[1-9]\d{0,19}$/u.test(threadId))throw new Error('Fil PeerTube invalide.');const t=await ptJson<PtThread>(ref.host,`/videos/${ref.uuid}/comment-threads/${threadId}`,env);const comments=flatten(Array.isArray(t.children)?t.children:[]);const expected=t.comment?.totalReplies||0;if(comments.length!==expected)throw new Error('Les réponses PeerTube sont tronquées par l’instance : aucun tirage partiel ne sera effectué.');return{comments,totalResults:comments.length};
}
export function peerTubeParticipants(comments:SocialComment[],rules:ContestRules){return createParticipants(comments,rules,getProviderCapabilities('peertube'));}
