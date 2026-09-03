import { createParticipants } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';
import { parseStackExchangeUrl, parseStackExchangeReference } from '../../../src/lib/stackexchange-sites';
import { providerCooldown, saveProviderCooldown } from './provider-cooldown';

const apiOrigin = 'https://api.stackexchange.com';
const pageSize = 100;

interface StackUser { user_id?: number; display_name?: string; link?: string; user_type?: string }
interface StackQuestion { question_id?: number; title?: string; link?: string; creation_date?: number; owner?: StackUser }
interface StackContribution { answer_id?: number; comment_id?: number; body?: string; creation_date?: number; owner?: StackUser }
interface StackResponse<T> { items?: T[]; has_more?: boolean; backoff?: number; quota_remaining?: number; error_id?: number; error_message?: string }

export function parseStackOverflowUrl(input: string): string | null {
  const parsed = parseStackExchangeUrl(input);
  return parsed?.site === 'stackoverflow' ? parsed.id : null;
}

function assertEnabled(env: Env) { if (env.STACKEXCHANGE_ENABLED !== 'true') throw new Error('Le connecteur Stack Exchange n’est pas activé (not enabled).'); }
function endpoint(path: string, page: number, env: Env, site: string): URL {
  const url = new URL(`/2.3${path}`, apiOrigin);
  url.search = new URLSearchParams({ site, filter: 'withbody', pagesize: String(pageSize), page: String(page), order: 'asc', sort: 'creation' }).toString();
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
async function stackJson<T>(url: URL, env: Env): Promise<StackResponse<T>> {
  const retryAt = await providerCooldown(env, 'stackexchange');
  if (retryAt) {
    const seconds = Math.ceil((retryAt - Date.now()) / 1000);
    throw new ProviderRequestError(`Quota Stack Exchange temporairement limité. Réessayez dans environ ${Math.ceil(seconds / 60)} minutes.`, true, seconds);
  }
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'manual', headers: { accept: 'application/json', 'user-agent': 'TirageSimple' } }); }
  catch { throw new ProviderRequestError('Stack Exchange ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    let failure: StackResponse<never> = {};
    try { failure = JSON.parse(detail); } catch { /* Non-JSON error response. */ }
    if (failure.error_id === 502 || response.status === 429) {
      const delay = failure.backoff || Number(failure.error_message?.match(/available in (\d+) seconds/u)?.[1]) || 60;
      await saveProviderCooldown(env, 'stackexchange', delay);
      throw new ProviderRequestError(`Quota Stack Exchange temporairement limité. Réessayez dans environ ${Math.ceil(delay / 60)} minutes.`, true, delay);
    }
    console.warn('stackexchange_api_error', { status: response.status, detail });
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('Le quota Stack Exchange est atteint ou le service est temporairement indisponible.', true);
    throw new ProviderRequestError(`Question Stack Exchange indisponible (${response.status}). Vérifiez qu’elle est publique.`, false);
  }
  let payload: StackResponse<T>;
  try { payload = await response.json() as StackResponse<T>; }
  catch { throw new ProviderRequestError('Réponse Stack Exchange invalide : le tirage est interrompu.', false); }
  if (payload.backoff && payload.backoff > 0) {
    await saveProviderCooldown(env, 'stackexchange', payload.backoff);
    if (!Number.isSafeInteger(payload.backoff) || payload.backoff > 43200) throw new ProviderRequestError('La pause demandée dépasse la durée de reprise autorisée. Réessayez plus tard.', false);
    throw new ProviderRequestError(`Stack Exchange demande une pause de ${payload.backoff} secondes. L’import sera repris.`, true, payload.backoff);
  }
  if (payload.error_id) throw new ProviderRequestError(`Stack Exchange refuse la requête (${payload.error_message || payload.error_id}).`, payload.error_id === 502 || payload.error_id === 503);
  return payload;
}

export async function getStackExchangePublication(input: string, env: Env): Promise<SocialPublication> {
  assertEnabled(env);
  const parsed = parseStackExchangeUrl(input);
  if (!parsed) throw new Error('Utilisez une question publique de Stack Overflow, Super User, Server Fault, Ask Ubuntu ou Arqade.');
  const payload = await stackJson<StackQuestion>(endpoint(`/questions/${parsed.id}`, 1, env, parsed.site), env);
  const question = payload.items?.[0];
  if (String(question?.question_id) !== parsed.id || !question?.title || !question.link) throw new Error('Question Stack Exchange introuvable ou incomplète.');
  return { provider: 'stackexchange', providerPublicationId: parsed.publicationId, canonicalUrl: parsed.canonicalUrl,
    authorProviderId: question.owner?.user_id ? String(question.owner.user_id) : undefined,
    authorName: question.owner?.display_name ? decodeEntities(question.owner.display_name) : undefined,
    title: decodeEntities(question.title).slice(0, 1000), publishedAt: question.creation_date ? new Date(question.creation_date * 1000).toISOString() : undefined };
}

export async function getStackExchangeParticipantsPage(questionId: string, pageToken: string | undefined, rules: ContestRules, env: Env) {
  assertEnabled(env);
  const parsed = parseStackExchangeReference(questionId);
  if (!parsed) throw new Error('Référence Stack Exchange invalide.');
  if (pageToken !== undefined && !/^[1-9]\d{0,3}$/u.test(pageToken)) throw new Error('Pagination Stack Exchange invalide.');
  const page = pageToken ? Number(pageToken) : 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error('Pagination Stack Exchange invalide.');
  const mode = rules.interaction === 'comments' ? 'comments' : 'answers';
  const payload = await stackJson<StackContribution>(endpoint(`/questions/${parsed.id}/${mode}`, page, env, parsed.site), env);
  if (!Array.isArray(payload.items) || typeof payload.has_more !== 'boolean') throw new Error('Réponse Stack Exchange incomplète : le tirage est interrompu.');
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
