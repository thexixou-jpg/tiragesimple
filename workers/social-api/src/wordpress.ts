import { createParticipants } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

interface WpUser { ID?: number; login?: string; name?: string; wpcom_id?: number; wpcom_login?: string }
interface WpPost { ID?: number; title?: string; URL?: string; date?: string; featured_image?: string; author?: WpUser }
interface WpComment { ID?: number; author?: WpUser; date?: string; content?: string; raw_content?: string; status?: string; parent?: false | { ID?: number }; type?: string }
interface WpComments { found?: number; comments?: WpComment[] }
export interface WordPressReference { site: string; slug: string; canonicalUrl: string }
const pageSize = 100;

export function parseWordPressUrl(input: string): WordPressReference | null {
  try {
    const url = new URL(input);
    const site = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !site.endsWith('.wordpress.com') || site === 'www.wordpress.com' || url.port || url.username || url.password || url.search || url.hash) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const slug = parts.at(-1) || '';
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,299}$/u.test(slug)) return null;
    return { site, slug, canonicalUrl: `https://${site}/${parts.join('/')}/` };
  } catch { return null; }
}

function assertEnabled(env: Env) { if (env.WORDPRESS_ENABLED !== 'true') throw new Error('Le connecteur WordPress.com est temporairement désactivé.'); }
async function wordpressJson<T>(path: string, env: Env): Promise<T> {
  assertEnabled(env);
  let response: Response;
  try { response = await fetch(`https://public-api.wordpress.com/rest/v1.1${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { accept: 'application/json', 'user-agent': 'TirageSimple/1.0 (+https://tiragesimple.fr)' } }); }
  catch { throw new ProviderRequestError('WordPress.com ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('Le quota WordPress.com est atteint ou le service est temporairement indisponible.', true);
    throw new ProviderRequestError(`Article WordPress.com public indisponible (${response.status}).`, false);
  }
  const text = await response.text();
  if (text.length > 4_000_000) throw new Error('La réponse WordPress.com dépasse la limite de sécurité de l’outil.');
  try { return JSON.parse(text) as T; } catch { throw new ProviderRequestError('Réponse WordPress.com invalide : le tirage est interrompu.', false); }
}
function decodeHtml(value: string): string { return value.replace(/<[^>]*>/gu, ' ').replace(/&#(\d+);/gu, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/giu, (_, n) => String.fromCodePoint(Number.parseInt(n, 16))).replace(/&amp;/gu, '&').replace(/&quot;/gu, '"').replace(/&#0?39;|&apos;/gu, "'").replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/\s+/gu, ' ').trim(); }
function key(site: string, id: number): string { return `${site}|${id}`; }
function splitKey(value: string): { site: string; id: string } {
  const match = value.match(/^([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})*\.wordpress\.com)\|([1-9]\d{0,19})$/u);
  if (!match) throw new Error('Référence WordPress.com invalide.');
  return { site: match[1], id: match[2] };
}
function stableUser(user?: WpUser): { id: string; username?: string; displayName?: string } | null {
  const id = user?.wpcom_id || user?.ID;
  if (!Number.isSafeInteger(id) || Number(id) <= 0) return null;
  const username = user?.wpcom_login || user?.login;
  return { id: String(id), username: username?.toLocaleLowerCase('fr-FR'), displayName: user?.name || username };
}

export async function getWordPressPublication(input: string, env: Env): Promise<SocialPublication> {
  const ref = parseWordPressUrl(input);
  if (!ref) throw new Error('Utilisez le lien complet d’un article public hébergé sur WordPress.com.');
  const post = await wordpressJson<WpPost>(`/sites/${encodeURIComponent(ref.site)}/posts/slug:${encodeURIComponent(ref.slug)}`, env);
  const returned = post.URL ? parseWordPressUrl(post.URL) : null;
  if (!Number.isSafeInteger(post.ID) || !post.title || !returned || returned.site !== ref.site || returned.slug !== ref.slug) throw new Error('Article WordPress.com public introuvable ou incomplet.');
  const author = stableUser(post.author);
  return { provider: 'wordpress', providerPublicationId: key(ref.site, post.ID!), canonicalUrl: returned.canonicalUrl, authorProviderId: author?.id, authorName: author?.displayName, title: decodeHtml(post.title).slice(0, 1000), thumbnailUrl: post.featured_image?.startsWith('https://') ? post.featured_image : undefined, publishedAt: post.date };
}

export async function getWordPressParticipantsPage(publicationId: string, pageToken: string | undefined, rules: ContestRules, env: Env) {
  const ref = splitKey(publicationId);
  const page = pageToken ? Number.parseInt(pageToken, 10) : 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1200) throw new Error('Pagination WordPress.com invalide.');
  const payload = await wordpressJson<WpComments>(`/sites/${encodeURIComponent(ref.site)}/posts/${ref.id}/replies/?number=${pageSize}&page=${page}&order=ASC&type=comment&status=approved&author_wpcom_data=true`, env);
  if (!Array.isArray(payload.comments) || payload.comments.length > pageSize) throw new Error('Pagination WordPress.com incomplète : le tirage est interrompu.');
  const comments: SocialComment[] = payload.comments.flatMap(comment => {
    const author = stableUser(comment.author);
    if (!Number.isSafeInteger(comment.ID) || comment.status !== 'approved' || comment.type !== 'comment' || !author) return [];
    return [{ providerCommentId: String(comment.ID), providerUserId: author.id, username: author.username, displayName: author.displayName, text: typeof comment.raw_content === 'string' ? comment.raw_content : decodeHtml(comment.content || ''), isReply: comment.parent !== false && Number.isSafeInteger(comment.parent?.ID), createdAt: comment.date }];
  });
  return { participants: createParticipants(comments, rules, getProviderCapabilities('wordpress')), totalResults: payload.comments.length, nextPageToken: payload.comments.length === pageSize ? String(page + 1) : undefined };
}
