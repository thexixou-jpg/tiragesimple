import { ProviderRequestError } from './provider-http';
import type { ContestRules, Env, Participant, SocialPublication } from './types';

const API = 'https://discord.com/api/v10';
export interface DiscordMessageRef { guildId: string; channelId: string; messageId: string }
interface DiscordUser { id: string; username: string; global_name?: string | null; bot?: boolean }
interface DiscordEmoji { id?: string | null; name?: string | null }
interface DiscordMessage { id: string; channel_id: string; author: DiscordUser; timestamp: string; reactions?: Array<{ count: number; emoji: DiscordEmoji }> }

export function parseDiscordMessageUrl(input: string): DiscordMessageRef | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !['discord.com', 'www.discord.com'].includes(url.hostname.toLowerCase())) return null;
    const match = url.pathname.match(/^\/channels\/([1-9]\d{16,19})\/([1-9]\d{16,19})\/([1-9]\d{16,19})\/?$/u);
    return match ? { guildId: match[1], channelId: match[2], messageId: match[3] } : null;
  } catch { return null; }
}

function config(env: Env) {
  if (env.DISCORD_ENABLED !== 'true' || !env.DISCORD_CLIENT_ID || !env.DISCORD_BOT_TOKEN) throw new Error('Discord is not enabled');
  return { clientId: env.DISCORD_CLIENT_ID, token: env.DISCORD_BOT_TOKEN };
}

async function discordJson<T>(path: string, env: Env): Promise<T> {
  const { token } = config(env);
  let response: Response;
  try { response = await fetch(`${API}${path}`, { headers: { Authorization: `Bot ${token}`, Accept: 'application/json', 'User-Agent': 'TirageSimple (https://tiragesimple.fr, 1.0)' }, signal: AbortSignal.timeout(15000) }); }
  catch { throw new ProviderRequestError('Discord ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('Discord est temporairement limité ou indisponible.', true);
    if (response.status === 403) throw new ProviderRequestError('Le bot TirageSimple n’a pas accès à ce message. Vérifiez son installation et les permissions du salon.', false);
    if (response.status === 404) throw new ProviderRequestError('Message Discord introuvable ou inaccessible au bot TirageSimple.', false);
    throw new ProviderRequestError(`Discord a refusé la requête (${response.status}).`, false);
  }
  return response.json() as Promise<T>;
}

export function discordInstallUrl(env: Env): string {
  const { clientId } = config(env);
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: clientId, scope: 'bot', permissions: '66560', integration_type: '0' }).toString();
  return url.toString();
}

function reactionKey(emoji: DiscordEmoji): string | null {
  if (emoji.id && emoji.name) return `custom:${emoji.name}:${emoji.id}`;
  if (emoji.name) return `unicode:${emoji.name}`;
  return null;
}

function reactionApiValue(key: string): string | null {
  const custom = key.match(/^custom:([^:]{1,100}):([1-9]\d{16,19})$/u);
  if (custom) return `${custom[1]}:${custom[2]}`;
  const unicode = key.match(/^unicode:(.{1,32})$/u);
  return unicode?.[1] ?? null;
}

export async function getDiscordPublication(input: string, env: Env): Promise<SocialPublication & { reactions: Array<{ id: string; label: string; count: number }> }> {
  const parsed = parseDiscordMessageUrl(input);
  if (!parsed) throw new Error('Collez le lien complet d’un message Discord provenant d’un serveur.');
  const message = await discordJson<DiscordMessage>(`/channels/${parsed.channelId}/messages/${parsed.messageId}`, env);
  const reactions = (message.reactions || []).flatMap(reaction => {
    const id = reactionKey(reaction.emoji); if (!id || reaction.count < 1) return [];
    return [{ id, label: reaction.emoji.name || 'emoji', count: reaction.count }];
  });
  if (!reactions.length) throw new Error('Ce message ne possède aucune réaction exploitable. Ajoutez un emoji puis réessayez.');
  return { provider:'discord', providerPublicationId:`${parsed.guildId}|${parsed.channelId}|${parsed.messageId}`, canonicalUrl:`https://discord.com/channels/${parsed.guildId}/${parsed.channelId}/${parsed.messageId}`,
    authorProviderId:message.author.id, authorName:message.author.global_name || message.author.username,
    title:`Message Discord de ${message.author.global_name || message.author.username}`, publishedAt:message.timestamp, reactions };
}

export async function getDiscordParticipantsPage(publicationId: string, pageToken: string | undefined, rules: ContestRules, env: Env) {
  const parts = publicationId.split('|');
  if (parts.length !== 3 || parts.some(value => !/^[1-9]\d{16,19}$/u.test(value))) throw new Error('Référence de message Discord invalide.');
  const emoji = rules.providerInteractionId && reactionApiValue(rules.providerInteractionId);
  if (!emoji) throw new Error('Choisissez une réaction Discord valide.');
  const query = new URLSearchParams({ type:'0', limit:'100', ...(pageToken ? { after:pageToken } : {}) });
  const users = await discordJson<DiscordUser[]>(`/channels/${parts[1]}/messages/${parts[2]}/reactions/${encodeURIComponent(emoji)}?${query}`, env);
  const participants: Participant[] = users.flatMap(user => {
    if (!user.id || user.bot || rules.excludedUsers.includes(user.id) || rules.excludedUsers.includes(user.username.toLowerCase())) return [];
    return [{ providerUserId:user.id, username:user.username, displayName:user.global_name || user.username, entriesCount:1, eligible:true, reasons:[] }];
  });
  return { participants, totalResults:users.length, nextPageToken:users.length === 100 ? users[users.length - 1].id : undefined };
}
