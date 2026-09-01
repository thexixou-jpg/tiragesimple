import { createParticipants } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

const apiOrigin = 'https://api.stackexchange.com';
const pageSize = 100;

interface StackUser { user_id?: number; display_name?: string; link?: string; user_type?: string }
interface StackQuestion { question_id?: number; title?: string; link?: string; creation_date?: number; owner?: StackUser }
interface StackContribution { answer_id?: number; comment_id?: number; body?: string; creation_date?: number; owner?: StackUser }
interface StackResponse<T> { items?: T[]; has_more?: boolean; backoff?: number; quota_remaining?: number; error_id?: number; error_message?: string }

export function parseStackOverflowUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !['stackoverflow.com', 'www.stackoverflow.com'].includes(url.hostname.toLowerCase()) || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/questions\/([1-9]\d{0,11})(?:\/[^/]*)?\/?$/u);
    return match?.[1] ?? null;
  } catch { return null; }
}

function assertEnabled(env: Env) { if (env.STACKEXCHANGE_ENABLED !== 'true') throw new Error('Le connecteur Stack Overflow n’est pas activé (not enabled).'); }
function endpoint(path: string, page: number, env: Env): URL {
  const url = new URL(`/2.3${path}`, apiOrigin);
  url.search = new URLSearchParams({ site: 'stackoverflow', filter: 'withbody', pagesize: String(pageSize), page: String(page), order: 'asc', sort: 'creation' }).toString();
  if (env.STACKEXCHANGE_API_KEY) url.searchParams.set('key', env.STACKEXCHANGE_API_KEY);
  return url;
}
function decodeEntities(value: string): string {
  const point = (value: number, fallback: string) => Number.isSafeInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : fallback;
  return value.replace(/<[^>]*>/gu, ' ').replace(/&#(\d+);/gu, (entity: string, code: string) => point(Number(code), entity))
    .replace(/&#x([\da-f]+);/giu, (entity: string, code: string) => point(Number.parseInt(code, 16), entity))
    .replace(/&quot;/gu, '"').replace(/&#39;|&apos;/gu, "'").replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&amp;/gu, '&')
    .replace(/\s+/gu, ' ').trim();
}
async function stackJson<T>(url: URL): Promise<StackResponse<T>> {
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'manual', headers: { accept: 'application/json', 'user-agent': 'TirageSimple' } }); }
  catch { throw new ProviderRequestError('Stack Overflow ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    console.warn('stackexchange_api_error', { status: response.status, detail });
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('Le quota Stack Overflow est atteint ou le service est temporairement indisponible.', true);
    throw new ProviderRequestError(`Question Stack Overflow indisponible (${response.status}). Vérifiez qu’elle est publique.`, false);
  }
  let payload: StackResponse<T>;
  try { payload = await response.json() as StackResponse<T>; }
  catch { throw new ProviderRequestError('Réponse Stack Overflow invalide : le tirage est interrompu.', false); }
  if (payload.error_id) throw new ProviderRequestError(`Stack Overflow refuse la requête (${payload.error_message || payload.error_id}).`, payload.error_id === 502 || payload.error_id === 503);
  if (payload.backoff && payload.backoff > 0) throw new ProviderRequestError(`Stack Overflow demande une pause de ${payload.backoff} secondes. L’import sera repris.`, true);
  return payload;
}

export async function getStackExchangePublication(input: string, env: Env): Promise<SocialPublication> {
  assertEnabled(env);
  const id = parseStackOverflowUrl(input);
  if (!id) throw new Error('Utilisez le lien public d’une question Stack Overflow.');
  const payload = await stackJson<StackQuestion>(endpoint(`/questions/${id}`, 1, env));
  const question = payload.items?.[0];
  if (!question?.question_id || !question.title || !question.link) throw new Error('Question Stack Overflow introuvable ou incomplète.');
  return { provider: 'stackexchange', providerPublicationId: String(question.question_id), canonicalUrl: question.link,
    authorProviderId: question.owner?.user_id ? String(question.owner.user_id) : undefined,
    authorName: question.owner?.display_name ? decodeEntities(question.owner.display_name) : undefined,
    title: decodeEntities(question.title).slice(0, 1000), publishedAt: question.creation_date ? new Date(question.creation_date * 1000).toISOString() : undefined };
}

export async function getStackExchangeParticipantsPage(questionId: string, pageToken: string | undefined, rules: ContestRules, env: Env) {
  assertEnabled(env);
  if (!/^[1-9]\d{0,11}$/u.test(questionId)) throw new Error('Référence Stack Overflow invalide.');
  const page = pageToken ? Number.parseInt(pageToken, 10) : 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error('Pagination Stack Overflow invalide.');
  const mode = rules.interaction === 'comments' ? 'comments' : 'answers';
  const payload = await stackJson<StackContribution>(endpoint(`/questions/${questionId}/${mode}`, page, env));
  if (!Array.isArray(payload.items)) throw new Error('Réponse Stack Overflow incomplète : le tirage est interrompu.');
  const comments: SocialComment[] = payload.items.flatMap(item => {
    const contributionId = mode === 'comments' ? item.comment_id : item.answer_id;
    if (!contributionId || !item.owner?.user_id) return [];
    return [{ providerCommentId: `${mode}:${contributionId}`, providerUserId: String(item.owner.user_id),
      displayName: decodeEntities(item.owner.display_name || `Utilisateur ${item.owner.user_id}`), text: decodeEntities(item.body || ''), isReply: false,
      createdAt: item.creation_date ? new Date(item.creation_date * 1000).toISOString() : undefined }];
  });
  return { participants: createParticipants(comments, rules, getProviderCapabilities('stackexchange')),
    nextPageToken: payload.has_more ? String(page + 1) : undefined, totalResults: payload.items.length };
}
