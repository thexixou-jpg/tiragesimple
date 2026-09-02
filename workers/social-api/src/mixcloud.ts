import { createParticipants } from './contest-rules';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, Participant, SocialComment, SocialPublication } from './types';

interface MixcloudUser { key?: string; url?: string; name?: string; username?: string }
interface MixcloudComment { key?: string; url?: string; user?: MixcloudUser; submit_date?: string; comment?: string }
interface MixcloudShow {
  key?: string; url?: string; name?: string; created_time?: string; type?: string; user?: MixcloudUser;
  pictures?: Record<string, string>; metadata?: { connections?: Record<string, string> };
}
interface MixcloudPage<T> { data?: T[]; paging?: { next?: string; previous?: string } }

export function parseMixcloudUrl(input: string): { username: string; slug: string; key: string } | null {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    if (url.protocol !== 'https:' || url.port || url.username || url.password || host !== 'mixcloud.com') return null;
    const parts = url.pathname.split('/').filter(Boolean).map(value => decodeURIComponent(value));
    if (parts.length !== 2 || parts.some(value => !/^[A-Za-z0-9_.-]{1,150}$/u.test(value) || value === '.' || value === '..')) return null;
    return { username: parts[0], slug: parts[1], key: `/${parts[0]}/${parts[1]}/` };
  } catch { return null; }
}

async function mixcloudJson<T>(path: string, env: Env): Promise<T> {
  if (env.MIXCLOUD_ENABLED !== 'true') throw new Error('Le connecteur Mixcloud est temporairement désactivé.');
  let response: Response;
  try { response = await fetch(`https://api.mixcloud.com${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } }); }
  catch { throw new ProviderRequestError('Mixcloud ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 403 && response.headers.has('retry-after') || response.status === 429 || response.status >= 500) throw new ProviderRequestError('Mixcloud limite temporairement les requêtes.', true);
    throw new ProviderRequestError(`Émission Mixcloud indisponible (${response.status}).`, false);
  }
  try { return await response.json() as T; }
  catch { throw new ProviderRequestError('Réponse Mixcloud invalide : le tirage est interrompu.', false); }
}

function apiKey(parsed: { username: string; slug: string }) { return `/${encodeURIComponent(parsed.username)}/${encodeURIComponent(parsed.slug)}/`; }
function validUser(user: MixcloudUser | undefined): user is MixcloudUser & { key: string } { return /^\/[A-Za-z0-9_.-]{1,150}\/$/u.test(user?.key ?? ''); }

export function mixcloudComment(value: MixcloudComment): SocialComment | undefined {
  if (!/^\/comments\/[A-Za-z0-9/_-]{3,250}\/$/u.test(value.key ?? '') || !validUser(value.user) || !value.comment) return undefined;
  return { providerCommentId: value.key!, providerUserId: value.user.key, username: value.user.username?.toLocaleLowerCase('fr-FR'), displayName: value.user.name, text: value.comment, isReply: false, createdAt: value.submit_date };
}

function mixcloudParticipant(user: MixcloudUser): Participant | undefined {
  if (!validUser(user)) return undefined;
  return { providerUserId: user.key, username: user.username?.toLocaleLowerCase('fr-FR'), displayName: user.name, entriesCount: 1, eligible: true, reasons: [] };
}

function nextOffset(next: string | undefined, parsed: { username: string; slug: string }, interaction: string): string | undefined {
  if (!next) return undefined;
  try {
    const url = new URL(next); const expected = `${apiKey(parsed)}${interaction}/`;
    if (url.protocol !== 'https:' || url.hostname !== 'api.mixcloud.com' || url.port || url.pathname !== expected) return undefined;
    const offset = url.searchParams.get('offset');
    return offset && /^[1-9]\d{0,8}$/u.test(offset) ? offset : undefined;
  } catch { return undefined; }
}

export async function getMixcloudPublication(input: string, env: Env): Promise<SocialPublication> {
  const parsed = parseMixcloudUrl(input); if (!parsed) throw new Error('Utilisez le lien complet d’une émission Mixcloud publique.');
  const show = await mixcloudJson<MixcloudShow>(`${apiKey(parsed)}?metadata=1`, env);
  if (show.key !== parsed.key || show.type !== 'cloudcast' || !show.name || !show.url || !validUser(show.user)) throw new Error('Émission Mixcloud publique introuvable ou incomplète.');
  const required = ['comments', 'favorites', 'listeners'];
  if (!required.every(name => show.metadata?.connections?.[name]?.startsWith(`https://api.mixcloud.com${apiKey(parsed)}${name}/`))) throw new Error('Les interactions de cette émission Mixcloud ne sont pas accessibles.');
  const picture = show.pictures?.['1024wx1024h'] || show.pictures?.extra_large || show.pictures?.large;
  return { provider: 'mixcloud', providerPublicationId: parsed.key, canonicalUrl: show.url, authorProviderId: show.user.key, authorName: show.user.name || show.user.username, title: show.name.slice(0, 1000), thumbnailUrl: picture?.startsWith('https://') ? picture : undefined, publishedAt: show.created_time };
}

export async function getMixcloudParticipantsPage(publicationKey: string, pageToken: string | undefined, rules: ContestRules, env: Env) {
  const parsed = parseMixcloudUrl(`https://www.mixcloud.com${publicationKey}`); if (!parsed || parsed.key !== publicationKey) throw new Error('Référence Mixcloud invalide.');
  if (pageToken && !/^[1-9]\d{0,8}$/u.test(pageToken)) throw new Error('Pagination Mixcloud invalide.');
  const interaction = rules.interaction === 'comments' ? 'comments' : rules.interaction === 'listeners' ? 'listeners' : 'favorites';
  const payload = await mixcloudJson<MixcloudPage<MixcloudComment | MixcloudUser>>(`${apiKey(parsed)}${interaction}/?limit=100&offset=${pageToken || '0'}`, env);
  if (!Array.isArray(payload.data)) throw new Error('Liste d’interactions Mixcloud incomplète.');
  const offset = nextOffset(payload.paging?.next, parsed, interaction);
  if (payload.paging?.next && !offset) throw new Error('Pagination Mixcloud incohérente : aucun tirage partiel ne sera effectué.');
  let participants: Participant[];
  if (interaction === 'comments') {
    const comments = (payload.data as MixcloudComment[]).flatMap(value => { const comment = mixcloudComment(value); return comment ? [comment] : []; });
    participants = createParticipants(comments, rules, { comments: true, likes: true, reposts: false, mentions: false, followers: false, replies: false });
  } else {
    participants = (payload.data as MixcloudUser[]).flatMap(value => { const participant = mixcloudParticipant(value); return participant ? [participant] : []; });
    const excluded = new Set(rules.excludedUsers);
    participants = participants.filter(value => !excluded.has(value.providerUserId) && !excluded.has(value.username || ''));
  }
  return { participants, nextPageToken: offset, totalResults: payload.data.length };
}
