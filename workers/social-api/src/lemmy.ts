import { createParticipants } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

const defaultHosts = ['lemmy.world', 'lemmy.ml', 'jlai.lu', 'feddit.org'];
const pageSize = 50;

interface LemmyPerson { id: number; name: string; display_name?: string; actor_id: string; deleted?: boolean; bot_account?: boolean }
interface LemmyPost { id: number; name: string; creator_id: number; published?: string; deleted?: boolean; removed?: boolean; ap_id?: string }
interface LemmyPostView { post: LemmyPost; creator: LemmyPerson; counts?: { comments?: number } }
interface LemmyCommentView {
  comment: { id: number; content: string; path: string; published?: string; deleted?: boolean; removed?: boolean; ap_id?: string };
  creator: LemmyPerson;
}

export function lemmyAllowedHosts(env: Env): Set<string> {
  const values = (env.LEMMY_ALLOWED_HOSTS || defaultHosts.join(',')).split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return new Set(values.filter(host => /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(host)));
}

export function parseLemmyUrl(input: string, env: Env): { host: string; postId: string } | null {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !lemmyAllowedHosts(env).has(host)) return null;
    const match = url.pathname.match(/^\/post\/([1-9]\d{0,19})\/?$/u);
    return match ? { host, postId: match[1] } : null;
  } catch { return null; }
}

function assertEnabled(env: Env) {
  if (env.LEMMY_ENABLED !== 'true') throw new Error('Le connecteur Lemmy n’est pas activé (not enabled).');
}

async function lemmyJson<T>(endpoint: URL): Promise<T> {
  let response: Response;
  try { response = await fetch(endpoint, { signal: AbortSignal.timeout(15000), redirect: 'manual', headers: { accept: 'application/json' } }); }
  catch { throw new ProviderRequestError('L’instance Lemmy ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('L’instance Lemmy est temporairement limitée ou indisponible.', true);
    throw new ProviderRequestError(`Publication Lemmy indisponible (${response.status}). Vérifiez qu’elle est publique et appartient à une instance prise en charge.`, false);
  }
  try { return await response.json() as T; }
  catch { throw new ProviderRequestError('Réponse Lemmy invalide : le tirage est interrompu.', false); }
}

function publicationKey(host: string, postId: string): string { return `${host}|${postId}`; }
function splitPublicationKey(value: string): { host: string; postId: string } {
  const separator = value.indexOf('|');
  if (separator < 1) throw new Error('Référence Lemmy invalide.');
  return { host: value.slice(0, separator), postId: value.slice(separator + 1) };
}

function federatedUsername(person: LemmyPerson): string {
  try { return `${person.name}@${new URL(person.actor_id).hostname.toLowerCase()}`; }
  catch { return person.name; }
}

export async function getLemmyPublication(input: string, env: Env): Promise<SocialPublication> {
  assertEnabled(env);
  const parsed = parseLemmyUrl(input, env);
  if (!parsed) throw new Error(`Utilisez un lien public provenant d’une instance prise en charge : ${[...lemmyAllowedHosts(env)].join(', ')}.`);
  const endpoint = new URL(`https://${parsed.host}/api/v3/post`);
  endpoint.searchParams.set('id', parsed.postId);
  const payload = await lemmyJson<{ post_view?: LemmyPostView }>(endpoint);
  const view = payload.post_view;
  if (!view?.post?.id || !view.creator?.actor_id || view.post.deleted || view.post.removed || view.creator.deleted) throw new Error('Publication Lemmy introuvable, supprimée ou incomplète.');
  return {
    provider: 'lemmy', providerPublicationId: publicationKey(parsed.host, String(view.post.id)),
    canonicalUrl: view.post.ap_id || `https://${parsed.host}/post/${view.post.id}`,
    authorProviderId: view.creator.actor_id, authorName: view.creator.display_name || federatedUsername(view.creator),
    title: view.post.name.slice(0, 1000), publishedAt: view.post.published,
  };
}

export async function getLemmyParticipantsPage(publicationId: string, pageToken: string | undefined, rules: ContestRules, env: Env) {
  assertEnabled(env);
  const { host, postId } = splitPublicationKey(publicationId);
  if (!lemmyAllowedHosts(env).has(host) || !/^[1-9]\d{0,19}$/u.test(postId)) throw new Error('Instance ou publication Lemmy non autorisée.');
  const page = pageToken ? Number.parseInt(pageToken, 10) : 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1200) throw new Error('Pagination Lemmy invalide.');
  const endpoint = new URL(`https://${host}/api/v3/comment/list`);
  endpoint.search = new URLSearchParams({ post_id: postId, sort: 'New', type_: 'All', limit: String(pageSize), page: String(page) }).toString();
  const payload = await lemmyJson<{ comments?: LemmyCommentView[] }>(endpoint);
  if (!Array.isArray(payload.comments)) throw new Error('Réponse Lemmy incomplète : le tirage est interrompu.');
  const comments: SocialComment[] = payload.comments.flatMap(view => {
    if (!view.comment?.id || !view.creator?.actor_id || view.comment.deleted || view.comment.removed || view.creator.deleted) return [];
    return [{
      providerCommentId: view.comment.ap_id || `${host}:${view.comment.id}`,
      providerUserId: view.creator.actor_id,
      username: federatedUsername(view.creator), displayName: view.creator.display_name || view.creator.name,
      text: view.comment.content || '', isReply: view.comment.path.split('.').filter(Boolean).length > 2,
      createdAt: view.comment.published,
    }];
  });
  return {
    participants: createParticipants(comments, rules, getProviderCapabilities('lemmy')),
    nextPageToken: payload.comments.length === pageSize ? String(page + 1) : undefined,
    totalResults: payload.comments.length,
  };
}
