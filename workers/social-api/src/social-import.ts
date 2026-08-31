import { createParticipants, sha256 } from './contest-rules';
import { getBlueskyParticipantsPage } from './bluesky';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import { checkImportAllowance, commitImportPage, createImport, getImport, getImportContext, getImportPage, importPageCount, reserveProviderRequest, savePublication, setImportStatus } from './storage';
import type { ContestRules, Env, Participant, SocialImportJob, SocialPublication } from './types';
import { getYouTubeCommentPage, getYouTubeReplyPage } from './youtube';
import { getMastodonParticipantsPage } from './mastodon';
import { getLemmyParticipantsPage } from './lemmy';

export function nextYouTubeJob(job: SocialImportJob, nextPageToken?: string, replyParentIds: string[] = []): SocialImportJob | undefined {
  const base = { provider: job.provider, importId: job.importId };
  if (job.phase === 'replies') {
    if (nextPageToken) return { ...job, pageToken: nextPageToken };
    const remaining = job.parentIds?.slice(1) ?? [];
    if (remaining.length) return { ...base, phase: 'replies', parentIds: remaining, nextThreadToken: job.nextThreadToken };
    return job.nextThreadToken ? { ...base, pageToken: job.nextThreadToken } : undefined;
  }
  if (replyParentIds.length) return { ...base, phase: 'replies', parentIds: replyParentIds, nextThreadToken: nextPageToken };
  return nextPageToken ? { ...base, pageToken: nextPageToken } : undefined;
}

export async function queueSocialImport(env: Env, sessionId: string, publication: SocialPublication, rules: ContestRules) {
  if (!env.SOCIAL_IMPORT_QUEUE) throw new Error('The social import queue is not configured');
  await checkImportAllowance(env, sessionId);
  const saved = await savePublication(env, publication);
  const imported = await createImport(env, sessionId, saved, rules, getProviderCapabilities(publication.provider), null);
  try { await env.SOCIAL_IMPORT_QUEUE.send({ provider: publication.provider, importId: imported.id }); }
  catch (error) { await setImportStatus(env, imported.id, 'failed', { errorMessage: 'Impossible de démarrer l’import. Réessayez.' }); throw error; }
  return { id: imported.id, status: imported.status };
}

export async function processSocialImport(job: SocialImportJob, env: Env): Promise<void> {
  const context = await getImportContext(env, job.importId);
  if (!context || ['ready', 'failed'].includes(context.import.status) || context.import.expires_at <= new Date().toISOString()) return;
  if (job.provider !== context.publication.provider || !['youtube', 'bluesky', 'mastodon', 'lemmy'].includes(job.provider)) throw new Error('Invalid import provider');
  const key = await sha256(JSON.stringify([job.phase ?? 'main', job.pageToken ?? '', job.parentIds ?? [], job.nextThreadToken ?? '']));
  const previous = await getImportPage(env, job.importId, key);
  if (previous) {
    if (previous.next_job_json) await env.SOCIAL_IMPORT_QUEUE!.send(JSON.parse(previous.next_job_json));
    return;
  }
  try {
    if (await importPageCount(env, job.importId) >= 1200) throw new Error('Limite de 1 200 pages API atteinte : aucun tirage partiel ne sera effectué.');
    await reserveProviderRequest(env, job.provider);
    let participants: Participant[];
    let analyzed: number;
    let next: SocialImportJob | undefined;
    if (job.provider === 'youtube') {
      const page = job.phase === 'replies'
        ? await getYouTubeReplyPage(job.parentIds![0], job.pageToken, env)
        : await getYouTubeCommentPage(context.publication.providerPublicationId, job.pageToken, context.rules.includeReplies, env);
      participants = createParticipants(page.comments, context.rules, getProviderCapabilities('youtube'));
      analyzed = page.totalResults;
      next = nextYouTubeJob(job, page.nextPageToken, 'replyParentIds' in page ? page.replyParentIds : []);
    } else if (job.provider === 'bluesky') {
      const page = await getBlueskyParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else if (job.provider === 'mastodon') {
      const page = await getMastodonParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else {
      const page = await getLemmyParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    }
    if (context.rules.excludePublicationAuthor) participants = participants.filter(p => p.providerUserId !== context.publication.authorProviderId);
    if (next) {
      const nextKey = await sha256(JSON.stringify([next.phase ?? 'main', next.pageToken ?? '', next.parentIds ?? [], next.nextThreadToken ?? '']));
      if (nextKey === key || (await getImportPage(env, job.importId, nextKey) && !await getImportPage(env, job.importId, key))) throw new Error('La pagination de la plateforme est incohérente. Import interrompu.');
    }
    const maximum = Math.max(100, Math.min(100000, Number.parseInt(env.MAX_PARTICIPANTS ?? '10000', 10) || 10000));
    await commitImportPage(env, job.importId, key, participants, context.rules.duplicateEntries && !context.rules.uniqueParticipants, analyzed, next, maximum);
  } catch (error) {
    if (error instanceof ProviderRequestError && error.retryable) throw error;
    await setImportStatus(env, job.importId, 'failed', { errorCode: 'import_failed', errorMessage: error instanceof Error ? error.message : 'Import impossible.' });
    return;
  }
  // Read the committed checkpoint, not a competing fetch's in-memory cursor.
  const committed = await getImportPage(env, job.importId, key);
  if (committed?.next_job_json && (await getImport(env, job.importId))?.status === 'queued') await env.SOCIAL_IMPORT_QUEUE!.send(JSON.parse(committed.next_job_json));
}
