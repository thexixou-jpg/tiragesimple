import type { ContestRules, Env, Participant, SocialImportJob, SocialPublication } from './types';

const SESSION_COOKIE = 'ts_social_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface ContestImportRecord {
  id: string;
  owner_session_id: string;
  provider: string;
  publication_id: string;
  status: string;
  progress_current: number;
  progress_total: number | null;
  participant_count: number;
  error_code: string | null;
  error_message: string | null;
  expires_at: string;
}

export interface StoredPublication extends SocialPublication { id: string }

export interface StoredParticipant extends Participant { id: string }

function assertDatabase(env: Env): asserts env is Env & { DB: D1Database } {
  if (!env.DB) throw new Error('The social contest database is not configured');
}

function assertSessionSecret(env: Env): string {
  if (!env.SESSION_SIGNING_SECRET) throw new Error('The social contest session secret is not configured');
  return env.SESSION_SIGNING_SECRET;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

function getCookie(request: Request, name: string): string | undefined {
  return request.headers.get('Cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function ownerSession(request: Request, env: Env): Promise<{ id: string; setCookie?: string }> {
  const secret = assertSessionSecret(env);
  const cookie = getCookie(request, SESSION_COOKIE);
  if (cookie) {
    const separator = cookie.lastIndexOf('.');
    const id = cookie.slice(0, separator);
    const signature = cookie.slice(separator + 1);
    if (separator > 0 && signature === await hmac(id, secret)) return { id };
  }
  const id = crypto.randomUUID();
  const signature = await hmac(id, secret);
  return {
    id,
    setCookie: `${SESSION_COOKIE}=${id}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  };
}

export function expiryDate(env: Env): string {
  const retention = Math.max(1, Math.min(90, Number.parseInt(env.RETENTION_DAYS ?? '30', 10) || 30));
  return new Date(Date.now() + retention * 86_400_000).toISOString();
}

export async function savePublication(env: Env, publication: SocialPublication): Promise<StoredPublication> {
  assertDatabase(env);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO social_publications (id, provider, provider_publication_id, canonical_url, author_provider_id, author_name, title, thumbnail_url, published_at, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_publication_id) DO UPDATE SET canonical_url = excluded.canonical_url, author_provider_id = excluded.author_provider_id, author_name = excluded.author_name, title = excluded.title, thumbnail_url = excluded.thumbnail_url, published_at = excluded.published_at, metadata_json = excluded.metadata_json`)
    .bind(id, publication.provider, publication.providerPublicationId, publication.canonicalUrl, publication.authorProviderId ?? null, publication.authorName ?? null, publication.title ?? null, publication.thumbnailUrl ?? null, publication.publishedAt ?? null, JSON.stringify(publication), now).run();
  const row = await env.DB.prepare('SELECT id FROM social_publications WHERE provider = ? AND provider_publication_id = ?').bind(publication.provider, publication.providerPublicationId).first<{ id: string }>();
  if (!row) throw new Error('Unable to store the publication');
  return { ...publication, id: row.id };
}

export async function createImport(env: Env, sessionId: string, publication: StoredPublication, rules: ContestRules, capabilities: unknown, progressTotal: number | null): Promise<ContestImportRecord> {
  assertDatabase(env);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = expiryDate(env);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO contest_imports (id, owner_session_id, provider, publication_id, status, progress_total, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, sessionId, publication.provider, publication.id, 'queued', progressTotal, expiresAt, now, now),
    env.DB.prepare('INSERT INTO contest_rules (id, import_id, rules_json, capabilities_json, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, JSON.stringify(rules), JSON.stringify(capabilities), now),
  ]);
  return { id, owner_session_id: sessionId, provider: publication.provider, publication_id: publication.id, status: 'queued', progress_current: 0, progress_total: progressTotal, participant_count: 0, error_code: null, error_message: null, expires_at: expiresAt };
}

export async function getImport(env: Env, importId: string): Promise<ContestImportRecord | null> {
  assertDatabase(env);
  return env.DB.prepare('SELECT id, owner_session_id, provider, publication_id, status, progress_current, progress_total, participant_count, error_code, error_message, expires_at FROM contest_imports WHERE id = ?').bind(importId).first<ContestImportRecord>();
}

export async function getOwnedImport(env: Env, importId: string, sessionId: string): Promise<ContestImportRecord | null> {
  assertDatabase(env);
  return env.DB.prepare('SELECT id, owner_session_id, provider, publication_id, status, progress_current, progress_total, participant_count, error_code, error_message, expires_at FROM contest_imports WHERE id = ? AND owner_session_id = ? AND expires_at > ?').bind(importId, sessionId, new Date().toISOString()).first<ContestImportRecord>();
}

export async function getImportContext(env: Env, importId: string): Promise<{ import: ContestImportRecord; publication: StoredPublication; rules: ContestRules } | null> {
  assertDatabase(env);
  const row = await env.DB.prepare(`SELECT i.id AS import_id, i.owner_session_id, i.provider AS import_provider, i.publication_id, i.status, i.progress_current, i.progress_total, i.participant_count, i.error_code, i.error_message, i.expires_at,
    p.id AS publication_id_value, p.provider AS publication_provider, p.provider_publication_id, p.canonical_url, p.author_provider_id, p.author_name, p.title, p.thumbnail_url, p.published_at,
    r.rules_json
    FROM contest_imports i JOIN social_publications p ON p.id = i.publication_id JOIN contest_rules r ON r.import_id = i.id
    WHERE i.id = ? ORDER BY r.created_at DESC LIMIT 1`).bind(importId).first<Record<string, string | number | null>>();
  if (!row) return null;
  return {
    import: {
      id: String(row.import_id), owner_session_id: String(row.owner_session_id), provider: String(row.import_provider), publication_id: String(row.publication_id), status: String(row.status),
      progress_current: Number(row.progress_current), progress_total: row.progress_total === null ? null : Number(row.progress_total), participant_count: Number(row.participant_count),
      error_code: row.error_code === null ? null : String(row.error_code), error_message: row.error_message === null ? null : String(row.error_message), expires_at: String(row.expires_at),
    },
    publication: {
      id: String(row.publication_id_value), provider: String(row.publication_provider) as StoredPublication['provider'], providerPublicationId: String(row.provider_publication_id), canonicalUrl: String(row.canonical_url),
      authorProviderId: row.author_provider_id === null ? undefined : String(row.author_provider_id), authorName: row.author_name === null ? undefined : String(row.author_name), title: row.title === null ? undefined : String(row.title),
      thumbnailUrl: row.thumbnail_url === null ? undefined : String(row.thumbnail_url), publishedAt: row.published_at === null ? undefined : String(row.published_at),
    },
    rules: JSON.parse(String(row.rules_json)) as ContestRules,
  };
}

export async function setImportStatus(env: Env, importId: string, status: string, details: { errorCode?: string; errorMessage?: string; progressIncrement?: number; participantCount?: number } = {}): Promise<void> {
  assertDatabase(env);
  await env.DB.prepare(`UPDATE contest_imports SET status = ?, progress_current = progress_current + ?, participant_count = COALESCE(?, participant_count), error_code = ?, error_message = ?, updated_at = ? WHERE id = ?`)
    .bind(status, details.progressIncrement ?? 0, details.participantCount ?? null, details.errorCode ?? null, details.errorMessage ?? null, new Date().toISOString(), importId).run();
}

export async function participantCount(env: Env, importId: string): Promise<number> {
  assertDatabase(env);
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM contest_participants WHERE import_id = ?').bind(importId).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function saveParticipants(env: Env, importId: string, participants: Participant[], duplicateEntries: boolean): Promise<void> {
  assertDatabase(env);
  const now = new Date().toISOString();
  await env.DB.batch(participants.map((participant) => env.DB.prepare(`INSERT INTO contest_participants (id, import_id, provider_user_id, username, display_name, entries_count, eligible, reason_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(import_id, provider_user_id) DO UPDATE SET
      username = COALESCE(excluded.username, contest_participants.username),
      display_name = COALESCE(excluded.display_name, contest_participants.display_name),
      entries_count = CASE WHEN ? = 1 THEN contest_participants.entries_count + excluded.entries_count ELSE MAX(contest_participants.entries_count, excluded.entries_count) END,
      eligible = MAX(contest_participants.eligible, excluded.eligible),
      reason_json = CASE WHEN excluded.eligible = 1 THEN '[]' ELSE contest_participants.reason_json END`)
    .bind(crypto.randomUUID(), importId, participant.providerUserId, participant.username ?? null, participant.displayName ?? null, participant.entriesCount, participant.eligible ? 1 : 0, JSON.stringify(participant.reasons), now, duplicateEntries ? 1 : 0)));
}

export async function listEligibleParticipants(env: Env, importId: string): Promise<StoredParticipant[]> {
  assertDatabase(env);
  const result = await env.DB.prepare('SELECT id, provider_user_id, username, display_name, entries_count, eligible, reason_json FROM contest_participants WHERE import_id = ? AND eligible = 1 ORDER BY provider_user_id').bind(importId).all<Record<string, string | number>>();
  return result.results.map((row) => ({ id: String(row.id), providerUserId: String(row.provider_user_id), username: row.username ? String(row.username) : undefined, displayName: row.display_name ? String(row.display_name) : undefined, entriesCount: Number(row.entries_count), eligible: Number(row.eligible) === 1, reasons: JSON.parse(String(row.reason_json)) as string[] }));
}

export async function incrementProviderUsage(env: Env, provider: string): Promise<void> {
  assertDatabase(env);
  const date = new Date().toISOString().slice(0, 10);
  await env.DB.prepare('INSERT INTO provider_usage (provider, usage_date, requests_count) VALUES (?, ?, 1) ON CONFLICT(provider, usage_date) DO UPDATE SET requests_count = requests_count + 1').bind(provider, date).run();
}

/** Deletes temporary contest data in dependency order. Public proofs expire too. */
export async function purgeExpiredData(env: Env): Promise<void> {
  if (!env.DB) return;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM contest_winners WHERE draw_id IN (SELECT id FROM contest_draws WHERE expires_at <= ?)').bind(now),
    env.DB.prepare('DELETE FROM contest_draws WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM contest_rules WHERE import_id IN (SELECT id FROM contest_imports WHERE expires_at <= ?)').bind(now),
    env.DB.prepare('DELETE FROM contest_import_pages WHERE import_id IN (SELECT id FROM contest_imports WHERE expires_at <= ?)').bind(now),
    env.DB.prepare('DELETE FROM contest_participants WHERE import_id IN (SELECT id FROM contest_imports WHERE expires_at <= ?)').bind(now),
    env.DB.prepare('DELETE FROM contest_imports WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM social_accounts WHERE deleted_at IS NOT NULL AND deleted_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM social_publications WHERE id NOT IN (SELECT publication_id FROM contest_imports)'),
  ]);
}

export async function reserveProviderRequest(env: Env, provider: string): Promise<void> {
  assertDatabase(env);
  // A shared server budget also bounds abuse. No paid quota expansion.
  const limit = provider === 'youtube' ? 6000 : provider === 'github' ? (env.GITHUB_API_TOKEN ? 4000 : 50) : 10000;
  const row = await env.DB.prepare(`INSERT INTO provider_usage (provider, usage_date, requests_count) VALUES (?, ?, 1)
    ON CONFLICT(provider, usage_date) DO UPDATE SET requests_count = requests_count + 1 WHERE requests_count < ? RETURNING requests_count`)
    .bind(provider, new Date().toISOString().slice(0, 10), limit).first();
  if (!row) throw new Error('Le quota quotidien du service est atteint. Réessayez demain.');
}

export async function checkImportAllowance(env: Env, sessionId: string): Promise<void> {
  assertDatabase(env);
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM contest_imports WHERE owner_session_id = ? AND created_at >= ?`)
    .bind(sessionId, new Date(Date.now() - 3600000).toISOString()).first<{ count: number }>();
  if ((row?.count ?? 0) >= 10) throw new Error('Limite de 10 imports par heure atteinte pour cette session.');
}

export async function getImportPage(env: Env, importId: string, key: string): Promise<{ next_job_json: string | null } | null> {
  assertDatabase(env);
  return env.DB.prepare('SELECT next_job_json FROM contest_import_pages WHERE import_id = ? AND page_key = ?').bind(importId, key).first();
}

export async function importPageCount(env: Env, importId: string): Promise<number> {
  assertDatabase(env);
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM contest_import_pages WHERE import_id = ?').bind(importId).first<{ count: number }>();
  return row?.count ?? 0;
}

/** D1 batches are transactions. Only the batch that inserted this checkpoint
 * may change participants/progress. Replayed deliveries just reuse next_job. */
export async function commitImportPage(env: Env, importId: string, key: string, participants: Participant[], duplicateEntries: boolean, analyzed: number, nextJob: SocialImportJob | undefined, maximum: number): Promise<void> {
  assertDatabase(env);
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const guard = 'EXISTS (SELECT 1 FROM contest_import_pages WHERE import_id = ? AND page_key = ? AND batch_token = ?)';
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO contest_import_pages (import_id, page_key, batch_token, next_job_json) VALUES (?, ?, ?, ?)')
      .bind(importId, key, token, nextJob ? JSON.stringify(nextJob) : null),
    env.DB.prepare(`INSERT INTO contest_participants (id, import_id, provider_user_id, username, display_name, entries_count, eligible, reason_json, created_at)
      SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.providerUserId'), json_extract(value, '$.username'), json_extract(value, '$.displayName'),
      json_extract(value, '$.entriesCount'), json_extract(value, '$.eligible'), json_extract(value, '$.reasons'), ? FROM json_each(?) WHERE ${guard}
      ON CONFLICT(import_id, provider_user_id) DO UPDATE SET
      username = COALESCE(excluded.username, contest_participants.username), display_name = COALESCE(excluded.display_name, contest_participants.display_name),
      entries_count = CASE WHEN ? = 1 THEN contest_participants.entries_count + excluded.entries_count ELSE MAX(contest_participants.entries_count, excluded.entries_count) END,
      eligible = MAX(contest_participants.eligible, excluded.eligible), reason_json = CASE WHEN excluded.eligible = 1 THEN '[]' ELSE contest_participants.reason_json END`)
      .bind(importId, now, JSON.stringify(participants.map(p => ({ ...p, id: crypto.randomUUID(), eligible: p.eligible ? 1 : 0 }))), importId, key, token, duplicateEntries ? 1 : 0),
    env.DB.prepare(`UPDATE contest_imports SET status = ?, progress_current = progress_current + ?,
      participant_count = (SELECT COUNT(*) FROM contest_participants WHERE import_id = ? AND eligible = 1), updated_at = ?
      WHERE id = ? AND ${guard}`).bind(nextJob ? 'queued' : 'ready', analyzed, importId, now, importId, importId, key, token),
    env.DB.prepare(`UPDATE contest_imports SET status = 'failed', error_code = 'participant_limit', error_message = ?
      WHERE id = ? AND ((SELECT COUNT(*) FROM contest_participants WHERE import_id = ?) > ? OR progress_current > 100000)`)
      .bind(`Import trop volumineux : limite de ${maximum} comptes ou 100 000 interactions. Aucun tirage partiel n’est proposé.`, importId, importId, maximum),
  ]);
}
