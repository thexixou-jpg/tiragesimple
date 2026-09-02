import { createParticipants } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

interface HackerNewsItem {
  id?: number;
  deleted?: boolean;
  dead?: boolean;
  type?: 'story' | 'comment' | 'job' | 'poll' | 'pollopt';
  by?: string;
  time?: number;
  text?: string;
  parent?: number;
  kids?: number[];
  title?: string;
}

const batchSize = 25;

export function parseHackerNewsUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'news.ycombinator.com' || url.port || url.username || url.password || url.pathname !== '/item' || url.hash) return null;
    if ([...url.searchParams.keys()].some(key => key !== 'id') || url.searchParams.getAll('id').length !== 1) return null;
    const id = url.searchParams.get('id');
    return id && /^[1-9]\d{0,11}$/u.test(id) ? id : null;
  } catch { return null; }
}

function assertEnabled(env: Env) {
  if (env.HACKERNEWS_ENABLED !== 'true') throw new Error('Le connecteur Hacker News est temporairement désactivé.');
}

async function getItem(id: string, env: Env): Promise<HackerNewsItem> {
  assertEnabled(env);
  let response: Response;
  try {
    response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { accept: 'application/json', 'user-agent': 'TirageSimple/1.0 (+https://tiragesimple.fr)' } });
  } catch { throw new ProviderRequestError('Hacker News ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('Hacker News est temporairement indisponible.', true);
    throw new ProviderRequestError(`Publication Hacker News indisponible (${response.status}).`, false);
  }
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error('Un élément Hacker News dépasse la limite de sécurité de l’outil.');
  try {
    const value = JSON.parse(text) as HackerNewsItem | null;
    if (!value || !Number.isSafeInteger(value.id) || String(value.id) !== id) throw new Error('missing');
    return value;
  } catch { throw new ProviderRequestError('Réponse Hacker News incomplète : le tirage est interrompu.', false); }
}

function decodeHtml(value: string): string {
  return value.replace(/<[^>]*>/gu, ' ').replace(/&#(x[0-9a-f]+|\d+);/giu, (_, code: string) => {
    const point = code[0].toLowerCase() === 'x' ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
    try { return Number.isSafeInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' '; } catch { return ' '; }
  }).replace(/&(nbsp|amp|lt|gt|quot|#39);/giu, entity => ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity.toLowerCase()] || ' ')).replace(/\s+/gu, ' ').trim();
}

export function hackerNewsComment(item: HackerNewsItem, storyId: string): SocialComment | undefined {
  if (item.type !== 'comment' || item.deleted || item.dead || !item.by || !item.text || !Number.isSafeInteger(item.id) || !Number.isSafeInteger(item.parent)) return undefined;
  return {
    providerCommentId: String(item.id), providerUserId: item.by, username: item.by, displayName: item.by,
    text: decodeHtml(item.text), isReply: String(item.parent) !== storyId,
    createdAt: Number.isSafeInteger(item.time) && item.time! > 0 ? new Date(item.time! * 1000).toISOString() : undefined,
  };
}

export async function getHackerNewsPublication(input: string, env: Env): Promise<SocialPublication> {
  const id = parseHackerNewsUrl(input);
  if (!id) throw new Error('Utilisez le lien complet d’une publication Hacker News, au format news.ycombinator.com/item?id=…');
  const item = await getItem(id, env);
  if (!['story', 'poll'].includes(item.type || '') || item.deleted || item.dead || !item.title || !item.by) throw new Error('Cette publication Hacker News ne peut pas être utilisée pour un tirage public.');
  return {
    provider: 'hackernews', providerPublicationId: id, canonicalUrl: `https://news.ycombinator.com/item?id=${id}`,
    authorProviderId: item.by, authorName: item.by, title: decodeHtml(item.title).slice(0, 1000),
    publishedAt: Number.isSafeInteger(item.time) && item.time! > 0 ? new Date(item.time! * 1000).toISOString() : undefined,
  };
}

export async function getHackerNewsParticipantsBatch(storyId: string, pendingIds: string[] | undefined, rules: ContestRules, env: Env) {
  if (!/^[1-9]\d{0,11}$/u.test(storyId)) throw new Error('Référence Hacker News invalide.');
  let pending = pendingIds;
  if (!pending) {
    const story = await getItem(storyId, env);
    if (!['story', 'poll'].includes(story.type || '') || story.deleted || story.dead) throw new Error('Publication Hacker News indisponible pendant l’import.');
    pending = (story.kids || []).map(String);
  }
  if (!Array.isArray(pending) || pending.length > 10000 || pending.some(id => !/^[1-9]\d{0,11}$/u.test(id))) throw new Error('Arbre de commentaires Hacker News invalide ou trop volumineux.');
  const current = pending.slice(0, batchSize);
  const remaining = pending.slice(batchSize);
  const items = await Promise.all(current.map(id => getItem(id, env)));
  const childIds: string[] = [];
  const comments: SocialComment[] = [];
  for (const item of items) {
    if (item.kids !== undefined && (!Array.isArray(item.kids) || item.kids.some(id => !Number.isSafeInteger(id) || id < 1))) throw new Error('Arbre de commentaires Hacker News incohérent.');
    for (const child of item.kids || []) childIds.push(String(child));
    const comment = hackerNewsComment(item, storyId);
    if (comment) comments.push(comment);
  }
  const nextPendingIds = [...remaining, ...childIds];
  if (nextPendingIds.length > 10000) throw new Error('Cette discussion dépasse la limite actuelle de 10 000 commentaires en attente.');
  return {
    participants: createParticipants(comments, rules, getProviderCapabilities('hackernews')),
    totalResults: current.length,
    nextPendingIds: nextPendingIds.length ? nextPendingIds : undefined,
  };
}
