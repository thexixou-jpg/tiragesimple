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

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function publicDrawPage(payload: Record<string, unknown>): string {
  const draw = payload.draw as { id: string; createdAt: string; platform: string; publication: { url: string; title?: string }; winners: Array<{ rank: number; kind: string; username?: string; displayName?: string }>; notice: string };
  const winnerRows = draw.winners.map((winner) => `<li><span>${winner.kind === 'winner' ? 'Gagnant' : 'Suppléant'} ${escapeHtml(winner.rank)}</span><strong>${escapeHtml(winner.displayName || winner.username || 'Participant')}</strong></li>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Résultat ${escapeHtml(draw.id)} | TirageSimple</title><style>body{margin:0;background:#f7f8fc;color:#19182a;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}.wrap{width:min(calc(100% - 2rem),44rem);margin:4rem auto}.card{padding:clamp(1.25rem,4vw,2rem);border:1px solid #e3e3ed;border-radius:22px;background:#fff;box-shadow:0 16px 48px rgb(37 31 86 / 10%)}.tag{display:inline-block;padding:.25rem .55rem;border-radius:999px;background:#efedff;color:#5141cf;font-size:.8rem;font-weight:800}h1{line-height:1.1;letter-spacing:-.04em}a{color:#5141cf}ul{margin:1.5rem 0;padding:0;list-style:none}li{display:flex;padding:1rem;justify-content:space-between;gap:1rem;border-radius:12px;background:#f7f8fc}li+li{margin-top:.5rem}li span{color:#656477;font-size:.85rem}small{color:#656477}</style></head><body><main class="wrap"><article class="card"><span class="tag">Résultat partagé</span><h1>Tirage ${escapeHtml(draw.id)}</h1><p>Plateforme : <strong>${escapeHtml(draw.platform)}</strong><br>Publié le ${escapeHtml(new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(draw.createdAt)))}</p><p><a href="${escapeHtml(draw.publication.url)}" rel="noopener noreferrer">${escapeHtml(draw.publication.title || 'Voir la publication')}</a></p><ul>${winnerRows}</ul><small>${escapeHtml(draw.notice)} Cette page n’est pas indexée par les moteurs de recherche.</small></article></main></body></html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowOrigin(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', 'vary': 'Origin' } });
    }
    const url = new URL(request.url);
    // The Worker can run behind the neutral same-site route /_tiragesimple/*.
    // It avoids a separate host and common blocker patterns such as "api"/"social".
    const pathname = url.pathname.startsWith('/_tiragesimple/') ? url.pathname.slice('/_tiragesimple'.length) : url.pathname;
    if (request.method === 'GET' && pathname === '/v1/providers') return json({ providers: providerStatus(env) }, 200, origin);
    const sharedPageMatch = pathname.match(/^\/tirage\/(TS-\d{8}-[A-Z2-9]+)$/u);
    if (request.method === 'GET' && sharedPageMatch) {
      const result = await publicDraw(env, sharedPageMatch[1]);
      return result
        ? new Response(publicDrawPage(result), { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' } })
        : new Response('Résultat introuvable ou expiré.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' } });
    }
    if (request.method === 'POST' && pathname === '/v1/youtube/publication') {
      try {
        const input = await request.json() as { url?: string };
        if (!input.url) return json({ error: 'A YouTube URL is required' }, 400, origin);
        return json({ publication: await getYouTubePublication(input.url, env) }, 200, origin);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Unable to load the YouTube publication' }, backendUnavailable(error) ? 503 : 400, origin);
      }
    }
    if (request.method === 'POST' && pathname === '/v1/youtube/imports') {
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
    const importMatch = pathname.match(/^\/v1\/imports\/([\w-]+)$/u);
    if (request.method === 'GET' && importMatch) {
      try {
        const session = await ownerSession(request, env);
        const imported = await getOwnedImport(env, importMatch[1], session.id);
        return imported ? json({ import: imported }, 200, origin, session.setCookie) : json({ error: 'Import not found' }, 404, origin, session.setCookie);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Unable to load the import' }, backendUnavailable(error) ? 503 : 400, origin);
      }
    }
    const drawMatch = pathname.match(/^\/v1\/imports\/([\w-]+)\/draw$/u);
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
    const publicDrawMatch = pathname.match(/^\/v1\/draws\/(TS-\d{8}-[A-Z2-9]+)$/u);
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
