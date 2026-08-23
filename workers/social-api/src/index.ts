import { normalizeRules } from './contest-rules';
import { providerStatus } from './providers';
import { getOwnedImport, ownerSession, purgeExpiredData } from './storage';
import type { ContestRules, Env, SocialImportJob } from './types';
import { createYouTubeDraw, processYouTubeImport, queueYouTubeImport } from './youtube-import';
import { getYouTubePublication } from './youtube';

function allowOrigin(request: Request, env: Env): string {
  const configured = env.ALLOWED_ORIGIN ?? 'https://tiragesimple.fr';
  return request.headers.get('Origin') === configured ? configured : configured;
}

function json(body: unknown, status = 200, origin = 'https://tiragesimple.fr', setCookie?: string): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'vary': 'Origin',
  });
  if (setCookie) headers.set('set-cookie', setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function backendUnavailable(error: unknown): boolean {
  return error instanceof Error && (error.message.includes('not configured') || error.message.includes('not enabled'));
}

async function publicDraw(env: Env, publicId: string): Promise<Record<string, unknown> | null> {
  if (!env.DB) return null;
  const draw = await env.DB.prepare(`SELECT d.public_id, d.participant_snapshot_hash, d.random_commitment_hash, d.verification_seed, d.result_hash, d.rules_snapshot_json, d.created_at,
    p.provider, p.canonical_url, p.title
    FROM contest_draws d JOIN contest_imports i ON i.id = d.import_id JOIN social_publications p ON p.id = i.publication_id
    WHERE d.public_id = ? AND d.public_visibility = 1 AND d.expires_at > ?`).bind(publicId, new Date().toISOString()).first<Record<string, string>>();
  if (!draw) return null;
  const winners = await env.DB.prepare(`SELECT w.rank, w.kind, cp.username, cp.display_name
    FROM contest_winners w JOIN contest_draws d ON d.id = w.draw_id JOIN contest_participants cp ON cp.id = w.participant_id
    WHERE d.public_id = ? ORDER BY w.kind, w.rank`).bind(publicId).all<Record<string, string | number | null>>();
  return {
    draw: {
      id: draw.public_id,
      createdAt: draw.created_at,
      platform: draw.provider,
      publication: { url: draw.canonical_url, title: draw.title },
      rules: JSON.parse(draw.rules_snapshot_json),
      participantSnapshotHash: draw.participant_snapshot_hash,
      randomCommitmentHash: draw.random_commitment_hash,
      verificationSeed: draw.verification_seed,
      resultHash: draw.result_hash,
      winners: winners.results.map((winner) => ({ rank: winner.rank, kind: winner.kind, username: winner.username, displayName: winner.display_name })),
      notice: 'Résultat reproductible avec la même liste de participants. Ce tirage n’est pas une certification tierce.',
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowOrigin(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', 'vary': 'Origin' } });
    }
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/v1/providers') return json({ providers: providerStatus(env) }, 200, origin);
    if (request.method === 'POST' && url.pathname === '/v1/youtube/publication') {
      try {
        const input = await request.json() as { url?: string };
        if (!input.url) return json({ error: 'A YouTube URL is required' }, 400, origin);
        return json({ publication: await getYouTubePublication(input.url, env) }, 200, origin);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Unable to load the YouTube publication' }, backendUnavailable(error) ? 503 : 400, origin);
      }
    }
    if (request.method === 'POST' && url.pathname === '/v1/youtube/imports') {
      try {
        const input = await request.json() as { url?: string; rules?: Partial<ContestRules> };
        if (!input.url) return json({ error: 'A YouTube URL is required' }, 400, origin);
        const session = await ownerSession(request, env);
        const publication = await getYouTubePublication(input.url, env);
        const imported = await queueYouTubeImport(env, session.id, publication, normalizeRules(input.rules ?? {}), null);
        return json({ import: imported }, 202, origin, session.setCookie);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Unable to start the YouTube import' }, backendUnavailable(error) ? 503 : 400, origin);
      }
    }
    const importMatch = url.pathname.match(/^\/v1\/imports\/([\w-]+)$/u);
    if (request.method === 'GET' && importMatch) {
      try {
        const session = await ownerSession(request, env);
        const imported = await getOwnedImport(env, importMatch[1], session.id);
        return imported ? json({ import: imported }, 200, origin, session.setCookie) : json({ error: 'Import not found' }, 404, origin, session.setCookie);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Unable to load the import' }, backendUnavailable(error) ? 503 : 400, origin);
      }
    }
    const drawMatch = url.pathname.match(/^\/v1\/imports\/([\w-]+)\/draw$/u);
    if (request.method === 'POST' && drawMatch) {
      try {
        const session = await ownerSession(request, env);
        const imported = await getOwnedImport(env, drawMatch[1], session.id);
        if (!imported) return json({ error: 'Import not found' }, 404, origin, session.setCookie);
        const input = await request.json().catch(() => ({})) as { publicVisibility?: boolean };
        const draw = await createYouTubeDraw(env, imported.id, input.publicVisibility === true);
        return json({ draw }, 201, origin, session.setCookie);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Unable to create the draw' }, backendUnavailable(error) ? 503 : 400, origin);
      }
    }
    const publicDrawMatch = url.pathname.match(/^\/v1\/draws\/(TS-\d{8}-[A-Z2-9]+)$/u);
    if (request.method === 'GET' && publicDrawMatch) {
      const result = await publicDraw(env, publicDrawMatch[1]);
      return result ? json(result, 200, origin) : json({ error: 'Draw not found' }, 404, origin);
    }
    return json({ error: 'Not found' }, 404, origin);
  },
  async queue(batch: MessageBatch<SocialImportJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      if (message.body.provider === 'youtube') await processYouTubeImport(message.body, env);
      message.ack();
    }
  },
  async scheduled(_controller, env): Promise<void> {
    await purgeExpiredData(env);
  },
} satisfies ExportedHandler<Env, SocialImportJob>;
