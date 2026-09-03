import { normalizeRules } from './contest-rules';
import { providerStatus } from './providers';
import { getOwnedImport, ownerSession, purgeExpiredData, reserveProviderRequest, setImportStatus } from './storage';
import type { ContestRules, Env, SocialComment, SocialImportJob } from './types';
import { createYouTubeDraw } from './youtube-import';
import { createClientSocialImport, processSocialImport, queueSocialImport } from './social-import';
import { getBlueskyPublication } from './bluesky';
import { getYouTubePublication } from './youtube';
import { socialRulesSummary } from '../../../src/lib/social-rules-summary';
import { getMastodonPublication } from './mastodon';
import { getLemmyPublication } from './lemmy';
import { getGitHubPublication, parseGitHubUrl } from './github';
import { getStackExchangePublication } from './stackexchange';
import { parseStackExchangeUrl } from '../../../src/lib/stackexchange-sites';
import { ProviderRequestError } from './provider-http';
import { providerCooldown } from './provider-cooldown';
import { getYouTubeLivePublication } from './youtube-live';
import { completeTwitchOAuth, disconnectTwitch, getTwitchAccount, getTwitchPublication, twitchOAuthUrl } from './twitch';
import { completeKickOAuth, disconnectKick, finishKickCollection, getKickAccount, kickOAuthUrl, receiveKickWebhook, startKickCollection } from './kick';
import { getTrovoCollection } from './trovo';
import { discordInstallUrl, getDiscordPublication } from './discord';
import { getRedditPublication } from './reddit';
import { getVimeoPublication } from './vimeo';
import { getSoundCloudPublication } from './soundcloud';
import { getMixcloudPublication } from './mixcloud';
import { getGitLabPublication } from './gitlab';
import { getDiscoursePublication } from './discourse';
import { getDevPublication } from './devto';
import { getHackerNewsPublication } from './hackernews';
import { getBitbucketPublication } from './bitbucket';
import { getWordPressPublication } from './wordpress';
import { getPeerTubePublication } from './peertube';
import { completePixelfedOAuth, disconnectPixelfed, getPixelfedAccount, getPixelfedPublication, pixelfedOAuthUrl } from './pixelfed';

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
<a href="https://tiragesimple.fr/">TirageSimple</a><p><span class="tag">Résultat partagé · ${escapeHtml(draw.platform === 'youtube' ? 'YouTube' : draw.platform === 'youtube_live' ? 'YouTube Live' : draw.platform === 'vimeo' ? 'Vimeo' : draw.platform === 'soundcloud' ? 'SoundCloud' : draw.platform === 'mixcloud' ? 'Mixcloud' : draw.platform === 'peertube' ? 'PeerTube' : draw.platform === 'twitch' ? 'Twitch' : draw.platform === 'kick' ? 'Kick' : draw.platform === 'trovo' ? 'Trovo' : draw.platform === 'discord' ? 'Discord' : draw.platform === 'mastodon' ? 'Mastodon' : draw.platform === 'pixelfed' ? 'Pixelfed' : draw.platform === 'lemmy' ? 'Lemmy' : draw.platform === 'reddit' ? 'Reddit' : draw.platform === 'github' ? 'GitHub' : draw.platform === 'gitlab' ? 'GitLab' : draw.platform === 'bitbucket' ? 'Bitbucket' : draw.platform === 'discourse' ? 'Discourse' : draw.platform === 'devto' ? 'DEV Community' : draw.platform === 'hackernews' ? 'Hacker News' : draw.platform === 'stackexchange' ? 'Stack Exchange' : draw.platform === 'wordpress' ? 'WordPress.com' : 'Bluesky')}</span></p>
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
    if (request.method === 'POST' && pathname === '/v1/kick/webhook') return receiveKickWebhook(request, env);
    if (request.method === 'GET' && pathname === '/v1/providers') {
      const providers: Record<string,string> = providerStatus(env);
      const retryAt = await providerCooldown(env, 'stackexchange');
      if (retryAt && providers.stackexchange === 'enabled') providers.stackexchange = 'rate_limited';
      return json({ providers, retryAt: retryAt ? {stackexchange:retryAt} : {} }, 200, origin);
    }
    if (request.method === 'GET' && pathname === '/v1/discord/install') {
      try { if (providerStatus(env).discord !== 'enabled') throw new Error('Discord is not enabled'); return Response.redirect(discordInstallUrl(env), 302); }
      catch { return new Response('Le connecteur Discord doit encore être activé.', { status:503, headers:{ 'content-type':'text/plain; charset=utf-8', 'cache-control':'no-store' } }); }
    }
    if (request.method === 'POST' && pathname === '/v1/trovo/publication') {
      try {
        if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return json({ error: 'Origine non autorisée.' }, 403, origin);
        if (providerStatus(env).trovo !== 'enabled') throw new Error('Trovo is not enabled');
        const input = await request.json() as { url?: string };
        if (typeof input.url !== 'string' || input.url.length > 2048) throw new Error('Indiquez une chaîne Trovo valide.');
        await reserveProviderRequest(env, 'trovo');
        const session = await ownerSession(request, env);
        const result = await getTrovoCollection(input.url, env);
        return json(result, 200, origin, session.setCookie);
      } catch (error) { return json({ error: error instanceof Error ? error.message : 'Impossible de contacter Trovo.' }, backendUnavailable(error) ? 503 : 400, origin); }
    }
    if (request.method === 'GET' && pathname === '/v1/kick/oauth/start') {
      try { const session = await ownerSession(request, env); const headers = new Headers({ location: await kickOAuthUrl(env, session.id), 'cache-control': 'no-store' }); if (session.setCookie) headers.set('set-cookie', session.setCookie); return new Response(null, { status: 302, headers }); }
      catch { return new Response('Le connecteur Kick doit encore être activé.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }); }
    }
    if (request.method === 'GET' && pathname === '/v1/kick/oauth/callback') {
      const session = await ownerSession(request, env); const publicSite = env.PUBLIC_SITE_URL ?? 'https://tiragesimple.fr';
      try { const code = url.searchParams.get('code'); const state = url.searchParams.get('state'); if (url.searchParams.get('error') || !code || !state) throw new Error('Connexion Kick annulée.'); await completeKickOAuth(env, session.id, state, code); const headers = new Headers({ location: new URL('/tirage-au-sort-kick/?kick=connected', publicSite).toString(), 'cache-control': 'no-store' }); if (session.setCookie) headers.set('set-cookie', session.setCookie); return new Response(null, { status: 302, headers }); }
      catch { const headers = new Headers({ location: new URL('/tirage-au-sort-kick/?kick=error', publicSite).toString(), 'cache-control': 'no-store' }); if (session.setCookie) headers.set('set-cookie', session.setCookie); return new Response(null, { status: 302, headers }); }
    }
    if (request.method === 'GET' && pathname === '/v1/kick/account') {
      try { if (providerStatus(env).kick !== 'enabled') return json({ connected: false, setupRequired: true }, 200, origin); const session = await ownerSession(request, env); const account = await getKickAccount(env, session.id); return json({ connected: Boolean(account), account: account ? { id: account.id, username: account.username, displayName: account.displayName } : undefined }, 200, origin, session.setCookie); }
      catch (error) { return json({ connected: false, error: error instanceof Error ? error.message : 'Connexion Kick indisponible.' }, 400, origin); }
    }
    if (request.method === 'POST' && pathname === '/v1/kick/disconnect') {
      try { if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return json({ error: 'Origine non autorisée.' }, 403, origin); const session = await ownerSession(request, env); await disconnectKick(env, session.id); return json({ connected: false }, 200, origin, session.setCookie); }
      catch (error) { return json({ error: error instanceof Error ? error.message : 'Déconnexion Kick impossible.' }, 400, origin); }
    }
    if (request.method === 'POST' && (pathname === '/v1/kick/publication' || pathname === '/v1/kick/imports')) {
      try {
        if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return json({ error: 'Origine non autorisée.' }, 403, origin); if (providerStatus(env).kick !== 'enabled') throw new Error('Kick is not enabled');
        const session = await ownerSession(request, env); await reserveProviderRequest(env, 'kick');
        if (pathname.endsWith('/publication')) return json({ publication: await startKickCollection(env, session.id) }, 200, origin, session.setCookie);
        const input = await request.json() as { rules?: Partial<ContestRules> }; const rules = normalizeRules(input.rules ?? {}); if (rules.minimumMentions || rules.includeReplies) throw new Error('Kick importe uniquement les messages reçus pendant la collecte.'); rules.interaction = 'livechat';
        const imported = await finishKickCollection(env, session.id, rules); return json({ import: imported, rulesSummary: socialRulesSummary('kick', { ...rules, excludedAccountCount: rules.excludedUsers.length }), requestedCount: rules.winnerCount + rules.alternateCount }, 201, origin, session.setCookie);
      } catch (error) { return json({ error: error instanceof Error ? error.message : 'Impossible de traiter la collecte Kick.' }, backendUnavailable(error) ? 503 : 400, origin); }
    }
    if (request.method === 'GET' && pathname === '/v1/twitch/oauth/start') {
      try {
        const session = await ownerSession(request, env); const location = await twitchOAuthUrl(env, session.id);
        const headers = new Headers({ location, 'cache-control': 'no-store' }); if (session.setCookie) headers.set('set-cookie', session.setCookie);
        return new Response(null, { status: 302, headers });
      } catch { return new Response('Le connecteur Twitch doit encore être activé.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }); }
    }
    if (request.method === 'GET' && pathname === '/v1/pixelfed/oauth/start') {
      try { const session=await ownerSession(request,env);const instance=url.searchParams.get('instance')||'';const headers=new Headers({location:await pixelfedOAuthUrl(env,session.id,instance),'cache-control':'no-store'});if(session.setCookie)headers.set('set-cookie',session.setCookie);return new Response(null,{status:302,headers}); }
      catch(error){return new Response(error instanceof Error?error.message:'Connexion Pixelfed impossible.',{status:400,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});}
    }
    if (request.method === 'GET' && pathname === '/v1/pixelfed/oauth/callback') {
      const session=await ownerSession(request,env);const publicSite=env.PUBLIC_SITE_URL??'https://tiragesimple.fr';
      try{const code=url.searchParams.get('code');const state=url.searchParams.get('state');if(url.searchParams.get('error')||!code||!state)throw new Error('Connexion annulée.');await completePixelfedOAuth(env,session.id,state,code);const headers=new Headers({location:new URL('/tirage-au-sort-pixelfed/?pixelfed=connected',publicSite).toString(),'cache-control':'no-store'});if(session.setCookie)headers.set('set-cookie',session.setCookie);return new Response(null,{status:302,headers});}
      catch{const headers=new Headers({location:new URL('/tirage-au-sort-pixelfed/?pixelfed=error',publicSite).toString(),'cache-control':'no-store'});if(session.setCookie)headers.set('set-cookie',session.setCookie);return new Response(null,{status:302,headers});}
    }
    if (request.method === 'GET' && pathname === '/v1/pixelfed/account') {
      try{if(providerStatus(env).pixelfed!=='enabled')return json({connected:false,setupRequired:true},200,origin);const session=await ownerSession(request,env);const account=await getPixelfedAccount(env,session.id);return json({connected:Boolean(account),account:account?{id:account.id,host:account.host,username:account.username,displayName:account.displayName}:undefined},200,origin,session.setCookie);}
      catch(error){return json({connected:false,error:error instanceof Error?error.message:'Connexion Pixelfed indisponible.'},400,origin);}
    }
    if (request.method === 'POST' && pathname === '/v1/pixelfed/disconnect') {
      try{if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)return json({error:'Origine non autorisée.'},403,origin);const session=await ownerSession(request,env);await disconnectPixelfed(env,session.id);return json({connected:false},200,origin,session.setCookie);}
      catch(error){return json({error:error instanceof Error?error.message:'Déconnexion Pixelfed impossible.'},400,origin);}
    }
    if (request.method === 'GET' && pathname === '/v1/twitch/oauth/callback') {
      const session = await ownerSession(request, env); const publicSite = env.PUBLIC_SITE_URL ?? 'https://tiragesimple.fr';
      try {
        const code = url.searchParams.get('code'); const state = url.searchParams.get('state'); const denied = url.searchParams.get('error');
        if (denied || !code || !state) throw new Error('Connexion Twitch annulée.');
        await completeTwitchOAuth(env, session.id, state, code);
        const headers = new Headers({ location: new URL('/tirage-au-sort-twitch/?twitch=connected', publicSite).toString(), 'cache-control': 'no-store' }); if (session.setCookie) headers.set('set-cookie', session.setCookie);
        return new Response(null, { status: 302, headers });
      } catch {
        const headers = new Headers({ location: new URL('/tirage-au-sort-twitch/?twitch=error', publicSite).toString(), 'cache-control': 'no-store' }); if (session.setCookie) headers.set('set-cookie', session.setCookie);
        return new Response(null, { status: 302, headers });
      }
    }
    if (request.method === 'GET' && pathname === '/v1/twitch/account') {
      try {
        if (providerStatus(env).twitch !== 'enabled') return json({ connected: false, setupRequired: true }, 200, origin);
        const session = await ownerSession(request, env); const account = await getTwitchAccount(env, session.id);
        return json({ connected: Boolean(account), account: account ? { id: account.id, username: account.username, displayName: account.displayName } : undefined }, 200, origin, session.setCookie);
      } catch (error) { return json({ connected: false, error: error instanceof Error ? error.message : 'Connexion Twitch indisponible.' }, 400, origin); }
    }
    if (request.method === 'POST' && pathname === '/v1/twitch/disconnect') {
      try {
        if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return json({ error: 'Origine non autorisée.' }, 403, origin);
        const session = await ownerSession(request, env); await disconnectTwitch(env, session.id); return json({ connected: false }, 200, origin, session.setCookie);
      } catch (error) { return json({ error: error instanceof Error ? error.message : 'Déconnexion Twitch impossible.' }, 400, origin); }
    }
    if (request.method === 'POST' && (pathname === '/v1/twitch/publication' || pathname === '/v1/twitch/imports')) {
      try {
        if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return json({ error: 'Origine non autorisée.' }, 403, origin);
        if (providerStatus(env).twitch !== 'enabled') throw new Error('Twitch is not enabled');
        const input = await request.json() as { channel?: string; url?: string; rules?: Partial<ContestRules> }; const channel = input.channel ?? input.url;
        if (typeof channel !== 'string' || channel.length > 200) return json({ error: 'Indiquez une chaîne Twitch valide.' }, 400, origin);
        const session = await ownerSession(request, env); await reserveProviderRequest(env, 'twitch');
        const publication = await getTwitchPublication(channel, env, session.id);
        if (pathname.endsWith('/publication')) return json({ publication }, 200, origin, session.setCookie);
        const rules = normalizeRules(input.rules ?? {});
        if (rules.requiredKeyword || rules.minimumMentions || rules.includeReplies || rules.duplicateEntries) throw new Error('Le tirage Twitch porte uniquement sur la présence dans le chat, sans pondération ni filtre de message.');
        if (rules.excludedUsers.some(value => !/^(?:[1-9]\d{0,19}|[A-Za-z0-9_]{4,25})$/u.test(value))) throw new Error('Excluez un login Twitch ou un identifiant numérique valide.');
        rules.interaction = 'chatters'; rules.uniqueParticipants = true;
        const imported = await queueSocialImport(env, session.id, publication, rules);
        return json({ import: imported, rulesSummary: socialRulesSummary('twitch', { ...rules, excludedAccountCount: rules.excludedUsers.length }), requestedCount: rules.winnerCount + rules.alternateCount }, 202, origin, session.setCookie);
      } catch (error) { return json({ error: error instanceof Error ? error.message : 'Impossible de contacter Twitch.' }, backendUnavailable(error) ? 503 : 400, origin); }
    }
    const sharedPageMatch = pathname.match(/^\/tirage\/(TS-\d{8}-[A-Z2-9]+)$/u);
    if (request.method === 'GET' && sharedPageMatch) {
      const result = await publicDraw(env, sharedPageMatch[1]);
      return result
        ? new Response(publicDrawPage(result), { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' } })
        : new Response('Résultat introuvable ou expiré.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' } });
    }
    const clientImportMatch = pathname.match(/^\/v1\/(github|stackexchange|trovo)\/client-imports$/u);
    if (request.method === 'POST' && clientImportMatch) {
      try {
        if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return json({ error: 'Origine non autorisée.' }, 403, origin);
        const length = Number(request.headers.get('content-length') || 0);
        if (length > 3_000_000) return json({ error: 'Collecte navigateur trop volumineuse.' }, 413, origin);
        const input = await request.json() as { url?: string; rules?: Partial<ContestRules>; publication?: { title?: string; authorName?: string; authorProviderId?: string; publishedAt?: string }; comments?: SocialComment[] };
        if (typeof input.url !== 'string' || input.url.length > 2048 || !input.publication || !Array.isArray(input.comments)) return json({ error: 'Collecte navigateur invalide.' }, 400, origin);
        const provider = clientImportMatch[1] as 'github' | 'stackexchange' | 'trovo';
        if (providerStatus(env)[provider] !== 'enabled') throw new Error('Le connecteur n’est pas activé (not enabled).');
        const title = typeof input.publication.title === 'string' ? input.publication.title.trim().slice(0, 1000) : '';
        const authorName = typeof input.publication.authorName === 'string' ? input.publication.authorName.trim().slice(0, 300) : undefined;
        const authorProviderId = typeof input.publication.authorProviderId === 'string' && /^[1-9]\d{0,19}$/u.test(input.publication.authorProviderId) ? input.publication.authorProviderId : undefined;
        const publishedAt = typeof input.publication.publishedAt === 'string' && !Number.isNaN(Date.parse(input.publication.publishedAt)) ? new Date(input.publication.publishedAt).toISOString() : undefined;
        if (!title) throw new Error('Métadonnées de publication incomplètes.');
        const github = provider === 'github' ? parseGitHubUrl(input.url) : null;
        const stackId = provider === 'stackexchange' ? parseStackExchangeUrl(input.url) : null;
        if (provider === 'github' && !github || provider === 'stackexchange' && !stackId) throw new Error('URL de publication invalide.');
        const trovo = provider === 'trovo' ? (await getTrovoCollection(input.url, env)).publication : null;
        const publication = provider === 'github'
          ? { provider, providerPublicationId: `${github!.owner}|${github!.repo}|${github!.number}`, canonicalUrl: `https://github.com/${github!.owner}/${github!.repo}/${github!.kind}/${github!.number}`, authorProviderId, authorName, title, publishedAt }
          : provider === 'stackexchange' ? { provider, providerPublicationId: stackId!.publicationId, canonicalUrl: stackId!.canonicalUrl, authorProviderId, authorName, title, publishedAt }
            : { provider, providerPublicationId: trovo!.providerPublicationId, canonicalUrl: trovo!.canonicalUrl, authorProviderId: trovo!.authorProviderId, authorName: trovo!.authorName, title: trovo!.title, thumbnailUrl: trovo!.thumbnailUrl, publishedAt: trovo!.publishedAt };
        const rules = normalizeRules(input.rules ?? {});
        if (provider === 'github') {
          if (input.rules?.interaction !== undefined || rules.includeReplies) throw new Error('GitHub accepte uniquement les commentaires généraux de la conversation.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.toLowerCase());
        } else if (provider === 'stackexchange') {
          if (!['answers', 'comments'].includes(input.rules?.interaction ?? '')) throw new Error('Choisissez les réponses ou les commentaires de la question.');
          if (rules.excludedUsers.some(value => !/^[1-9]\d{0,11}$/u.test(value))) throw new Error('Utilisez uniquement les identifiants utilisateur numériques pour les exclusions.');
        } else {
          if (rules.includeReplies || rules.minimumMentions || input.rules?.interaction !== 'livechat') throw new Error('Trovo importe uniquement les messages normaux reçus pendant la collecte.');
          if (rules.excludedUsers.some(value => !/^(?:[1-9]\d{0,19}|[A-Za-z0-9_]{3,50})$/u.test(value))) throw new Error('Utilisez un login ou un identifiant Trovo valide pour les exclusions.');
          rules.interaction = 'livechat';
        }
        const session = await ownerSession(request, env);
        const imported = await createClientSocialImport(env, session.id, publication, rules, input.comments);
        return json({ import: imported, rulesSummary: socialRulesSummary(provider, { ...rules, clientSourced: true, excludedAccountCount: rules.excludedUsers.length }), requestedCount: rules.winnerCount + rules.alternateCount }, 201, origin, session.setCookie);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Impossible de traiter la collecte navigateur.' }, backendUnavailable(error) ? 503 : 400, origin);
      }
    }
    const providerMatch = pathname.match(/^\/v1\/(youtube|youtube_live|vimeo|soundcloud|mixcloud|peertube|discord|bluesky|mastodon|pixelfed|lemmy|reddit|github|gitlab|bitbucket|discourse|devto|hackernews|stackexchange|wordpress)\/(publication|imports)$/u);
    if (request.method === 'POST' && providerMatch) {
      try {
        if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return json({ error: 'Origine non autorisée.' }, 403, origin);
        const input = await request.json() as { url?: string; rules?: Partial<ContestRules> };
        if (typeof input.url !== 'string' || input.url.length > 2048) return json({ error: 'Une URL valide est nécessaire.' }, 400, origin);
        const provider = providerMatch[1];
        const session = await ownerSession(request, env);
        await reserveProviderRequest(env, provider);
        if (provider === 'bluesky') await reserveProviderRequest(env, provider); // handle resolution + post lookup
        const publication = provider === 'youtube' ? await getYouTubePublication(input.url, env)
          : provider === 'youtube_live' ? await getYouTubeLivePublication(input.url, env)
          : provider === 'vimeo' ? await getVimeoPublication(input.url, env)
          : provider === 'soundcloud' ? await getSoundCloudPublication(input.url, env)
          : provider === 'mixcloud' ? await getMixcloudPublication(input.url, env)
          : provider === 'peertube' ? await getPeerTubePublication(input.url, env)
          : provider === 'discord' ? await getDiscordPublication(input.url, env)
          : provider === 'bluesky' ? await getBlueskyPublication(input.url, env)
            : provider === 'mastodon' ? await getMastodonPublication(input.url, env)
              : provider === 'pixelfed' ? await getPixelfedPublication(input.url, env, session.id)
              : provider === 'lemmy' ? await getLemmyPublication(input.url, env)
                : provider === 'reddit' ? await getRedditPublication(input.url, env)
                : provider === 'github' ? await getGitHubPublication(input.url, env)
                : provider === 'gitlab' ? await getGitLabPublication(input.url, env)
                : provider === 'bitbucket' ? await getBitbucketPublication(input.url, env)
                : provider === 'discourse' ? await getDiscoursePublication(input.url, env)
                : provider === 'devto' ? await getDevPublication(input.url, env)
                : provider === 'hackernews' ? await getHackerNewsPublication(input.url, env)
                : provider === 'wordpress' ? await getWordPressPublication(input.url, env) : await getStackExchangePublication(input.url, env);
        if (providerMatch[2] === 'publication') return json({ publication }, 200, origin);
        const rules = normalizeRules(input.rules ?? {});
        if ((provider === 'youtube' || provider === 'youtube_live') && rules.excludedUsers.some(id => !/^UC[\w-]{22}$/u.test(id))) throw new Error('Utilisez les identifiants de chaîne UC… pour les exclusions YouTube, pas les noms affichés.');
        if (provider === 'vimeo') {
          if (input.rules?.interaction !== undefined || rules.minimumMentions) throw new Error('Vimeo importe uniquement les commentaires et leurs réponses.');
          if (rules.excludedUsers.some(value => !/^(?:\/(?:users|guest_users)\/[A-Za-z0-9_-]+|[^,\n]{1,100})$/u.test(value))) throw new Error('Utilisez un nom affiché ou un identifiant Vimeo valide pour les exclusions.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.toLocaleLowerCase('fr-FR'));
        }
        if (provider === 'soundcloud') {
          if (input.rules?.interaction !== undefined || rules.minimumMentions || rules.includeReplies) throw new Error('SoundCloud importe uniquement les commentaires publics de la piste, sans réponses imbriquées.');
          if (rules.excludedUsers.some(value => !/^(?:soundcloud:users:[1-9]\d{0,19}|[A-Za-z0-9_-]{1,100})$/u.test(value))) throw new Error('Utilisez un permalink ou un URN utilisateur SoundCloud valide pour les exclusions.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.toLocaleLowerCase('fr-FR'));
        }
        if (provider === 'mixcloud') {
          if (!['comments', 'likes', 'listeners'].includes(input.rules?.interaction ?? '')) throw new Error('Choisissez les commentaires, favoris ou auditeurs Mixcloud.');
          if (rules.minimumMentions || rules.includeReplies) throw new Error('Les réponses imbriquées et mentions ne sont pas des critères Mixcloud disponibles.');
          if (rules.interaction !== 'comments' && (rules.requiredKeyword || rules.duplicateEntries)) throw new Error('Le filtre textuel et les chances multiples sont disponibles uniquement pour les commentaires Mixcloud.');
          if (rules.excludedUsers.some(value => !/^(?:\/[A-Za-z0-9_.-]{1,150}\/|[A-Za-z0-9_.-]{1,150})$/u.test(value))) throw new Error('Utilisez un nom utilisateur ou une clé de profil Mixcloud valide pour les exclusions.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.startsWith('/') ? value : value.toLocaleLowerCase('fr-FR'));
        }
        if (provider === 'peertube') {
          if (input.rules?.interaction !== undefined || rules.minimumMentions) throw new Error('PeerTube importe uniquement les commentaires publics et leurs réponses.');
          if (rules.excludedUsers.some(value => !/^(?:https:\/\/[^\s,]{1,480}|[A-Za-z0-9_.-]{1,100}(?:@[A-Za-z0-9.-]{1,253})?)$/u.test(value))) throw new Error('Utilisez un compte nom@instance ou une identité ActivityPub HTTPS valide pour les exclusions.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.startsWith('https://') ? value.replace(/\/$/u, '') : value.toLowerCase());
        }
        if (provider === 'youtube_live') {
          if (rules.includeReplies || rules.minimumMentions || input.rules?.interaction && input.rules.interaction !== 'livechat') throw new Error('YouTube Live importe uniquement les messages texte actuellement disponibles dans le chat.');
          rules.interaction = 'livechat';
        }
        if (provider === 'bluesky' || provider === 'mastodon' || provider === 'pixelfed') {
          if (!['likes', 'reposts'].includes(input.rules?.interaction ?? '')) throw new Error('Choisissez les likes ou les reposts.');
          if (rules.requiredKeyword || rules.minimumMentions || rules.includeReplies || rules.duplicateEntries) throw new Error(`Ces règles ne sont pas prises en charge pour ${provider === 'bluesky' ? 'Bluesky' : provider === 'pixelfed' ? 'Pixelfed' : 'Mastodon'}.`);
          rules.uniqueParticipants = true;
        }
        if (provider === 'discord') {
          if (!input.rules?.providerInteractionId || !/^(?:unicode:.{1,32}|custom:[^:]{1,100}:[1-9]\d{16,19})$/u.test(input.rules.providerInteractionId)) throw new Error('Choisissez l’emoji Discord utilisé pour participer.');
          if (rules.requiredKeyword || rules.minimumMentions || rules.includeReplies || rules.duplicateEntries) throw new Error('Le tirage Discord utilise uniquement une réaction au message, sans filtre de texte ni chances multiples.');
          if (rules.excludedUsers.some(value => !/^(?:[1-9]\d{16,19}|[a-z0-9_.]{2,32})$/u.test(value.toLowerCase()))) throw new Error('Utilisez un nom utilisateur ou un identifiant Discord valide pour les exclusions.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.toLowerCase()); rules.interaction = 'likes'; rules.uniqueParticipants = true;
        }
        if (provider === 'lemmy' && input.rules?.interaction !== undefined) throw new Error('Les likes Lemmy ne sont pas disponibles comme participants. Utilisez les commentaires.');
        if (provider === 'reddit') {
          if (input.rules?.interaction !== undefined || rules.minimumMentions) throw new Error('Reddit importe uniquement les commentaires et réponses publics.');
          if (rules.excludedUsers.some(value => !/^(?:t2_[a-z0-9]+|[A-Za-z0-9_-]{3,20})$/u.test(value))) throw new Error('Utilisez un pseudo Reddit ou un identifiant t2_… valide pour les exclusions.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.toLowerCase());
        }
        if (provider === 'github') {
          if (input.rules?.interaction !== undefined || rules.includeReplies) throw new Error('Ce connecteur importe uniquement les commentaires généraux de la conversation GitHub.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.toLowerCase());
        }
        if (provider === 'gitlab') {
          if (input.rules?.interaction !== undefined || rules.includeReplies || rules.minimumMentions) throw new Error('Ce connecteur importe uniquement les commentaires publics non système de la conversation GitLab.');
          if (rules.excludedUsers.some(value => !/^(?:[1-9]\d{0,19}|[A-Za-z0-9_.-]{1,255})$/u.test(value))) throw new Error('Utilisez un nom utilisateur ou un identifiant numérique GitLab valide pour les exclusions.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.toLocaleLowerCase('fr-FR'));
        }
        if (provider === 'bitbucket') {
          if (input.rules?.interaction !== undefined || rules.minimumMentions) throw new Error('Bitbucket importe uniquement les commentaires publics et leurs réponses de pull request.');
          if (rules.excludedUsers.some(value => !/^(?:\{[0-9a-f-]{36}\}|[A-Za-z0-9_. -]{1,100})$/iu.test(value))) throw new Error('Utilisez un nom de compte ou UUID Bitbucket valide pour les exclusions.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.toLocaleLowerCase('fr-FR'));
        }
        if (provider === 'discourse') {
          if (input.rules?.interaction !== undefined || rules.minimumMentions) throw new Error('Discourse importe uniquement les messages publics.');
          if (rules.excludedUsers.some(value => !/^[1-9]\d{0,11}$/u.test(value))) throw new Error('Utilisez les identifiants numériques du forum.');
        }
        if (provider === 'devto') {
          if (input.rules?.interaction !== undefined || rules.minimumMentions) throw new Error('DEV Community importe uniquement les commentaires publics et leurs réponses.');
          if (rules.excludedUsers.some(value => !/^(?:[1-9]\d{0,19}|[A-Za-z0-9_-]{2,100})$/u.test(value))) throw new Error('Utilisez un nom utilisateur ou un identifiant numérique DEV Community valide pour les exclusions.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.toLocaleLowerCase('fr-FR'));
        }
        if (provider === 'hackernews') {
          if (input.rules?.interaction !== undefined || rules.minimumMentions) throw new Error('Hacker News importe uniquement les commentaires publics et leurs réponses.');
          if (rules.excludedUsers.some(value => !/^[A-Za-z0-9_-]{2,100}$/u.test(value))) throw new Error('Utilisez les identifiants exacts et sensibles à la casse des membres Hacker News.');
        }
        if (provider === 'wordpress') {
          if (input.rules?.interaction !== undefined || rules.minimumMentions) throw new Error('WordPress.com importe uniquement les commentaires publics et leurs réponses.');
          if (rules.excludedUsers.some(value => !/^(?:[1-9]\d{0,19}|[A-Za-z0-9_.-]{1,100})$/u.test(value))) throw new Error('Utilisez un login WordPress.com ou un identifiant numérique valide pour les exclusions.');
          rules.excludedUsers = rules.excludedUsers.map(value => value.toLocaleLowerCase('fr-FR'));
        }
        if (provider === 'stackexchange') {
          if (!['answers', 'comments'].includes(input.rules?.interaction ?? '')) throw new Error('Choisissez les réponses ou les commentaires de la question.');
          if (rules.includeReplies || rules.minimumMentions) throw new Error('Les réponses imbriquées et mentions ne sont pas des critères Stack Exchange disponibles.');
          if (rules.excludedUsers.some(value => !/^[1-9]\d{0,11}$/u.test(value))) throw new Error('Pour les exclusions Stack Exchange, utilisez uniquement les identifiants utilisateur numériques.');
        }
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
      } catch (error) {
        if (message.attempts >= 4) {
          await setImportStatus(env, message.body.importId, 'failed', { errorMessage: 'Import interrompu après plusieurs tentatives. Aucun tirage partiel ne sera effectué.' });
          message.ack();
        } else message.retry({ delaySeconds: Math.min(43200, Math.max(15 * 2 ** message.attempts, error instanceof ProviderRequestError ? error.retryAfterSeconds : 0)) });
      }
    }
  },
  async scheduled(_controller, env): Promise<void> {
    await purgeExpiredData(env);
  },
} satisfies ExportedHandler<Env, SocialImportJob>;
