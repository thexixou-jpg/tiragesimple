import type { Env, SocialComment, SocialPublication } from './types';
import { ProviderRequestError } from './provider-http';

interface VimeoUser { uri?: string; name?: string; link?: string }
interface VimeoComment {
  uri?: string; text?: string; created_on?: string; deleted_on?: string | null; user?: VimeoUser | null;
  metadata?: { connections?: { user?: VimeoUser; guest_user?: VimeoUser; replies?: { total?: number; uri?: string } } };
}
interface VimeoPage<T> { data?: T[]; total?: number; page?: number; per_page?: number; paging?: { next?: string | null } }
interface VimeoVideo {
  uri?: string; name?: string; link?: string; created_time?: string; user?: VimeoUser;
  pictures?: { sizes?: Array<{ width?: number; link?: string }> };
}

let tokenCache: { token: string; key: string } | undefined;

export function parseVimeoUrl(input: string): { videoId: string } | null {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !['vimeo.com','player.vimeo.com'].includes(host)) return null;
    const match = host === 'player.vimeo.com' ? url.pathname.match(/^\/video\/([1-9]\d{5,14})\/?$/u) : url.pathname.match(/\/([1-9]\d{5,14})\/?$/u);
    return match ? { videoId: match[1] } : null;
  } catch { return null; }
}

function assertEnabled(env: Env) {
  if (env.VIMEO_ENABLED !== 'true' || !env.VIMEO_CLIENT_ID || !env.VIMEO_CLIENT_SECRET) throw new Error('Le connecteur Vimeo doit encore être activé avec une application officielle (not enabled).');
}

async function accessToken(env: Env): Promise<string> {
  assertEnabled(env);
  const key = env.VIMEO_CLIENT_ID!;
  if (tokenCache?.key === key) return tokenCache.token;
  let response: Response;
  try {
    response = await fetch('https://api.vimeo.com/oauth/authorize/client', {
      method:'POST', redirect:'manual', signal:AbortSignal.timeout(15000),
      headers:{ authorization:`basic ${btoa(`${env.VIMEO_CLIENT_ID}:${env.VIMEO_CLIENT_SECRET}`)}`, accept:'application/vnd.vimeo.*+json;version=3.4', 'content-type':'application/json' },
      body:JSON.stringify({ grant_type:'client_credentials', scope:'public' }),
    });
  } catch { throw new ProviderRequestError('Vimeo ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('Vimeo limite temporairement les requêtes.', true);
    throw new ProviderRequestError('Authentification Vimeo refusée. Vérifiez l’application configurée.', false);
  }
  const payload=await response.json() as { access_token?: string };
  if (!payload.access_token) throw new ProviderRequestError('Réponse OAuth Vimeo incomplète.', false);
  tokenCache={ token:payload.access_token, key };
  return tokenCache.token;
}

async function vimeoJson<T>(path:string, env:Env):Promise<T> {
  const token=await accessToken(env);
  let response:Response;
  try { response=await fetch(`https://api.vimeo.com${path}`,{ redirect:'manual',signal:AbortSignal.timeout(20000),headers:{ authorization:`bearer ${token}`,accept:'application/vnd.vimeo.*+json;version=3.4' } }); }
  catch { throw new ProviderRequestError('Vimeo ne répond pas. Une nouvelle tentative sera effectuée.',true); }
  if(!response.ok){
    if(response.status===401){tokenCache=undefined;throw new ProviderRequestError('Le jeton Vimeo a expiré. Une nouvelle tentative sera effectuée.',true);}
    if(response.status===429||response.status>=500)throw new ProviderRequestError('Vimeo limite temporairement les requêtes.',true);
    if(response.status===403)throw new ProviderRequestError('Cette vidéo ou ses commentaires ne sont pas accessibles à l’application Vimeo.',false);
    throw new ProviderRequestError(`Vidéo Vimeo indisponible (${response.status}).`,false);
  }
  try{return await response.json() as T;}catch{throw new ProviderRequestError('Réponse Vimeo invalide : le tirage est interrompu.',false);}
}

function commentId(uri:string|undefined):string|undefined{return uri?.match(/\/comments\/([1-9]\d{0,19})$/u)?.[1];}

export function vimeoComment(comment:VimeoComment,isReply:boolean):SocialComment|undefined{
  if(!comment.uri||comment.deleted_on||!comment.text)return undefined;
  const identity=comment.metadata?.connections?.user || comment.metadata?.connections?.guest_user || comment.user || undefined;
  if(!identity?.uri)return undefined;
  const name=identity.name?.trim() || undefined;
  return { providerCommentId:comment.uri,providerUserId:identity.uri,username:name?.toLocaleLowerCase('fr-FR'),displayName:name,text:comment.text,isReply,createdAt:comment.created_on };
}

export async function getVimeoPublication(input:string,env:Env):Promise<SocialPublication>{
  assertEnabled(env);const parsed=parseVimeoUrl(input);if(!parsed)throw new Error('Utilisez le lien complet d’une vidéo Vimeo publique.');
  const video=await vimeoJson<VimeoVideo>(`/videos/${parsed.videoId}`,env);
  if(video.uri!==`/videos/${parsed.videoId}`||!video.name||!video.link)throw new Error('Vidéo Vimeo introuvable ou incomplète.');
  const picture=[...(video.pictures?.sizes||[])].sort((a,b)=>(b.width||0)-(a.width||0)).find(item=>item.link?.startsWith('https://'))?.link;
  return {provider:'vimeo',providerPublicationId:parsed.videoId,canonicalUrl:video.link,authorProviderId:video.user?.uri,authorName:video.user?.name,title:video.name.slice(0,1000),thumbnailUrl:picture,publishedAt:video.created_time};
}

export async function getVimeoCommentPage(videoId:string,pageToken:string|undefined,includeReplies:boolean,env:Env){
  if(!/^[1-9]\d{5,14}$/u.test(videoId))throw new Error('Référence Vimeo invalide.');
  const page=pageToken?Number.parseInt(pageToken,10):1;if(!Number.isSafeInteger(page)||page<1||page>1200)throw new Error('Pagination Vimeo invalide.');
  const payload=await vimeoJson<VimeoPage<VimeoComment>>(`/videos/${videoId}/comments?page=${page}&per_page=100&direction=asc`,env);
  if(!Array.isArray(payload.data))throw new Error('Liste de commentaires Vimeo incomplète.');
  return {comments:payload.data.flatMap(value=>{const normalized=vimeoComment(value,false);return normalized?[normalized]:[];}),replyParentIds:includeReplies?payload.data.filter(value=>(value.metadata?.connections?.replies?.total||0)>0).map(value=>commentId(value.uri)).filter((value):value is string=>Boolean(value)):[],nextPageToken:payload.paging?.next?String(page+1):undefined,totalResults:payload.data.length};
}

export async function getVimeoReplyPage(videoId:string,parentId:string,pageToken:string|undefined,env:Env){
  if(!/^[1-9]\d{5,14}$/u.test(videoId)||!/^[1-9]\d{0,19}$/u.test(parentId))throw new Error('Référence de réponse Vimeo invalide.');
  const page=pageToken?Number.parseInt(pageToken,10):1;if(!Number.isSafeInteger(page)||page<1||page>1200)throw new Error('Pagination Vimeo invalide.');
  const payload=await vimeoJson<VimeoPage<VimeoComment>>(`/videos/${videoId}/comments/${parentId}/replies?page=${page}&per_page=100&direction=asc`,env);
  if(!Array.isArray(payload.data))throw new Error('Liste de réponses Vimeo incomplète.');
  return {comments:payload.data.flatMap(value=>{const normalized=vimeoComment(value,true);return normalized?[normalized]:[];}),nextPageToken:payload.paging?.next?String(page+1):undefined,totalResults:payload.data.length};
}
