import { createParticipants } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

interface RedditThing { kind?: string; data?: RedditPostData | RedditCommentData | RedditMoreData }
interface RedditListing { data?: { children?: RedditThing[] } }
interface RedditPostData {
  id?: string; name?: string; permalink?: string; title?: string; author?: string; author_fullname?: string;
  created_utc?: number; num_comments?: number; over_18?: boolean; thumbnail?: string; preview?: { images?: Array<{ source?: { url?: string } }> };
}
interface RedditCommentData {
  id?: string; name?: string; body?: string; author?: string; author_fullname?: string; created_utc?: number;
  parent_id?: string; replies?: '' | RedditListing;
}
interface RedditMoreData { children?: string[] }

let tokenCache: { token: string; expiresAt: number; key: string } | undefined;

export function parseRedditUrl(input: string): { postId: string } | null {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    if (host === 'redd.it') {
      const match = url.pathname.match(/^\/([a-z0-9]{5,10})\/?$/iu);
      return match ? { postId: match[1].toLowerCase() } : null;
    }
    if (host !== 'reddit.com' && host !== 'old.reddit.com') return null;
    const match = url.pathname.match(/^\/r\/[A-Za-z0-9_]{2,21}\/comments\/([a-z0-9]{5,10})(?:\/[^/]*)?\/?$/iu);
    return match ? { postId: match[1].toLowerCase() } : null;
  } catch { return null; }
}

function assertEnabled(env: Env) {
  if (env.REDDIT_ENABLED !== 'true' || !env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET || !env.REDDIT_USER_AGENT) {
    throw new Error('Le connecteur Reddit doit encore être activé avec une application OAuth autorisée (not enabled).');
  }
  if (env.REDDIT_USER_AGENT.length < 12 || env.REDDIT_USER_AGENT.length > 200) throw new Error('Le User-Agent Reddit configuré est invalide.');
}

async function accessToken(env: Env): Promise<string> {
  assertEnabled(env);
  const key = `${env.REDDIT_CLIENT_ID}:${env.REDDIT_USER_AGENT}`;
  if (tokenCache?.key === key && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  let response: Response;
  try {
    response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: {
        authorization: `Basic ${btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`)}`,
        'content-type': 'application/x-www-form-urlencoded', 'user-agent': env.REDDIT_USER_AGENT!,
      },
      body: 'grant_type=client_credentials',
    });
  } catch { throw new ProviderRequestError('Reddit ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('Reddit limite temporairement les requêtes.', true);
    throw new ProviderRequestError('Authentification Reddit refusée. Vérifiez l’application et ses autorisations.', false);
  }
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new ProviderRequestError('Réponse OAuth Reddit incomplète.', false);
  tokenCache = { token: payload.access_token, expiresAt: Date.now() + Math.max(60, payload.expires_in || 3600) * 1000, key };
  return tokenCache.token;
}

async function redditJson<T>(path: string, env: Env): Promise<T> {
  const token = await accessToken(env);
  let response: Response;
  try {
    response = await fetch(`https://oauth.reddit.com${path}`, {
      redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': env.REDDIT_USER_AGENT! },
    });
  } catch { throw new ProviderRequestError('Reddit ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 401) tokenCache = undefined;
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('Reddit limite temporairement les requêtes.', true);
    if (response.status === 403) throw new ProviderRequestError('Cette publication Reddit est privée, restreinte ou inaccessible à cette application.', false);
    throw new ProviderRequestError(`Publication Reddit indisponible (${response.status}).`, false);
  }
  try { return await response.json() as T; }
  catch { throw new ProviderRequestError('Réponse Reddit invalide : le tirage est interrompu.', false); }
}

function listingPost(payload: unknown): RedditPostData {
  if (!Array.isArray(payload)) throw new Error('Réponse Reddit incomplète.');
  const listing = payload[0] as RedditListing | undefined;
  const thing = listing?.data?.children?.[0];
  if (thing?.kind !== 't3' || !thing.data) throw new Error('Publication Reddit introuvable ou non publique.');
  return thing.data as RedditPostData;
}

function thumbnail(post: RedditPostData): string | undefined {
  const preview = post.preview?.images?.[0]?.source?.url?.replace(/&amp;/gu, '&');
  if (preview?.startsWith('https://')) return preview;
  return post.thumbnail?.startsWith('https://') ? post.thumbnail : undefined;
}

export async function getRedditPublication(input: string, env: Env): Promise<SocialPublication> {
  assertEnabled(env);
  const parsed = parseRedditUrl(input);
  if (!parsed) throw new Error('Utilisez le lien complet d’une publication Reddit publique ou un lien redd.it.');
  const payload = await redditJson<unknown>(`/comments/${parsed.postId}?raw_json=1&limit=1&depth=1`, env);
  const post = listingPost(payload);
  if (!post.id || !post.name || !post.permalink || !post.title) throw new Error('Métadonnées Reddit incomplètes.');
  return {
    provider: 'reddit', providerPublicationId: post.id,
    canonicalUrl: `https://www.reddit.com${post.permalink}`,
    authorProviderId: post.author_fullname, authorName: post.author,
    title: post.title.slice(0, 1000), thumbnailUrl: thumbnail(post),
    publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : undefined,
  };
}

export function collectRedditThings(things: RedditThing[], comments: SocialComment[], moreIds: Set<string>): void {
  for (const thing of things) {
    if (thing.kind === 'more') {
      for (const id of (thing.data as RedditMoreData | undefined)?.children || []) if (/^[a-z0-9]{1,12}$/iu.test(id)) moreIds.add(id);
      continue;
    }
    if (thing.kind !== 't1') continue;
    const value = thing.data as RedditCommentData | undefined;
    if (!value?.id || !value.name) continue;
    if (value.author_fullname && value.author && value.author !== '[deleted]' && value.body && value.body !== '[deleted]' && value.body !== '[removed]') {
      comments.push({
        providerCommentId: value.name, providerUserId: value.author_fullname,
        username: value.author.toLowerCase(), displayName: value.author, text: value.body,
        isReply: Boolean(value.parent_id?.startsWith('t1_')),
        createdAt: value.created_utc ? new Date(value.created_utc * 1000).toISOString() : undefined,
      });
    }
    if (value.replies && typeof value.replies === 'object') collectRedditThings(value.replies.data?.children || [], comments, moreIds);
  }
}

export async function getRedditParticipants(publicationId: string, rules: ContestRules, env: Env) {
  assertEnabled(env);
  if (!/^[a-z0-9]{5,10}$/iu.test(publicationId)) throw new Error('Référence Reddit invalide.');
  const payload = await redditJson<unknown>(`/comments/${publicationId}?raw_json=1&limit=500&depth=10&sort=old`, env);
  const post = listingPost(payload);
  if ((post.num_comments || 0) > 10000) throw new Error('Cette discussion dépasse la limite actuelle de 10 000 commentaires. Aucun tirage partiel ne sera effectué.');
  const root = (payload as RedditListing[])[1];
  if (!root?.data?.children) throw new Error('Les commentaires Reddit sont indisponibles ou désactivés.');
  const comments: SocialComment[] = [];
  const moreIds = new Set<string>();
  collectRedditThings(root.data.children, comments, moreIds);
  const seen = new Set(comments.map(comment => comment.providerCommentId.replace(/^t1_/u, '')));
  for (const id of seen) moreIds.delete(id);
  let batches = 0;
  while (moreIds.size) {
    if (++batches > 120) throw new Error('L’arbre Reddit est trop fragmenté pour être importé complètement. Aucun tirage partiel ne sera effectué.');
    const ids = [...moreIds].slice(0, 100); ids.forEach(id => moreIds.delete(id));
    const query = new URLSearchParams({ api_type: 'json', raw_json: '1', link_id: `t3_${publicationId}`, children: ids.join(','), sort: 'old' });
    const page = await redditJson<{ json?: { data?: { things?: RedditThing[] } } }>(`/api/morechildren?${query}`, env);
    const things = page.json?.data?.things;
    if (!Array.isArray(things)) throw new Error('Pagination Reddit incomplète. Aucun tirage partiel ne sera effectué.');
    const before = comments.length;
    collectRedditThings(things, comments, moreIds);
    for (const comment of comments.slice(before)) {
      const id = comment.providerCommentId.replace(/^t1_/u, '');
      if (!seen.has(id)) seen.add(id);
      moreIds.delete(id);
    }
    if (comments.length > 10000) throw new Error('La discussion dépasse la limite actuelle de 10 000 commentaires. Aucun tirage partiel ne sera effectué.');
  }
  return { participants: createParticipants(comments, rules, getProviderCapabilities('reddit')), totalResults: comments.length };
}
