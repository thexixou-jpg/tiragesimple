import { createParticipants } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

interface DevUser { user_id?: number; username?: string; name?: string }
interface DevArticle { id?: number; title?: string; url?: string; published_at?: string; cover_image?: string | null; social_image?: string | null; user?: DevUser }
export interface DevComment { id_code?: string; created_at?: string; body_html?: string; user?: DevUser; children?: DevComment[] }

export interface DevReference { username: string; slug: string; canonicalUrl: string }

export function parseDevUrl(input: string): DevReference | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'dev.to' || url.port || url.username || url.password || url.search || url.hash) return null;
    const match = url.pathname.match(/^\/([A-Za-z0-9_-]{2,100})\/([A-Za-z0-9-]{1,300})\/?$/u);
    if (!match) return null;
    return { username: match[1], slug: match[2], canonicalUrl: `https://dev.to/${match[1]}/${match[2]}` };
  } catch { return null; }
}

function assertEnabled(env: Env) {
  if (env.DEVTO_ENABLED !== 'true') throw new Error('Le connecteur DEV Community est temporairement désactivé.');
}

async function devJson<T>(path: string, env: Env): Promise<T> {
  assertEnabled(env);
  let response: Response;
  try { response = await fetch(`https://dev.to/api${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { accept: 'application/vnd.forem.api-v1+json', 'user-agent': 'TirageSimple/1.0 (+https://tiragesimple.fr)' } }); }
  catch { throw new ProviderRequestError('DEV Community ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('DEV Community limite temporairement les requêtes.', true);
    throw new ProviderRequestError(`Ressource DEV Community publique indisponible (${response.status}).`, false);
  }
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > 8_000_000) throw new Error('La discussion DEV Community dépasse la limite de sécurité de l’outil.');
  const text = await response.text();
  if (text.length > 8_000_000) throw new Error('La discussion DEV Community dépasse la limite de sécurité de l’outil.');
  try { return JSON.parse(text) as T; } catch { throw new ProviderRequestError('Réponse DEV Community invalide : le tirage est interrompu.', false); }
}

function decodeHtml(value: string): string {
  return value.replace(/<[^>]*>/gu, ' ').replace(/&#(x[0-9a-f]+|\d+);/giu, (_, code: string) => {
    const point = code[0].toLowerCase() === 'x' ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
    try { return Number.isSafeInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' '; } catch { return ' '; }
  }).replace(/&(nbsp|amp|lt|gt|quot|#39);/giu, entity => ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity.toLowerCase()] || ' ')).replace(/\s+/gu, ' ').trim();
}

export function devComment(value: DevComment, isReply: boolean): SocialComment | undefined {
  if (!value.id_code || !/^[a-z0-9]{3,20}$/iu.test(value.id_code) || !Number.isSafeInteger(value.user?.user_id) || value.user!.user_id! < 1 || !value.user?.username || !value.body_html) return undefined;
  return { providerCommentId: value.id_code, providerUserId: String(value.user.user_id), username: value.user.username.toLocaleLowerCase('fr-FR'), displayName: value.user.name || value.user.username, text: decodeHtml(value.body_html), isReply, createdAt: value.created_at };
}

function flattenComments(roots: DevComment[]): { comments: SocialComment[]; total: number } {
  const stack = roots.map(value => ({ value, depth: 0 }));
  const comments: SocialComment[] = [];
  const seen = new Set<string>();
  let total = 0;
  while (stack.length) {
    const current = stack.pop()!;
    total++;
    if (total > 100000 || current.depth > 100) throw new Error('La discussion DEV Community dépasse la limite de sécurité de l’outil.');
    if (!Array.isArray(current.value.children)) throw new Error('Arbre de commentaires DEV Community incomplet.');
    const id = current.value.id_code;
    if (id && seen.has(id)) throw new Error('Arbre de commentaires DEV Community incohérent.');
    if (id) seen.add(id);
    const normalized = devComment(current.value, current.depth > 0);
    if (normalized) comments.push(normalized);
    for (const child of current.value.children) stack.push({ value: child, depth: current.depth + 1 });
  }
  return { comments, total };
}

export async function getDevPublication(input: string, env: Env): Promise<SocialPublication> {
  const ref = parseDevUrl(input);
  if (!ref) throw new Error('Utilisez le lien complet d’un article public publié sur dev.to.');
  const article = await devJson<DevArticle>(`/articles/${encodeURIComponent(ref.username)}/${encodeURIComponent(ref.slug)}`, env);
  if (!Number.isSafeInteger(article.id) || article.id! < 1 || !article.title || !article.url || !Number.isSafeInteger(article.user?.user_id)) throw new Error('Article DEV Community public introuvable ou incomplet.');
  const canonical = parseDevUrl(article.url);
  if (!canonical || canonical.username.toLowerCase() !== ref.username.toLowerCase() || canonical.slug !== ref.slug) throw new Error('Réponse DEV Community incohérente.');
  const image = article.cover_image || article.social_image || undefined;
  return { provider: 'devto', providerPublicationId: String(article.id), canonicalUrl: canonical.canonicalUrl, authorProviderId: String(article.user!.user_id), authorName: article.user?.name || article.user?.username, title: article.title.slice(0, 1000), thumbnailUrl: image?.startsWith('https://') ? image : undefined, publishedAt: article.published_at };
}

export async function getDevParticipants(publicationId: string, rules: ContestRules, env: Env) {
  if (!/^[1-9]\d{0,11}$/u.test(publicationId)) throw new Error('Référence DEV Community invalide.');
  const roots = await devJson<DevComment[]>(`/comments?a_id=${publicationId}`, env);
  if (!Array.isArray(roots)) throw new Error('Liste de commentaires DEV Community incomplète.');
  const flattened = flattenComments(roots);
  return { participants: createParticipants(flattened.comments, rules, getProviderCapabilities('devto')), totalResults: flattened.total };
}
