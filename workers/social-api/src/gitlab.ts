import { createParticipants } from './contest-rules';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

interface GitLabUser { id?: number | string; username?: string; name?: string; state?: string }
interface GitLabProject { id?: number; path_with_namespace?: string; visibility?: string }
interface GitLabConversation { iid?: number; project_id?: number; title?: string; web_url?: string; created_at?: string; author?: GitLabUser }
interface GitLabNote { id?: number | string; body?: string; created_at?: string; createdAt?: string; system?: boolean; internal?: boolean; confidential?: boolean; author?: GitLabUser }
interface GitLabGraphqlConversation { notes?: { nodes?: GitLabNote[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } } }
interface GitLabGraphqlResponse { data?: { project?: { issue?: GitLabGraphqlConversation | null; mergeRequest?: GitLabGraphqlConversation | null } | null }; errors?: Array<{ message?: string }> }

export interface GitLabReference { projectPath: string; kind: 'issues' | 'merge_requests'; iid: number; canonicalUrl: string }

export function parseGitLabUrl(input: string): GitLabReference | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'gitlab.com' || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/(.+)\/-\/(issues|merge_requests)\/([1-9]\d{0,9})\/?$/u);
    if (!match) return null;
    const parts = match[1].split('/').map(value => decodeURIComponent(value));
    if (parts.length < 2 || parts.length > 20 || parts.some(value => !/^[A-Za-z0-9_.-]{1,255}$/u.test(value) || value === '.' || value === '..')) return null;
    const projectPath = parts.join('/');
    const kind = match[2] as GitLabReference['kind'];
    const iid = Number(match[3]);
    return { projectPath, kind, iid, canonicalUrl: `https://gitlab.com/${parts.map(encodeURIComponent).join('/')}/-/${kind}/${iid}` };
  } catch { return null; }
}

async function gitlabResponse(path: string, env: Env): Promise<Response> {
  if (env.GITLAB_ENABLED !== 'true') throw new Error('Le connecteur GitLab est temporairement désactivé.');
  let response: Response;
  try {
    response = await fetch(`https://gitlab.com/api/v4${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { accept: 'application/json', ...(env.GITLAB_API_TOKEN ? { 'private-token': env.GITLAB_API_TOKEN } : {}) } });
  } catch { throw new ProviderRequestError('GitLab ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('GitLab limite temporairement les requêtes.', true);
    if (response.status === 401 && env.GITLAB_API_TOKEN) throw new ProviderRequestError('Le jeton GitLab configuré est invalide.', false);
    throw new ProviderRequestError(`Conversation GitLab publique indisponible (${response.status}).`, false);
  }
  return response;
}

async function gitlabJson<T>(path: string, env: Env): Promise<T> {
  const response = await gitlabResponse(path, env);
  try { return await response.json() as T; } catch { throw new ProviderRequestError('Réponse GitLab invalide : le tirage est interrompu.', false); }
}

async function gitlabGraphql(query: string, variables: Record<string, unknown>, env: Env): Promise<GitLabGraphqlResponse> {
  if (env.GITLAB_ENABLED !== 'true') throw new Error('Le connecteur GitLab est temporairement désactivé.');
  let response: Response;
  try {
    response = await fetch('https://gitlab.com/api/graphql', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { accept: 'application/json', 'content-type': 'application/json', ...(env.GITLAB_API_TOKEN ? { authorization: `Bearer ${env.GITLAB_API_TOKEN}` } : {}) },
      body: JSON.stringify({ query, variables }),
    });
  } catch { throw new ProviderRequestError('GitLab ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('GitLab limite temporairement les requêtes.', true);
    if (response.status === 401 && env.GITLAB_API_TOKEN) throw new ProviderRequestError('Le jeton GitLab configuré est invalide.', false);
    throw new ProviderRequestError(`Commentaires GitLab publics indisponibles (${response.status}).`, false);
  }
  let payload: GitLabGraphqlResponse;
  try { payload = await response.json() as GitLabGraphqlResponse; } catch { throw new ProviderRequestError('Réponse GitLab invalide : le tirage est interrompu.', false); }
  if (payload.errors?.length) throw new ProviderRequestError(`GitLab refuse la lecture des commentaires : ${payload.errors[0]?.message || 'erreur GraphQL'}.`, false);
  return payload;
}

function referenceId(ref: GitLabReference) { return `${encodeURIComponent(ref.projectPath)}:${ref.kind}:${ref.iid}`; }
function parseReferenceId(value: string): GitLabReference | null {
  const match = value.match(/^([^:]{3,2000}):(issues|merge_requests):([1-9]\d{0,9})$/u);
  if (!match) return null;
  try { return parseGitLabUrl(`https://gitlab.com/${decodeURIComponent(match[1])}/-/${match[2]}/${match[3]}`); } catch { return null; }
}

function numericGid(value: number | string | undefined, type: 'Note' | 'User'): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  const match = value?.match(new RegExp(`^gid://gitlab/${type}/([1-9]\\d{0,19})$`, 'u'));
  if (!match) return undefined;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) ? number : undefined;
}

export function gitlabComment(note: GitLabNote): SocialComment | undefined {
  const noteId = numericGid(note.id, 'Note');
  const authorId = numericGid(note.author?.id, 'User');
  if (!noteId || !authorId || !note.body || note.system || note.internal || note.confidential || note.author?.state === 'blocked') return undefined;
  return { providerCommentId: String(noteId), providerUserId: String(authorId), username: note.author?.username?.toLocaleLowerCase('fr-FR'), displayName: note.author?.name, text: note.body, isReply: false, createdAt: note.createdAt || note.created_at };
}

export async function getGitLabPublication(input: string, env: Env): Promise<SocialPublication> {
  const ref = parseGitLabUrl(input);
  if (!ref) throw new Error('Utilisez le lien complet d’une issue ou merge request publique sur gitlab.com.');
  const project = await gitlabJson<GitLabProject>(`/projects/${encodeURIComponent(ref.projectPath)}`, env);
  if (!Number.isSafeInteger(project.id) || project.visibility !== 'public' || project.path_with_namespace?.toLocaleLowerCase('fr-FR') !== ref.projectPath.toLocaleLowerCase('fr-FR')) throw new Error('Projet GitLab public introuvable.');
  const conversation = await gitlabJson<GitLabConversation>(`/projects/${project.id}/${ref.kind}/${ref.iid}`, env);
  if (conversation.iid !== ref.iid || conversation.project_id !== project.id || !conversation.title || !conversation.web_url) throw new Error('Issue ou merge request GitLab introuvable.');
  const authorId = numericGid(conversation.author?.id, 'User');
  return { provider: 'gitlab', providerPublicationId: referenceId(ref), canonicalUrl: conversation.web_url, authorProviderId: authorId ? String(authorId) : undefined, authorName: conversation.author?.name || conversation.author?.username, title: conversation.title.slice(0, 1000), publishedAt: conversation.created_at };
}

export async function getGitLabParticipantsPage(publicationId: string, pageToken: string | undefined, rules: ContestRules, env: Env) {
  const ref = parseReferenceId(publicationId);
  if (!ref) throw new Error('Référence GitLab invalide.');
  if (pageToken && !/^[A-Za-z0-9+/=_-]{1,1000}$/u.test(pageToken)) throw new Error('Pagination GitLab invalide.');
  const field = ref.kind === 'issues' ? 'issue' : 'mergeRequest';
  const query = `query TirageSimpleGitLabComments($project: ID!, $iid: String!, $after: String) { project(fullPath: $project) { ${field}(iid: $iid) { notes(first: 100, after: $after) { nodes { id body createdAt system internal author { id username name state } } pageInfo { hasNextPage endCursor } } } } }`;
  const payload = await gitlabGraphql(query, { project: ref.projectPath, iid: String(ref.iid), after: pageToken || null }, env);
  const conversation = payload.data?.project?.[field];
  const notes = conversation?.notes?.nodes;
  const pageInfo = conversation?.notes?.pageInfo;
  if (!conversation || !Array.isArray(notes) || !pageInfo || typeof pageInfo.hasNextPage !== 'boolean') throw new Error('Liste de commentaires GitLab incomplète.');
  if (pageInfo.hasNextPage && (!pageInfo.endCursor || !/^[A-Za-z0-9+/=_-]{1,1000}$/u.test(pageInfo.endCursor))) throw new Error('Pagination GitLab incohérente : aucun tirage partiel ne sera effectué.');
  const comments = notes.flatMap(value => { const comment = gitlabComment(value); return comment ? [comment] : []; });
  return { participants: createParticipants(comments, rules, { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false }), nextPageToken: pageInfo.hasNextPage ? pageInfo.endCursor || undefined : undefined, totalResults: notes.length };
}
