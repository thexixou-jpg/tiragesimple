import type { ContestRules, Env, Participant, SocialPublication } from './types';

interface TwitchTokenResponse { access_token: string; refresh_token?: string; expires_in: number; scope?: string[] }
interface TwitchValidation { client_id: string; login: string; scopes: string[]; user_id: string; expires_in: number }
interface TwitchAccountRow { id: string; provider_account_id: string; username: string | null; display_name: string | null; encrypted_token: string; encrypted_refresh_token: string | null; token_expires_at: string | null }

const text = new TextEncoder();
const fromText = new TextDecoder();

function assertConfig(env: Env): { clientId: string; clientSecret: string; redirectUri: string; encryptionKey: string; sessionSecret: string } {
  if (env.TWITCH_ENABLED !== 'true' || !env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET || !env.TWITCH_REDIRECT_URI || !env.DATA_ENCRYPTION_KEY || !env.SESSION_SIGNING_SECRET || !env.DB) throw new Error('Twitch is not enabled');
  return { clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET, redirectUri: env.TWITCH_REDIRECT_URI, encryptionKey: env.DATA_ENCRYPTION_KEY, sessionSecret: env.SESSION_SIGNING_SECRET };
}

function base64url(bytes: Uint8Array): string {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
function decode64(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded); return Uint8Array.from(binary, character => character.charCodeAt(0));
}
async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', text.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, text.encode(value))));
}
async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', text.encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret), text.encode(value)));
  return `${base64url(iv)}.${base64url(cipher)}`;
}
async function decrypt(value: string, secret: string): Promise<string> {
  const [iv, cipher] = value.split('.'); if (!iv || !cipher) throw new Error('Connexion Twitch invalide. Reconnectez le compte.');
  try { return fromText.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode64(iv) }, await encryptionKey(secret), decode64(cipher))); }
  catch { throw new Error('Connexion Twitch illisible. Reconnectez le compte.'); }
}

async function twitchJson<T>(url: string | URL, init: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000), redirect: 'manual' }); }
  catch { throw new Error('Twitch ne répond pas. Réessayez dans quelques instants.'); }
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(response.status === 401 ? 'La connexion Twitch a expiré. Reconnectez le compte.' : response.status === 403 ? 'Le compte connecté doit être le diffuseur ou un modérateur de cette chaîne.' : payload.message || `Twitch est indisponible (${response.status}).`);
  return payload as T;
}

export async function twitchOAuthUrl(env: Env, sessionId: string): Promise<string> {
  const config = assertConfig(env); const issued = Math.floor(Date.now() / 1000); const nonce = crypto.randomUUID();
  const stateValue = `${sessionId}:${issued}:${nonce}`; const state = `${issued}.${nonce}.${await hmac(stateValue, config.sessionSecret)}`;
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri, scope: 'moderator:read:chatters', state, force_verify: 'true' }).toString();
  return url.toString();
}

export async function completeTwitchOAuth(env: Env, sessionId: string, state: string, code: string): Promise<void> {
  const config = assertConfig(env); const [issuedText, nonce, signature] = state.split('.'); const issued = Number(issuedText);
  if (!issued || !nonce || !signature || Math.abs(Date.now() / 1000 - issued) > 600 || signature !== await hmac(`${sessionId}:${issued}:${nonce}`, config.sessionSecret)) throw new Error('Connexion Twitch expirée ou invalide. Recommencez.');
  const token = await twitchJson<TwitchTokenResponse>('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, grant_type: 'authorization_code', redirect_uri: config.redirectUri }) });
  const validation = await twitchJson<TwitchValidation>('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token.access_token}` } });
  if (!validation.scopes.includes('moderator:read:chatters')) throw new Error('La permission Twitch nécessaire n’a pas été accordée.');
  const userPayload = await twitchJson<{ data: Array<{ id: string; login: string; display_name: string }> }>('https://api.twitch.tv/helix/users', { headers: { Authorization: `Bearer ${token.access_token}`, 'Client-Id': config.clientId } });
  const user = userPayload.data[0]; if (!user || user.id !== validation.user_id) throw new Error('Compte Twitch introuvable.');
  const now = new Date().toISOString(); const expiresAt = new Date(Date.now() + Math.max(60, token.expires_in) * 1000).toISOString();
  await env.DB!.prepare(`INSERT INTO social_accounts (id, owner_session_id, provider, provider_account_id, username, display_name, encrypted_token, encrypted_refresh_token, token_expires_at, created_at, deleted_at)
    VALUES (?, ?, 'twitch', ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(provider, provider_account_id) DO UPDATE SET owner_session_id=excluded.owner_session_id, username=excluded.username, display_name=excluded.display_name, encrypted_token=excluded.encrypted_token, encrypted_refresh_token=excluded.encrypted_refresh_token, token_expires_at=excluded.token_expires_at, deleted_at=NULL`)
    .bind(crypto.randomUUID(), sessionId, user.id, user.login, user.display_name, await encrypt(token.access_token, config.encryptionKey), token.refresh_token ? await encrypt(token.refresh_token, config.encryptionKey) : null, expiresAt, now).run();
}

async function refreshAccount(env: Env, row: TwitchAccountRow): Promise<{ row: TwitchAccountRow; accessToken: string }> {
  const config = assertConfig(env); let accessToken = await decrypt(row.encrypted_token, config.encryptionKey);
  const expiresSoon = !row.token_expires_at || Date.parse(row.token_expires_at) < Date.now() + 120000;
  if (!expiresSoon) return { row, accessToken };
  if (!row.encrypted_refresh_token) throw new Error('La connexion Twitch a expiré. Reconnectez le compte.');
  const refreshToken = await decrypt(row.encrypted_refresh_token, config.encryptionKey);
  const token = await twitchJson<TwitchTokenResponse>('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }) });
  accessToken = token.access_token; const encryptedToken = await encrypt(accessToken, config.encryptionKey); const encryptedRefresh = await encrypt(token.refresh_token ?? refreshToken, config.encryptionKey); const expiresAt = new Date(Date.now() + Math.max(60, token.expires_in) * 1000).toISOString();
  await env.DB!.prepare('UPDATE social_accounts SET encrypted_token=?, encrypted_refresh_token=?, token_expires_at=? WHERE id=?').bind(encryptedToken, encryptedRefresh, expiresAt, row.id).run();
  return { row: { ...row, encrypted_token: encryptedToken, encrypted_refresh_token: encryptedRefresh, token_expires_at: expiresAt }, accessToken };
}

export async function getTwitchAccount(env: Env, sessionId: string): Promise<{ id: string; username?: string; displayName?: string; accessToken: string } | null> {
  const config = assertConfig(env);
  const row = await env.DB!.prepare(`SELECT id, provider_account_id, username, display_name, encrypted_token, encrypted_refresh_token, token_expires_at FROM social_accounts WHERE owner_session_id=? AND provider='twitch' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`).bind(sessionId).first<TwitchAccountRow>();
  if (!row) return null; const active = await refreshAccount(env, row);
  const validation = await twitchJson<TwitchValidation>('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${active.accessToken}` } });
  if (validation.client_id !== config.clientId || validation.user_id !== row.provider_account_id || !validation.scopes.includes('moderator:read:chatters')) throw new Error('La connexion Twitch n’est plus valide. Reconnectez le compte.');
  return { id: row.provider_account_id, username: row.username ?? undefined, displayName: row.display_name ?? undefined, accessToken: active.accessToken };
}

export async function disconnectTwitch(env: Env, sessionId: string): Promise<void> {
  const config = assertConfig(env);
  try {
    const account = await getTwitchAccount(env, sessionId);
    if (account) await twitchJson('https://id.twitch.tv/oauth2/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, token: account.accessToken }) });
  } catch { /* Local deletion remains mandatory even if Twitch is unavailable. */ }
  await env.DB!.prepare(`DELETE FROM social_accounts WHERE owner_session_id=? AND provider='twitch'`).bind(sessionId).run();
}

export function parseTwitchChannel(input: string): string | null {
  const value = input.trim();
  if (/^[A-Za-z0-9_]{4,25}$/u.test(value)) return value.toLowerCase();
  try { const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean); const login = parts[0]; return url.protocol === 'https:' && ['twitch.tv', 'www.twitch.tv'].includes(url.hostname.toLowerCase()) && parts.length === 1 && login && /^[A-Za-z0-9_]{4,25}$/u.test(login) ? login.toLowerCase() : null; }
  catch { return null; }
}

export async function getTwitchPublication(input: string, env: Env, sessionId: string): Promise<SocialPublication> {
  const config = assertConfig(env); const account = await getTwitchAccount(env, sessionId); if (!account) throw new Error('Connectez d’abord Twitch.');
  const login = parseTwitchChannel(input); if (!login) throw new Error('Indiquez une chaîne Twitch ou son URL complète.');
  const endpoint = new URL('https://api.twitch.tv/helix/users'); endpoint.searchParams.set('login', login);
  const payload = await twitchJson<{ data: Array<{ id: string; login: string; display_name: string; profile_image_url?: string; description?: string }> }>(endpoint, { headers: { Authorization: `Bearer ${account.accessToken}`, 'Client-Id': config.clientId } });
  const channel = payload.data[0]; if (!channel) throw new Error('Chaîne Twitch introuvable.');
  return { provider: 'twitch', providerPublicationId: channel.id, canonicalUrl: `https://www.twitch.tv/${channel.login}`, authorProviderId: channel.id, authorName: channel.display_name, title: `Chat Twitch de ${channel.display_name}`, thumbnailUrl: channel.profile_image_url };
}

export async function getTwitchChattersPage(broadcasterId: string, cursor: string | undefined, rules: ContestRules, env: Env, sessionId: string): Promise<{ participants: Participant[]; nextPageToken?: string; totalResults: number }> {
  const config = assertConfig(env); const account = await getTwitchAccount(env, sessionId); if (!account) throw new Error('La connexion Twitch n’est plus disponible.');
  const endpoint = new URL('https://api.twitch.tv/helix/chat/chatters'); endpoint.search = new URLSearchParams({ broadcaster_id: broadcasterId, moderator_id: account.id, first: '1000', ...(cursor ? { after: cursor } : {}) }).toString();
  const payload = await twitchJson<{ data: Array<{ user_id: string; user_login: string; user_name: string }>; pagination?: { cursor?: string }; total?: number }>(endpoint, { headers: { Authorization: `Bearer ${account.accessToken}`, 'Client-Id': config.clientId } });
  const excluded = new Set(rules.excludedUsers.map(value => value.toLowerCase()));
  const participants = payload.data.map(user => ({ providerUserId: user.user_id, username: user.user_login, displayName: user.user_name, entriesCount: 1, eligible: !excluded.has(user.user_id) && !excluded.has(user.user_login.toLowerCase()), reasons: excluded.has(user.user_id) || excluded.has(user.user_login.toLowerCase()) ? ['excluded_user'] : [] }));
  return { participants, nextPageToken: payload.pagination?.cursor, totalResults: payload.data.length };
}
