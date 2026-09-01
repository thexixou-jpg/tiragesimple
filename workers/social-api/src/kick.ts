import { createRecordedSocialImport } from './social-import';
import type { ContestRules, Env, SocialComment, SocialPublication } from './types';

interface KickTokenResponse { access_token: string; refresh_token?: string; expires_in: number; scope?: string }
interface KickAccountRow { id: string; provider_account_id: string; username: string | null; display_name: string | null; encrypted_token: string; encrypted_refresh_token: string | null; token_expires_at: string | null }
interface KickUser { user_id: number; name: string; profile_picture?: string }
interface KickChannel { broadcaster_user_id: number; slug: string; stream_title?: string; channel_description?: string; banner_picture?: string; stream?: { is_live?: boolean; thumbnail?: string } }
interface KickCollection { id: string; owner_session_id: string; provider_account_id: string; channel_slug: string; channel_title: string | null; channel_thumbnail: string | null; subscription_id: string | null; status: string; started_at: string; stopped_at: string | null; expires_at: string }

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const KICK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

function config(env: Env) {
  if (env.KICK_ENABLED !== 'true' || !env.KICK_CLIENT_ID || !env.KICK_CLIENT_SECRET || !env.KICK_REDIRECT_URI || !env.DATA_ENCRYPTION_KEY || !env.SESSION_SIGNING_SECRET || !env.DB) throw new Error('Kick is not enabled');
  return { clientId: env.KICK_CLIENT_ID, clientSecret: env.KICK_CLIENT_SECRET, redirectUri: env.KICK_REDIRECT_URI, encryptionKey: env.DATA_ENCRYPTION_KEY, sessionSecret: env.SESSION_SIGNING_SECRET };
}

function base64url(bytes: Uint8Array): string { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, ''); }
function decode64(value: string): Uint8Array { const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4); const raw = atob(padded); return Uint8Array.from(raw, char => char.charCodeAt(0)); }
async function digest(value: string): Promise<string> { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function hmac(value: string, secret: string): Promise<string> { const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))); }
async function aesKey(secret: string): Promise<CryptoKey> { return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function encrypt(value: string, secret: string): Promise<string> { const iv = crypto.getRandomValues(new Uint8Array(12)); const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), encoder.encode(value))); return `${base64url(iv)}.${base64url(data)}`; }
async function decrypt(value: string, secret: string): Promise<string> { const [iv, data] = value.split('.'); if (!iv || !data) throw new Error('Connexion Kick invalide. Reconnectez le compte.'); try { return decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode64(iv) }, await aesKey(secret), decode64(data))); } catch { throw new Error('Connexion Kick illisible. Reconnectez le compte.'); } }

async function kickJson<T>(url: string | URL, init: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000), redirect: 'manual' }); } catch { throw new Error('Kick ne répond pas. Réessayez dans quelques instants.'); }
  const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
  if (!response.ok) throw new Error(response.status === 401 ? 'La connexion Kick a expiré. Reconnectez le compte.' : response.status === 403 ? 'Kick a refusé cette autorisation.' : payload.message || payload.error || `Kick est indisponible (${response.status}).`);
  return payload as T;
}

export async function kickOAuthUrl(env: Env, sessionId: string): Promise<string> {
  const current = config(env); const issued = Math.floor(Date.now() / 1000); const nonce = crypto.randomUUID(); const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const signed = `${sessionId}:${issued}:${nonce}:${verifier}`; const state = `${issued}.${nonce}.${verifier}.${await hmac(signed, current.sessionSecret)}`;
  const url = new URL('https://id.kick.com/oauth/authorize');
  url.search = new URLSearchParams({ response_type: 'code', client_id: current.clientId, redirect_uri: current.redirectUri, scope: 'user:read channel:read events:subscribe', code_challenge: await digest(verifier), code_challenge_method: 'S256', state }).toString();
  return url.toString();
}

export async function completeKickOAuth(env: Env, sessionId: string, state: string, code: string): Promise<void> {
  const current = config(env); const [issuedText, nonce, verifier, signature] = state.split('.'); const issued = Number(issuedText);
  if (!issued || !nonce || !verifier || !signature || Math.abs(Date.now() / 1000 - issued) > 600 || signature !== await hmac(`${sessionId}:${issued}:${nonce}:${verifier}`, current.sessionSecret)) throw new Error('Connexion Kick expirée ou invalide. Recommencez.');
  const token = await kickJson<KickTokenResponse>('https://id.kick.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: current.clientId, client_secret: current.clientSecret, redirect_uri: current.redirectUri, code_verifier: verifier, code }) });
  const introspection = await kickJson<{ data: { active: boolean; client_id: string; scope: string; exp: number } }>('https://id.kick.com/oauth/token/introspect', { method: 'POST', headers: { Authorization: `Bearer ${token.access_token}` } });
  const scopes = new Set((introspection.data.scope || token.scope || '').split(/\s+/u));
  if (!introspection.data.active || introspection.data.client_id !== current.clientId || !['user:read', 'channel:read', 'events:subscribe'].every(scope => scopes.has(scope))) throw new Error('Les permissions Kick nécessaires n’ont pas été accordées.');
  const users = await kickJson<{ data: KickUser[] }>('https://api.kick.com/public/v1/users', { headers: { Authorization: `Bearer ${token.access_token}` } });
  const channels = await kickJson<{ data: KickChannel[] }>('https://api.kick.com/public/v1/channels', { headers: { Authorization: `Bearer ${token.access_token}` } });
  const user = users.data[0]; const channel = channels.data[0]; if (!user || !channel || String(user.user_id) !== String(channel.broadcaster_user_id)) throw new Error('Chaîne Kick introuvable.');
  const now = new Date().toISOString(); const expiresAt = new Date(Date.now() + Math.max(60, Number(token.expires_in)) * 1000).toISOString();
  await env.DB!.prepare(`INSERT INTO social_accounts (id, owner_session_id, provider, provider_account_id, username, display_name, encrypted_token, encrypted_refresh_token, token_expires_at, created_at, deleted_at)
    VALUES (?, ?, 'kick', ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(provider, provider_account_id) DO UPDATE SET owner_session_id=excluded.owner_session_id, username=excluded.username, display_name=excluded.display_name, encrypted_token=excluded.encrypted_token, encrypted_refresh_token=excluded.encrypted_refresh_token, token_expires_at=excluded.token_expires_at, deleted_at=NULL`)
    .bind(crypto.randomUUID(), sessionId, String(user.user_id), channel.slug, user.name, await encrypt(token.access_token, current.encryptionKey), token.refresh_token ? await encrypt(token.refresh_token, current.encryptionKey) : null, expiresAt, now).run();
}

async function activeKickAccount(env: Env, sessionId: string): Promise<{ id: string; username: string; displayName?: string; accessToken: string } | null> {
  const current = config(env); const row = await env.DB!.prepare(`SELECT id, provider_account_id, username, display_name, encrypted_token, encrypted_refresh_token, token_expires_at FROM social_accounts WHERE owner_session_id=? AND provider='kick' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`).bind(sessionId).first<KickAccountRow>();
  if (!row) return null; let accessToken = await decrypt(row.encrypted_token, current.encryptionKey);
  if (!row.token_expires_at || Date.parse(row.token_expires_at) < Date.now() + 120000) {
    if (!row.encrypted_refresh_token) throw new Error('La connexion Kick a expiré. Reconnectez le compte.'); const refreshToken = await decrypt(row.encrypted_refresh_token, current.encryptionKey);
    const token = await kickJson<KickTokenResponse>('https://id.kick.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: current.clientId, client_secret: current.clientSecret, refresh_token: refreshToken }) });
    accessToken = token.access_token; const encryptedRefresh = await encrypt(token.refresh_token ?? refreshToken, current.encryptionKey); const expiresAt = new Date(Date.now() + Math.max(60, Number(token.expires_in)) * 1000).toISOString();
    await env.DB!.prepare('UPDATE social_accounts SET encrypted_token=?, encrypted_refresh_token=?, token_expires_at=? WHERE id=?').bind(await encrypt(accessToken, current.encryptionKey), encryptedRefresh, expiresAt, row.id).run();
  }
  const introspection = await kickJson<{ data: { active: boolean; client_id: string; scope: string } }>('https://id.kick.com/oauth/token/introspect', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!introspection.data.active || introspection.data.client_id !== current.clientId || !introspection.data.scope.includes('events:subscribe')) throw new Error('La connexion Kick n’est plus valide. Reconnectez le compte.');
  return { id: row.provider_account_id, username: row.username ?? '', displayName: row.display_name ?? undefined, accessToken };
}

export async function getKickAccount(env: Env, sessionId: string) { return activeKickAccount(env, sessionId); }

async function channelForAccount(env: Env, sessionId: string): Promise<{ account: NonNullable<Awaited<ReturnType<typeof activeKickAccount>>>; channel: KickChannel }> {
  const account = await activeKickAccount(env, sessionId); if (!account) throw new Error('Connectez d’abord votre chaîne Kick.');
  const response = await kickJson<{ data: KickChannel[] }>('https://api.kick.com/public/v1/channels', { headers: { Authorization: `Bearer ${account.accessToken}` } });
  const channel = response.data[0]; if (!channel || String(channel.broadcaster_user_id) !== account.id) throw new Error('La chaîne Kick connectée est introuvable.'); return { account, channel };
}

async function ensureChatSubscription(account: { id: string; accessToken: string }): Promise<string> {
  const listed = await kickJson<{ data: Array<{ id: string; event: string; broadcaster_user_id: number }> }>(`https://api.kick.com/public/v1/events/subscriptions?broadcaster_user_id=${encodeURIComponent(account.id)}`, { headers: { Authorization: `Bearer ${account.accessToken}` } });
  const existing = listed.data.find(item => item.event === 'chat.message.sent' && String(item.broadcaster_user_id) === account.id); if (existing) return existing.id;
  const created = await kickJson<{ data: Array<{ name: string; subscription_id?: string; error?: string }> }>('https://api.kick.com/public/v1/events/subscriptions', { method: 'POST', headers: { Authorization: `Bearer ${account.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ events: [{ name: 'chat.message.sent', version: 1 }], method: 'webhook' }) });
  const subscription = created.data.find(item => item.name === 'chat.message.sent'); if (!subscription?.subscription_id || subscription.error) throw new Error(subscription?.error || 'Kick n’a pas créé l’abonnement au chat.'); return subscription.subscription_id;
}

export async function startKickCollection(env: Env, sessionId: string): Promise<SocialPublication & { startedAt: string }> {
  const { account, channel } = await channelForAccount(env, sessionId); const existing = await env.DB!.prepare(`SELECT id FROM kick_collections WHERE owner_session_id=? AND status='collecting' AND expires_at>? LIMIT 1`).bind(sessionId, new Date().toISOString()).first(); if (existing) throw new Error('Une collecte Kick est déjà en cours pour cette session.');
  const subscriptionId = await ensureChatSubscription(account); const id = crypto.randomUUID(); const startedAt = new Date().toISOString(); const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); const title = channel.stream_title || `Chat Kick de ${channel.slug}`; const thumbnail = channel.stream?.thumbnail || channel.banner_picture;
  await env.DB!.prepare(`INSERT INTO kick_collections (id, owner_session_id, provider_account_id, channel_slug, channel_title, channel_thumbnail, subscription_id, status, started_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'collecting', ?, ?)`)
    .bind(id, sessionId, account.id, channel.slug, title, thumbnail ?? null, subscriptionId, startedAt, expiresAt).run();
  return { provider: 'kick', providerPublicationId: id, canonicalUrl: `https://kick.com/${channel.slug}`, authorProviderId: account.id, authorName: account.displayName || account.username, title, thumbnailUrl: thumbnail, publishedAt: startedAt, startedAt };
}

export async function finishKickCollection(env: Env, sessionId: string, rules: ContestRules) {
  const collection = await env.DB!.prepare(`SELECT * FROM kick_collections WHERE owner_session_id=? AND status='collecting' AND expires_at>? ORDER BY started_at DESC LIMIT 1`).bind(sessionId, new Date().toISOString()).first<KickCollection>();
  if (!collection) throw new Error('Aucune collecte Kick active. Démarrez-la pendant votre direct.'); const stoppedAt = new Date().toISOString();
  const rows = await env.DB!.prepare(`SELECT message_id, provider_user_id, username, content, created_at FROM kick_collection_messages WHERE collection_id=? ORDER BY created_at, message_id LIMIT 100001`).bind(collection.id).all<Record<string, string>>();
  if (rows.results.length > 100000) throw new Error('La collecte dépasse 100 000 messages.');
  const comments: SocialComment[] = rows.results.map(row => ({ providerCommentId: String(row.message_id), providerUserId: String(row.provider_user_id), username: row.username ? String(row.username) : undefined, displayName: row.username ? String(row.username) : undefined, text: String(row.content), isReply: false, createdAt: String(row.created_at) }));
  const publication: SocialPublication = { provider: 'kick', providerPublicationId: collection.id, canonicalUrl: `https://kick.com/${collection.channel_slug}`, authorProviderId: collection.provider_account_id, authorName: collection.channel_slug, title: collection.channel_title ?? `Chat Kick de ${collection.channel_slug}`, thumbnailUrl: collection.channel_thumbnail ?? undefined, publishedAt: collection.started_at };
  const imported = await createRecordedSocialImport(env, sessionId, publication, rules, comments);
  await env.DB!.batch([env.DB!.prepare(`UPDATE kick_collections SET status='ready', stopped_at=? WHERE id=?`).bind(stoppedAt, collection.id), env.DB!.prepare('DELETE FROM kick_collection_messages WHERE collection_id=?').bind(collection.id)]);
  return imported;
}

export async function disconnectKick(env: Env, sessionId: string): Promise<void> {
  const account = await activeKickAccount(env, sessionId).catch(() => null);
  if (account) {
    const subscriptions = await env.DB!.prepare(`SELECT DISTINCT subscription_id FROM kick_collections WHERE owner_session_id=? AND subscription_id IS NOT NULL`).bind(sessionId).all<{ subscription_id: string }>();
    if (subscriptions.results.length) { const endpoint = new URL('https://api.kick.com/public/v1/events/subscriptions'); for (const item of subscriptions.results) endpoint.searchParams.append('id', item.subscription_id); await fetch(endpoint, { method: 'DELETE', headers: { Authorization: `Bearer ${account.accessToken}` } }).catch(() => undefined); }
    const revoke = new URL('https://id.kick.com/oauth/revoke'); revoke.searchParams.set('token', account.accessToken); revoke.searchParams.set('token_hint_type', 'access_token'); await fetch(revoke, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } }).catch(() => undefined);
  }
  await env.DB!.prepare(`UPDATE kick_collections SET status='expired' WHERE owner_session_id=? AND status='collecting'`).bind(sessionId).run();
  await env.DB!.prepare(`DELETE FROM social_accounts WHERE owner_session_id=? AND provider='kick'`).bind(sessionId).run();
}

function pemBytes(pem: string): Uint8Array { return decode64(pem.replace(/-----[^-]+-----/gu, '').replace(/\s+/gu, '')); }
export async function receiveKickWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return new Response('Unavailable', { status: 503 }); const raw = await request.text(); const id = request.headers.get('Kick-Event-Message-Id'); const timestamp = request.headers.get('Kick-Event-Message-Timestamp'); const signature = request.headers.get('Kick-Event-Signature'); const type = request.headers.get('Kick-Event-Type'); const version = request.headers.get('Kick-Event-Version');
  if (!id || !timestamp || !signature || type !== 'chat.message.sent' || version !== '1' || raw.length > 20000) return new Response('Invalid event', { status: 400 });
  const key = await crypto.subtle.importKey('spki', pemBytes(KICK_PUBLIC_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']); const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode64(signature), encoder.encode(`${id}.${timestamp}.${raw}`)); if (!valid) return new Response('Invalid signature', { status: 403 });
  const payload = JSON.parse(raw) as { message_id?: string; content?: string; created_at?: string; broadcaster?: { user_id?: number }; sender?: { is_anonymous?: boolean; user_id?: number; username?: string } }; if (!payload.message_id || !payload.broadcaster?.user_id || !payload.sender?.user_id || payload.sender.is_anonymous || typeof payload.content !== 'string') return new Response(null, { status: 204 });
  const collection = await env.DB.prepare(`SELECT id FROM kick_collections WHERE provider_account_id=? AND status='collecting' AND expires_at>? ORDER BY started_at DESC LIMIT 1`).bind(String(payload.broadcaster.user_id), new Date().toISOString()).first<{ id: string }>(); if (!collection) return new Response(null, { status: 204 });
  await env.DB.prepare(`INSERT OR IGNORE INTO kick_collection_messages (message_id, collection_id, provider_user_id, username, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(payload.message_id, collection.id, String(payload.sender.user_id), payload.sender.username?.slice(0, 300) ?? null, payload.content.slice(0, 2000), payload.created_at && !Number.isNaN(Date.parse(payload.created_at)) ? new Date(payload.created_at).toISOString() : new Date().toISOString()).run(); return new Response(null, { status: 204 });
}
