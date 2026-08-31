import type { ContestRules, Env, Participant, SocialPublication } from './types';
import { providerJson } from './provider-http';

const api = 'https://public.api.bsky.app/xrpc/';
interface Actor { did: string; handle: string; displayName?: string }

export function parseBlueskyUrl(input: string): { actor: string; rkey: string } | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname !== 'bsky.app' || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([a-zA-Z0-9]+)\/?$/u);
    if (!match) return null;
    const actor = decodeURIComponent(match[1]);
    if (!/^(?:did:(?:plc|web):[a-zA-Z0-9.:-]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/u.test(actor)) return null;
    return { actor, rkey: match[2] };
  } catch { return null; }
}

function assertEnabled(env: Env) {
  if (env.BLUESKY_ENABLED !== 'true') throw new Error('Le connecteur Bluesky n’est pas activé (not enabled).');
}

export async function getBlueskyPublication(input: string, env: Env): Promise<SocialPublication> {
  assertEnabled(env);
  const parsed = parseBlueskyUrl(input);
  if (!parsed) throw new Error('Utilisez un lien https://bsky.app/profile/compte/post/identifiant.');
  let did = parsed.actor;
  if (!did.startsWith('did:')) {
    const resolve = new URL(`${api}com.atproto.identity.resolveHandle`);
    resolve.searchParams.set('handle', did.toLowerCase());
    did = (await providerJson<{ did: string }>(resolve)).did;
  }
  const endpoint = new URL(`${api}app.bsky.feed.getPosts`);
  endpoint.searchParams.append('uris', `at://${did}/app.bsky.feed.post/${parsed.rkey}`);
  const { posts } = await providerJson<{ posts: Array<{ uri: string; author: Actor; record: { text?: string; createdAt?: string } }> }>(endpoint);
  const post = posts[0];
  if (!post || !post.author?.did) throw new Error('Publication Bluesky introuvable, supprimée ou inaccessible.');
  return { provider: 'bluesky', providerPublicationId: post.uri,
    canonicalUrl: `https://bsky.app/profile/${post.author.did}/post/${parsed.rkey}`,
    authorProviderId: post.author.did, authorName: post.author.displayName || post.author.handle,
    title: post.record.text?.slice(0, 1000) || 'Publication Bluesky', publishedAt: post.record.createdAt };
}

export async function getBlueskyParticipantsPage(uri: string, pageToken: string | undefined, rules: ContestRules, env: Env) {
  assertEnabled(env);
  const endpoint = new URL(`${api}${rules.interaction === 'reposts' ? 'app.bsky.feed.getRepostedBy' : 'app.bsky.feed.getLikes'}`);
  endpoint.search = new URLSearchParams({ uri, limit: '100', ...(pageToken ? { cursor: pageToken } : {}) }).toString();
  const payload = await providerJson<{ likes?: Array<{ actor: Actor }>; repostedBy?: Actor[]; cursor?: string }>(endpoint);
  const actors = rules.interaction === 'reposts' ? payload.repostedBy : payload.likes?.map(like => like.actor);
  if (!Array.isArray(actors)) throw new Error('Réponse Bluesky incomplète : le tirage est interrompu.');
  const participants: Participant[] = [...new Map(actors.map(actor => [actor.did, actor])).values()].flatMap(actor => {
    if (!actor.did) throw new Error('Identifiant de participant manquant : le tirage est interrompu.');
    if (rules.excludedUsers.includes(actor.did) || rules.excludedUsers.some(value => value.toLowerCase() === actor.handle.toLowerCase().replace(/^@/u, ''))) return [];
    return [{ providerUserId: actor.did, username: actor.handle, displayName: actor.displayName, entriesCount: 1, eligible: true, reasons: [] }];
  });
  return { participants, nextPageToken: payload.cursor, totalResults: actors.length };
}
