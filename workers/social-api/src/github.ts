import { createParticipants } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

const pageSize = 100;
interface GitHubUser { id: number; login: string; type?: string; html_url?: string }
interface GitHubIssue { number: number; title: string; html_url: string; created_at?: string; user: GitHubUser; state?: string; pull_request?: unknown }
interface GitHubComment { id: number; node_id?: string; body?: string; created_at?: string; user: GitHubUser | null }

export function parseGitHubUrl(input: string): { owner: string; repo: string; number: string; kind: 'issues' | 'pull' } | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})\/(issues|pull)\/([1-9]\d{0,9})\/?$/u);
    return match ? { owner: match[1], repo: match[2].replace(/\.git$/iu, ''), kind: match[3] as 'issues' | 'pull', number: match[4] } : null;
  } catch { return null; }
}

function assertEnabled(env: Env) { if (env.GITHUB_ENABLED !== 'true') throw new Error('Le connecteur GitHub n’est pas activé (not enabled).'); }
function headers(env: Env): Headers {
  const value = new Headers({ accept: 'application/vnd.github+json', 'user-agent': 'TirageSimple', 'x-github-api-version': '2026-03-10' });
  if (env.GITHUB_API_TOKEN) value.set('authorization', `Bearer ${env.GITHUB_API_TOKEN}`);
  return value;
}
async function githubJson<T>(endpoint: URL, env: Env): Promise<T> {
  let response: Response;
  try { response = await fetch(endpoint, { signal: AbortSignal.timeout(15000), redirect: 'manual', headers: headers(env) }); }
  catch { throw new ProviderRequestError('GitHub ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 403 || response.status === 429 || response.status >= 500) throw new ProviderRequestError('Le quota GitHub est atteint ou le service est temporairement indisponible.', true);
    throw new ProviderRequestError(`Issue ou pull request GitHub indisponible (${response.status}). Vérifiez qu’elle est publique.`, false);
  }
  try { return await response.json() as T; }
  catch { throw new ProviderRequestError('Réponse GitHub invalide : le tirage est interrompu.', false); }
}

function key(owner: string, repo: string, number: string): string { return `${owner}|${repo}|${number}`; }
function splitKey(value: string): { owner: string; repo: string; number: string } {
  const parts = value.split('|');
  if (parts.length !== 3 || !parseGitHubUrl(`https://github.com/${parts[0]}/${parts[1]}/issues/${parts[2]}`)) throw new Error('Référence GitHub invalide.');
  return { owner: parts[0], repo: parts[1], number: parts[2] };
}

export async function getGitHubPublication(input: string, env: Env): Promise<SocialPublication> {
  assertEnabled(env);
  const parsed = parseGitHubUrl(input);
  if (!parsed) throw new Error('Utilisez le lien public d’une issue ou pull request GitHub.');
  const endpoint = new URL(`https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/issues/${parsed.number}`);
  const issue = await githubJson<GitHubIssue>(endpoint, env);
  if (!issue?.number || !issue.user?.id || !issue.title || !issue.html_url) throw new Error('Issue ou pull request GitHub incomplète.');
  return { provider: 'github', providerPublicationId: key(parsed.owner, parsed.repo, String(issue.number)), canonicalUrl: issue.html_url,
    authorProviderId: String(issue.user.id), authorName: issue.user.login, title: issue.title.slice(0, 1000), publishedAt: issue.created_at };
}

export async function getGitHubParticipantsPage(publicationId: string, pageToken: string | undefined, rules: ContestRules, env: Env) {
  assertEnabled(env);
  const { owner, repo, number } = splitKey(publicationId);
  const page = pageToken ? Number.parseInt(pageToken, 10) : 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error('Pagination GitHub invalide.');
  const endpoint = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments`);
  endpoint.search = new URLSearchParams({ per_page: String(pageSize), page: String(page), sort: 'created', direction: 'asc' }).toString();
  const payload = await githubJson<GitHubComment[]>(endpoint, env);
  if (!Array.isArray(payload)) throw new Error('Réponse GitHub incomplète : le tirage est interrompu.');
  const comments: SocialComment[] = payload.flatMap(comment => comment?.id && comment.user?.id && comment.user.login ? [{
    providerCommentId: comment.node_id || String(comment.id), providerUserId: String(comment.user.id), username: comment.user.login.toLowerCase(),
    displayName: comment.user.login, text: comment.body || '', isReply: false, createdAt: comment.created_at,
  }] : []);
  return { participants: createParticipants(comments, rules, getProviderCapabilities('github')),
    nextPageToken: payload.length === pageSize ? String(page + 1) : undefined, totalResults: payload.length };
}
