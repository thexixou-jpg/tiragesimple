import { parseDiscourseUrl } from '../../../src/lib/discourse-forums';
import { createParticipants } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import { providerCooldown, saveProviderCooldown } from './provider-cooldown';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

interface Post {
  id:number; topic_id:number; post_number:number; post_type:number; user_id?:number;
  username?:string; name?:string; cooked?:string; created_at?:string;
  hidden?:boolean; deleted_at?:string|null; user_deleted?:boolean; reply_to_post_number?:number|null;
}
interface Topic { id:number; title:string; created_at?:string; archetype?:string; visible?:boolean; post_stream:{posts:Post[];stream?:number[]}; }
type Ref=NonNullable<ReturnType<typeof parseDiscourseUrl>>;
const maxPosts=5000;

function reference(value:string): Ref {
  const parts=value.split('|');
  const ref=parts.length===2 ? parseDiscourseUrl(`https://${parts[0]}/t/${parts[1]}`) : null;
  if(!ref)throw new Error('Référence de sujet Discourse invalide.');
  return ref;
}
async function discourseJson<T>(ref:Ref,path:string,env:Env):Promise<T> {
  if(env.DISCOURSE_ENABLED!=='true')throw new Error('Le connecteur Discourse est désactivé.');
  const cooldownKey=`discourse:${ref.host}`;
  const until=await providerCooldown(env,cooldownKey);
  if(until)throw new ProviderRequestError('Ce forum demande une pause. L’import reprendra après le délai imposé.',true,Math.ceil((until-Date.now())/1000));
  let response:Response;
  try { response=await fetch(`https://${ref.host}${path}`,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{accept:'application/json','user-agent':'TirageSimple/1.0 (+https://tiragesimple.fr)'}}); }
  catch { throw new ProviderRequestError('Le forum ne répond pas. Une nouvelle tentative sera effectuée.',true); }
  if(response.status===429){
    const header=response.headers.get('retry-after');
    const seconds=header && /^\d+$/u.test(header) ? Number(header) : header ? Math.max(1,Math.ceil((Date.parse(header)-Date.now())/1000)) : 60;
    const delay=Number.isFinite(seconds) && seconds>0 ? seconds : 60;
    await saveProviderCooldown(env,cooldownKey,delay);
    throw new ProviderRequestError('Le forum limite temporairement les requêtes. Aucun tirage partiel ne sera effectué.',delay<=43200,delay);
  }
  if(!response.ok)throw new ProviderRequestError(`Sujet public indisponible (${response.status}). Aucun accès privé ou blocage ne sera contourné.`,response.status>=500);
  const text=await response.text();
  if(text.length>4_000_000)throw new Error('Le sujet dépasse la limite de lecture sécurisée.');
  try { return JSON.parse(text) as T; } catch { throw new Error('Le forum n’a pas renvoyé une réponse API valide.'); }
}
function plainText(html:string):string {
  return html.replace(/<[^>]*>/gu,' ').replace(/&#(x[0-9a-f]+|\d+);/giu,(_,code:string)=>{
    const value=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);
    return Number.isSafeInteger(value)&&value>0&&value<=0x10ffff?String.fromCodePoint(value):' ';
  }).replace(/&(amp|lt|gt|quot|apos|nbsp);/gu,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[entity]||' ')).replace(/\s+/gu,' ').trim();
}
async function topic(ref:Ref,env:Env) {
  const data=await discourseJson<Topic>(ref,`/t/${ref.id}.json`,env);
  if(String(data.id)!==ref.id || !data.title || data.visible===false || data.archetype==='private_message' || !Array.isArray(data.post_stream?.posts) || !Array.isArray(data.post_stream.stream))throw new Error('Sujet Discourse public introuvable ou incomplet.');
  const stream=data.post_stream.stream;
  if(!stream.length || stream.length>maxPosts)throw new Error('La limite est de 5 000 messages par sujet. Aucun tirage partiel ne sera effectué.');
  if(stream.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(stream).size!==stream.length)throw new Error('Liste de messages Discourse incohérente.');
  return data;
}
function validatePosts(posts:Post[],ids:string[],topicId:string) {
  if(!Array.isArray(posts)||posts.length!==ids.length||new Set(posts.map(p=>p.id)).size!==ids.length||posts.some(p=>String(p.topic_id)!==topicId||!ids.includes(String(p.id))))throw new Error('Un message manque ou a changé de sujet. Import interrompu ; relancez une collecte complète.');
}
export function discourseComment(post:Post):SocialComment|undefined {
  if(post.post_number<=1 || post.post_type!==1 || post.hidden || post.deleted_at || post.user_deleted || !Number.isSafeInteger(post.user_id) || post.user_id!<1 || !post.username || typeof post.cooked!=='string')return undefined;
  return {providerCommentId:String(post.id),providerUserId:String(post.user_id),username:post.username.toLowerCase(),displayName:post.name||post.username,text:plainText(post.cooked),createdAt:post.created_at,isReply:Boolean(post.reply_to_post_number && post.reply_to_post_number>1)};
}
export async function getDiscoursePublication(input:string,env:Env):Promise<SocialPublication> {
  const ref=parseDiscourseUrl(input);
  if(!ref)throw new Error('Utilisez le lien d’un sujet public Home Assistant, Docker Community ou Discourse Meta.');
  const data=await topic(ref,env);
  const author=data.post_stream.posts.find(p=>p.post_number===1);
  if(!author || !author.user_id || author.user_id<1)throw new Error('Auteur du sujet introuvable.');
  return {provider:'discourse',providerPublicationId:ref.reference,canonicalUrl:ref.canonicalUrl,title:data.title.slice(0,1000),authorProviderId:String(author.user_id),authorName:author.name||author.username,publishedAt:data.created_at};
}
export async function getDiscourseParticipantsBatch(publicationId:string,pending:string[]|undefined,rules:ContestRules,env:Env) {
  const ref=reference(publicationId);
  let posts:Post[],remaining:string[];
  if(pending===undefined){
    const data=await topic(ref,env);
    const stream=data.post_stream.stream!.map(String);
    posts=data.post_stream.posts;
    const initialIds=posts.map(p=>String(p.id));
    if(!initialIds.length || initialIds.some(id=>!stream.includes(id)))throw new Error('Première page Discourse incomplète.');
    validatePosts(posts,initialIds,ref.id);
    remaining=stream.filter(id=>!initialIds.includes(id));
  }else{
    if(!pending.length||pending.length>maxPosts||pending.some(id=>!/^\d{1,12}$/u.test(id))||new Set(pending).size!==pending.length)throw new Error('Pagination Discourse invalide.');
    const ids=pending.slice(0,20);
    const query=new URLSearchParams();ids.forEach(id=>query.append('post_ids[]',id));
    const data=await discourseJson<{post_stream:{posts:Post[]}}>(ref,`/t/${ref.id}/posts.json?${query}`,env);
    posts=data.post_stream?.posts; validatePosts(posts,ids,ref.id); remaining=pending.slice(20);
  }
  const comments=posts.map(discourseComment).filter((item):item is SocialComment=>Boolean(item));
  return {participants:createParticipants(comments,rules,getProviderCapabilities('discourse')),totalResults:posts.length,nextPendingIds:remaining.length?remaining:undefined};
}
