import type { Env, SocialPublication } from './types';

const API = 'https://open-api.trovo.live/openplatform';

interface TrovoChannel {
  is_live?: boolean;
  live_title?: string;
  thumbnail?: string;
  profile_pic?: string;
  channel_url?: string;
  username?: string;
  started_at?: string | number;
}

export function parseTrovoChannel(value: string): string | null {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_]{3,50}$/u.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !['trovo.live', 'www.trovo.live'].includes(url.hostname.toLowerCase())) return null;
    const match = decodeURIComponent(url.pathname).match(/^\/([A-Za-z0-9_]{3,50})\/?$/u);
    return match?.[1] ?? null;
  } catch { return null; }
}

async function trovoJson<T>(url: string, clientId: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Accept: 'application/json', 'Client-ID': clientId, ...init.headers } });
  if (!response.ok) throw new Error(response.status === 404 ? 'Chaîne Trovo publique introuvable.' : `Trovo a refusé la requête (${response.status}).`);
  const body = await response.json() as T & { error?: string; message?: string };
  if (body.error) throw new Error(body.message || 'Réponse Trovo invalide.');
  return body;
}

export async function getTrovoCollection(value: string, env: Env): Promise<{ publication: SocialPublication & { chatToken: string; websocketUrl: string } }> {
  const clientId = env.TROVO_CLIENT_ID;
  if (env.TROVO_ENABLED !== 'true' || !clientId) throw new Error('Trovo is not enabled');
  const username = parseTrovoChannel(value);
  if (!username) throw new Error('Indiquez un login ou une URL de chaîne Trovo valide.');
  const users = await trovoJson<{ users?: Array<{ user_id: string; channel_id: string; username: string; nickname: string }> }>(`${API}/getusers`, clientId, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: [username] }),
  });
  const user = users.users?.[0];
  if (!user?.channel_id || !user.user_id) throw new Error('Chaîne Trovo publique introuvable.');
  const channel = await trovoJson<TrovoChannel>(`${API}/channels/id`, clientId, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel_id: Number(user.channel_id) }),
  });
  const token = await trovoJson<{ token?: string }>(`${API}/chat/channel-token/${encodeURIComponent(user.channel_id)}`, clientId);
  if (!token.token) throw new Error('Trovo n’a pas fourni de jeton de chat.');
  const canonicalUsername = channel.username || user.username;
  const title = channel.live_title || `Chat Trovo de ${user.nickname || canonicalUsername}`;
  const started = channel.started_at && Number(channel.started_at) > 0 ? new Date(Number(channel.started_at) * 1000).toISOString() : undefined;
  return { publication: {
    provider: 'trovo', providerPublicationId: user.channel_id, canonicalUrl: channel.channel_url || `https://trovo.live/${canonicalUsername}`,
    authorProviderId: user.user_id, authorName: user.nickname || canonicalUsername, title,
    thumbnailUrl: channel.thumbnail || channel.profile_pic || undefined, publishedAt: started,
    chatToken: token.token, websocketUrl: 'wss://open-chat.trovo.live/chat',
  } };
}
