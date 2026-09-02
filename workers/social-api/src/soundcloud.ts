import type { Env, SocialComment, SocialPublication } from './types';
import { ProviderRequestError } from './provider-http';

interface SoundCloudUser { urn?: string; username?: string; permalink?: string; permalink_url?: string }
interface SoundCloudTrack {
  urn?: string; kind?: string; title?: string; artwork_url?: string; created_at?: string; permalink_url?: string;
  sharing?: string; commentable?: boolean; reveal_comments?: boolean; user?: SoundCloudUser | null;
}
interface SoundCloudComment {
  urn?: string; kind?: string; body?: string; created_at?: string; user_urn?: string; track_urn?: string;
  user?: SoundCloudUser | null;
}
interface SoundCloudPage { collection?: SoundCloudComment[]; next_href?: string | null }
interface TokenPayload { access_token?: string; refresh_token?: string; expires_in?: number }

let tokenCache: { accessToken: string; refreshToken?: string; expiresAt: number; key: string } | undefined;

export function parseSoundCloudUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !['soundcloud.com', 'on.soundcloud.com'].includes(host)) return null;
    if (host === 'on.soundcloud.com') return /^\/[A-Za-z0-9_-]{3,100}\/?$/u.test(url.pathname) ? url : null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]{1,100}$/u.test(part))) return null;
    return url;
  } catch { return null; }
}

function assertEnabled(env: Env) {
  if (env.SOUNDCLOUD_ENABLED !== 'true' || !env.SOUNDCLOUD_CLIENT_ID || !env.SOUNDCLOUD_CLIENT_SECRET) throw new Error('Le connecteur SoundCloud doit encore être activé avec une application officielle (not enabled).');
}

async function exchangeToken(env: Env, refreshToken?: string): Promise<TokenPayload> {
  let response: Response;
  const body = new URLSearchParams(refreshToken
    ? { grant_type: 'refresh_token', client_id: env.SOUNDCLOUD_CLIENT_ID!, client_secret: env.SOUNDCLOUD_CLIENT_SECRET!, refresh_token: refreshToken }
    : { grant_type: 'client_credentials' });
  try {
    response = await fetch('https://secure.soundcloud.com/oauth/token', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), body,
      headers: {
        accept: 'application/json; charset=utf-8', 'content-type': 'application/x-www-form-urlencoded',
        ...(refreshToken ? {} : { authorization: `Basic ${btoa(`${env.SOUNDCLOUD_CLIENT_ID}:${env.SOUNDCLOUD_CLIENT_SECRET}`)}` }),
      },
    });
  } catch { throw new ProviderRequestError('SoundCloud ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('SoundCloud limite temporairement les requêtes.', true);
    throw new ProviderRequestError('Authentification SoundCloud refusée. Vérifiez l’application configurée.', false);
  }
  try { return await response.json() as TokenPayload; }
  catch { throw new ProviderRequestError('Réponse OAuth SoundCloud incomplète.', false); }
}

async function accessToken(env: Env): Promise<string> {
  assertEnabled(env);
  const key = env.SOUNDCLOUD_CLIENT_ID!;
  if (tokenCache?.key === key && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.accessToken;
  let payload: TokenPayload;
  try { payload = await exchangeToken(env, tokenCache?.key === key ? tokenCache.refreshToken : undefined); }
  catch (error) {
    if (!tokenCache?.refreshToken || tokenCache.key !== key) throw error;
    tokenCache = undefined;
    payload = await exchangeToken(env);
  }
  if (!payload.access_token) throw new ProviderRequestError('Réponse OAuth SoundCloud incomplète.', false);
  tokenCache = { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + Math.max(300, payload.expires_in ?? 3599) * 1000, key };
  return tokenCache.accessToken;
}

async function soundCloudResponse(path: string, env: Env): Promise<Response> {
  const token = await accessToken(env);
  let response: Response;
  try {
    response = await fetch(`https://api.soundcloud.com${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { authorization: `OAuth ${token}`, accept: 'application/json; charset=utf-8' } });
  } catch { throw new ProviderRequestError('SoundCloud ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (response.status === 401) { tokenCache = undefined; throw new ProviderRequestError('Le jeton SoundCloud a expiré. Une nouvelle tentative sera effectuée.', true); }
  if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('SoundCloud limite temporairement les requêtes.', true);
  if (response.status === 403) throw new ProviderRequestError('Cette piste ou ses commentaires ne sont pas accessibles à l’application SoundCloud.', false);
  if (!response.ok && response.status !== 302) throw new ProviderRequestError(`Piste SoundCloud indisponible (${response.status}).`, false);
  return response;
}

async function soundCloudJson<T>(path: string, env: Env): Promise<T> {
  const response = await soundCloudResponse(path, env);
  try { return await response.json() as T; }
  catch { throw new ProviderRequestError('Réponse SoundCloud invalide : le tirage est interrompu.', false); }
}

function validTrackUrn(value: string | undefined): value is string { return /^soundcloud:tracks:[1-9]\d{0,19}$/u.test(value ?? ''); }
function validUserUrn(value: string | undefined): value is string { return /^soundcloud:users:[1-9]\d{0,19}$/u.test(value ?? ''); }

export function soundCloudComment(comment: SoundCloudComment, trackUrn: string): SocialComment | undefined {
  const userUrn = comment.user?.urn || comment.user_urn;
  if (!/^soundcloud:comments:[1-9]\d{0,19}$/u.test(comment.urn ?? '') || !validUserUrn(userUrn) || comment.track_urn !== trackUrn || !comment.body) return undefined;
  const name = comment.user?.username?.trim() || undefined;
  return { providerCommentId: comment.urn!, providerUserId: userUrn, username: comment.user?.permalink || name?.toLocaleLowerCase('fr-FR'), displayName: name, text: comment.body, isReply: false, createdAt: comment.created_at };
}

function nextCursor(nextHref: string | null | undefined, trackUrn: string): string | undefined {
  if (!nextHref) return undefined;
  try {
    const url = new URL(nextHref);
    const expectedPaths = [`/tracks/${trackUrn}/comments`, `/tracks/${encodeURIComponent(trackUrn)}/comments`];
    if (url.protocol !== 'https:' || url.hostname !== 'api.soundcloud.com' || url.port || !expectedPaths.some(path => path.toLowerCase() === url.pathname.toLowerCase())) return undefined;
    const cursor = url.searchParams.get('cursor');
    return cursor && cursor.length <= 500 ? cursor : undefined;
  } catch { return undefined; }
}

export async function getSoundCloudPublication(input: string, env: Env): Promise<SocialPublication> {
  assertEnabled(env);
  const url = parseSoundCloudUrl(input);
  if (!url) throw new Error('Utilisez le lien complet d’une piste SoundCloud publique.');
  const resolved = await soundCloudResponse(`/resolve?url=${encodeURIComponent(url.toString())}`, env);
  const payload = await resolved.json().catch(() => ({})) as { location?: string };
  const location = resolved.headers.get('location') || payload.location;
  if (!location) throw new Error('SoundCloud n’a pas reconnu cette piste.');
  let resource: URL;
  try { resource = new URL(location); } catch { throw new Error('Réponse de résolution SoundCloud invalide.'); }
  if (resource.protocol !== 'https:' || resource.hostname !== 'api.soundcloud.com' || !/^\/tracks\/(?:soundcloud%3Atracks%3A)?[1-9]\d{0,19}$/iu.test(resource.pathname)) throw new Error('Le lien SoundCloud ne correspond pas à une piste publique.');
  const track = await soundCloudJson<SoundCloudTrack>(`${resource.pathname}${resource.search}`, env);
  if (!validTrackUrn(track.urn) || track.kind !== 'track' || !track.title || !track.permalink_url || track.sharing !== 'public') throw new Error('Piste SoundCloud publique introuvable ou incomplète.');
  if (track.commentable === false || track.reveal_comments === false) throw new Error('Les commentaires de cette piste SoundCloud ne sont pas accessibles.');
  return { provider: 'soundcloud', providerPublicationId: track.urn, canonicalUrl: track.permalink_url, authorProviderId: validUserUrn(track.user?.urn) ? track.user!.urn : undefined, authorName: track.user?.username, title: track.title.slice(0, 1000), thumbnailUrl: track.artwork_url?.startsWith('https://') ? track.artwork_url.replace(/-large(?=\.jpg(?:$|\?))/u, '-t500x500') : undefined, publishedAt: track.created_at };
}

export async function getSoundCloudCommentPage(trackUrn: string, pageToken: string | undefined, env: Env) {
  if (!validTrackUrn(trackUrn)) throw new Error('Référence SoundCloud invalide.');
  if (pageToken && (pageToken.length > 500 || !/^[A-Za-z0-9_.,:~=-]+$/u.test(pageToken))) throw new Error('Pagination SoundCloud invalide.');
  const path = `/tracks/${encodeURIComponent(trackUrn)}/comments?limit=200&linked_partitioning=true${pageToken ? `&cursor=${encodeURIComponent(pageToken)}` : ''}`;
  const payload = await soundCloudJson<SoundCloudPage>(path, env);
  if (!Array.isArray(payload.collection)) throw new Error('Liste de commentaires SoundCloud incomplète.');
  const cursor = nextCursor(payload.next_href, trackUrn);
  if (payload.next_href && !cursor) throw new Error('Pagination SoundCloud incohérente : aucun tirage partiel ne sera effectué.');
  return { comments: payload.collection.flatMap(value => { const normalized = soundCloudComment(value, trackUrn); return normalized ? [normalized] : []; }), nextPageToken: cursor, totalResults: payload.collection.length };
}
