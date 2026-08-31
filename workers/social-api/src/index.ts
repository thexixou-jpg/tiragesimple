import { normalizeRules } from './contest-rules';
import { providerStatus } from './providers';
import { getOwnedImport, ownerSession, purgeExpiredData, reserveProviderRequest, setImportStatus } from './storage';
import type { ContestRules, Env, SocialImportJob } from './types';
import { createYouTubeDraw } from './youtube-import';
import { processSocialImport, queueSocialImport } from './social-import';
import { getBlueskyPublication } from './bluesky';
import { getYouTubePublication } from './youtube';
import { socialRulesSummary } from '../../../src/lib/social-rules-summary';
import { getMastodonPublication } from './mastodon';
import { getLemmyPublication } from './lemmy';

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
    p.provider, p.canonical_url, p.title, i.participant_count, i.progress_current, d.expires_at
    FROM contest_draws d JOIN contest_imports i ON i.id = d.import_id JOIN social_publications p ON p.id = i.publication_id
    WHERE d.public_id = ? AND d.public_visibility = 1 AND d.expires_at > ?`).bind(publicId, new Date().toISOString()).first<Record<string, string>>();
  if (!draw) return null;
  const { excludedUsers, ...publicRules } = JSON.parse(draw.rules_snapshot_json) as ContestRules;
  const winners = await env.DB.prepare(`SELECT w.rank, w.kind, cp.username, cp.display_name
    FROM contest_winners w JOIN contest_draws d ON d.id = w.draw_id JOIN contest_participants cp ON cp.id = w.participant_id
    WHERE d.public_id = ? ORDER BY w.kind, w.rank`).bind(publicId).all<Record<string, string | number | null>>();
  return {
    draw: {
      id: draw.public_id,
      createdAt: draw.created_at,
      platform: draw.provider,
      participantCount: Number(draw.participant_count),
      analyzedCount: Number(draw.progress_current),
      expiresAt: draw.expires_at,
      publication: { url: draw.canonical_url, title: draw.title },
      rules: { ...publicRules, excludedAccountCount: excludedUsers.length },
      rulesSummary: socialRulesSummary(draw.provider, { ...publicRules, excludedAccountCount: excludedUsers.length }),
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
  const draw = payload.draw as { id: string; createdAt: string; expiresAt: string; platform: string; participantCount: number; analyzedCount: number; rulesSummary: string[]; participantSnapshotHash: string; randomCommitmentHash: string; verificationSeed: string; resultHash: string; publication: { url: string; title?: string }; winners: Array<{ rank: number; kind: string; username?: string; displayName?: string }>; notice: string };
  const date = (value: string) => escapeHtml(new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(value)));
  const winnerRows = [...draw.winners].sort((a, b) => Number(a.kind !== 'winner') - Number(b.kind !== 'winner') || a.rank - b.rank)
    .map((winner) => `<li><span>${winner.kind === 'winner' ? 'Gagnant' : 'Suppléant'} ${escapeHtml(winner.rank)}</span><strong>${escapeHtml(winner.displayName || winner.username || 'Participant')}</strong></li>`).join('');
  const rules = draw.rulesSummary.map(line => `<li>${escapeHtml(line)}</li>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Résultat ${escapeHtml(draw.id)} | TirageSimple</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#101220;color:#eff1ff;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}.wrap{width:min(calc(100% - 2rem),52rem);margin:clamp(1rem,5vw,4rem) auto}.card{padding:clamp(1.25rem,4vw,2.5rem);border:1px solid #343953;border-radius:24px;background:#191d30}.tag{display:inline-block;padding:.3rem .7rem;border-radius:999px;background:#2a294c;color:#c5baff;font-size:.8rem;font-weight:700}h1{font-size:clamp(1.5rem,5vw,2.4rem);line-height:1.2;letter-spacing:-.04em}h2{font-size:1.2rem;margin-top:2rem}a{color:#c1b3ff}a:focus-visible,summary:focus-visible{outline:2px solid #fff;outline-offset:4px}p,h1,strong,li,a,code{overflow-wrap:anywhere}.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.stats div{padding:1rem;background:#101524;border-radius:14px}.stats strong{display:block;font-size:1.7rem}.stats span,small{color:#b7bed4}.winners{padding:0;list-style:none}.winners li{display:flex;flex-wrap:wrap;padding:1rem;justify-content:space-between;gap:.5rem 1rem;border-radius:12px;background:#242b44}.winners li+li{margin-top:.5rem}.winners span{color:#c4cbe0}.rules{padding-left:1.2rem;color:#d1d7eb}.rules li+li{margin-top:.45rem}.proof{margin-top:2rem;padding:1rem;border:1px solid #343953;border-radius:14px;background:#111628}.proof summary{cursor:pointer;font-weight:700}.proof dl{margin-bottom:0}.proof dt{margin-top:.8rem;color:#b7bed4;font-size:.8rem}.proof dd{margin:.15rem 0 0}.proof code{display:block;padding:.55rem;border-radius:8px;background:#090c16;font-size:.72rem;word-break:break-all;user-select:all}footer{border-top:1px solid #343953;margin-top:2rem;padding-top:1rem}footer p{margin-bottom:0}@media(max-width:360px){.stats{grid-template-columns:1fr}}
</style></head><body><main class="wrap"><article class="card">
<a href="https://tiragesimple.fr/">TirageSimple</a><p><span class="tag">Résultat partagé · ${escapeHtml(draw.platform === 'youtube' ? 'YouTube' : draw.platform === 'mastodon' ? 'Mastodon' : draw.platform === 'lemmy' ? 'Lemmy' : 'Bluesky')}</span></p>
<h1>Tirage ${escapeHtml(draw.id)}</h1><p>${date(draw.createdAt)} (heure de Paris)</p>
<p><a href="${escapeHtml(draw.publication.url)}" rel="noopener noreferrer">${escapeHtml(draw.publication.title || 'Voir la publication')}</a></p>
<div class="stats"><div><strong>${escapeHtml(draw.participantCount)}</strong><span>comptes éligibles</span></div><div><strong>${escapeHtml(draw.analyzedCount)}</strong><span>interactions analysées</span></div></div>
<h2>Résultats du tirage</h2><ul class="winners">${winnerRows}</ul>
<h2>Règles appliquées</h2><ul class="rules">${rules}</ul>
<details class="proof"><summary>Empreintes techniques du reçu</summary><p><small>Elles permettent de détecter une modification. Sans la liste privée des participants, elles ne suffisent pas à rejouer le tirage et ne constituent pas une certification indépendante.</small></p><dl><dt>Empreinte de la liste</dt><dd><code>${escapeHtml(draw.participantSnapshotHash)}</code></dd><dt>Engagement aléatoire</dt><dd><code>${escapeHtml(draw.randomCommitmentHash)}</code></dd><dt>Graine révélée</dt><dd><code>${escapeHtml(draw.verificationSeed)}</code></dd><dt>Empreinte du résultat</dt><dd><code>${escapeHtml(draw.resultHash)}</code></dd></dl><p><a href="/_tiragesimple/v1/draws/${encodeURIComponent(draw.id)}">Consulter le reçu JSON</a></p></details>
<footer><small>${escapeHtml(draw.notice)} La liste complète des participants n’est pas publique ; cette page seule ne permet donc pas de rejouer le tirage. Cette page n’est pas indexée par les moteurs de recherche.</small><p><small>Résultat disponible jusqu’au ${date(draw.expiresAt)} (heure de Paris).</small></p></footer>
</article></main></body></html>`;
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
    const providerMatch = pathname.match(/^\/v1\/(youtube|bluesky|mastodon|lemmy)\/(publication|imports)$/u);
    if (request.method === 'POST' && providerMatch) {
      try {
        if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return json({ error: 'Origine non autorisée.' }, 403, origin);
        const input = await request.json() as { url?: string; rules?: Partial<ContestRules> };
        if (typeof input.url !== 'string' || input.url.length > 2048) return json({ error: 'Une URL valide est nécessaire.' }, 400, origin);
        const provider = providerMatch[1];
        await reserveProviderRequest(env, provider);
        if (provider === 'bluesky') await reserveProviderRequest(env, provider); // handle resolution + post lookup
        const publication = provider === 'youtube' ? await getYouTubePublication(input.url, env)
          : provider === 'bluesky' ? await getBlueskyPublication(input.url, env)
            : provider === 'mastodon' ? await getMastodonPublication(input.url, env) : await getLemmyPublication(input.url, env);
        if (providerMatch[2] === 'publication') return json({ publication }, 200, origin);
        const rules = normalizeRules(input.rules ?? {});
        if (provider === 'youtube' && rules.excludedUsers.some(id => !/^UC[\w-]{22}$/u.test(id))) throw new Error('Utilisez les identifiants de chaîne UC… pour les exclusions YouTube, pas les noms affichés.');
        if (provider === 'bluesky' || provider === 'mastodon') {
          if (!['likes', 'reposts'].includes(input.rules?.interaction ?? '')) throw new Error('Choisissez les likes ou les reposts.');
          if (rules.requiredKeyword || rules.minimumMentions || rules.includeReplies || rules.duplicateEntries) throw new Error(`Ces règles ne sont pas prises en charge pour ${provider === 'bluesky' ? 'Bluesky' : 'Mastodon'}.`);
          rules.uniqueParticipants = true;
        }
        if (provider === 'lemmy' && input.rules?.interaction !== undefined) throw new Error('Les likes Lemmy ne sont pas disponibles comme participants. Utilisez les commentaires.');
        const session = await ownerSession(request, env);
        const imported = await queueSocialImport(env, session.id, publication, rules);
        return json({ import: imported, rulesSummary: socialRulesSummary(provider, { ...rules, excludedAccountCount: rules.excludedUsers.length }), requestedCount: rules.winnerCount + rules.alternateCount }, 202, origin, session.setCookie);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Impossible de contacter la plateforme.' }, backendUnavailable(error) ? 503 : 400, origin);
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
      try {
        await processSocialImport(message.body, env);
        message.ack();
      } catch {
        if (message.attempts >= 4) {
          await setImportStatus(env, message.body.importId, 'failed', { errorMessage: 'Import interrompu après plusieurs tentatives. Aucun tirage partiel ne sera effectué.' });
          message.ack();
        } else message.retry({ delaySeconds: Math.min(300, 15 * 2 ** message.attempts) });
      }
    }
  },
  async scheduled(_controller, env): Promise<void> {
    await purgeExpiredData(env);
  },
} satisfies ExportedHandler<Env, SocialImportJob>;
