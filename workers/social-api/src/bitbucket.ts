import { createParticipants } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

interface BitbucketUser { uuid?: string; account_id?: string; nickname?: string; display_name?: string; type?: string }
interface BitbucketLink { href?: string }
interface BitbucketPullRequest { id?: number; title?: string; created_on?: string; author?: BitbucketUser; links?: { html?: BitbucketLink } }
interface BitbucketComment { id?: number; created_on?: string; deleted?: boolean; pending?: boolean; content?: { raw?: string }; user?: BitbucketUser; parent?: { id?: number } }
interface BitbucketPage<T> { values?: T[]; next?: string; page?: number; pagelen?: number; size?: number }
export interface BitbucketReference { workspace: string; repo: string; pullRequestId: string; canonicalUrl: string }

const pageSize = 100;

export function parseBitbucketUrl(input: string): BitbucketReference | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'bitbucket.org' || url.port || url.username || url.password || url.search || url.hash) return null;
    const match = url.pathname.match(/^\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9._-]{1,100})\/pull-requests\/([1-9]\d{0,9})\/?$/u);
    if (!match) return null;
    return { workspace: match[1], repo: match[2], pullRequestId: match[3], canonicalUrl: `https://bitbucket.org/${match[1]}/${match[2]}/pull-requests/${match[3]}` };
  } catch { return null; }
}

function assertEnabled(env: Env) {
  if (env.BITBUCKET_ENABLED !== 'true') throw new Error('Le connecteur Bitbucket est temporairement désactivé.');
}

async function bitbucketJson<T>(path: string, env: Env): Promise<T> {
  assertEnabled(env);
  let response: Response;
  try {
    response = await fetch(`https://api.bitbucket.org/2.0${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { accept: 'application/json', 'user-agent': 'TirageSimple/1.0 (+https://tiragesimple.fr)' } });
  } catch { throw new ProviderRequestError('Bitbucket ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('Le quota Bitbucket est atteint ou le service est temporairement indisponible.', true);
    throw new ProviderRequestError(`Pull request Bitbucket publique indisponible (${response.status}).`, false);
  }
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > 4_000_000) throw new Error('La réponse Bitbucket dépasse la limite de sécurité de l’outil.');
  const text = await response.text();
  if (text.length > 4_000_000) throw new Error('La réponse Bitbucket dépasse la limite de sécurité de l’outil.');
  try { return JSON.parse(text) as T; } catch { throw new ProviderRequestError('Réponse Bitbucket invalide : le tirage est interrompu.', false); }
}

function key(ref: BitbucketReference): string { return `${ref.workspace}|${ref.repo}|${ref.pullRequestId}`; }
function splitKey(value: string): BitbucketReference {
  const parts = value.split('|');
  const parsed = parts.length === 3 ? parseBitbucketUrl(`https://bitbucket.org/${parts[0]}/${parts[1]}/pull-requests/${parts[2]}`) : null;
  if (!parsed) throw new Error('Référence Bitbucket invalide.');
  return parsed;
}
function apiPath(ref: BitbucketReference): string {
  return `/repositories/${encodeURIComponent(ref.workspace)}/${encodeURIComponent(ref.repo)}/pullrequests/${ref.pullRequestId}`;
}
function validUuid(value: string | undefined): value is string { return Boolean(value && /^\{[0-9a-f-]{36}\}$/iu.test(value)); }

export async function getBitbucketPublication(input: string, env: Env): Promise<SocialPublication> {
  const ref = parseBitbucketUrl(input);
  if (!ref) throw new Error('Utilisez le lien complet d’une pull request Bitbucket Cloud publique.');
  const pullRequest = await bitbucketJson<BitbucketPullRequest>(apiPath(ref), env);
  if (!Number.isSafeInteger(pullRequest.id) || String(pullRequest.id) !== ref.pullRequestId || !pullRequest.title || !validUuid(pullRequest.author?.uuid)) throw new Error('Pull request Bitbucket publique introuvable ou incomplète.');
  const returnedUrl = pullRequest.links?.html?.href ? parseBitbucketUrl(pullRequest.links.html.href) : null;
  if (!returnedUrl || returnedUrl.workspace.toLowerCase() !== ref.workspace.toLowerCase() || returnedUrl.repo.toLowerCase() !== ref.repo.toLowerCase() || returnedUrl.pullRequestId !== ref.pullRequestId) throw new Error('Réponse Bitbucket incohérente.');
  return {
    provider: 'bitbucket', providerPublicationId: key(returnedUrl), canonicalUrl: returnedUrl.canonicalUrl,
    authorProviderId: pullRequest.author!.uuid!.toLowerCase(), authorName: pullRequest.author?.display_name || pullRequest.author?.nickname,
    title: pullRequest.title.slice(0, 1000), publishedAt: pullRequest.created_on,
  };
}

export async function getBitbucketParticipantsPage(publicationId: string, pageToken: string | undefined, rules: ContestRules, env: Env) {
  const ref = splitKey(publicationId);
  const page = pageToken ? Number.parseInt(pageToken, 10) : 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 100) throw new Error('Pagination Bitbucket invalide.');
  const payload = await bitbucketJson<BitbucketPage<BitbucketComment>>(`${apiPath(ref)}/comments?pagelen=${pageSize}&page=${page}&sort=created_on`, env);
  if (!Array.isArray(payload.values) || payload.page !== page || typeof payload.pagelen !== 'number' || payload.values.length > pageSize) throw new Error('Pagination Bitbucket incomplète : le tirage est interrompu.');
  const comments: SocialComment[] = payload.values.flatMap(comment => {
    if (!Number.isSafeInteger(comment.id) || comment.deleted || comment.pending || !validUuid(comment.user?.uuid) || typeof comment.content?.raw !== 'string') return [];
    return [{
      providerCommentId: String(comment.id), providerUserId: comment.user.uuid.toLowerCase(),
      username: comment.user.nickname?.toLocaleLowerCase('fr-FR'), displayName: comment.user.display_name || comment.user.nickname,
      text: comment.content.raw, isReply: Number.isSafeInteger(comment.parent?.id), createdAt: comment.created_on,
    }];
  });
  return {
    participants: createParticipants(comments, rules, getProviderCapabilities('bitbucket')),
    totalResults: payload.values.length,
    nextPageToken: payload.next ? String(page + 1) : undefined,
  };
}
