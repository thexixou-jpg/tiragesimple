import type { ContestRules, Env, Participant, SocialPublication } from './types';
import { ProviderRequestError } from './provider-http';

const defaultHosts = ['mastodon.social', 'mastodon.online', 'mastodon.world', 'mstdn.social', 'piaille.fr'];

interface MastodonAccount { id: string; acct: string; display_name?: string; uri?: string; url?: string }
interface MastodonStatus {
  id: string; url?: string; uri: string; content?: string; created_at?: string; visibility?: string;
  account: MastodonAccount;
}

export function mastodonAllowedHosts(env: Env): Set<string> {
  const values = (env.MASTODON_ALLOWED_HOSTS || defaultHosts.join(',')).split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return new Set(values.filter(host => /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(host)));
}

export function parseMastodonUrl(input: string, env: Env): { host: string; statusId: string } | null {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !mastodonAllowedHosts(env).has(host)) return null;
    const path = decodeURIComponent(url.pathname);
    const patterns = [/^\/@[^/]+\/([A-Za-z0-9_-]+)\/?$/u, /^\/users\/[^/]+\/statuses\/([A-Za-z0-9_-]+)\/?$/u, /^\/web\/statuses\/([A-Za-z0-9_-]+)\/?$/u];
    const match = patterns.map(pattern => path.match(pattern)).find(Boolean);
    return match ? { host, statusId: match[1] } : null;
  } catch { return null; }
}

function assertEnabled(env: Env) {
  if (env.MASTODON_ENABLED !== 'true') throw new Error('Le connecteur Mastodon n’est pas activé (not enabled).');
}

async function mastodonResponse<T>(endpoint: URL): Promise<{ data: T; response: Response }> {
  let response: Response;
  try { response = await fetch(endpoint, { signal: AbortSignal.timeout(15000), redirect: 'manual', headers: { accept: 'application/json' } }); }
  catch { throw new ProviderRequestError('L’instance Mastodon ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('L’instance Mastodon est temporairement limitée ou indisponible.', true);
    throw new ProviderRequestError(`Post Mastodon indisponible (${response.status}). Vérifiez qu’il est public et appartient à une instance prise en charge.`, false);
  }
  try { return { data: await response.json() as T, response }; }
  catch { throw new ProviderRequestError('Réponse Mastodon invalide : le tirage est interrompu.', false); }
}

function textContent(html = ''): string {
  return html.replace(/<br\s*\/?\s*>/giu, '\n').replace(/<\/p>/giu, '\n').replace(/<[^>]*>/gu, '')
    .replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&#39;|&apos;/gu, "'").replace(/&amp;/gu, '&').trim();
}

function publicationKey(host: string, statusId: string): string { return `${host}|${statusId}`; }
function splitPublicationKey(value: string): { host: string; statusId: string } {
  const separator = value.indexOf('|');
  if (separator < 1) throw new Error('Référence Mastodon invalide.');
  return { host: value.slice(0, separator), statusId: value.slice(separator + 1) };
}

export async function getMastodonPublication(input: string, env: Env): Promise<SocialPublication> {
  assertEnabled(env);
  const parsed = parseMastodonUrl(input, env);
  if (!parsed) throw new Error(`Utilisez un lien public provenant d’une instance prise en charge : ${[...mastodonAllowedHosts(env)].join(', ')}.`);
  const endpoint = new URL(`https://${parsed.host}/api/v1/statuses/${encodeURIComponent(parsed.statusId)}`);
  const { data: status } = await mastodonResponse<MastodonStatus>(endpoint);
  if (!status?.id || !status.account?.id || !['public', 'unlisted'].includes(status.visibility ?? '')) throw new Error('Post Mastodon introuvable, privé ou incomplet.');
  return {
    provider: 'mastodon', providerPublicationId: publicationKey(parsed.host, status.id), canonicalUrl: status.url || input,
    authorProviderId: status.account.uri || status.account.url || `${parsed.host}:${status.account.id}`,
    authorName: status.account.display_name || status.account.acct,
    title: textContent(status.content).slice(0, 1000) || 'Publication Mastodon', publishedAt: status.created_at,
  };
}

function nextPageToken(linkHeader: string | null, endpoint: URL): string | undefined {
  if (!linkHeader) return undefined;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/u);
    if (!match) continue;
    try {
      const next = new URL(match[1]);
      if (next.origin !== endpoint.origin || next.pathname !== endpoint.pathname) return undefined;
      const token = next.searchParams.get('max_id');
      if (token && token.length <= 300 && /^[A-Za-z0-9_.~:-]+$/u.test(token)) return token;
    } catch { return undefined; }
  }
  return undefined;
}

export async function getMastodonParticipantsPage(publicationId: string, pageToken: string | undefined, rules: ContestRules, env: Env) {
  assertEnabled(env);
  const { host, statusId } = splitPublicationKey(publicationId);
  if (!mastodonAllowedHosts(env).has(host)) throw new Error('Instance Mastodon non autorisée.');
  const action = rules.interaction === 'reposts' ? 'reblogged_by' : 'favourited_by';
  const endpoint = new URL(`https://${host}/api/v1/statuses/${encodeURIComponent(statusId)}/${action}`);
  endpoint.search = new URLSearchParams({ limit: '80', ...(pageToken ? { max_id: pageToken } : {}) }).toString();
  const { data: accounts, response } = await mastodonResponse<MastodonAccount[]>(endpoint);
  if (!Array.isArray(accounts)) throw new Error('Réponse Mastodon incomplète : le tirage est interrompu.');
  const participants: Participant[] = [...new Map(accounts.map(account => [account.uri || account.url || `${host}:${account.id}`, account])).values()].flatMap(account => {
    const providerUserId = account.uri || account.url || `${host}:${account.id}`;
    if (!providerUserId || !account.acct) throw new Error('Identifiant Mastodon manquant : le tirage est interrompu.');
    const fullAcct = account.acct.includes('@') ? account.acct : `${account.acct}@${host}`;
    const accountNames = [account.acct.toLowerCase(), fullAcct.toLowerCase()];
    if (rules.excludedUsers.includes(providerUserId) || rules.excludedUsers.some(value => accountNames.includes(value.toLowerCase().replace(/^@/u, '')))) return [];
    return [{ providerUserId, username: fullAcct, displayName: account.display_name, entriesCount: 1, eligible: true, reasons: [] }];
  });
  return { participants, nextPageToken: nextPageToken(response.headers.get('Link'), endpoint), totalResults: accounts.length };
}
